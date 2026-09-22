export interface Heartbeat {
  status: 1 | 0 | 2; // 1 = UP, 0 = DOWN, 2 = PENDING
  time: string;
  ping: number;
}

export interface KumaMonitor {
  id: string;
  name: string;
  url: string;
  type: string;
  status: "up" | "down" | "degraded";
  currentPing: number;
  uptime24h: number;
  uptime30d: number;
  heartbeats: Heartbeat[];
}

export interface KumaIncident {
  id: string;
  monitorName: string;
  title: string;
  type: "resolved" | "investigating" | "maintenance";
  date: string;
  duration: string;
  impact: "none" | "minor" | "major";
}

export interface KumaStatusResponse {
  overallUptime: number;
  monitors: KumaMonitor[];
  incidents: KumaIncident[];
  lastUpdated: string;
  isMock: boolean;
}

export async function fetchKumaStatus(): Promise<KumaStatusResponse> {
  const kumaUrl = process.env.NEXT_PUBLIC_KUMA_URL;

  if (kumaUrl) {
    try {
      const res = await fetch(`${kumaUrl}/api/status-page/heartbeat/mindzed`, {
        headers: { Accept: "application/json" },
        next: { revalidate: 30 },
      });
      if (res.ok) {
        const raw = await res.json();
        // Transform raw Kuma format if needed or return mapped
        if (raw && raw.heartbeatList) {
          // Process real Kuma heartbeats
        }
      }
    } catch {
      // Fall through to mock
    }
  }

  // Realistic mock data for the 4 core targets
  const now = Date.now();
  const generateHeartbeats = (basePing: number, failureRate = 0): Heartbeat[] => {
    return Array.from({ length: 30 }).map((_, i) => {
      const isDown = failureRate > 0 && i === 12;
      return {
        status: isDown ? 0 : 1,
        time: new Date(now - (29 - i) * 15 * 60 * 1000).toISOString(),
        ping: isDown ? 0 : Math.round(basePing + (Math.sin(i) * 6) + (Math.random() * 4)),
      };
    });
  };

  const monitors: KumaMonitor[] = [
    {
      id: "mon_dokploy",
      name: "Dokploy PaaS Manager",
      url: "https://dokploy.mindzed.tech",
      type: "HTTPS",
      status: "up",
      currentPing: 34,
      uptime24h: 100.0,
      uptime30d: 99.98,
      heartbeats: generateHeartbeats(34),
    },
    {
      id: "mon_agent",
      name: "Go VPS Agent (Cloudflare Tunnel)",
      url: "https://agent.mindzed.tech/health",
      type: "HTTPS",
      status: "up",
      currentPing: 22,
      uptime24h: 100.0,
      uptime30d: 99.95,
      heartbeats: generateHeartbeats(22),
    },
    {
      id: "mon_mindzed",
      name: "MindZed Primary Portal",
      url: "https://mindzed.tech",
      type: "HTTPS",
      status: "up",
      currentPing: 18,
      uptime24h: 100.0,
      uptime30d: 99.99,
      heartbeats: generateHeartbeats(18),
    },
    {
      id: "mon_postgres",
      name: "PostgreSQL Swarm Cluster",
      url: "tcp://postgres-databases-sharedpostgres-kooq42:5432",
      type: "TCP Port",
      status: "up",
      currentPing: 2,
      uptime24h: 99.92,
      uptime30d: 99.91,
      heartbeats: generateHeartbeats(3, 0.03),
    },
  ];

  const incidents: KumaIncident[] = [
    {
      id: "inc_01",
      monitorName: "PostgreSQL Swarm Cluster",
      title: "Routine Docker Swarm rolling container update",
      type: "maintenance",
      date: "Yesterday at 03:15 UTC",
      duration: "45 seconds",
      impact: "minor",
    },
    {
      id: "inc_02",
      monitorName: "Go VPS Agent",
      title: "Cloudflare Tunnel automatic reconnect",
      type: "resolved",
      date: "3 days ago",
      duration: "12 seconds",
      impact: "none",
    },
  ];

  return {
    overallUptime: 99.98,
    monitors,
    incidents,
    lastUpdated: new Date().toISOString(),
    isMock: true,
  };
}
