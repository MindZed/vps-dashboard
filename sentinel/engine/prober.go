package engine

import (
	"crypto/tls"
	"fmt"
	"net"
	"net/http"
	"net/http/httptrace"
	"strings"
	"time"
)

type SSLCertInfo struct {
	Issuer        string    `json:"issuer"`
	Subject       string    `json:"subject"`
	ValidFrom     time.Time `json:"valid_from"`
	ValidUntil    time.Time `json:"valid_until"`
	DaysRemaining int       `json:"days_remaining"`
	IsValid       bool      `json:"is_valid"`
}

type ProbeResult struct {
	Target         string       `json:"target"`
	Type           string       `json:"type"`
	Status         string       `json:"status"` // "up", "down", "degraded"
	StatusCode     int          `json:"status_code,omitempty"`
	LatencyMs      int64        `json:"latency_ms"`
	DNSLookupMs    int64        `json:"dns_lookup_ms,omitempty"`
	TCPConnectMs   int64        `json:"tcp_connect_ms,omitempty"`
	TLSHandshakeMs int64        `json:"tls_handshake_ms,omitempty"`
	TTFBMs         int64        `json:"ttfb_ms,omitempty"`
	SSLCert        *SSLCertInfo `json:"ssl_cert,omitempty"`
	ErrorMessage   string       `json:"error_message,omitempty"`
	Timestamp      string       `json:"timestamp"`
}

// ProbeTarget performs an enterprise-grade synthetic probe on a URL or TCP host:port
func ProbeTarget(target, probeType string, timeout time.Duration) *ProbeResult {
	if timeout <= 0 {
		timeout = 5 * time.Second
	}

	normalizedType := strings.ToUpper(strings.TrimSpace(probeType))
	if normalizedType == "TCP" || strings.HasPrefix(target, "tcp://") {
		return ProbeTCP(target, timeout)
	}

	return ProbeHTTP(target, timeout)
}

// ProbeHTTP probes an HTTP/HTTPS endpoint with full httptrace breakdown and SSL inspection
func ProbeHTTP(rawURL string, timeout time.Duration) *ProbeResult {
	if !strings.HasPrefix(rawURL, "http://") && !strings.HasPrefix(rawURL, "https://") {
		rawURL = "https://" + rawURL
	}

	result := &ProbeResult{
		Target:    rawURL,
		Type:      "HTTPS",
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}
	if strings.HasPrefix(rawURL, "http://") {
		result.Type = "HTTP"
	}

	var dnsStart, dnsDone, connStart, connDone, tlsStart, tlsDone, firstByte time.Time

	trace := &httptrace.ClientTrace{
		DNSStart: func(_ httptrace.DNSStartInfo) { dnsStart = time.Now() },
		DNSDone:  func(_ httptrace.DNSDoneInfo) { dnsDone = time.Now() },
		ConnectStart: func(_, _ string) { connStart = time.Now() },
		ConnectDone: func(_, _ string, _ error) { connDone = time.Now() },
		TLSHandshakeStart: func() { tlsStart = time.Now() },
		TLSHandshakeDone: func(_ tls.ConnectionState, _ error) { tlsDone = time.Now() },
		GotFirstResponseByte: func() { firstByte = time.Now() },
	}

	req, err := http.NewRequest("GET", rawURL, nil)
	if err != nil {
		result.Status = "down"
		result.ErrorMessage = fmt.Sprintf("Invalid URL: %v", err)
		return result
	}
	req.Header.Set("User-Agent", "MindZed-Sentinel/1.0 (Enterprise Watchdog)")
	req = req.WithContext(httptrace.WithClientTrace(req.Context(), trace))

	client := &http.Client{
		Timeout: timeout,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				InsecureSkipVerify: false,
			},
			DisableKeepAlives: true,
		},
	}

	startTotal := time.Now()
	resp, err := client.Do(req)
	totalDuration := time.Since(startTotal)

	result.LatencyMs = totalDuration.Milliseconds()

	if !dnsStart.IsZero() && !dnsDone.IsZero() {
		result.DNSLookupMs = dnsDone.Sub(dnsStart).Milliseconds()
	}
	if !connStart.IsZero() && !connDone.IsZero() {
		result.TCPConnectMs = connDone.Sub(connStart).Milliseconds()
	}
	if !tlsStart.IsZero() && !tlsDone.IsZero() {
		result.TLSHandshakeMs = tlsDone.Sub(tlsStart).Milliseconds()
	}
	if !firstByte.IsZero() {
		result.TTFBMs = firstByte.Sub(startTotal).Milliseconds()
	}

	if err != nil {
		result.Status = "down"
		result.ErrorMessage = err.Error()
		return result
	}
	defer resp.Body.Close()

	result.StatusCode = resp.StatusCode

	// Parse TLS Certificate if HTTPS
	if resp.TLS != nil && len(resp.TLS.PeerCertificates) > 0 {
		cert := resp.TLS.PeerCertificates[0]
		daysRemaining := int(time.Until(cert.NotAfter).Hours() / 24)
		result.SSLCert = &SSLCertInfo{
			Issuer:        cert.Issuer.CommonName,
			Subject:       cert.Subject.CommonName,
			ValidFrom:     cert.NotBefore,
			ValidUntil:    cert.NotAfter,
			DaysRemaining: daysRemaining,
			IsValid:       daysRemaining > 0,
		}
	}

	// Determine UP / DOWN based on HTTP status
	if resp.StatusCode >= 200 && resp.StatusCode < 400 {
		result.Status = "up"
	} else if resp.StatusCode >= 400 && resp.StatusCode < 500 {
		result.Status = "degraded"
		result.ErrorMessage = fmt.Sprintf("HTTP %d Client Warning", resp.StatusCode)
	} else {
		result.Status = "down"
		result.ErrorMessage = fmt.Sprintf("HTTP %d Server Error", resp.StatusCode)
	}

	return result
}

// ProbeTCP probes a TCP socket (e.g. PgBouncer 6432, Postgres 5432, Redis 6379)
func ProbeTCP(rawTarget string, timeout time.Duration) *ProbeResult {
	cleanTarget := strings.TrimPrefix(rawTarget, "tcp://")
	if !strings.Contains(cleanTarget, ":") {
		cleanTarget = cleanTarget + ":80"
	}

	result := &ProbeResult{
		Target:    cleanTarget,
		Type:      "TCP",
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}

	start := time.Now()
	conn, err := net.DialTimeout("tcp", cleanTarget, timeout)
	latency := time.Since(start)

	result.LatencyMs = latency.Milliseconds()

	if err != nil {
		result.Status = "down"
		result.ErrorMessage = err.Error()
		return result
	}
	_ = conn.Close()

	result.Status = "up"
	return result
}
