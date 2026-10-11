package handler

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"mindzed-sentinel/engine"
	"mindzed-sentinel/storage"

	"github.com/gin-gonic/gin"
)

type APIHandler struct {
	Store *storage.Store
}

func NewAPIHandler(store *storage.Store) *APIHandler {
	return &APIHandler{Store: store}
}

// HealthHandler returns public liveness for Cloudflare Tunnel
func (h *APIHandler) HealthHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":    "ok",
		"service":   "mindzed-sentinel",
		"version":   "1.0.0",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

// ProbeSiteHandler performs an instant real-time synthetic probe on ANY website or host:port
func (h *APIHandler) ProbeSiteHandler(c *gin.Context) {
	var body struct {
		Target    string `json:"target" binding:"required"`
		Type      string `json:"type"`       // "HTTP", "HTTPS", "TCP"
		TimeoutMs int    `json:"timeout_ms"` // e.g. 5000
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Target URL or host:port is required"})
		return
	}

	timeout := 6 * time.Second
	if body.TimeoutMs > 0 && body.TimeoutMs <= 30000 {
		timeout = time.Duration(body.TimeoutMs) * time.Millisecond
	}

	result := engine.ProbeTarget(body.Target, body.Type, timeout)
	c.JSON(http.StatusOK, result)
}

// GetStatusHandler returns the overall status page for the entire monitored fleet
func (h *APIHandler) GetStatusHandler(c *gin.Context) {
	monitors, err := h.Store.ListMonitors()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch monitors"})
		return
	}

	type MonitorStatus struct {
		ID            string                 `json:"id"`
		Name          string                 `json:"name"`
		URL           string                 `json:"url"`
		Type          string                 `json:"type"`
		IntervalSec   int                    `json:"interval_sec"`
		Status        string                 `json:"status"` // "up", "down", "degraded"
		CurrentPing   int64                  `json:"current_ping"`
		MinPing       int64                  `json:"min_ping"`
		MaxPing       int64                  `json:"max_ping"`
		AvgPing       int64                  `json:"avg_ping"`
		Uptime24h     float64                `json:"uptime24h"`
		Uptime30d     float64                `json:"uptime30d"`
		SSLDaysLeft   *int                   `json:"ssl_days_left,omitempty"`
		SSLIssuer     *string                `json:"ssl_issuer,omitempty"`
		Heartbeats    []storage.Heartbeat    `json:"heartbeats"`
		Buckets24h    []storage.UptimeBucket `json:"buckets_24h"`
		Buckets7d     []storage.UptimeBucket `json:"buckets_7d"`
		Buckets30d    []storage.UptimeBucket `json:"buckets_30d"`
		LastCheckedAt string                 `json:"last_checked_at"`
		Active        bool                   `json:"active"`
	}

	var statusList []MonitorStatus
	var totalUptimeSum float64

	for _, m := range monitors {
		hbs, _ := h.Store.GetRecentHeartbeats(m.ID, 30)
		up24 := h.Store.CalculateUptime(m.ID, 24)
		up720 := h.Store.CalculateUptime(m.ID, 720)
		totalUptimeSum += up720

		minP, maxP, avgP := h.Store.GetMonitorStats(m.ID, 24)
		b24, _ := h.Store.GetHourlyBuckets(m.ID, 24)
		b7, _ := h.Store.GetDailyBuckets(m.ID, 7)
		b30, _ := h.Store.GetDailyBuckets(m.ID, 30)

		status := "up"
		var currentPing int64 = 0
		var lastChecked = time.Now().UTC().Format(time.RFC3339)

		if len(hbs) > 0 {
			lastHb := hbs[len(hbs)-1]
			currentPing = lastHb.LatencyMs
			lastChecked = lastHb.CreatedAt
			if lastHb.Status == 0 {
				status = "down"
			} else if lastHb.Status == 2 {
				status = "degraded"
			}
		}

		interval := m.IntervalSec
		if interval <= 0 {
			interval = 30
		}

		ms := MonitorStatus{
			ID:            m.ID,
			Name:          m.Name,
			URL:           m.URL,
			Type:          m.Type,
			IntervalSec:   interval,
			Status:        status,
			CurrentPing:   currentPing,
			MinPing:       minP,
			MaxPing:       maxP,
			AvgPing:       avgP,
			Uptime24h:     float64(int(up24*100)) / 100,
			Uptime30d:     float64(int(up720*100)) / 100,
			Heartbeats:    hbs,
			Buckets24h:    b24,
			Buckets7d:     b7,
			Buckets30d:    b30,
			LastCheckedAt: lastChecked,
			Active:        m.Active,
		}

		statusList = append(statusList, ms)
	}

	var overallUptime float64 = 100.0
	if len(monitors) > 0 {
		overallUptime = float64(int((totalUptimeSum/float64(len(monitors)))*100)) / 100
	}

	incidents, _ := h.Store.ListIncidents(5)

	c.JSON(http.StatusOK, gin.H{
		"overall_uptime": overallUptime,
		"total_monitors": len(monitors),
		"monitors":       statusList,
		"incidents":      incidents,
		"last_updated":   time.Now().UTC().Format(time.RFC3339),
	})
}

// ListMonitorsHandler returns raw monitor records
func (h *APIHandler) ListMonitorsHandler(c *gin.Context) {
	monitors, err := h.Store.ListMonitors()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, monitors)
}

// AddMonitorHandler creates a new target monitor
func (h *APIHandler) AddMonitorHandler(c *gin.Context) {
	var body struct {
		Name        string `json:"name" binding:"required"`
		URL         string `json:"url" binding:"required"`
		Type        string `json:"type"`         // "HTTP", "HTTPS", "TCP"
		IntervalSec int    `json:"interval_sec"` // default 60
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name and url are required"})
		return
	}

	probeType := strings.ToUpper(strings.TrimSpace(body.Type))
	if probeType == "" {
		if strings.HasPrefix(body.URL, "tcp://") || (!strings.HasPrefix(body.URL, "http://") && !strings.HasPrefix(body.URL, "https://") && strings.Contains(body.URL, ":")) {
			probeType = "TCP"
		} else {
			probeType = "HTTPS"
		}
	}

	interval := body.IntervalSec
	if interval <= 0 {
		interval = 60
	}

	m, err := h.Store.AddMonitor(body.Name, body.URL, probeType, interval)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to add monitor: %v", err)})
		return
	}

	c.JSON(http.StatusCreated, m)
}

// UpdateMonitorHandler edits an existing monitor's configuration including tick interval
func (h *APIHandler) UpdateMonitorHandler(c *gin.Context) {
	id := c.Param("id")
	var body struct {
		Name        string `json:"name" binding:"required"`
		URL         string `json:"url" binding:"required"`
		Type        string `json:"type"`
		IntervalSec int    `json:"interval_sec"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name and url are required"})
		return
	}

	probeType := strings.ToUpper(strings.TrimSpace(body.Type))
	if probeType == "" {
		probeType = "HTTPS"
	}

	interval := body.IntervalSec
	if interval <= 0 {
		interval = 30
	}

	if err := h.Store.UpdateMonitor(id, body.Name, body.URL, probeType, interval); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to update monitor: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":      true,
		"message":      "Monitor updated successfully",
		"id":           id,
		"interval_sec": interval,
	})
}

// DeleteMonitorHandler removes a monitor
func (h *APIHandler) DeleteMonitorHandler(c *gin.Context) {
	id := c.Param("id")
	if err := h.Store.DeleteMonitor(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Monitor deleted"})
}

// ToggleMonitorHandler pauses or unpauses monitoring
func (h *APIHandler) ToggleMonitorHandler(c *gin.Context) {
	id := c.Param("id")
	var body struct {
		Active bool `json:"active"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "active (boolean) is required"})
		return
	}

	if err := h.Store.ToggleMonitor(id, body.Active); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "active": body.Active})
}

// ListIncidentsHandler returns incident log
func (h *APIHandler) ListIncidentsHandler(c *gin.Context) {
	incidents, err := h.Store.ListIncidents(20)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, incidents)
}
