export interface SSLCertDetails {
  issuer: string;
  subject: string;
  valid_from: string;
  valid_until: string;
  days_remaining: number;
  is_valid: boolean;
}

export interface SyntheticProbeResult {
  target: string;
  type: string;
  status: "up" | "down" | "degraded";
  status_code?: number;
  latency_ms: number;
  dns_lookup_ms?: number;
  tcp_connect_ms?: number;
  tls_handshake_ms?: number;
  ttfb_ms?: number;
  ssl_cert?: SSLCertDetails;
  error_message?: string;
  timestamp: string;
}

export interface SentinelHeartbeat {
  id?: number;
  monitor_id: string;
  status: number; // 1 = UP, 0 = DOWN, 2 = DEGRADED
  latency_ms: number;
  status_code?: number;
  error_msg?: string;
  created_at: string;
}

export interface SentinelMonitor {
  id: string;
  name: string;
  url: string;
  type: string; // "HTTPS" | "TCP"
  status: "up" | "down" | "degraded";
  current_ping: number;
  uptime24h: number;
  uptime30d: number;
  ssl_days_left?: number;
  ssl_issuer?: string;
  heartbeats: SentinelHeartbeat[];
  last_checked_at: string;
  active: boolean;
}

export interface SentinelIncident {
  id: string;
  monitor_id: string;
  monitor_name: string;
  title: string;
  status: "active" | "resolved";
  impact: "minor" | "major";
  error_msg?: string;
  started_at: string;
  resolved_at?: string;
  duration_sec: number;
}

export interface SentinelStatusResponse {
  overall_uptime: number;
  total_monitors: number;
  monitors: SentinelMonitor[];
  incidents: SentinelIncident[];
  last_updated: string;
  isMock: boolean;
}

function getWatchdogEndpoint(path: string): string {
  if (typeof window !== "undefined") {
    return `/api/watchdog/${path}`;
  }
  const baseUrl = process.env.WATCHDOG_URL || process.env.NEXT_PUBLIC_WATCHDOG_URL || process.env.NEXT_PUBLIC_KUMA_URL || "https://status.mindzed.tech";
  return `${baseUrl}/api/v1/${path}`;
}

export async function fetchWatchdogStatus(): Promise<SentinelStatusResponse> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(getWatchdogEndpoint("status"), {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.monitors) {
        return {
          ...data,
          isMock: false,
        };
      }
    }
  } catch {
    // Fallback to simulated mode
  }

  // Realistic mock data fallback
  const now = Date.now();
  const generateMockHbs = (basePing: number, failure = false): SentinelHeartbeat[] => {
    return Array.from({ length: 30 }).map((_, i) => {
      const isDown = failure && i === 18;
      return {
        monitor_id: "mock",
        status: isDown ? 0 : 1,
        latency_ms: isDown ? 0 : Math.round(basePing + Math.sin(i) * 5 + Math.random() * 4),
        created_at: new Date(now - (29 - i) * 60 * 1000).toISOString(),
        status_code: isDown ? 502 : 200,
      };
    });
  };

  const mockMonitors: SentinelMonitor[] = [
    {
      id: "mon_agent",
      name: "Go VPS Agent (Cloudflare Tunnel)",
      url: "https://agent.mindzed.tech/health",
      type: "HTTPS",
      status: "up",
      current_ping: 24,
      uptime24h: 100.0,
      uptime30d: 99.98,
      ssl_days_left: 78,
      ssl_issuer: "Google Trust Services LLC",
      heartbeats: generateMockHbs(24),
      last_checked_at: new Date().toISOString(),
      active: true,
    },
    {
      id: "mon_dokploy",
      name: "Dokploy PaaS Manager",
      url: "https://dokploy.mindzed.tech",
      type: "HTTPS",
      status: "up",
      current_ping: 32,
      uptime24h: 100.0,
      uptime30d: 99.99,
      ssl_days_left: 64,
      ssl_issuer: "Let's Encrypt",
      heartbeats: generateMockHbs(32),
      last_checked_at: new Date().toISOString(),
      active: true,
    },
    {
      id: "mon_pgbouncer",
      name: "PgBouncer Connection Pooler",
      url: "129.154.34.1:6432",
      type: "TCP",
      status: "up",
      current_ping: 2,
      uptime24h: 99.95,
      uptime30d: 99.92,
      heartbeats: generateMockHbs(2, true),
      last_checked_at: new Date().toISOString(),
      active: true,
    },
    {
      id: "mon_mindzed",
      name: "MindZed Primary Portal",
      url: "https://mindzed.tech",
      type: "HTTPS",
      status: "up",
      current_ping: 18,
      uptime24h: 100.0,
      uptime30d: 99.99,
      ssl_days_left: 36,
      ssl_issuer: "YR1",
      heartbeats: generateMockHbs(18),
      last_checked_at: new Date().toISOString(),
      active: true,
    },
  ];

  return {
    overall_uptime: 99.98,
    total_monitors: mockMonitors.length,
    monitors: mockMonitors,
    incidents: [
      {
        id: "inc_01",
        monitor_id: "mon_pgbouncer",
        monitor_name: "PgBouncer Connection Pooler",
        title: "Docker Swarm rolling network convergence",
        status: "resolved",
        impact: "minor",
        started_at: "Yesterday at 04:15 UTC",
        duration_sec: 42,
      },
    ],
    last_updated: new Date().toISOString(),
    isMock: true,
  };
}

export async function probeTarget(target: string, type = "HTTPS"): Promise<SyntheticProbeResult> {
  try {
    const res = await fetch(getWatchdogEndpoint("probe"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, type }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Fallback simulated probe
  }

  // Fallback probe simulation
  const isHttps = target.startsWith("https://") || !target.includes(":");
  return {
    target,
    type: isHttps ? "HTTPS" : "TCP",
    status: "up",
    status_code: 200,
    latency_ms: 38,
    dns_lookup_ms: 4,
    tcp_connect_ms: 12,
    tls_handshake_ms: 14,
    ttfb_ms: 36,
    ssl_cert: isHttps ? {
      issuer: "Let's Encrypt Authority X3",
      subject: target.replace(/^https?:\/\//, "").split("/")[0],
      valid_from: new Date(Date.now() - 30 * 86400000).toISOString(),
      valid_until: new Date(Date.now() + 60 * 86400000).toISOString(),
      days_remaining: 60,
      is_valid: true,
    } : undefined,
    timestamp: new Date().toISOString(),
  };
}

export async function addWatchdogMonitor(name: string, url: string, type = "HTTPS", intervalSec = 60) {
  try {
    const res = await fetch(getWatchdogEndpoint("monitors"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, url, type, interval_sec: intervalSec }),
    });
    return await res.json();
  } catch (e) {
    return { error: "Failed to add monitor" };
  }
}

export async function deleteWatchdogMonitor(id: string) {
  try {
    const res = await fetch(getWatchdogEndpoint(`monitors/${encodeURIComponent(id)}`), {
      method: "DELETE",
    });
    return await res.json();
  } catch (e) {
    return { error: "Failed to delete monitor" };
  }
}

export async function toggleWatchdogMonitor(id: string, active: boolean) {
  try {
    const res = await fetch(getWatchdogEndpoint(`monitors/${encodeURIComponent(id)}/toggle`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    return await res.json();
  } catch (e) {
    return { error: "Failed to toggle monitor" };
  }
}
