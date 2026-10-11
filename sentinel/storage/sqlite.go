package storage

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

type Monitor struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	URL         string    `json:"url"`
	Type        string    `json:"type"` // "HTTP", "HTTPS", "TCP"
	IntervalSec int       `json:"interval_sec"`
	Active      bool      `json:"active"`
	CreatedAt   time.Time `json:"created_at"`
}

type Heartbeat struct {
	ID         int64  `json:"id"`
	MonitorID  string `json:"monitor_id"`
	Status     int    `json:"status"` // 1 = UP, 0 = DOWN, 2 = DEGRADED
	LatencyMs  int64  `json:"latency_ms"`
	StatusCode int    `json:"status_code,omitempty"`
	ErrorMsg   string `json:"error_msg,omitempty"`
	CreatedAt  string `json:"created_at"`
}

type Incident struct {
	ID          string  `json:"id"`
	MonitorID   string  `json:"monitor_id"`
	MonitorName string  `json:"monitor_name"`
	Title       string  `json:"title"`
	Status      string  `json:"status"` // "active" or "resolved"
	Impact      string  `json:"impact"` // "minor", "major"
	ErrorMsg    string  `json:"error_msg"`
	StartedAt   string  `json:"started_at"`
	ResolvedAt  *string `json:"resolved_at,omitempty"`
	DurationSec int     `json:"duration_sec"`
}

type Store struct {
	db *sql.DB
	mu sync.RWMutex
}

// NewStore initializes embedded SQLite database with WAL mode and tables
func NewStore(dbPath string) (*Store, error) {
	if dbPath == "" {
		dbPath = "data/sentinel.db"
	}

	dir := filepath.Dir(dbPath)
	if dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return nil, fmt.Errorf("failed to create db directory: %w", err)
		}
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open sqlite database: %w", err)
	}

	// Performance tuning pragmas
	pragmas := []string{
		"PRAGMA journal_mode = WAL;",
		"PRAGMA synchronous = NORMAL;",
		"PRAGMA foreign_keys = ON;",
		"PRAGMA busy_timeout = 5000;",
	}
	for _, p := range pragmas {
		if _, err := db.Exec(p); err != nil {
			log.Printf("[WARN] Failed pragma %s: %v", p, err)
		}
	}

	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		return nil, fmt.Errorf("database migration failed: %w", err)
	}

	s.seedDefaultMonitors()
	return s, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) migrate() error {
	schema := `
	CREATE TABLE IF NOT EXISTS monitors (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		url TEXT NOT NULL,
		type TEXT NOT NULL,
		interval_sec INTEGER NOT NULL DEFAULT 60,
		active INTEGER NOT NULL DEFAULT 1,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS heartbeats (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		monitor_id TEXT NOT NULL,
		status INTEGER NOT NULL,
		latency_ms INTEGER NOT NULL,
		status_code INTEGER,
		error_msg TEXT,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_heartbeats_monitor_time ON heartbeats (monitor_id, created_at DESC);

	CREATE TABLE IF NOT EXISTS incidents (
		id TEXT PRIMARY KEY,
		monitor_id TEXT NOT NULL,
		monitor_name TEXT NOT NULL,
		title TEXT NOT NULL,
		status TEXT NOT NULL,
		impact TEXT NOT NULL,
		error_msg TEXT,
		started_at DATETIME NOT NULL,
		resolved_at DATETIME,
		duration_sec INTEGER NOT NULL DEFAULT 0
	);
	`
	_, err := s.db.Exec(schema)
	return err
}

func (s *Store) seedDefaultMonitors() {
	var count int
	_ = s.db.QueryRow("SELECT COUNT(*) FROM monitors").Scan(&count)
	if count > 0 {
		return
	}

	log.Println("[INFO] Seeding default core monitors into SQLite...")
	defaults := []Monitor{
		{ID: "mon_agent", Name: "Go VPS Agent (Cloudflare Tunnel)", URL: "https://agent.mindzed.tech/health", Type: "HTTPS", IntervalSec: 60, Active: true},
		{ID: "mon_dokploy", Name: "Dokploy PaaS Manager", URL: "https://dokploy.mindzed.tech", Type: "HTTPS", IntervalSec: 60, Active: true},
		{ID: "mon_pgbouncer", Name: "PgBouncer Connection Pooler", URL: "129.154.34.1:6432", Type: "TCP", IntervalSec: 60, Active: true},
		{ID: "mon_mindzed", Name: "MindZed Primary Portal", URL: "https://mindzed.tech", Type: "HTTPS", IntervalSec: 60, Active: true},
	}

	for _, m := range defaults {
		_, _ = s.db.Exec(
			"INSERT INTO monitors (id, name, url, type, interval_sec, active) VALUES (?, ?, ?, ?, ?, ?)",
			m.ID, m.Name, m.URL, m.Type, m.IntervalSec, 1,
		)
	}
}

func (s *Store) ListMonitors() ([]Monitor, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rows, err := s.db.Query("SELECT id, name, url, type, interval_sec, active, created_at FROM monitors ORDER BY created_at ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var monitors []Monitor
	for rows.Next() {
		var m Monitor
		var activeInt int
		if err := rows.Scan(&m.ID, &m.Name, &m.URL, &m.Type, &m.IntervalSec, &activeInt, &m.CreatedAt); err != nil {
			continue
		}
		m.Active = activeInt == 1
		monitors = append(monitors, m)
	}
	return monitors, nil
}

func (s *Store) AddMonitor(name, url, probeType string, interval int) (*Monitor, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if interval <= 0 {
		interval = 60
	}
	id := "mon_" + uuid.New().String()[:8]

	_, err := s.db.Exec(
		"INSERT INTO monitors (id, name, url, type, interval_sec, active) VALUES (?, ?, ?, ?, ?, 1)",
		id, name, url, probeType, interval,
	)
	if err != nil {
		return nil, err
	}

	return &Monitor{
		ID:          id,
		Name:        name,
		URL:         url,
		Type:        probeType,
		IntervalSec: interval,
		Active:      true,
		CreatedAt:   time.Now().UTC(),
	}, nil
}

func (s *Store) DeleteMonitor(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec("DELETE FROM monitors WHERE id = ?", id)
	return err
}

func (s *Store) ToggleMonitor(id string, active bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	activeVal := 0
	if active {
		activeVal = 1
	}
	_, err := s.db.Exec("UPDATE monitors SET active = ? WHERE id = ?", activeVal, id)
	return err
}

func (s *Store) RecordHeartbeat(monitorID string, status int, latencyMs int64, statusCode int, errMsg string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec(
		"INSERT INTO heartbeats (monitor_id, status, latency_ms, status_code, error_msg, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
		monitorID, status, latencyMs, statusCode, errMsg,
	)
	return err
}

func (s *Store) GetRecentHeartbeats(monitorID string, limit int) ([]Heartbeat, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if limit <= 0 {
		limit = 30
	}

	rows, err := s.db.Query(
		"SELECT id, monitor_id, status, latency_ms, COALESCE(status_code, 0), COALESCE(error_msg, ''), created_at FROM heartbeats WHERE monitor_id = ? ORDER BY id DESC LIMIT ?",
		monitorID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var hbs []Heartbeat
	for rows.Next() {
		var h Heartbeat
		if err := rows.Scan(&h.ID, &h.MonitorID, &h.Status, &h.LatencyMs, &h.StatusCode, &h.ErrorMsg, &h.CreatedAt); err != nil {
			continue
		}
		hbs = append(hbs, h)
	}

	// Reverse to chronological order (oldest to newest)
	for i, j := 0, len(hbs)-1; i < j; i, j = i+1, j-1 {
		hbs[i], hbs[j] = hbs[j], hbs[i]
	}
	return hbs, nil
}

func (s *Store) CalculateUptime(monitorID string, hours int) float64 {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var total, up int
	query := fmt.Sprintf("SELECT COUNT(*), COALESCE(SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END), 0) FROM heartbeats WHERE monitor_id = ? AND created_at >= datetime('now', '-%d hours')", hours)
	err := s.db.QueryRow(query, monitorID).Scan(&total, &up)
	if err != nil || total == 0 {
		return 100.0
	}
	return float64(up) / float64(total) * 100.0
}

func (s *Store) RecordIncident(monitorID, monitorName, title, impact, errMsg string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	id := "inc_" + uuid.New().String()[:8]
	_, err := s.db.Exec(
		"INSERT INTO incidents (id, monitor_id, monitor_name, title, status, impact, error_msg, started_at) VALUES (?, ?, ?, ?, 'active', ?, ?, CURRENT_TIMESTAMP)",
		id, monitorID, monitorName, title, impact, errMsg,
	)
	return id, err
}

func (s *Store) ResolveIncident(monitorID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Find active incident
	var id string
	var startedAt time.Time
	err := s.db.QueryRow("SELECT id, started_at FROM incidents WHERE monitor_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1", monitorID).Scan(&id, &startedAt)
	if err != nil {
		return nil // No active incident
	}

	duration := int(time.Since(startedAt).Seconds())
	_, err = s.db.Exec("UPDATE incidents SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP, duration_sec = ? WHERE id = ?", duration, id)
	return err
}

func (s *Store) ListIncidents(limit int) ([]Incident, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if limit <= 0 {
		limit = 10
	}

	rows, err := s.db.Query("SELECT id, monitor_id, monitor_name, title, status, impact, COALESCE(error_msg, ''), started_at, resolved_at, duration_sec FROM incidents ORDER BY started_at DESC LIMIT ?", limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var incidents []Incident
	for rows.Next() {
		var inc Incident
		var resolvedAt sql.NullString
		if err := rows.Scan(&inc.ID, &inc.MonitorID, &inc.MonitorName, &inc.Title, &inc.Status, &inc.Impact, &inc.ErrorMsg, &inc.StartedAt, &resolvedAt, &inc.DurationSec); err != nil {
			continue
		}
		if resolvedAt.Valid {
			inc.ResolvedAt = &resolvedAt.String
		}
		incidents = append(incidents, inc)
	}
	return incidents, nil
}

func (s *Store) PruneOldData(days int) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if days <= 0 {
		days = 30
	}

	query := fmt.Sprintf("DELETE FROM heartbeats WHERE created_at < datetime('now', '-%d days')", days)
	_, err := s.db.Exec(query)
	if err == nil {
		_, _ = s.db.Exec("VACUUM")
	}
	return err
}
