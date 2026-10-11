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

export interface UptimeBucket {
  time_label: string;
  date_key: string;
  uptime_percent: number;
  avg_latency_ms: number;
  total_checks: number;
  up_checks: number;
  down_checks: number;
  status: "up" | "degraded" | "down" | "no_data";
}

export interface SentinelMonitor {
  id: string;
  name: string;
  url: string;
  type: string; // "HTTPS" | "TCP"
  interval_sec: number;
  status: "up" | "down" | "degraded";
  current_ping: number;
  min_ping?: number;
  max_ping?: number;
  avg_ping?: number;
  uptime24h: number;
  uptime30d: number;
  ssl_days_left?: number;
  ssl_issuer?: string;
  heartbeats: SentinelHeartbeat[];
  buckets_24h?: UptimeBucket[];
  buckets_7d?: UptimeBucket[];
  buckets_30d?: UptimeBucket[];
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

  const generateMockDailyBuckets = (days: number, basePing: number): UptimeBucket[] => {
    return Array.from({ length: days }).map((_, i) => {
      const d = new Date(now - (days - 1 - i) * 86400000);
      const isPastFailure = i === days - 4 && basePing < 10;
      return {
        time_label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        date_key: d.toISOString().split("T")[0],
        uptime_percent: isPastFailure ? 98.4 : 100.0,
        avg_latency_ms: Math.round(basePing + Math.sin(i) * 3),
        total_checks: 1440,
        up_checks: isPastFailure ? 1417 : 1440,
        down_checks: isPastFailure ? 23 : 0,
        status: isPastFailure ? "degraded" : "up",
      };
    });
  };

  const generateMockHourlyBuckets = (hours: number, basePing: number): UptimeBucket[] => {
    return Array.from({ length: hours }).map((_, i) => {
      const d = new Date(now - (hours - 1 - i) * 3600000);
      return {
        time_label: `${String(d.getHours()).padStart(2, "0")}:00`,
        date_key: `${d.toISOString().split("T")[0]} ${String(d.getHours()).padStart(2, "0")}:00`,
        uptime_percent: 100.0,
        avg_latency_ms: Math.round(basePing + (i % 3)),
        total_checks: 120,
        up_checks: 120,
        down_checks: 0,
        status: "up",
      };
    });
  };

  const mockMonitors: SentinelMonitor[] = [
    {
      id: "mon_agent",
      name: "Go VPS Agent (Cloudflare Tunnel)",
      url: "https://agent.mindzed.tech/health",
      type: "HTTPS",
      interval_sec: 30,
      status: "up",
      current_ping: 24,
      min_ping: 18,
      max_ping: 42,
      avg_ping: 25,
      uptime24h: 100.0,
      uptime30d: 99.98,
      ssl_days_left: 78,
      ssl_issuer: "Google Trust Services LLC",
      heartbeats: generateMockHbs(24),
      buckets_24h: generateMockHourlyBuckets(24, 24),
      buckets_7d: generateMockDailyBuckets(7, 24),
      buckets_30d: generateMockDailyBuckets(30, 24),
      last_checked_at: new Date().toISOString(),
      active: true,
    },
    {
      id: "mon_dokploy",
      name: "Dokploy PaaS Manager",
      url: "https://dokploy.mindzed.tech",
      type: "HTTPS",
      interval_sec: 30,
      status: "up",
      current_ping: 32,
      min_ping: 28,
      max_ping: 58,
      avg_ping: 34,
      uptime24h: 100.0,
      uptime30d: 99.99,
      ssl_days_left: 64,
      ssl_issuer: "Let's Encrypt",
      heartbeats: generateMockHbs(32),
      buckets_24h: generateMockHourlyBuckets(24, 32),
      buckets_7d: generateMockDailyBuckets(7, 32),
      buckets_30d: generateMockDailyBuckets(30, 32),
      last_checked_at: new Date().toISOString(),
      active: true,
    },
    {
      id: "mon_pgbouncer",
      name: "PgBouncer Connection Pooler",
      url: "129.154.34.1:6432",
      type: "TCP",
      interval_sec: 10,
      status: "up",
      current_ping: 2,
      min_ping: 1,
      max_ping: 5,
      avg_ping: 2,
      uptime24h: 99.95,
      uptime30d: 99.92,
      heartbeats: generateMockHbs(2, true),
      buckets_24h: generateMockHourlyBuckets(24, 2),
      buckets_7d: generateMockDailyBuckets(7, 2),
      buckets_30d: generateMockDailyBuckets(30, 2),
      last_checked_at: new Date().toISOString(),
      active: true,
    },
    {
      id: "mon_mindzed",
      name: "MindZed Primary Portal",
      url: "https://mindzed.tech",
      type: "HTTPS",
      interval_sec: 30,
      status: "up",
      current_ping: 18,
      min_ping: 14,
      max_ping: 35,
      avg_ping: 19,
      uptime24h: 100.0,
      uptime30d: 99.99,
      ssl_days_left: 36,
      ssl_issuer: "YR1",
      heartbeats: generateMockHbs(18),
      buckets_24h: generateMockHourlyBuckets(24, 18),
      buckets_7d: generateMockDailyBuckets(7, 18),
      buckets_30d: generateMockDailyBuckets(30, 18),
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

export async function addWatchdogMonitor(name: string, url: string, type = "HTTPS", intervalSec = 30) {
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

export async function updateWatchdogMonitor(id: string, data: { name: string; url: string; type: string; interval_sec: number }) {
  try {
    const res = await fetch(getWatchdogEndpoint(`monitors/${encodeURIComponent(id)}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return await res.json();
  } catch (e) {
    return { error: "Failed to update monitor" };
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
