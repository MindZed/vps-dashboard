package handler

import (
	"fmt"
	"math"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
	psutilnet "github.com/shirou/gopsutil/v3/net"
)

// SystemVitalsResponse represents the host resource telemetry payload.
type SystemVitalsResponse struct {
	CPUUsagePct   float64 `json:"cpu_usage_pct"`
	RAMUsedMB     uint64  `json:"ram_used_mb"`
	RAMTotalMB    uint64  `json:"ram_total_mb"`
	DiskUsedGB    float64 `json:"disk_used_gb"`
	DiskTotalGB   float64 `json:"disk_total_gb"`
	UptimeSeconds uint64  `json:"uptime_seconds"`
	NetBytesSent  uint64  `json:"net_bytes_sent"`
	NetBytesRecv  uint64  `json:"net_bytes_recv"`
	Timestamp     string  `json:"timestamp"`
}

// ListeningPort represents a network port with security exposure classification.
type ListeningPort struct {
	Port     uint32 `json:"port"`
	Service  string `json:"service"`
	BindIP   string `json:"bind_ip"`
	Status   string `json:"status"` // "safe_local", "docker_internal", "public_exposed"
	Protocol string `json:"protocol"`
}

// NetworkPortsResponse represents the network security summary.
type NetworkPortsResponse struct {
	TotalListening int             `json:"total_listening"`
	PublicExposed  int             `json:"public_exposed"`
	DockerInternal int             `json:"docker_internal"`
	SafeLocal      int             `json:"safe_local"`
	Ports          []ListeningPort `json:"ports"`
	HostOS         string          `json:"host_os"`
	KernelVersion  string          `json:"kernel_version"`
	Architecture   string          `json:"architecture"`
	Timestamp      string          `json:"timestamp"`
}

// roundToDecimals rounds float to specified decimal places
func roundToDecimals(val float64, decimals int) float64 {
	pow := math.Pow(10, float64(decimals))
	return math.Round(val*pow) / pow
}

// GetSystemVitalsHandler collects real-time CPU, RAM, Disk, and Host metrics.
func GetSystemVitalsHandler(c *gin.Context) {
	// 1. CPU Percentage (over 150ms window)
	cpuPercents, err := cpu.Percent(150*time.Millisecond, false)
	cpuUsage := 0.0
	if err == nil && len(cpuPercents) > 0 {
		cpuUsage = roundToDecimals(cpuPercents[0], 1)
	}

	// 2. RAM Usage
	vmStat, err := mem.VirtualMemory()
	var ramUsedMB, ramTotalMB uint64
	if err == nil {
		ramUsedMB = vmStat.Used / 1024 / 1024
		ramTotalMB = vmStat.Total / 1024 / 1024
	}

	// 3. Disk Usage (Root mount "/")
	diskStat, err := disk.Usage("/")
	var diskUsedGB, diskTotalGB float64
	if err == nil {
		diskUsedGB = roundToDecimals(float64(diskStat.Used)/(1024*1024*1024), 1)
		diskTotalGB = roundToDecimals(float64(diskStat.Total)/(1024*1024*1024), 1)
	}

	// 4. Host Uptime
	uptime, _ := host.Uptime()

	// 5. Network Stats
	var netSent, netRecv uint64
	netCounters, err := psutilnet.IOCounters(false)
	if err == nil && len(netCounters) > 0 {
		netSent = netCounters[0].BytesSent
		netRecv = netCounters[0].BytesRecv
	}

	response := SystemVitalsResponse{
		CPUUsagePct:   cpuUsage,
		RAMUsedMB:     ramUsedMB,
		RAMTotalMB:    ramTotalMB,
		DiskUsedGB:    diskUsedGB,
		DiskTotalGB:   diskTotalGB,
		UptimeSeconds: uptime,
		NetBytesSent:  netSent,
		NetBytesRecv:  netRecv,
		Timestamp:     time.Now().UTC().Format(time.RFC3339),
	}

	c.JSON(http.StatusOK, response)
}

// inferServiceName maps well-known ports to human-readable services
func inferServiceName(port uint32) string {
	switch port {
	case 22:
		return "OpenSSH Daemon"
	case 80:
		return "HTTP Gateway (Traefik)"
	case 443:
		return "HTTPS Gateway / Cloudflare Tunnel"
	case 3000:
		return "Dokploy Management UI"
	case 5432:
		return "PostgreSQL Primary Cluster"
	case 5433:
		return "PostgreSQL SSH Tunnel Forward"
	case 6379:
		return "Redis In-Memory Cache"
	case 8080:
		return "MindZed Agent API"
	case 9000:
		return "Traefik Dashboard"
	default:
		return fmt.Sprintf("Service (Port %d)", port)
	}
}

// classifyBindIP determines exposure risk level
func classifyBindIP(ip string) string {
	if ip == "127.0.0.1" || ip == "::1" || strings.HasPrefix(ip, "127.") {
		return "safe_local"
	}
	if strings.HasPrefix(ip, "172.") || strings.HasPrefix(ip, "10.") || strings.HasPrefix(ip, "192.168.") {
		return "docker_internal"
	}
	return "public_exposed"
}

// GetNetworkPortsHandler reads active listening TCP sockets and classifies security exposure.
func GetNetworkPortsHandler(c *gin.Context) {
	connections, err := psutilnet.Connections("tcp")
	seenPorts := make(map[uint32]bool)
	var ports []ListeningPort

	if err == nil {
		for _, conn := range connections {
			if conn.Status == "LISTEN" && conn.Laddr.Port > 0 {
				port := conn.Laddr.Port
				if seenPorts[port] {
					continue
				}
				seenPorts[port] = true

				bindIP := conn.Laddr.IP
				if bindIP == "" || bindIP == "0.0.0.0" {
					bindIP = "0.0.0.0"
				} else if bindIP == "::" {
					bindIP = ":: (all IPv6)"
				}

				status := classifyBindIP(conn.Laddr.IP)

				ports = append(ports, ListeningPort{
					Port:     port,
					Service:  inferServiceName(port),
					BindIP:   bindIP,
					Status:   status,
					Protocol: "TCP",
				})
			}
		}
	}

	// Sort ports ascending
	sort.Slice(ports, func(i, j int) bool {
		return ports[i].Port < ports[j].Port
	})

	// Tally counts
	var publicCount, dockerCount, localCount int
	for _, p := range ports {
		switch p.Status {
		case "public_exposed":
			publicCount++
		case "docker_internal":
			dockerCount++
		case "safe_local":
			localCount++
		}
	}

	// Host system information
	hostInfo, _ := host.Info()
	hostOS := "Oracle Linux Server 9.4 (Ampere)"
	kernel := "5.15.0-oracle"
	arch := "arm64"
	if hostInfo != nil {
		if hostInfo.Platform != "" {
			hostOS = fmt.Sprintf("%s %s", hostInfo.Platform, hostInfo.PlatformVersion)
		}
		if hostInfo.KernelVersion != "" {
			kernel = hostInfo.KernelVersion
		}
		if hostInfo.KernelArch != "" {
			arch = hostInfo.KernelArch
		}
	}

	c.JSON(http.StatusOK, NetworkPortsResponse{
		TotalListening: len(ports),
		PublicExposed:  publicCount,
		DockerInternal: dockerCount,
		SafeLocal:      localCount,
		Ports:          ports,
		HostOS:         hostOS,
		KernelVersion:  kernel,
		Architecture:   arch,
		Timestamp:      time.Now().UTC().Format(time.RFC3339),
	})
}
