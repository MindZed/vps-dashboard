package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/mindzed/mindzed-agent/handler"
)

// sanitizeDatabaseURL cleans connection strings, strips quotes, URL-encodes special characters in passwords, and ensures sslmode=disable
func sanitizeDatabaseURL(raw string) string {
	raw = strings.Trim(strings.TrimSpace(raw), "\"'`\r\n\t")
	if raw == "" || strings.EqualFold(raw, "none") || strings.EqualFold(raw, "false") || strings.EqualFold(raw, "disabled") {
		return ""
	}

	// Auto-prepend postgres:// if missing
	if !strings.HasPrefix(raw, "postgres://") && !strings.HasPrefix(raw, "postgresql://") {
		raw = "postgres://" + raw
	}

	schemaIdx := strings.Index(raw, "://")
	if schemaIdx == -1 {
		return ""
	}
	schema := raw[:schemaIdx+3]
	remainder := raw[schemaIdx+3:]

	lastAtIdx := strings.LastIndex(remainder, "@")
	if lastAtIdx == -1 {
		return ""
	}

	userPass := remainder[:lastAtIdx]
	hostDb := remainder[lastAtIdx+1:]

	colonIdx := strings.Index(userPass, ":")
	if colonIdx == -1 {
		return ""
	}

	user := userPass[:colonIdx]
	pass := userPass[colonIdx+1:]

	// Unescape first if user already put %40, then escape properly to prevent double-encoding
	if unescaped, err := url.QueryUnescape(pass); err == nil {
		pass = unescaped
	}
	escapedPass := url.QueryEscape(pass)
	escapedPass = strings.ReplaceAll(escapedPass, "+", "%20")

	// Ensure sslmode parameter exists for internal Docker connections
	if !strings.Contains(hostDb, "sslmode=") {
		if strings.Contains(hostDb, "?") {
			hostDb += "&sslmode=disable"
		} else {
			hostDb += "?sslmode=disable"
		}
	}

	return fmt.Sprintf("%s%s:%s@%s", schema, user, escapedPass, hostDb)
}

// maskDatabaseURL redacts credentials from database URL for secure logging
func maskDatabaseURL(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return "(masked-url)"
	}
	return u.Redacted()
}

func main() {
	// 1. Load .env if present
	_ = godotenv.Load()

	// 2. Environment config
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	agentSecret := os.Getenv("AGENT_SECRET")
	if agentSecret == "" {
		log.Println("[WARN] AGENT_SECRET is not set! Using default development secret.")
		agentSecret = "mindzed-insecure-dev-secret-change-me"
	}

	ginMode := os.Getenv("GIN_MODE")
	if ginMode == "" {
		gin.SetMode(gin.ReleaseMode)
	}

	// 3. PostgreSQL Connection Pool (Optional - Whitelist is persisted to JSON file)
	rawDBUrl := os.Getenv("DATABASE_URL")
	pgConnString := ""

	if rawDBUrl != "" {
		pgConnString = sanitizeDatabaseURL(rawDBUrl)
	} else if os.Getenv("PG_PASSWORD") != "" {
		pgHost := os.Getenv("PG_HOST")
		if pgHost == "" {
			pgHost = "postgres-databases-sharedpostgres-kooq42"
		}
		pgPort := os.Getenv("PG_PORT")
		if pgPort == "" {
			pgPort = "5432"
		}
		pgUser := os.Getenv("PG_USER")
		if pgUser == "" {
			pgUser = "postgres"
		}
		pgPass := os.Getenv("PG_PASSWORD")
		pgDB := os.Getenv("PG_DATABASE")
		if pgDB == "" {
			pgDB = "postgres"
		}
		pgSSL := os.Getenv("PG_SSLMODE")
		if pgSSL == "" {
			pgSSL = "disable"
		}

		escapedPass := url.QueryEscape(pgPass)
		escapedPass = strings.ReplaceAll(escapedPass, "+", "%20")
		pgConnString = fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=%s",
			pgUser, escapedPass, pgHost, pgPort, pgDB, pgSSL)
	}

	var pool *pgxpool.Pool
	if pgConnString != "" {
		log.Printf("[INFO] Attempting PostgreSQL connection to: %s", maskDatabaseURL(pgConnString))
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		var err error
		pool, err = pgxpool.New(ctx, pgConnString)
		if err != nil {
			log.Printf("[WARN] Initial PostgreSQL connection pool creation failed: %v", err)
		} else if err := pool.Ping(ctx); err != nil {
			log.Printf("[WARN] PostgreSQL ping failed: %v (daemon will run, vitals available)", err)
		} else {
			log.Printf("[INFO] Connected successfully to PostgreSQL at %s", maskDatabaseURL(pgConnString))
		}
	} else {
		log.Println("[INFO] PostgreSQL not configured. MindZed Agent running in vitals-only mode (whitelist stored in JSON).")
	}

	dbManager := handler.NewDBManager(pool)
	explorerManager := handler.NewExplorerManager(pgConnString)

	// 4. Gin Router Setup
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(gin.LoggerWithConfig(gin.LoggerConfig{
		SkipPaths: []string{"/health"},
	}))

	// CORS Setup
	r.Use(cors.New(cors.Config{
		AllowAllOrigins:  true,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Agent-Secret"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	// 5. Public Endpoints (for Cloudflare Tunnel, Dokploy, and Uptime Kuma)
	r.GET("/health", func(c *gin.Context) {
		pgStatus := "connected"
		if pool == nil {
			pgStatus = "disconnected"
		} else if err := pool.Ping(c.Request.Context()); err != nil {
			pgStatus = "unreachable"
		}

		c.JSON(http.StatusOK, gin.H{
			"status":      "ok",
			"service":     "mindzed-agent",
			"version":     "1.0.0",
			"postgres":    pgStatus,
			"timestamp":   time.Now().UTC().Format(time.RFC3339),
		})
	})

	r.GET("/", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"service": "MindZed VPS Agent",
			"version": "1.0.0",
			"health":  "/health",
		})
	})

	// 6. Security Middleware for Protected API routes
	authMiddleware := func(c *gin.Context) {
		clientSecret := c.GetHeader("X-Agent-Secret")
		if clientSecret == "" {
			// Check Authorization: Bearer <secret>
			authHeader := c.GetHeader("Authorization")
			if strings.HasPrefix(authHeader, "Bearer ") {
				clientSecret = strings.TrimPrefix(authHeader, "Bearer ")
			}
		}

		if clientSecret == "" || clientSecret != agentSecret {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error":   "Unauthorized",
				"message": "Missing or invalid X-Agent-Secret header",
			})
			return
		}
		c.Next()
	}

	// 7. Protected Routes
	v1 := r.Group("/api/v1")
	v1.Use(authMiddleware)
	{
		// System telemetry & Network ports
		v1.GET("/system/vitals", handler.GetSystemVitalsHandler)
		v1.GET("/system/network/ports", handler.GetNetworkPortsHandler)

		// Neon-style Database Provisioning
		v1.GET("/databases", dbManager.ListDatabases)
		v1.POST("/databases", dbManager.CreateDatabase)
		v1.DELETE("/databases/:name", dbManager.DeleteDatabase)
		v1.POST("/databases/:name/reset-password", dbManager.ResetDatabasePassword)

		// Neon & Supabase-style Database Explorer & SQL Console
		v1.GET("/explorer/tables", explorerManager.ListTables)
		v1.GET("/explorer/schema", explorerManager.GetTableSchema)
		v1.POST("/explorer/rows", explorerManager.GetRows)
		v1.POST("/explorer/insert", explorerManager.InsertRow)
		v1.PATCH("/explorer/update", explorerManager.UpdateRow)
		v1.POST("/explorer/delete", explorerManager.DeleteRows)
		v1.POST("/explorer/create-table", explorerManager.CreateTable)
		v1.POST("/explorer/query", explorerManager.ExecuteQuery)

		// GitHub Whitelist & First-User Admin Management
		v1.GET("/auth/whitelist", dbManager.GetWhitelist)
		v1.POST("/auth/whitelist/claim", dbManager.ClaimAdmin)
		v1.POST("/auth/whitelist", dbManager.AddWhitelistUser)
		v1.DELETE("/auth/whitelist/:username", dbManager.DeleteWhitelistUser)
		v1.GET("/auth/verify/:username", dbManager.VerifyUser)
	}

	// 8. Graceful Server Startup & Shutdown
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("[INFO] MindZed Agent listening on port :%s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[FATAL] Listen error: %s\n", err)
		}
	}()

	// Wait for interrupt signal to gracefully shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("[INFO] Shutting down MindZed Agent...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("[FATAL] Server forced to shutdown: %v", err)
	}

	if pool != nil {
		pool.Close()
	}

	log.Println("[INFO] MindZed Agent exited properly.")
}
