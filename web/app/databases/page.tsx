"use client";

import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { 
  Database, 
  Table,
  Plus, 
  Search, 
  Trash2, 
  KeyRound, 
  Server, 
  HardDrive, 
  AlertTriangle, 
  RefreshCw,
  CheckCircle2
} from "lucide-react";
import { 
  fetchDatabases, 
  deleteDatabaseApi, 
  DatabaseSummary, 
  CreateDatabaseResponse,
  getSavedDatabaseCredentials
} from "@/lib/agent-client";
import CreateDbModal from "@/components/db/CreateDbModal";
import ConnectionCard from "@/components/db/ConnectionCard";

export default function DatabasesPage() {
  const [databases, setDatabases] = useState<DatabaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [envFilter, setEnvFilter] = useState<string>("all");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [connectionModalData, setConnectionModalData] = useState<CreateDatabaseResponse | null>(null);

  // Safe 2-step delete state
  const [dbToDelete, setDbToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Notification toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const [clusterInfo, setClusterInfo] = useState<{ internal_host: string; external_host: string; port: string; pgbouncer_port?: string; ssh_port: string } | null>(null);

  const loadDatabases = async () => {
    try {
      const res = await fetchDatabases();
      setDatabases(res.databases);
      if (res.clusterInfo) {
        setClusterInfo(res.clusterInfo);
      }
    } catch (e) {
      console.error("Failed to load databases", e);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadDatabases();
    setTimeout(() => setIsRefreshing(false), 400);
  };

  useEffect(() => {
    loadDatabases();
  }, []);

  const handleDatabaseCreated = (newDb: CreateDatabaseResponse) => {
    setIsCreateModalOpen(false);
    setConnectionModalData(newDb);
    showToast(`Database ${newDb.database} provisioned successfully!`);
    loadDatabases();
  };

  const handleConfirmDelete = async () => {
    if (!dbToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteDatabaseApi(dbToDelete);
      showToast(`Database ${dbToDelete} dropped.`);
      setDbToDelete(null);
      await loadDatabases();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setDeleteError(errMsg);
    } finally {
      setIsDeleting(false);
    }
  };

  // Open existing DB connection card - Uses dynamic URLs provided directly by Agent!
  const handleOpenExistingConnection = (db: DatabaseSummary) => {
    const saved = getSavedDatabaseCredentials(db.name);
    const password = saved?.password || "•••(managed)•••";
    const hasRealPassword = password !== "•••(managed)•••";

    const intHost = (clusterInfo?.internal_host && clusterInfo.internal_host !== "postgres") ? clusterInfo.internal_host : "postgres-databases-sharedpostgres-kooq42";
    const extHost = clusterInfo?.external_host || (typeof window !== "undefined" ? window.location.hostname : "vps-host");
    const sshPort = clusterInfo?.ssh_port || "5433";
    const port = clusterInfo?.port || "5432";
    const pgbouncerPort = clusterInfo?.pgbouncer_port || "6432";

    let dokployUrl = db.connections?.dokploy_internal || `postgresql://${db.owner}:${hasRealPassword ? password : "••••••••"}@${intHost}:${port}/${db.name}`;
    // CRITICAL: Always ensure internal Dokploy URL uses the active container service name
    dokployUrl = dokployUrl.replace(/@postgres:5432\//, `@${intHost}:${port}/`);
    let sshUrl = db.connections?.ssh_tunnel || `postgresql://${db.owner}:${hasRealPassword ? password : "••••••••"}@localhost:${sshPort}/${db.name}`;
    let externalUrl = db.connections?.external_vercel || `postgresql://${db.owner}:${hasRealPassword ? password : "••••••••"}@${extHost}:${pgbouncerPort}/${db.name}?sslmode=disable`;

    // CRITICAL: Always ensure external URL uses PgBouncer port 6432, replacing any stale 5432
    externalUrl = externalUrl.replace(/:5432\//, `:${pgbouncerPort}/`);

    // If we have saved the real password in local vault, replace the masked •••••••• with real password
    if (hasRealPassword) {
      dokployUrl = dokployUrl.replace(/:••••••••@/, `:${password}@`).replace(/:[^:@]+@/, `:${password}@`);
      sshUrl = sshUrl.replace(/:••••••••@/, `:${password}@`).replace(/:[^:@]+@/, `:${password}@`);
      externalUrl = externalUrl.replace(/:••••••••@/, `:${password}@`).replace(/:[^:@]+@/, `:${password}@`);
    }

    setConnectionModalData({
      success: true,
      database: db.name,
      username: db.owner,
      password: password,
      connections: {
        dokploy_internal: dokployUrl,
        ssh_tunnel: sshUrl,
        external_vercel: externalUrl,
      },
      created_at: new Date().toISOString(),
    });
  };

  // Filtered databases
  const filteredDatabases = useMemo(() => {
    return databases.filter((db) => {
      const matchesSearch =
        db.name.toLowerCase().includes(search.toLowerCase()) ||
        db.owner.toLowerCase().includes(search.toLowerCase());
      const matchesEnv = envFilter === "all" || db.environment.toLowerCase() === envFilter.toLowerCase();
      return matchesSearch && matchesEnv;
    });
  }, [databases, search, envFilter]);

  // Aggregate stats
  const totalDiskMB = useMemo(() => {
    return Math.round(databases.reduce((acc, curr) => acc + curr.size_mb, 0) * 10) / 10;
  }, [databases]);

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8 animate-in fade-in duration-200">
      {/* Toast Notification (Soft Emerald) */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-18 right-6 z-50 rounded-xl bg-zinc-900 border border-emerald-500/40 text-emerald-200 px-4 py-3 shadow-2xl flex items-center gap-2.5 text-xs font-medium backdrop-blur-md"
          >
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Database Provisioner
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-semibold">
              Isolated PostgreSQL
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            Instant DDL provisioning, dedicated roles, and connection string generator.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 text-xs font-medium"
            title="Refresh database list"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-white" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-black bg-white hover:bg-zinc-200 transition-colors flex items-center gap-2 cursor-pointer shadow"
          >
            <Plus className="h-4 w-4" />
            <span>New Database</span>
          </button>
        </div>
      </div>

      {/* Cluster Stats Summary Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-zinc-900/30 border border-zinc-800/80 p-4 backdrop-blur-sm flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] text-zinc-500 font-mono block">ACTIVE DATABASES</span>
            <div className="text-xl font-bold font-mono text-white">{databases.length} Instances</div>
          </div>
          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Database className="h-4 w-4" />
          </div>
        </div>

        <div className="rounded-2xl bg-zinc-900/30 border border-zinc-800/80 p-4 backdrop-blur-sm flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] text-zinc-500 font-mono block">STORAGE ALLOCATED</span>
            <div className="text-xl font-bold font-mono text-white">{totalDiskMB} MB</div>
          </div>
          <div className="p-2 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300">
            <HardDrive className="h-4 w-4" />
          </div>
        </div>

        <div className="rounded-2xl bg-zinc-900/30 border border-zinc-800/80 p-4 backdrop-blur-sm flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] text-zinc-500 font-mono block">INTERNAL DB HOST</span>
            <div className="text-xs font-mono text-zinc-300 truncate max-w-[190px]">
              {clusterInfo?.internal_host && clusterInfo.internal_host !== "postgres" ? clusterInfo.internal_host : "postgres-databases-sharedpostgres-kooq42"}
            </div>
          </div>
          <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
            <Server className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Search and Filters Bar with Soft Env Badges */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-zinc-900/20 border border-zinc-800/70 p-3 rounded-2xl backdrop-blur-sm">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search databases or owners..."
            className="w-full rounded-xl bg-zinc-950 border border-zinc-800 pl-9 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-white font-mono transition-colors"
          />
        </div>

        {/* Environment Filter Pills with soft indicating colors */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <span className="text-[11px] text-zinc-500 font-medium px-2 hidden sm:inline">Env:</span>
          {[
            { id: "all", label: "ALL" },
            { id: "prod", label: "PROD", activeClass: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
            { id: "staging", label: "STAGING", activeClass: "bg-amber-500/20 text-amber-300 border-amber-500/40" },
            { id: "dev", label: "DEV", activeClass: "bg-sky-500/20 text-sky-300 border-sky-500/40" },
          ].map((item) => {
            const isActive = envFilter === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setEnvFilter(item.id)}
                className={`px-3 py-1 rounded-lg text-xs font-medium uppercase font-mono transition-all cursor-pointer border ${
                  isActive
                    ? item.activeClass || "bg-white text-black font-semibold border-white shadow-sm"
                    : "border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-850"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Database Fleet Table */}
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/20 backdrop-blur-sm overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950 border-b border-zinc-800 text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3 font-semibold">Database Name</th>
                <th className="px-5 py-3 font-semibold">Environment</th>
                <th className="px-5 py-3 font-semibold">Storage Used</th>
                <th className="px-5 py-3 font-semibold">Assigned Role</th>
                <th className="px-5 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-850/60 font-mono">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-zinc-500">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin text-white" />
                      <span>Scanning PostgreSQL catalogs...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredDatabases.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-zinc-500">
                    <div className="max-w-xs mx-auto space-y-2">
                      <Database className="h-7 w-7 text-zinc-600 mx-auto" />
                      <p className="text-zinc-400 font-sans text-xs">No databases match your query</p>
                      <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="text-white hover:underline text-xs font-sans font-medium"
                      >
                        Provision new database
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredDatabases.map((db, idx) => {
                  const isProd = db.environment.toLowerCase() === "prod" || db.environment.toLowerCase() === "production";
                  const isStaging = db.environment.toLowerCase() === "staging";
                  const isDev = db.environment.toLowerCase() === "dev" || db.environment.toLowerCase() === "development";

                  return (
                    <motion.tr
                      key={db.name}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.15, delay: idx * 0.02 }}
                      className="hover:bg-zinc-850/30 transition-colors group"
                    >
                      {/* Database Name */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="p-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 group-hover:border-zinc-500 transition-colors">
                            <Database className="h-3.5 w-3.5" />
                          </div>
                          <div>
                            <span className="font-semibold text-white text-xs block">{db.name}</span>
                            <span className="text-[10px] text-zinc-500 font-sans block">{db.project}</span>
                          </div>
                        </div>
                      </td>

                      {/* Environment Badge (Soft Indicator Colors) */}
                      <td className="px-5 py-3.5">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider border ${
                          isProd
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                            : isStaging
                            ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                            : isDev
                            ? "bg-sky-500/10 border-sky-500/30 text-sky-400"
                            : "bg-zinc-800 border-zinc-700 text-zinc-300"
                        }`}>
                          {db.environment}
                        </span>
                      </td>

                      {/* Disk Allocation */}
                      <td className="px-5 py-3.5 text-zinc-300">
                        <div className="flex items-center gap-2">
                          <span>{db.size_mb} MB</span>
                          <div className="w-16 bg-zinc-800 rounded-full h-1 overflow-hidden">
                            <div
                              className="bg-white h-full rounded-full"
                              style={{ width: `${Math.min(100, Math.max(10, db.size_mb * 2))}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Owner & Active Clients */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-300 font-mono text-[11px] bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                            {db.owner}
                          </span>
                          {(db.active_connections ?? 0) > 0 ? (
                            <span className="text-[10px] font-sans px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              {db.active_connections} active
                            </span>
                          ) : (
                            <span className="text-[10px] text-zinc-500 font-sans">0 active</span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/databases/${encodeURIComponent(db.name)}`}
                            className="px-2.5 py-1 rounded-lg text-xs font-sans font-medium text-emerald-300 hover:text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                            title="Open Supabase/Neon-style Table Explorer & SQL Studio"
                          >
                            <Table className="h-3 w-3" />
                            <span>Studio</span>
                          </Link>

                          <button
                            onClick={() => handleOpenExistingConnection(db)}
                            className="px-2.5 py-1 rounded-lg text-xs font-sans font-medium text-zinc-200 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                            title="View connection URLs & credentials"
                          >
                            <KeyRound className="h-3 w-3" />
                            <span>Connection Info</span>
                          </button>

                          <button
                            onClick={() => setDbToDelete(db.name)}
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                            title="Drop database"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <CreateDbModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={handleDatabaseCreated}
      />

      {connectionModalData && (
        <ConnectionCard
          data={connectionModalData}
          onClose={() => setConnectionModalData(null)}
        />
      )}

      {/* Safe 2-Step Delete Confirmation Dialog (Soft Rose Alert) */}
      {dbToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-[#111114] border border-rose-900/40 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Drop Database</h3>
                <p className="text-xs text-zinc-400">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Are you sure you want to drop <span className="font-mono font-bold text-rose-300">{dbToDelete}</span>? 
              All active connections will be terminated via <code className="text-white">pg_terminate_backend</code> and data will be permanently removed.
            </p>

            {deleteError && (
              <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/30 text-rose-300 text-xs">
                {deleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setDbToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600/90 hover:bg-rose-500 disabled:opacity-50 transition-colors flex items-center gap-1.5 cursor-pointer shadow"
              >
                {isDeleting ? "Dropping..." : "Confirm Drop"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
