package main

import (
	"context"
	"crypto/subtle"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"mindzed-sentinel/engine"
	"mindzed-sentinel/handler"
	"mindzed-sentinel/storage"

	"github.com/gin-gonic/gin"
)

func main() {
	log.Println("[INIT] Starting MindZed Sentinel - Enterprise Micro Watchdog...")

	dbPath := os.Getenv("SENTINEL_DB_PATH")
	if dbPath == "" {
		dbPath = "data/sentinel.db"
	}

	store, err := storage.NewStore(dbPath)
	if err != nil {
		log.Fatalf("[FATAL] Failed to initialize SQLite store: %v", err)
	}
	defer store.Close()

	// 1. Start background probe scheduler
	stopScheduler := make(chan struct{})
	go startScheduler(store, stopScheduler)

	// 2. Start background 24-hour cleanup job
	go func() {
		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			log.Println("[MAINTENANCE] Pruning heartbeats older than 30 days...")
			_ = store.PruneOldData(30)
		}
	}()

	// 3. HTTP Server Setup
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())

	// CORS Middleware
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Agent-Secret, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	})

	apiHandler := handler.NewAPIHandler(store)

	// Public Health Liveness
	r.GET("/health", apiHandler.HealthHandler)

	// Protected Endpoints with X-Agent-Secret
	agentSecret := os.Getenv("SENTINEL_SECRET")
	if agentSecret == "" {
		agentSecret = os.Getenv("AGENT_SECRET")
	}
	if agentSecret == "" {
		log.Println("[SECURITY WARNING] SENTINEL_SECRET / AGENT_SECRET not configured!")
	}

	authMiddleware := func(c *gin.Context) {
		token := c.GetHeader("X-Agent-Secret")
		if token == "" || agentSecret == "" || subtle.ConstantTimeCompare([]byte(token), []byte(agentSecret)) != 1 {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error":   "Unauthorized",
				"message": "Invalid or missing X-Agent-Secret",
			})
			return
		}
		c.Next()
	}

	v1 := r.Group("/api/v1")
	v1.Use(authMiddleware)
	{
		// Instant On-Demand Probe
		v1.POST("/probe", apiHandler.ProbeSiteHandler)

		// Fleet Status & Incidents
		v1.GET("/status", apiHandler.GetStatusHandler)
		v1.GET("/incidents", apiHandler.ListIncidentsHandler)

		// Monitors CRUD
		v1.GET("/monitors", apiHandler.ListMonitorsHandler)
		v1.POST("/monitors", apiHandler.AddMonitorHandler)
		v1.PUT("/monitors/:id", apiHandler.UpdateMonitorHandler)
		v1.DELETE("/monitors/:id", apiHandler.DeleteMonitorHandler)
		v1.PATCH("/monitors/:id/toggle", apiHandler.ToggleMonitorHandler)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8085"
	}
	bindHost := os.Getenv("BIND_HOST")
	if bindHost == "" {
		bindHost = "127.0.0.1"
	}
	addr := fmt.Sprintf("%s:%s", bindHost, port)

	srv := &http.Server{
		Addr:         addr,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	go func() {
		log.Printf("[INFO] Sentinel API listening on http://%s", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[FATAL] ListenAndServe error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("[SHUTDOWN] Stopping Sentinel gracefully...")
	close(stopScheduler)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
	log.Println("[SHUTDOWN] Sentinel stopped cleanly.")
}

func startScheduler(store *storage.Store, stop <-chan struct{}) {
	// Master scheduler ticks every 5 seconds to evaluate monitor interval triggers
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	// Track active incidents per monitor in-memory
	activeIncidentMap := make(map[string]bool)
	// Track last probe time per monitor
	lastProbeMap := make(map[string]time.Time)

	checkAndProbe := func() {
		monitors, err := store.ListMonitors()
		if err != nil {
			return
		}

		now := time.Now()
		for _, m := range monitors {
			if !m.Active {
				continue
			}

			interval := m.IntervalSec
			if interval <= 0 {
				interval = 30
			}

			lastTime, exists := lastProbeMap[m.ID]
			if exists && now.Sub(lastTime) < time.Duration(interval)*time.Second {
				continue
			}

			lastProbeMap[m.ID] = now

			// Probe concurrently per monitor
			go func(mon storage.Monitor) {
				res := engine.ProbeTarget(mon.URL, mon.Type, 5*time.Second)

				statusInt := 1
				if res.Status == "down" {
					statusInt = 0
				} else if res.Status == "degraded" {
					statusInt = 2
				}

				_ = store.RecordHeartbeat(mon.ID, statusInt, res.LatencyMs, res.StatusCode, res.ErrorMessage)

				// Handle Incident State Changes
				if statusInt == 0 {
					if !activeIncidentMap[mon.ID] {
						activeIncidentMap[mon.ID] = true
						title := fmt.Sprintf("%s is unreachable (%s)", mon.Name, res.ErrorMessage)
						impact := "major"
						_, _ = store.RecordIncident(mon.ID, mon.Name, title, impact, res.ErrorMessage)
						log.Printf("[ALERT] Incident triggered: %s", title)
					}
				} else if statusInt == 1 {
					if activeIncidentMap[mon.ID] {
						activeIncidentMap[mon.ID] = false
						_ = store.ResolveIncident(mon.ID)
						log.Printf("[RECOVERY] Service restored: %s (%dms)", mon.Name, res.LatencyMs)
					}
				}
			}(m)
		}
	}

	// Initial immediate check on startup
	checkAndProbe()

	for {
		select {
		case <-ticker.C:
			checkAndProbe()
		case <-stop:
			return
		}
	}
}

