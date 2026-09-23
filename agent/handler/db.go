package handler

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"math"
	"math/big"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	validIdentifierRegex = regexp.MustCompile(`^[a-zA-Z0-9_]+$`)
	charset              = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
)

// DBManager handles PostgreSQL operations, connection templates, and file-based whitelist management.
type DBManager struct {
	Pool          *pgxpool.Pool
	InternalHost  string
	ExternalHost  string
	Port          string
	PGBouncerPort string
	SSHPort       string
	WhitelistFile string
	whitelistMu   sync.RWMutex
}

// WhitelistData structure stored in the JSON file
type WhitelistData struct {
	Admin string          `json:"admin"`
	Users []WhitelistUser `json:"users"`
}

// WhitelistUser represents an authenticated GitHub user.
type WhitelistUser struct {
	Username string `json:"username"`
	Role     string `json:"role"` // "admin" or "member"
	AddedAt  string `json:"added_at"`
}

// NewDBManager initializes a new DBManager with environment variables.
func NewDBManager(pool *pgxpool.Pool) *DBManager {
	internalHost := os.Getenv("PG_INTERNAL_HOST")
	if internalHost == "" {
		internalHost = "localhost"
	}

	externalHost := os.Getenv("PG_EXTERNAL_HOST")
	if externalHost == "" {
		externalHost = "localhost"
	}

	port := os.Getenv("PG_PORT")
	if port == "" {
		port = "5432"
	}

	pgBouncerPort := os.Getenv("PGBOUNCER_PORT")
	if pgBouncerPort == "" {
		pgBouncerPort = "6432"
	}

	sshPort := os.Getenv("SSH_LOCAL_PORT")
	if sshPort == "" {
		sshPort = "5433"
	}

	whitelistFile := os.Getenv("WHITELIST_FILE")
	if whitelistFile == "" {
		whitelistFile = "whitelist.json"
	}

	return &DBManager{
		Pool:          pool,
		InternalHost:  internalHost,
		ExternalHost:  externalHost,
		Port:          port,
		PGBouncerPort: pgBouncerPort,
		SSHPort:       sshPort,
		WhitelistFile: whitelistFile,
	}
}

// Helper methods for thread-safe JSON file whitelist persistence
func (m *DBManager) readWhitelistFile() (*WhitelistData, error) {
	m.whitelistMu.RLock()
	defer m.whitelistMu.RUnlock()

	data, err := os.ReadFile(m.WhitelistFile)
	if err != nil {
		if os.IsNotExist(err) {
			return &WhitelistData{Admin: "", Users: []WhitelistUser{}}, nil
		}
		return nil, err
	}

	var wl WhitelistData
	if err := json.Unmarshal(data, &wl); err != nil {
		return &WhitelistData{Admin: "", Users: []WhitelistUser{}}, nil
	}
	if wl.Users == nil {
		wl.Users = []WhitelistUser{}
	}
	return &wl, nil
}

func (m *DBManager) writeWhitelistFile(wl *WhitelistData) error {
	m.whitelistMu.Lock()
	defer m.whitelistMu.Unlock()

	if dir := filepath.Dir(m.WhitelistFile); dir != "" && dir != "." {
		_ = os.MkdirAll(dir, 0755)
	}

	bytes, err := json.MarshalIndent(wl, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(m.WhitelistFile, bytes, 0644)
}

// CreateDatabaseRequest payload
type CreateDatabaseRequest struct {
	ProjectName string `json:"project_name" binding:"required"`
	Environment string `json:"environment" binding:"required"`
}

// ConnectionURLs container
type ConnectionURLs struct {
	DokployInternal string `json:"dokploy_internal"`
	SSHTunnel       string `json:"ssh_tunnel"`
	ExternalVercel  string `json:"external_vercel"`
}

// DatabaseSummary model with dynamic connection templates & active connections count
type DatabaseSummary struct {
	Name              string         `json:"name"`
	Owner             string         `json:"owner"`
	SizeBytes         int64          `json:"size_bytes"`
	SizeMB            float64        `json:"size_mb"`
	Environment       string         `json:"environment"`
	Project           string         `json:"project"`
	ActiveConnections int            `json:"active_connections"`
	Connections       ConnectionURLs `json:"connections"`
}

// CreateDatabaseResponse payload
type CreateDatabaseResponse struct {
	Success     bool           `json:"success"`
	Database    string         `json:"database"`
	Username    string         `json:"username"`
	Password    string         `json:"password"`
	Connections ConnectionURLs `json:"connections"`
	CreatedAt   string         `json:"created_at"`
}

// generateSecurePassword generates a high-entropy 32-character crypto password
func generateSecurePassword(length int) (string, error) {
	bytes := make([]byte, length)
	for i := 0; i < length; i++ {
		num, err := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		if err != nil {
			return "", err
		}
		bytes[i] = charset[num.Int64()]
	}
	return string(bytes), nil
}

// sanitizeIdentifier validates that the identifier contains only letters, digits, and underscores
func sanitizeIdentifier(identifier string) bool {
	return validIdentifierRegex.MatchString(identifier)
}

// CreateDatabase handles atomic DB + User provisioning
func (m *DBManager) CreateDatabase(c *gin.Context) {
	if m.Pool == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "PostgreSQL pool is not connected"})
		return
	}

	var req CreateDatabaseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: project_name and environment are required"})
		return
	}

	proj := strings.ToLower(strings.TrimSpace(req.ProjectName))
	env := strings.ToLower(strings.TrimSpace(req.Environment))

	if !sanitizeIdentifier(proj) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "project_name must contain only alphanumeric characters and underscores"})
		return
	}
	if !sanitizeIdentifier(env) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "environment must contain only alphanumeric characters and underscores"})
		return
	}

	dbName := fmt.Sprintf("db_%s_%s", proj, env)
	userName := fmt.Sprintf("usr_%s", proj)

	password, err := generateSecurePassword(32)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate secure password"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	// 1. Create or update user with encrypted password safely
	userSQL := fmt.Sprintf(`
		DO $$
		BEGIN
			IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '%s') THEN
				CREATE USER "%s" WITH ENCRYPTED PASSWORD '%s';
			ELSE
				ALTER USER "%s" WITH ENCRYPTED PASSWORD '%s';
			END IF;
		END
		$$;
	`, userName, userName, password, userName, password)

	if _, err := m.Pool.Exec(ctx, userSQL); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to configure database user: %v", err)})
		return
	}

	// 2. Create Database
	var exists bool
	checkSQL := "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1)"
	if err := m.Pool.QueryRow(ctx, checkSQL, dbName).Scan(&exists); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to check database existence: %v", err)})
		return
	}

	if exists {
		c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("Database '%s' already exists", dbName)})
		return
	}

	createDbSQL := fmt.Sprintf(`CREATE DATABASE "%s" OWNER "%s"`, dbName, userName)
	if _, err := m.Pool.Exec(ctx, createDbSQL); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to create database: %v", err)})
		return
	}

	// 3. Grant all privileges on database to user
	grantSQL := fmt.Sprintf(`GRANT ALL PRIVILEGES ON DATABASE "%s" TO "%s"`, dbName, userName)
	if _, err := m.Pool.Exec(ctx, grantSQL); err != nil {
		fmt.Printf("Warning granting database privileges: %v\n", err)
	}

	// 4. Construct Connection Strings dynamically from Agent configuration
	connections := ConnectionURLs{
		DokployInternal: fmt.Sprintf("postgresql://%s:%s@%s:%s/%s", userName, password, m.InternalHost, m.Port, dbName),
		SSHTunnel:       fmt.Sprintf("postgresql://%s:%s@localhost:%s/%s", userName, password, m.SSHPort, dbName),
		ExternalVercel:  fmt.Sprintf("postgresql://%s:%s@%s:%s/%s?sslmode=disable", userName, password, m.ExternalHost, m.PGBouncerPort, dbName),
	}

	c.JSON(http.StatusCreated, CreateDatabaseResponse{
		Success:     true,
		Database:    dbName,
		Username:    userName,
		Password:    password,
		Connections: connections,
		CreatedAt:   time.Now().UTC().Format(time.RFC3339),
	})
}

// ListDatabases lists all non-system databases with disk usage, active client connections, and templates
func (m *DBManager) ListDatabases(c *gin.Context) {
	if m.Pool == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "PostgreSQL pool is not connected"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	// 1. Query active client connections per database
	activeConns := make(map[string]int)
	activitySQL := `
		SELECT datname, count(*) 
		FROM pg_stat_activity 
		WHERE datname IS NOT NULL AND pid <> pg_backend_pid() 
		GROUP BY datname;
	`
	actRows, err := m.Pool.Query(ctx, activitySQL)
	if err == nil {
		for actRows.Next() {
			var dName string
			var count int
			if scanErr := actRows.Scan(&dName, &count); scanErr == nil {
				activeConns[dName] = count
			}
		}
		actRows.Close()
	}

	// 2. Query all user databases
	query := `
		SELECT 
			d.datname,
			COALESCE(pg_catalog.pg_get_userbyid(d.datdba), 'unknown') AS owner,
			COALESCE(pg_catalog.pg_database_size(d.datname), 0) AS size_bytes
		FROM pg_catalog.pg_database d
		WHERE d.datistemplate = false
		  AND d.datname NOT IN ('postgres', 'template0', 'template1')
		ORDER BY d.datname ASC;
	`

	rows, err := m.Pool.Query(ctx, query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to query databases: %v", err)})
		return
	}
	defer rows.Close()

	var databases []DatabaseSummary
	for rows.Next() {
		var name, owner string
		var sizeBytes int64
		if err := rows.Scan(&name, &owner, &sizeBytes); err != nil {
			continue
		}

		sizeMB := math.Round((float64(sizeBytes)/(1024*1024))*100) / 100

		env := "custom"
		project := name
		if strings.HasPrefix(name, "db_") {
			parts := strings.Split(name, "_")
			if len(parts) >= 3 {
				env = parts[len(parts)-1]
				project = strings.Join(parts[1:len(parts)-1], "_")
			}
		}

		connTemplates := ConnectionURLs{
			DokployInternal: fmt.Sprintf("postgresql://%s:••••••••@%s:%s/%s", owner, m.InternalHost, m.Port, name),
			SSHTunnel:       fmt.Sprintf("postgresql://%s:••••••••@localhost:%s/%s", owner, m.SSHPort, name),
			ExternalVercel:  fmt.Sprintf("postgresql://%s:••••••••@%s:%s/%s?sslmode=disable", owner, m.ExternalHost, m.PGBouncerPort, name),
		}

		databases = append(databases, DatabaseSummary{
			Name:              name,
			Owner:             owner,
			SizeBytes:         sizeBytes,
			SizeMB:            sizeMB,
			Environment:       env,
			Project:           project,
			ActiveConnections: activeConns[name],
			Connections:       connTemplates,
		})
	}

	if databases == nil {
		databases = []DatabaseSummary{}
	}

	c.JSON(http.StatusOK, gin.H{
		"count":     len(databases),
		"databases": databases,
		"cluster_info": gin.H{
			"internal_host":   m.InternalHost,
			"external_host":   m.ExternalHost,
			"port":            m.Port,
			"pgbouncer_port":  m.PGBouncerPort,
			"ssh_port":        m.SSHPort,
		},
	})
}

// DeleteDatabase drops connections and deletes the database
func (m *DBManager) DeleteDatabase(c *gin.Context) {
	if m.Pool == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "PostgreSQL pool is not connected"})
		return
	}

	dbName := strings.TrimSpace(c.Param("name"))
	if !sanitizeIdentifier(dbName) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid database name format"})
		return
	}

	switch strings.ToLower(dbName) {
	case "postgres", "template0", "template1":
		c.JSON(http.StatusForbidden, gin.H{"error": "Cannot delete protected system database"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	terminateSQL := `
		SELECT pg_terminate_backend(pid) 
		FROM pg_stat_activity 
		WHERE datname = $1 AND pid <> pg_backend_pid();
	`
	_, _ = m.Pool.Exec(ctx, terminateSQL, dbName)

	dropSQL := fmt.Sprintf(`DROP DATABASE IF EXISTS "%s"`, dbName)
	if _, err := m.Pool.Exec(ctx, dropSQL); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to drop database: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": fmt.Sprintf("Database '%s' dropped successfully", dbName),
	})
}

// ResetDatabasePassword rotates/resets the database owner user's password with a fresh CSPRNG password
func (m *DBManager) ResetDatabasePassword(c *gin.Context) {
	if m.Pool == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "PostgreSQL pool is not connected"})
		return
	}

	dbName := strings.TrimSpace(c.Param("name"))
	if !sanitizeIdentifier(dbName) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid database name format"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	// Find the database owner
	var owner string
	ownerSQL := `
		SELECT COALESCE(pg_catalog.pg_get_userbyid(datdba), '') 
		FROM pg_catalog.pg_database 
		WHERE datname = $1;
	`
	if err := m.Pool.QueryRow(ctx, ownerSQL, dbName).Scan(&owner); err != nil || owner == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("Database '%s' not found", dbName)})
		return
	}

	// Generate fresh 32-character cryptographic password
	newPassword, err := generateSecurePassword(32)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate password"})
		return
	}

	// Update user password in PostgreSQL
	alterSQL := fmt.Sprintf(`ALTER USER "%s" WITH ENCRYPTED PASSWORD '%s'`, owner, newPassword)
	if _, err := m.Pool.Exec(ctx, alterSQL); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to update password: %v", err)})
		return
	}

	connections := ConnectionURLs{
		DokployInternal: fmt.Sprintf("postgresql://%s:%s@%s:%s/%s", owner, newPassword, m.InternalHost, m.Port, dbName),
		SSHTunnel:       fmt.Sprintf("postgresql://%s:%s@localhost:%s/%s", owner, newPassword, m.SSHPort, dbName),
		ExternalVercel:  fmt.Sprintf("postgresql://%s:%s@%s:%s/%s?sslmode=disable", owner, newPassword, m.ExternalHost, m.PGBouncerPort, dbName),
	}

	c.JSON(http.StatusOK, CreateDatabaseResponse{
		Success:     true,
		Database:    dbName,
		Username:    owner,
		Password:    newPassword,
		Connections: connections,
		CreatedAt:   time.Now().UTC().Format(time.RFC3339),
	})
}

// ==========================================
// GitHub Whitelist & First-User Admin Logic (JSON File Persistence)
// Zero database tables created in PostgreSQL!
// ==========================================

// GetWhitelist returns the list of whitelisted GitHub usernames and who the admin is
func (m *DBManager) GetWhitelist(c *gin.Context) {
	wl, err := m.readWhitelistFile()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to read whitelist: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"has_admin": wl.Admin != "",
		"admin":     wl.Admin,
		"users":     wl.Users,
	})
}

// ClaimAdmin sets the first user to authenticate as the Primary Admin
func (m *DBManager) ClaimAdmin(c *gin.Context) {
	var body struct {
		Username string `json:"username" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "username is required"})
		return
	}

	username := strings.ToLower(strings.TrimSpace(body.Username))
	wl, err := m.readWhitelistFile()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to read whitelist: %v", err)})
		return
	}

	if wl.Admin != "" {
		c.JSON(http.StatusConflict, gin.H{"error": "Admin has already been claimed"})
		return
	}

	wl.Admin = username
	found := false
	for i, u := range wl.Users {
		if strings.EqualFold(u.Username, username) {
			wl.Users[i].Role = "admin"
			found = true
			break
		}
	}
	if !found {
		wl.Users = append([]WhitelistUser{{
			Username: username,
			Role:     "admin",
			AddedAt:  time.Now().UTC().Format(time.RFC3339),
		}}, wl.Users...)
	}

	if err := m.writeWhitelistFile(wl); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to persist whitelist: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":  true,
		"message":  fmt.Sprintf("User '%s' claimed as primary admin", username),
		"username": username,
		"role":     "admin",
	})
}

// AddWhitelistUser adds a friend's GitHub username to the whitelist
func (m *DBManager) AddWhitelistUser(c *gin.Context) {
	var body struct {
		Username string `json:"username" binding:"required"`
		Role     string `json:"role"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "username is required"})
		return
	}

	username := strings.ToLower(strings.TrimSpace(body.Username))
	role := "member"
	if body.Role == "admin" {
		role = "admin"
	}

	wl, err := m.readWhitelistFile()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to read whitelist: %v", err)})
		return
	}

	for _, u := range wl.Users {
		if strings.EqualFold(u.Username, username) {
			c.JSON(http.StatusOK, gin.H{"success": true, "username": username, "role": u.Role})
			return
		}
	}

	wl.Users = append(wl.Users, WhitelistUser{
		Username: username,
		Role:     role,
		AddedAt:  time.Now().UTC().Format(time.RFC3339),
	})

	if err := m.writeWhitelistFile(wl); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to persist whitelist: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":  true,
		"username": username,
		"role":     role,
	})
}

// DeleteWhitelistUser removes a user from the whitelist (cannot remove sole admin)
func (m *DBManager) DeleteWhitelistUser(c *gin.Context) {
	username := strings.ToLower(strings.TrimSpace(c.Param("username")))

	wl, err := m.readWhitelistFile()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to read whitelist: %v", err)})
		return
	}

	// Cannot delete sole admin
	if strings.EqualFold(wl.Admin, username) {
		adminCount := 0
		for _, u := range wl.Users {
			if u.Role == "admin" {
				adminCount++
			}
		}
		if adminCount <= 1 {
			c.JSON(http.StatusForbidden, gin.H{"error": "Cannot delete the sole admin account"})
			return
		}
	}

	var updated []WhitelistUser
	for _, u := range wl.Users {
		if !strings.EqualFold(u.Username, username) {
			updated = append(updated, u)
		}
	}
	wl.Users = updated

	if strings.EqualFold(wl.Admin, username) {
		wl.Admin = ""
		for _, u := range wl.Users {
			if u.Role == "admin" {
				wl.Admin = u.Username
				break
			}
		}
	}

	if err := m.writeWhitelistFile(wl); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to persist whitelist: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": fmt.Sprintf("User '%s' removed from whitelist", username),
	})
}

// VerifyUser checks whether a username is allowed access
func (m *DBManager) VerifyUser(c *gin.Context) {
	username := strings.ToLower(strings.TrimSpace(c.Param("username")))

	wl, err := m.readWhitelistFile()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"allowed": true, "role": "admin", "mock": true})
		return
	}

	for _, u := range wl.Users {
		if strings.EqualFold(u.Username, username) {
			c.JSON(http.StatusOK, gin.H{
				"allowed":  true,
				"username": username,
				"role":     u.Role,
			})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"allowed": false, "username": username})
}
