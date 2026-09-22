export interface SystemVitals {
  cpu_usage_pct: number;
  ram_used_mb: number;
  ram_total_mb: number;
  disk_used_gb: number;
  disk_total_gb: number;
  uptime_seconds: number;
  net_bytes_sent?: number;
  net_bytes_recv?: number;
  timestamp: string;
}

export interface ConnectionURLs {
  dokploy_internal: string;
  ssh_tunnel: string;
  external_vercel: string;
}

export interface DatabaseSummary {
  name: string;
  owner: string;
  size_bytes: number;
  size_mb: number;
  environment: string;
  project: string;
  active_connections?: number;
  connections?: ConnectionURLs;
}

export interface CreateDatabaseRequest {
  project_name: string;
  environment: string;
}

export interface CreateDatabaseResponse {
  success: boolean;
  database: string;
  username: string;
  password: string;
  connections: ConnectionURLs;
  created_at: string;
}

// Network Ports & Security Telemetry
export interface ListeningPort {
  port: number;
  service: string;
  bind_ip: string;
  status: "safe_local" | "docker_internal" | "public_exposed";
  protocol: string;
}

export interface NetworkPortsResponse {
  total_listening: number;
  public_exposed: number;
  docker_internal: number;
  safe_local: number;
  ports: ListeningPort[];
  host_os: string;
  kernel_version: string;
  architecture: string;
  timestamp: string;
}

// Whitelist and Team Access
export interface WhitelistUser {
  username: string;
  role: "admin" | "member";
  added_at: string;
}

export interface WhitelistResponse {
  has_admin: boolean;
  admin: string;
  users: WhitelistUser[];
  isMock?: boolean;
}

// In-memory state for fallback mode
let mockDatabases: DatabaseSummary[] = [
  {
    name: "db_mindzed_core_prod",
    owner: "usr_mindzed_core",
    size_bytes: 42467328,
    size_mb: 40.5,
    environment: "prod",
    project: "mindzed_core",
    active_connections: 3,
    connections: {
      dokploy_internal: "postgresql://usr_mindzed_core:••••••••@postgres:5432/db_mindzed_core_prod",
      ssh_tunnel: "postgresql://usr_mindzed_core:••••••••@localhost:5433/db_mindzed_core_prod",
      external_vercel: "postgresql://usr_mindzed_core:••••••••@vps-host:5432/db_mindzed_core_prod?sslmode=disable",
    },
  },
  {
    name: "db_client_crm_staging",
    owner: "usr_client_crm",
    size_bytes: 18874368,
    size_mb: 18.0,
    environment: "staging",
    project: "client_crm",
    active_connections: 1,
    connections: {
      dokploy_internal: "postgresql://usr_client_crm:••••••••@postgres:5432/db_client_crm_staging",
      ssh_tunnel: "postgresql://usr_client_crm:••••••••@localhost:5433/db_client_crm_staging",
      external_vercel: "postgresql://usr_client_crm:••••••••@vps-host:5432/db_client_crm_staging?sslmode=disable",
    },
  },
  {
    name: "db_analytics_dev",
    owner: "usr_analytics",
    size_bytes: 8388608,
    size_mb: 8.0,
    environment: "dev",
    project: "analytics",
    active_connections: 0,
    connections: {
      dokploy_internal: "postgresql://usr_analytics:••••••••@postgres:5432/db_analytics_dev",
      ssh_tunnel: "postgresql://usr_analytics:••••••••@localhost:5433/db_analytics_dev",
      external_vercel: "postgresql://usr_analytics:••••••••@vps-host:5432/db_analytics_dev?sslmode=disable",
    },
  },
];

let mockWhitelist: WhitelistUser[] = [
  { username: "Seven", role: "admin", added_at: new Date(Date.now() - 86400000).toISOString() },
  { username: "friend_dev", role: "member", added_at: new Date(Date.now() - 3600000).toISOString() },
];

let mockUptimeSeconds = 842100;

export function generateSecretKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function getAgentConfig() {
  if (typeof window !== "undefined") {
    const savedUrl = localStorage.getItem("mindzed_agent_url");
    const savedSecret = localStorage.getItem("mindzed_agent_secret");
    const savedMode = localStorage.getItem("mindzed_demo_mode");

    return {
      baseUrl: savedUrl || process.env.NEXT_PUBLIC_AGENT_URL || "https://agent.mindzed.tech",
      secret: savedSecret || process.env.NEXT_PUBLIC_AGENT_SECRET || "",
      forceDemo: savedMode === "true",
      hasCustomKey: Boolean(savedSecret || process.env.NEXT_PUBLIC_AGENT_SECRET),
    };
  }

  return {
    baseUrl: process.env.NEXT_PUBLIC_AGENT_URL || "https://agent.mindzed.tech",
    secret: process.env.AGENT_SECRET || process.env.NEXT_PUBLIC_AGENT_SECRET || "",
    forceDemo: false,
    hasCustomKey: Boolean(process.env.AGENT_SECRET || process.env.NEXT_PUBLIC_AGENT_SECRET),
  };
}

export async function checkAgentHealth(): Promise<{
  ok: boolean;
  status: string;
  latencyMs: number;
  postgres: string;
  isMock: boolean;
}> {
  const config = getAgentConfig();
  if (config.forceDemo) {
    return {
      ok: true,
      status: "ok (Simulated Mode)",
      latencyMs: 18,
      postgres: "connected",
      isMock: true,
    };
  }

  const start = performance.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(`${config.baseUrl}/health`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeoutId);

    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) {
      throw new Error(`Healthcheck returned status ${res.status}`);
    }

    const data = await res.json();
    return {
      ok: true,
      status: data.status || "ok",
      latencyMs,
      postgres: data.postgres || "connected",
      isMock: false,
    };
  } catch {
    return {
      ok: true,
      status: "fallback (Agent Unreachable)",
      latencyMs: 24,
      postgres: "connected (mock)",
      isMock: true,
    };
  }
}

export async function fetchSystemVitals(): Promise<{ vitals: SystemVitals; isMock: boolean }> {
  const config = getAgentConfig();

  if (!config.forceDemo && config.secret) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(`${config.baseUrl}/api/v1/system/vitals`, {
        signal: controller.signal,
        headers: {
          "X-Agent-Secret": config.secret,
          Accept: "application/json",
        },
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const vitals = await res.json();
        return { vitals, isMock: false };
      }
    } catch {
      // Fall through to mock
    }
  }

  // Realistic mock generator
  mockUptimeSeconds += 4;
  const jitterCpu = Math.max(5.2, Math.min(88.0, 14.5 + Math.sin(Date.now() / 8000) * 12.0 + (Math.random() * 4 - 2)));
  const jitterRam = Math.round(4250 + Math.cos(Date.now() / 15000) * 350 + (Math.random() * 60 - 30));

  return {
    vitals: {
      cpu_usage_pct: Math.round(jitterCpu * 10) / 10,
      ram_used_mb: jitterRam,
      ram_total_mb: 24150,
      disk_used_gb: 34.2,
      disk_total_gb: 98.4,
      uptime_seconds: mockUptimeSeconds,
      net_bytes_sent: 418293021,
      net_bytes_recv: 1982847291,
      timestamp: new Date().toISOString(),
    },
    isMock: true,
  };
}

export async function fetchNetworkPorts(): Promise<{ data: NetworkPortsResponse; isMock: boolean }> {
  const config = getAgentConfig();

  if (!config.forceDemo && config.secret) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(`${config.baseUrl}/api/v1/system/network/ports`, {
        signal: controller.signal,
        headers: {
          "X-Agent-Secret": config.secret,
          Accept: "application/json",
        },
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        return { data, isMock: false };
      }
    } catch {
      // Fall through to mock
    }
  }

  // Mock ports telemetry
  const mockPorts: ListeningPort[] = [
    { port: 22, service: "OpenSSH Daemon", bind_ip: "0.0.0.0", status: "public_exposed", protocol: "TCP" },
    { port: 80, service: "HTTP Gateway (Traefik)", bind_ip: "0.0.0.0", status: "public_exposed", protocol: "TCP" },
    { port: 443, service: "HTTPS Gateway / Cloudflare Tunnel", bind_ip: "0.0.0.0", status: "public_exposed", protocol: "TCP" },
    { port: 3000, service: "Dokploy Management UI", bind_ip: "172.18.0.2", status: "docker_internal", protocol: "TCP" },
    { port: 5432, service: "PostgreSQL Primary Cluster", bind_ip: "172.18.0.3", status: "docker_internal", protocol: "TCP" },
    { port: 5433, service: "PostgreSQL SSH Tunnel Forward", bind_ip: "127.0.0.1", status: "safe_local", protocol: "TCP" },
    { port: 8080, service: "MindZed Agent API", bind_ip: "127.0.0.1", status: "safe_local", protocol: "TCP" },
  ];

  return {
    data: {
      total_listening: mockPorts.length,
      public_exposed: 3,
      docker_internal: 2,
      safe_local: 2,
      ports: mockPorts,
      host_os: "Oracle Linux Server 9.4 (Ampere ARM64)",
      kernel_version: "5.15.0-206.153.7.1.el9uek.aarch64",
      architecture: "aarch64 (Neoverse-N1)",
      timestamp: new Date().toISOString(),
    },
    isMock: true,
  };
}

export async function fetchDatabases(): Promise<{ 
  databases: DatabaseSummary[]; 
  clusterInfo?: { internal_host: string; external_host: string; port: string; ssh_port: string }; 
  isMock: boolean 
}> {
  const config = getAgentConfig();

  if (!config.forceDemo && config.secret) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(`${config.baseUrl}/api/v1/databases`, {
        signal: controller.signal,
        headers: {
          "X-Agent-Secret": config.secret,
          Accept: "application/json",
        },
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        return { 
          databases: data.databases || [], 
          clusterInfo: data.cluster_info,
          isMock: false 
        };
      }
    } catch {
      // Fall through to mock
    }
  }

  return {
    databases: [...mockDatabases],
    clusterInfo: {
      internal_host: "postgres",
      external_host: "vps-host",
      port: "5432",
      ssh_port: "5433",
    },
    isMock: true,
  };
}

export async function createDatabaseApi(
  req: CreateDatabaseRequest
): Promise<{ data: CreateDatabaseResponse; isMock: boolean }> {
  const config = getAgentConfig();

  if (!config.forceDemo && config.secret) {
    try {
      const res = await fetch(`${config.baseUrl}/api/v1/databases`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Agent-Secret": config.secret,
          Accept: "application/json",
        },
        body: JSON.stringify(req),
      });

      if (res.ok) {
        const data = await res.json();
        return { data, isMock: false };
      }
      const err = await res.json().catch(() => ({ error: "Request failed" }));
      throw new Error(err.error || "Failed to create database");
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      if (!errMsg.includes("fetch")) {
        throw e;
      }
    }
  }

  const proj = req.project_name.toLowerCase().trim().replace(/[^a-zA-Z0-9_]/g, "");
  const env = req.environment.toLowerCase().trim().replace(/[^a-zA-Z0-9_]/g, "");
  const dbName = `db_${proj}_${env}`;
  const userName = `usr_${proj}`;
  const password = generateSecretKey().slice(0, 32);

  const mockResponse: CreateDatabaseResponse = {
    success: true,
    database: dbName,
    username: userName,
    password,
    connections: {
      dokploy_internal: `postgresql://${userName}:${password}@postgres:5432/${dbName}`,
      ssh_tunnel: `postgresql://${userName}:${password}@localhost:5433/${dbName}`,
      external_vercel: `postgresql://${userName}:${password}@vps-host:5432/${dbName}?sslmode=disable`,
    },
    created_at: new Date().toISOString(),
  };

  mockDatabases.unshift({
    name: dbName,
    owner: userName,
    size_bytes: 8388608,
    size_mb: 8.0,
    environment: env,
    project: proj,
    active_connections: 0,
    connections: mockResponse.connections,
  });

  return { data: mockResponse, isMock: true };
}

export async function deleteDatabaseApi(name: string): Promise<{ success: boolean; isMock: boolean }> {
  const config = getAgentConfig();

  if (!config.forceDemo && config.secret) {
    try {
      const res = await fetch(`${config.baseUrl}/api/v1/databases/${encodeURIComponent(name)}`, {
        method: "DELETE",
        headers: {
          "X-Agent-Secret": config.secret,
          Accept: "application/json",
        },
      });

      if (res.ok) {
        return { success: true, isMock: false };
      }
      const err = await res.json().catch(() => ({ error: "Request failed" }));
      throw new Error(err.error || "Failed to delete database");
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      if (!errMsg.includes("fetch")) {
        throw e;
      }
    }
  }

  mockDatabases = mockDatabases.filter((d) => d.name !== name);
  return { success: true, isMock: true };
}

// ==========================================
// Whitelist & Admin Management APIs
// ==========================================

export async function fetchWhitelist(): Promise<WhitelistResponse> {
  const config = getAgentConfig();

  if (!config.forceDemo && config.secret) {
    try {
      const res = await fetch(`${config.baseUrl}/api/v1/auth/whitelist`, {
        headers: {
          "X-Agent-Secret": config.secret,
          Accept: "application/json",
        },
      });
      if (res.ok) {
        const data = await res.json();
        return { ...data, isMock: false };
      }
    } catch {
      // Fall through to mock
    }
  }

  return {
    has_admin: mockWhitelist.some((u) => u.role === "admin"),
    admin: mockWhitelist.find((u) => u.role === "admin")?.username || "",
    users: [...mockWhitelist],
    isMock: true,
  };
}

export async function claimAdmin(username: string): Promise<{ success: boolean; error?: string }> {
  const config = getAgentConfig();

  if (!config.forceDemo && config.secret) {
    try {
      const res = await fetch(`${config.baseUrl}/api/v1/auth/whitelist/claim`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Agent-Secret": config.secret,
          Accept: "application/json",
        },
        body: JSON.stringify({ username }),
      });
      if (res.ok) {
        return { success: true };
      }
      const err = await res.json().catch(() => ({ error: "Claim failed" }));
      return { success: false, error: err.error };
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      return { success: false, error: errMsg };
    }
  }

  // Fallback mock
  mockWhitelist.unshift({
    username,
    role: "admin",
    added_at: new Date().toISOString(),
  });
  return { success: true };
}

export async function addWhitelistUser(username: string, role = "member"): Promise<{ success: boolean; error?: string }> {
  const config = getAgentConfig();

  if (!config.forceDemo && config.secret) {
    try {
      const res = await fetch(`${config.baseUrl}/api/v1/auth/whitelist`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Agent-Secret": config.secret,
          Accept: "application/json",
        },
        body: JSON.stringify({ username, role }),
      });
      if (res.ok) {
        return { success: true };
      }
      const err = await res.json().catch(() => ({ error: "Failed to add user" }));
      return { success: false, error: err.error };
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      return { success: false, error: errMsg };
    }
  }

  mockWhitelist.push({
    username,
    role: role as "admin" | "member",
    added_at: new Date().toISOString(),
  });
  return { success: true };
}

export async function removeWhitelistUser(username: string): Promise<{ success: boolean; error?: string }> {
  const config = getAgentConfig();

  if (!config.forceDemo && config.secret) {
    try {
      const res = await fetch(`${config.baseUrl}/api/v1/auth/whitelist/${encodeURIComponent(username)}`, {
        method: "DELETE",
        headers: {
          "X-Agent-Secret": config.secret,
          Accept: "application/json",
        },
      });
      if (res.ok) {
        return { success: true };
      }
      const err = await res.json().catch(() => ({ error: "Failed to remove user" }));
      return { success: false, error: err.error };
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      return { success: false, error: errMsg };
    }
  }

  mockWhitelist = mockWhitelist.filter((u) => u.username.toLowerCase() !== username.toLowerCase());
  return { success: true };
}
