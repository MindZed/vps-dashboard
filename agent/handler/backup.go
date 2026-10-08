package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/robfig/cron/v3"
)

var (
	validLabelRegex = regexp.MustCompile(`^[a-zA-Z0-9_\-]+$`)
)

// BackupItem represents a single database snapshot file with parsed metadata.
type BackupItem struct {
	Filename  string    `json:"filename"`
	Label     string    `json:"label"`
	Database  string    `json:"database"`
	Type      string    `json:"type"` // "manual" or "auto"
	SizeBytes int64     `json:"size_bytes"`
	CreatedAt time.Time `json:"created_at"`
}

// DatabaseSchedule configures automated recurring backups for a database.
type DatabaseSchedule struct {
	Database      string     `json:"database"`
	Enabled       bool       `json:"enabled"`
	CronExpr      string     `json:"cron_expr"`
	SlidingWindow int        `json:"sliding_window"` // Max 5
	LastRun       *time.Time `json:"last_run,omitempty"`
	NextRun       *time.Time `json:"next_run,omitempty"`
	LastStatus    string     `json:"last_status,omitempty"` // "success" or "failed"
	LastError     string     `json:"last_error,omitempty"`
}

// SchedulesData persists the schedule settings to disk.
type SchedulesData struct {
	Schedules map[string]*DatabaseSchedule `json:"schedules"`
}

// BackupManager coordinates manual backups, automated cron schedules, and sliding window pruning.
type BackupManager struct {
	Pool          *pgxpool.Pool
	BackupDir     string
	ConfigFile    string
	Host          string
	Port          string
	User          string
	Password      string
	ContainerName string
	cronRunner    *cron.Cron
	cronMu        sync.RWMutex
	cronEntries   map[string]cron.EntryID
	schedules     map[string]*DatabaseSchedule
}

// NewBackupManager creates and starts the backup manager.
func NewBackupManager(pool *pgxpool.Pool, rawConnStr string) *BackupManager {
	backupDir := os.Getenv("BACKUP_DIR")
	if backupDir == "" {
		backupDir = "./data/backups"
	}
	_ = os.MkdirAll(backupDir, 0755)

	configFile := os.Getenv("BACKUP_CONFIG_FILE")
	if configFile == "" {
		configFile = filepath.Join(backupDir, "backup_schedules.json")
	}

	host := os.Getenv("PG_INTERNAL_HOST")
	if host == "" {
		host = os.Getenv("PG_HOST")
	}
	if host == "" {
		host = "postgres-databases-sharedpostgres-kooq42"
	}

	port := os.Getenv("PG_PORT")
	if port == "" {
		port = "5432"
	}

	user := os.Getenv("PG_USER")
	if user == "" {
		user = "postgres"
	}

	password := os.Getenv("PG_PASSWORD")

	containerName := os.Getenv("PG_CONTAINER_NAME")
	if containerName == "" {
		containerName = "postgres-databases-sharedpostgres-kooq42"
	}

	// Parse credentials from rawConnStr if available
	if rawConnStr != "" {
		if u, err := url.Parse(rawConnStr); err == nil {
			if u.Hostname() != "" {
				host = u.Hostname()
			}
			if u.Port() != "" {
				port = u.Port()
			}
			if u.User != nil {
				if u.User.Username() != "" {
					user = u.User.Username()
				}
				if pass, ok := u.User.Password(); ok {
					password = pass
				}
			}
		}
	}

	cronRunner := cron.New()
	cronRunner.Start()

	bm := &BackupManager{
		Pool:          pool,
		BackupDir:     backupDir,
		ConfigFile:    configFile,
		Host:          host,
		Port:          port,
		User:          user,
		Password:      password,
		ContainerName: containerName,
		cronRunner:    cronRunner,
		cronEntries:   make(map[string]cron.EntryID),
		schedules:     make(map[string]*DatabaseSchedule),
	}

	// Load existing schedules from disk and register in cron runner
	bm.loadSchedulesFromDisk()

	return bm
}

// sanitizeLabel converts user provided label to safe characters
func sanitizeLabel(raw string) string {
	raw = strings.TrimSpace(raw)
	raw = strings.ToLower(raw)
	// Replace spaces and special characters with hyphens
	reg := regexp.MustCompile(`[^a-z0-9_\-]+`)
	cleaned := reg.ReplaceAllString(raw, "-")
	cleaned = strings.Trim(cleaned, "-_")
	if cleaned == "" {
		cleaned = "snapshot"
	}
	if len(cleaned) > 50 {
		cleaned = cleaned[:50]
	}
	return cleaned
}

// ParseBackupFilename decomposes a structured backup filename into its components:
// Format: <LABEL>__<DATABASE>__<TYPE>__<YYYYMMDD_HHMMSS>.dump
func ParseBackupFilename(filename string, sizeBytes int64) (*BackupItem, error) {
	if !strings.HasSuffix(filename, ".dump") && !strings.HasSuffix(filename, ".sql.gz") {
		return nil, fmt.Errorf("invalid backup extension")
	}

	cleanBase := strings.TrimSuffix(filename, ".dump")
	cleanBase = strings.TrimSuffix(cleanBase, ".sql.gz")

	parts := strings.Split(cleanBase, "__")
	if len(parts) < 4 {
		return nil, fmt.Errorf("invalid backup filename format")
	}

	label := parts[0]
	database := parts[1]
	backupType := parts[2]
	timeStr := parts[3]

	parsedTime, err := time.Parse("20060102_150405", timeStr)
	if err != nil {
		parsedTime = time.Now().UTC()
	}

	return &BackupItem{
		Filename:  filename,
		Label:     label,
		Database:  database,
		Type:      backupType,
		SizeBytes: sizeBytes,
		CreatedAt: parsedTime,
	}, nil
}

// getPostgresContainerName finds the active container ID for PostgreSQL in Docker Swarm
func (bm *BackupManager) getPostgresContainerName(ctx context.Context) string {
	out, err := exec.CommandContext(ctx, "docker", "ps", "-q", "-f", "name=postgres-databases-sharedpostgres").Output()
	if err == nil {
		lines := strings.Split(strings.TrimSpace(string(out)), "\n")
		if len(lines) > 0 && lines[0] != "" {
			return lines[0]
		}
	}
	return bm.ContainerName
}

// executeDump runs pg_dump natively or via docker
func (bm *BackupManager) executeDump(ctx context.Context, dbName string, outPath string) error {
	// Strategy 1: Check if docker exec is available
	if _, err := exec.LookPath("docker"); err == nil {
		targetContainer := bm.getPostgresContainerName(ctx)
		outFile, err := os.Create(outPath)
		if err == nil {
			defer outFile.Close()

			args := []string{
				"exec",
				"-i",
			}
			if bm.Password != "" {
				args = append(args, "-e", fmt.Sprintf("PGPASSWORD=%s", bm.Password))
			}
			args = append(args, targetContainer, "pg_dump", "-U", bm.User, "-d", dbName, "-F", "c", "-Z", "9")

			cmd := exec.CommandContext(ctx, "docker", args...)
			cmd.Stdout = outFile
			var stderr bytes.Buffer
			cmd.Stderr = &stderr

			if runErr := cmd.Run(); runErr == nil {
				return nil
			}
			log.Printf("[DEBUG] docker exec pg_dump failed: %s, falling back to local pg_dump", stderr.String())
			_ = os.Remove(outPath)
		}
	}

	// Strategy 2: Direct pg_dump command
	args := []string{
		"-h", bm.Host,
		"-p", bm.Port,
		"-U", bm.User,
		"-d", dbName,
		"-F", "c",
		"-Z", "9",
		"-f", outPath,
	}

	cmd := exec.CommandContext(ctx, "pg_dump", args...)
	cmd.Env = append(os.Environ(), fmt.Sprintf("PGPASSWORD=%s", bm.Password))
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		_ = os.Remove(outPath)
		errMsg := strings.TrimSpace(stderr.String())
		if errMsg == "" {
			errMsg = err.Error()
		}
		return fmt.Errorf("pg_dump failed: %s", errMsg)
	}

	return nil
}

// executeRestore runs pg_restore natively or via docker
func (bm *BackupManager) executeRestore(ctx context.Context, dbName string, inPath string) error {
	// Strategy 1: Try via docker exec if available
	if _, err := exec.LookPath("docker"); err == nil {
		targetContainer := bm.getPostgresContainerName(ctx)
		inFile, err := os.Open(inPath)
		if err == nil {
			defer inFile.Close()

			args := []string{
				"exec",
				"-i",
			}
			if bm.Password != "" {
				args = append(args, "-e", fmt.Sprintf("PGPASSWORD=%s", bm.Password))
			}
			args = append(args, targetContainer, "pg_restore", "-U", bm.User, "-d", dbName, "--clean", "--if-exists", "--no-owner", "--no-privileges")

			cmd := exec.CommandContext(ctx, "docker", args...)
			cmd.Stdin = inFile
			var stderr bytes.Buffer
			cmd.Stderr = &stderr

			if runErr := cmd.Run(); runErr == nil {
				return nil
			}
			log.Printf("[DEBUG] docker exec pg_restore failed: %s, falling back to local pg_restore", stderr.String())
		}
	}

	// Strategy 2: Direct pg_restore command
	args := []string{
		"-h", bm.Host,
		"-p", bm.Port,
		"-U", bm.User,
		"-d", dbName,
		"--clean",
		"--if-exists",
		"--no-owner",
		"--no-privileges",
		inPath,
	}

	cmd := exec.CommandContext(ctx, "pg_restore", args...)
	cmd.Env = append(os.Environ(), fmt.Sprintf("PGPASSWORD=%s", bm.Password))
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		// pg_restore often exits with code 1 if warnings occur (e.g. drop table if not exists)
		// check if it's fatal
		errMsg := strings.TrimSpace(stderr.String())
		if strings.Contains(errMsg, "fatal:") {
			return fmt.Errorf("pg_restore failed: %s", errMsg)
		}
		log.Printf("[WARN] pg_restore completed with notices: %s", errMsg)
	}

	return nil
}

// pruneSlidingWindow keeps only the newest N automated backups for the database
func (bm *BackupManager) pruneSlidingWindow(dbName string, maxCount int) {
	if maxCount < 1 {
		maxCount = 1
	}
	if maxCount > 5 {
		maxCount = 5
	}

	files, err := os.ReadDir(bm.BackupDir)
	if err != nil {
		return
	}

	var autoBackups []*BackupItem
	for _, f := range files {
		if f.IsDir() {
			continue
		}
		info, err := f.Info()
		if err != nil {
			continue
		}
		item, err := ParseBackupFilename(f.Name(), info.Size())
		if err == nil && item.Database == dbName && item.Type == "auto" {
			autoBackups = append(autoBackups, item)
		}
	}

	// Sort newest first
	sort.Slice(autoBackups, func(i, j int) bool {
		return autoBackups[i].CreatedAt.After(autoBackups[j].CreatedAt)
	})

	// If count exceeds maxCount, remove the oldest excess items
	if len(autoBackups) > maxCount {
		for i := maxCount; i < len(autoBackups); i++ {
			toRemove := filepath.Join(bm.BackupDir, autoBackups[i].Filename)
			log.Printf("[INFO] [BACKUP] Sliding window prune: removing oldest auto backup %s", autoBackups[i].Filename)
			_ = os.Remove(toRemove)
		}
	}
}

// performBackupInternal executes backup and triggers sliding window if auto
func (bm *BackupManager) performBackupInternal(ctx context.Context, dbName string, label string, bType string) (*BackupItem, error) {
	cleanLabel := sanitizeLabel(label)
	timestampStr := time.Now().UTC().Format("20060102_150405")
	filename := fmt.Sprintf("%s__%s__%s__%s.dump", cleanLabel, dbName, bType, timestampStr)
	outPath := filepath.Join(bm.BackupDir, filename)

	err := bm.executeDump(ctx, dbName, outPath)
	if err != nil {
		return nil, err
	}

	fileInfo, err := os.Stat(outPath)
	var sizeBytes int64
	if err == nil {
		sizeBytes = fileInfo.Size()
	}

	item, _ := ParseBackupFilename(filename, sizeBytes)

	// If auto backup, prune using configured sliding window
	if bType == "auto" {
		bm.cronMu.RLock()
		sched := bm.schedules[dbName]
		slidingWindow := 5
		if sched != nil && sched.SlidingWindow > 0 {
			slidingWindow = sched.SlidingWindow
		}
		bm.cronMu.RUnlock()

		bm.pruneSlidingWindow(dbName, slidingWindow)
	}

	return item, nil
}

// --- HTTP API Handlers ---

// ListBackups handles GET /api/v1/backups?db=<name>
func (bm *BackupManager) ListBackups(c *gin.Context) {
	filterDb := strings.TrimSpace(c.Query("db"))

	files, err := os.ReadDir(bm.BackupDir)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": true, "backups": []BackupItem{}})
		return
	}

	results := make([]BackupItem, 0)
	for _, f := range files {
		if f.IsDir() {
			continue
		}
		info, err := f.Info()
		if err != nil {
			continue
		}
		item, err := ParseBackupFilename(f.Name(), info.Size())
		if err != nil {
			continue
		}
		if filterDb != "" && item.Database != filterDb {
			continue
		}
		results = append(results, *item)
	}

	// Sort newest first
	sort.Slice(results, func(i, j int) bool {
		return results[i].CreatedAt.After(results[j].CreatedAt)
	})

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"backups": results,
		"count":   len(results),
	})
}

// CreateBackup handles POST /api/v1/backups/create
func (bm *BackupManager) CreateBackup(c *gin.Context) {
	var req struct {
		Database string `json:"database" binding:"required"`
		Name     string `json:"name" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing database or backup name"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 180*time.Second)
	defer cancel()

	item, err := bm.performBackupInternal(ctx, req.Database, req.Name, "manual")
	if err != nil {
		log.Printf("[ERROR] Manual backup failed for %s: %v", req.Database, err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Backup failed",
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"backup":  item,
		"message": fmt.Sprintf("Backup '%s' created successfully", item.Label),
	})
}

// RestoreBackup handles POST /api/v1/backups/restore
func (bm *BackupManager) RestoreBackup(c *gin.Context) {
	var req struct {
		Database string `json:"database" binding:"required"`
		Filename string `json:"filename" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing database or filename"})
		return
	}

	// Security: prevent directory traversal
	cleanFilename := filepath.Base(req.Filename)
	filePath := filepath.Join(bm.BackupDir, cleanFilename)
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Backup file not found on disk"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 240*time.Second)
	defer cancel()

	// Step 1: Pre-restore Safety Snapshot
	safetyLabel := fmt.Sprintf("safety-pre-restore-%s", time.Now().UTC().Format("150405"))
	log.Printf("[INFO] Creating safety pre-restore backup for %s...", req.Database)
	safetyItem, safetyErr := bm.performBackupInternal(ctx, req.Database, safetyLabel, "manual")
	if safetyErr != nil {
		log.Printf("[WARN] Safety pre-restore snapshot warning: %v", safetyErr)
	}

	// Step 2: Terminate active connections to prevent database lockups
	if bm.Pool != nil {
		termQuery := `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid();`
		_, _ = bm.Pool.Exec(ctx, termQuery, req.Database)
	}

	// Step 3: Run pg_restore
	err := bm.executeRestore(ctx, req.Database, filePath)
	if err != nil {
		log.Printf("[ERROR] Restore failed for %s: %v", req.Database, err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":         "Database restore failed",
			"message":       err.Error(),
			"safety_backup": safetyItem,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":       true,
		"message":       fmt.Sprintf("Database '%s' restored successfully", req.Database),
		"safety_backup": safetyItem,
	})
}

// DownloadBackup handles GET /api/v1/backups/:filename/download
func (bm *BackupManager) DownloadBackup(c *gin.Context) {
	filename := filepath.Base(c.Param("filename"))
	filePath := filepath.Join(bm.BackupDir, filename)

	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Backup file not found"})
		return
	}

	c.Header("Content-Description", "File Transfer")
	c.Header("Content-Transfer-Encoding", "binary")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	c.Header("Content-Type", "application/octet-stream")
	c.File(filePath)
}

// DeleteBackup handles DELETE /api/v1/backups/:filename
func (bm *BackupManager) DeleteBackup(c *gin.Context) {
	filename := filepath.Base(c.Param("filename"))
	filePath := filepath.Join(bm.BackupDir, filename)

	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Backup file not found"})
		return
	}

	if err := os.Remove(filePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete backup file"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Backup snapshot deleted successfully",
	})
}

// GetSchedule handles GET /api/v1/backups/schedule?db=<name>
func (bm *BackupManager) GetSchedule(c *gin.Context) {
	dbName := strings.TrimSpace(c.Query("db"))

	bm.cronMu.RLock()
	defer bm.cronMu.RUnlock()

	if dbName != "" {
		sched, exists := bm.schedules[dbName]
		if !exists {
			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"schedule": &DatabaseSchedule{
					Database:      dbName,
					Enabled:       false,
					CronExpr:      "0 2 * * *",
					SlidingWindow: 5,
				},
			})
			return
		}

		if entryID, ok := bm.cronEntries[dbName]; ok {
			entry := bm.cronRunner.Entry(entryID)
			sched.NextRun = &entry.Next
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "schedule": sched})
		return
	}

	all := make([]*DatabaseSchedule, 0)
	for _, s := range bm.schedules {
		if entryID, ok := bm.cronEntries[s.Database]; ok {
			entry := bm.cronRunner.Entry(entryID)
			s.NextRun = &entry.Next
		}
		all = append(all, s)
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "schedules": all})
}

// SaveSchedule handles POST /api/v1/backups/schedule
func (bm *BackupManager) SaveSchedule(c *gin.Context) {
	var req struct {
		Database      string `json:"database"`
		Enabled       bool   `json:"enabled"`
		CronExpr      string `json:"cron_expr"`
		SlidingWindow int    `json:"sliding_window"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "Invalid schedule payload",
			"message": err.Error(),
		})
		return
	}

	if req.Database == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Database name is required"})
		return
	}

	// Validate sliding window: max 5, min 1
	if req.SlidingWindow <= 0 {
		req.SlidingWindow = 5
	}
	if req.SlidingWindow > 5 {
		req.SlidingWindow = 5
	}

	if req.CronExpr == "" {
		req.CronExpr = "0 2 * * *"
	}

	// Validate cron expression
	cronParser := cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow)
	schedule, err := cronParser.Parse(req.CronExpr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "Invalid crontab expression",
			"message": err.Error(),
		})
		return
	}

	bm.cronMu.Lock()
	defer bm.cronMu.Unlock()

	// Remove existing cron entry if any
	if oldEntryID, exists := bm.cronEntries[req.Database]; exists {
		bm.cronRunner.Remove(oldEntryID)
		delete(bm.cronEntries, req.Database)
	}

	// Update schedule entry
	sched := &DatabaseSchedule{
		Database:      req.Database,
		Enabled:       req.Enabled,
		CronExpr:      req.CronExpr,
		SlidingWindow: req.SlidingWindow,
	}
	bm.schedules[req.Database] = sched

	// If enabled, register new cron entry
	if req.Enabled {
		db := req.Database
		entryID := bm.cronRunner.Schedule(schedule, cron.FuncJob(func() {
			bm.runScheduledBackup(db)
		}))
		bm.cronEntries[db] = entryID

		next := schedule.Next(time.Now())
		sched.NextRun = &next
		log.Printf("[INFO] [CRON] Registered auto-backup for %s with expr '%s'. Next run: %s", db, req.CronExpr, next.Format(time.RFC3339))
	} else {
		sched.NextRun = nil
		log.Printf("[INFO] [CRON] Disabled auto-backup for %s", req.Database)
	}

	_ = bm.saveSchedulesToDisk()

	c.JSON(http.StatusOK, gin.H{
		"success":  true,
		"schedule": sched,
		"message":  "Backup schedule updated successfully",
	})
}

// runScheduledBackup is executed on cron trigger
func (bm *BackupManager) runScheduledBackup(dbName string) {
	log.Printf("[INFO] [CRON] Starting automated backup for database: %s", dbName)
	ctx, cancel := context.WithTimeout(context.Background(), 180*time.Second)
	defer cancel()

	now := time.Now().UTC()
	item, err := bm.performBackupInternal(ctx, dbName, "auto-backup", "auto")

	bm.cronMu.Lock()
	defer bm.cronMu.Unlock()

	sched := bm.schedules[dbName]
	if sched != nil {
		sched.LastRun = &now
		if err != nil {
			sched.LastStatus = "failed"
			sched.LastError = err.Error()
			log.Printf("[ERROR] [CRON] Automated backup failed for %s: %v", dbName, err)
		} else {
			sched.LastStatus = "success"
			sched.LastError = ""
			log.Printf("[INFO] [CRON] Automated backup succeeded for %s (%s, %d bytes)", dbName, item.Filename, item.SizeBytes)
		}
		_ = bm.saveSchedulesToDisk()
	}
}

// loadSchedulesFromDisk loads persisted schedules and re-registers enabled crons
func (bm *BackupManager) loadSchedulesFromDisk() {
	bm.cronMu.Lock()
	defer bm.cronMu.Unlock()

	data, err := os.ReadFile(bm.ConfigFile)
	if err != nil {
		return
	}

	var fileData SchedulesData
	if err := json.Unmarshal(data, &fileData); err != nil {
		return
	}

	cronParser := cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow)

	for dbName, sched := range fileData.Schedules {
		bm.schedules[dbName] = sched
		if sched.Enabled && sched.CronExpr != "" {
			if schedule, err := cronParser.Parse(sched.CronExpr); err == nil {
				db := dbName
				entryID := bm.cronRunner.Schedule(schedule, cron.FuncJob(func() {
					bm.runScheduledBackup(db)
				}))
				bm.cronEntries[db] = entryID
				next := schedule.Next(time.Now())
				sched.NextRun = &next
				log.Printf("[INFO] [CRON] Reloaded auto-backup for %s (Next: %s)", db, next.Format(time.RFC3339))
			}
		}
	}
}

// saveSchedulesToDisk writes current schedules to JSON file
func (bm *BackupManager) saveSchedulesToDisk() error {
	fileData := SchedulesData{
		Schedules: bm.schedules,
	}

	bytesData, err := json.MarshalIndent(fileData, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(bm.ConfigFile, bytesData, 0644)
}
