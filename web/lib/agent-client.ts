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
      external_vercel: "postgresql://usr_mindzed_core:••••••••@vps-host:6432/db_mindzed_core_prod?sslmode=disable",
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
      external_vercel: "postgresql://usr_client_crm:••••••••@vps-host:6432/db_client_crm_staging?sslmode=disable",
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
      external_vercel: "postgresql://usr_analytics:••••••••@vps-host:6432/db_analytics_dev?sslmode=disable",
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

const DEFAULT_AGENT_SECRET = "dfb2bd78acdzfdxarf379161b46bd31e0890610fab9028x1";

export function getAgentConfig() {
  if (typeof window !== "undefined") {
    const savedUrl = localStorage.getItem("mindzed_agent_url");
    const savedMode = localStorage.getItem("mindzed_demo_mode");

    return {
      baseUrl: savedUrl || process.env.NEXT_PUBLIC_AGENT_URL || "https://agent.mindzed.tech",
      secret: "protected-server-env",
      forceDemo: savedMode === "true",
      hasCustomKey: true,
    };
  }

  return {
    baseUrl: process.env.AGENT_URL || process.env.NEXT_PUBLIC_AGENT_URL || "https://agent.mindzed.tech",
    secret: process.env.AGENT_SECRET || process.env.NEXT_PUBLIC_AGENT_SECRET || DEFAULT_AGENT_SECRET,
    forceDemo: false,
    hasCustomKey: true,
  };
}

function getApiEndpoint(path: string): string {
  if (typeof window !== "undefined") {
    // In browser, route through secure Next.js server proxy
    return `/api/proxy/${path}`;
  }
  const baseUrl = process.env.AGENT_URL || process.env.NEXT_PUBLIC_AGENT_URL || "https://agent.mindzed.tech";
  return `${baseUrl}/api/v1/${path}`;
}

function getHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...extra,
  };
  if (typeof window === "undefined") {
    headers["X-Agent-Secret"] = process.env.AGENT_SECRET || process.env.NEXT_PUBLIC_AGENT_SECRET || DEFAULT_AGENT_SECRET;
  }
  return headers;
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

  // 1. Attempt direct client-to-agent measurement first to bypass Vercel serverless proxy overhead
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const start = performance.now();
    const res = await fetch(`${config.baseUrl}/health`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
      mode: "cors",
    });
    clearTimeout(timeoutId);

    const latencyMs = Math.round(performance.now() - start);
    if (res.ok) {
      const data = await res.json();
      return {
        ok: true,
        status: data.status || "ok",
        latencyMs,
        postgres: data.postgres || "connected",
        isMock: false,
      };
    }
  } catch {
    // If direct cross-origin fetch is blocked, fallback to serverless proxy
  }

  // 2. Fallback to Next.js server proxy if direct fetch is blocked
  const start = performance.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch("/api/proxy-health", {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
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
      latencyMs: data.latencyMs || latencyMs,
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

  if (!config.forceDemo) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(getApiEndpoint("system/vitals"), {
        signal: controller.signal,
        headers: getHeaders(),
        cache: "no-store",
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

  if (!config.forceDemo) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(getApiEndpoint("system/network/ports"), {
        signal: controller.signal,
        headers: getHeaders(),
        cache: "no-store",
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
  clusterInfo?: { internal_host: string; external_host: string; port: string; pgbouncer_port?: string; ssh_port: string }; 
  isMock: boolean 
}> {
  const config = getAgentConfig();

  if (!config.forceDemo) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(getApiEndpoint("databases"), {
        signal: controller.signal,
        headers: getHeaders(),
        cache: "no-store",
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
      pgbouncer_port: "6432",
      ssh_port: "5433",
    },
    isMock: true,
  };
}

export async function createDatabaseApi(
  req: CreateDatabaseRequest
): Promise<{ data: CreateDatabaseResponse; isMock: boolean }> {
  const config = getAgentConfig();

  if (!config.forceDemo) {
    try {
      const res = await fetch(getApiEndpoint("databases"), {
        method: "POST",
        headers: getHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(req),
      });

      if (res.ok) {
        const data = await res.json();
        saveDatabaseCredentials(data.database, data.username, data.password);
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
      external_vercel: `postgresql://${userName}:${password}@vps-host:6432/${dbName}?sslmode=disable`,
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

  if (!config.forceDemo) {
    try {
      const res = await fetch(getApiEndpoint(`databases/${encodeURIComponent(name)}`), {
        method: "DELETE",
        headers: getHeaders(),
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

export async function resetDatabasePasswordApi(
  name: string
): Promise<{ data: CreateDatabaseResponse; isMock: boolean }> {
  const config = getAgentConfig();

  if (!config.forceDemo) {
    try {
      const res = await fetch(getApiEndpoint(`databases/${encodeURIComponent(name)}/reset-password`), {
        method: "POST",
        headers: getHeaders(),
      });

      if (res.ok) {
        const data = await res.json();
        saveDatabaseCredentials(data.database, data.username, data.password);
        return { data, isMock: false };
      }
      const err = await res.json().catch(() => ({ error: "Request failed" }));
      throw new Error(err.error || "Failed to reset password");
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      if (!errMsg.includes("fetch")) {
        throw e;
      }
    }
  }

  const newPassword = generateSecretKey().slice(0, 32);
  const mockResp: CreateDatabaseResponse = {
    success: true,
    database: name,
    username: `usr_${name.replace(/^db_/, "").replace(/_[^_]+$/, "")}`,
    password: newPassword,
    connections: {
      dokploy_internal: `postgresql://mock:${newPassword}@postgres:5432/${name}`,
      ssh_tunnel: `postgresql://mock:${newPassword}@localhost:5433/${name}`,
      external_vercel: `postgresql://mock:${newPassword}@vps-host:6432/${name}?sslmode=disable`,
    },
    created_at: new Date().toISOString(),
  };
  saveDatabaseCredentials(name, mockResp.username, newPassword);
  return { data: mockResp, isMock: true };
}

const VAULT_KEY = "mindzed_db_vault";

export function saveDatabaseCredentials(database: string, username: string, password: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(VAULT_KEY);
    const vault = raw ? JSON.parse(raw) : {};
    vault[database] = { username, password, savedAt: new Date().toISOString() };
    localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
  } catch (e) {
    console.warn("Failed to save credentials to vault", e);
  }
}

export function getSavedDatabaseCredentials(database: string): { username: string; password?: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(VAULT_KEY);
    if (!raw) return null;
    const vault = JSON.parse(raw);
    return vault[database] || null;
  } catch {
    return null;
  }
}

// ==========================================
// Whitelist & Admin Management APIs
// ==========================================

export async function fetchWhitelist(): Promise<WhitelistResponse> {
  const config = getAgentConfig();

  if (!config.forceDemo) {
    try {
      const res = await fetch(getApiEndpoint("auth/whitelist"), {
        headers: getHeaders(),
        cache: "no-store",
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

  if (!config.forceDemo) {
    try {
      const res = await fetch(getApiEndpoint("auth/whitelist/claim"), {
        method: "POST",
        headers: getHeaders({ "Content-Type": "application/json" }),
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

  if (!config.forceDemo) {
    try {
      const res = await fetch(getApiEndpoint("auth/whitelist"), {
        method: "POST",
        headers: getHeaders({ "Content-Type": "application/json" }),
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

  if (!config.forceDemo) {
    try {
      const res = await fetch(getApiEndpoint(`auth/whitelist/${encodeURIComponent(username)}`), {
        method: "DELETE",
        headers: getHeaders(),
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

// ==========================================
// Neon & Supabase-style Database Explorer APIs
// ==========================================

export interface ExplorerTable {
  name: string;
  schema: string;
  estimated_rows: number;
  size_bytes: number;
}

export interface ExplorerColumn {
  name: string;
  data_type: string;
  udt_name: string;
  is_nullable: boolean;
  default_value: string;
  is_primary_key: boolean;
}

export interface ExplorerIndex {
  name: string;
  definition: string;
}

export interface FilterRule {
  column: string;
  operator: "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "contains" | "is_null" | "is_not_null";
  value: string;
}

export interface GetRowsOptions {
  page?: number;
  limit?: number;
  sort_column?: string;
  sort_order?: "asc" | "desc";
  search?: string;
  filters?: FilterRule[];
}

export interface GetRowsResponse {
  database: string;
  table: string;
  page: number;
  limit: number;
  total_count: number;
  columns: string[];
  rows: Record<string, any>[];
}

export interface ColumnSpec {
  name: string;
  type: string;
  is_primary_key?: boolean;
  is_nullable?: boolean;
  default_value?: string;
}

export interface SqlQueryResponse {
  success: boolean;
  columns?: string[];
  rows?: Record<string, any>[];
  row_count?: number;
  rows_affected?: number;
  duration_ms: number;
  message?: string;
  error?: string;
}

// Mock state for Explorer demo fallback (empty by default so only real PostgreSQL tables are displayed)
const mockExplorerTables: Record<string, ExplorerTable[]> = {};
const mockExplorerColumns: Record<string, ExplorerColumn[]> = {};
const mockExplorerRows: Record<string, Record<string, any>[]> = {};

export async function fetchTables(database: string): Promise<ExplorerTable[]> {
  const config = getAgentConfig();
  if (!config.forceDemo) {
    try {
      const res = await fetch(getApiEndpoint(`explorer/tables?db=${encodeURIComponent(database)}`), {
        headers: getHeaders(),
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        return data.tables || [];
      }
      if (res.status === 404) {
        throw new Error("Backend explorer endpoints returned 404. Please click 'Redeploy' on mindzed-agent in Dokploy to update the Go binary.");
      }
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Server error (${res.status})`);
    } catch (e: any) {
      throw e;
    }
  }
  return mockExplorerTables[database] || [];
}

export async function fetchTableSchema(
  database: string,
  table: string
): Promise<{ columns: ExplorerColumn[]; indexes: ExplorerIndex[] }> {
  const config = getAgentConfig();
  if (!config.forceDemo) {
    try {
      const res = await fetch(
        getApiEndpoint(`explorer/schema?db=${encodeURIComponent(database)}&table=${encodeURIComponent(table)}`),
        {
          headers: getHeaders(),
          cache: "no-store",
        }
      );
      if (res.ok) {
        const data = await res.json();
        return {
          columns: data.columns || [],
          indexes: data.indexes || [],
        };
      }
      return { columns: [], indexes: [] };
    } catch {
      return { columns: [], indexes: [] };
    }
  }

  const cols = mockExplorerColumns[table] || [];
  return { columns: cols, indexes: [] };
}

export async function fetchTableRows(
  database: string,
  table: string,
  options: GetRowsOptions = {}
): Promise<GetRowsResponse> {
  const config = getAgentConfig();
  if (!config.forceDemo) {
    try {
      const res = await fetch(
        getApiEndpoint(`explorer/rows?db=${encodeURIComponent(database)}&table=${encodeURIComponent(table)}`),
        {
          method: "POST",
          headers: getHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(options),
          cache: "no-store",
        }
      );
      if (res.ok) {
        return await res.json();
      }
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to fetch rows (${res.status})`);
    } catch (e: any) {
      throw e;
    }
  }

  const rows = mockExplorerRows[table] || [];
  return {
    database,
    table,
    page: options.page || 1,
    limit: options.limit || 50,
    total_count: rows.length,
    columns: rows.length > 0 ? Object.keys(rows[0]) : [],
    rows,
  };
}

export async function insertTableRow(
  database: string,
  table: string,
  record: Record<string, any>
): Promise<{ success: boolean; record?: Record<string, any>; error?: string }> {
  const config = getAgentConfig();
  if (!config.forceDemo) {
    try {
      const res = await fetch(
        getApiEndpoint(`explorer/insert?db=${encodeURIComponent(database)}&table=${encodeURIComponent(table)}`),
        {
          method: "POST",
          headers: getHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ record }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        return { success: true, record: data.record };
      }
      return { success: false, error: data.error || "Failed to insert record" };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  const mockNew = { id: `mock-${Date.now()}`, ...record };
  if (!mockExplorerRows[table]) mockExplorerRows[table] = [];
  mockExplorerRows[table].unshift(mockNew);
  return { success: true, record: mockNew };
}

export async function updateTableRow(
  database: string,
  table: string,
  pkColumn: string,
  pkValue: any,
  updates: Record<string, any>
): Promise<{ success: boolean; record?: Record<string, any>; error?: string }> {
  const config = getAgentConfig();
  if (!config.forceDemo) {
    try {
      const res = await fetch(
        getApiEndpoint(`explorer/update?db=${encodeURIComponent(database)}&table=${encodeURIComponent(table)}`),
        {
          method: "PATCH",
          headers: getHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ pk_column: pkColumn, pk_value: pkValue, updates }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        return { success: true, record: data.record };
      }
      return { success: false, error: data.error || "Failed to update record" };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  if (mockExplorerRows[table]) {
    const idx = mockExplorerRows[table].findIndex((r) => r[pkColumn] === pkValue);
    if (idx !== -1) {
      mockExplorerRows[table][idx] = { ...mockExplorerRows[table][idx], ...updates };
      return { success: true, record: mockExplorerRows[table][idx] };
    }
  }
  return { success: true };
}

export async function deleteTableRows(
  database: string,
  table: string,
  pkColumn: string,
  pkValues: any[]
): Promise<{ success: boolean; deleted_count?: number; error?: string }> {
  const config = getAgentConfig();
  if (!config.forceDemo) {
    try {
      const res = await fetch(
        getApiEndpoint(`explorer/delete?db=${encodeURIComponent(database)}&table=${encodeURIComponent(table)}`),
        {
          method: "POST",
          headers: getHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ pk_column: pkColumn, pk_values: pkValues }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        return { success: true, deleted_count: data.deleted_count };
      }
      return { success: false, error: data.error || "Failed to delete records" };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  if (mockExplorerRows[table]) {
    const set = new Set(pkValues);
    mockExplorerRows[table] = mockExplorerRows[table].filter((r) => !set.has(r[pkColumn]));
  }
  return { success: true, deleted_count: pkValues.length };
}

export async function createTableVisual(
  database: string,
  tableName: string,
  columns: ColumnSpec[]
): Promise<{ success: boolean; message?: string; error?: string }> {
  const config = getAgentConfig();
  if (!config.forceDemo) {
    try {
      const res = await fetch(
        getApiEndpoint(`explorer/create-table?db=${encodeURIComponent(database)}`),
        {
          method: "POST",
          headers: getHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ table_name: tableName, columns }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        return { success: true, message: data.message };
      }
      return { success: false, error: data.error || "Failed to create table" };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  if (!mockExplorerTables[database]) mockExplorerTables[database] = [];
  mockExplorerTables[database].push({
    name: tableName,
    schema: "public",
    estimated_rows: 0,
    size_bytes: 8192,
  });
  return { success: true, message: `Table '${tableName}' created successfully` };
}

export async function executeSqlQuery(
  database: string,
  sql: string
): Promise<SqlQueryResponse> {
  const config = getAgentConfig();
  if (!config.forceDemo) {
    try {
      const res = await fetch(
        getApiEndpoint(`explorer/query?db=${encodeURIComponent(database)}`),
        {
          method: "POST",
          headers: getHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ sql }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        return {
          success: true,
          columns: data.columns,
          rows: data.rows,
          row_count: data.row_count,
          rows_affected: data.rows_affected,
          duration_ms: data.duration_ms || 0,
          message: data.message,
        };
      }
      return {
        success: false,
        duration_ms: data.duration_ms || 0,
        error: data.error || "Query failed",
      };
    } catch (e: unknown) {
      return {
        success: false,
        duration_ms: 0,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  return {
    success: true,
    columns: ["sample_col_1", "sample_col_2"],
    rows: [{ sample_col_1: "Hello", sample_col_2: "World" }],
    row_count: 1,
    duration_ms: 1.4,
    message: "Executed in mock mode",
  };
}
