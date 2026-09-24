"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, 
  Copy, 
  Check, 
  Eye, 
  EyeOff, 
  Terminal, 
  Globe, 
  Server, 
  Key, 
  Database,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Zap
} from "lucide-react";
import { CreateDatabaseResponse, resetDatabasePasswordApi } from "@/lib/agent-client";

interface ConnectionCardProps {
  data: CreateDatabaseResponse | null;
  onClose: () => void;
}

export default function ConnectionCard({ data, onClose }: ConnectionCardProps) {
  const [activeTab, setActiveTab] = useState<"dokploy" | "ssh" | "external">("dokploy");
  const [showPassword, setShowPassword] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Local card data that updates when password is reset/rotated
  const [cardData, setCardData] = useState<CreateDatabaseResponse | null>(data);
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [isPrismaMode, setIsPrismaMode] = useState(true);
  const [isServerlessMode, setIsServerlessMode] = useState(true);

  useEffect(() => {
    if (data) {
      setCardData({
        ...data,
        connections: {
          ...data.connections,
          external_vercel: (data.connections?.external_vercel || "").replace(/:5432\//, ":6432/"),
        },
      });
      // Show password by default if it's a real password, not managed
      if (data.password && data.password !== "•••(managed)•••") {
        setShowPassword(true);
      }
    } else {
      setCardData(null);
    }
  }, [data]);

  // If parent closed the modal or data is null, immediately render nothing!
  if (!data || !cardData) return null;

  const isManaged = cardData.password === "•••(managed)•••";

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleResetPassword = async () => {
    if (!confirm(`Generate a new 32-character secure password for ${cardData.database}? Any existing applications connecting with the old password will need to be updated.`)) {
      return;
    }
    setIsResetting(true);
    setResetError(null);
    try {
      const res = await resetDatabasePasswordApi(cardData.database);
      const updated = {
        ...res.data,
        connections: {
          ...res.data.connections,
          external_vercel: res.data.connections.external_vercel.replace(/:5432\//, ":6432/"),
        },
      };
      setCardData(updated);
      setShowPassword(true);
      setResetSuccess(true);
      setTimeout(() => setResetSuccess(false), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setResetError(msg);
    } finally {
      setIsResetting(false);
    }
  };

  const getMaskedUrl = (url: string) => {
    if (isManaged) return url;
    if (showPassword) return url;
    return url.replace(`:${cardData.password}@`, ":••••••••••••••••@");
  };

  const extractedExtHost = (() => {
    try {
      const match = cardData.connections.external_vercel.match(/@([^:/]+)/);
      return match ? match[1] : "vps-host";
    } catch {
      return "vps-host";
    }
  })();

  const tabs = [
    {
      id: "dokploy",
      label: "Dokploy Internal",
      portBadge: "5432",
      icon: Server,
      url: cardData.connections.dokploy_internal,
      desc: "For microservices deployed inside the Docker Swarm network on Oracle VPS (direct internal port 5432).",
      helperCmd: null,
      tip: "Non-Serverless: Long-running Dokploy containers do NOT need &connection_limit=1. Let Prisma manage its standard connection pool (~10 connections).",
    },
    {
      id: "ssh",
      label: "Local SSH Tunnel",
      portBadge: "5433",
      icon: Terminal,
      url: cardData.connections.ssh_tunnel,
      desc: "Connect local GUI tools (DBeaver, TablePlus, pgAdmin) securely through an encrypted SSH tunnel.",
      helperCmd: `ssh -L 5433:postgres-databases-sharedpostgres-kooq42:5432 opc@${extractedExtHost}`,
      tip: "Run the command below in your local terminal to forward port 5433 securely to your workstation.",
    },
    {
      id: "external",
      label: "Pooled / Vercel (PgBouncer)",
      portBadge: "6432",
      icon: Globe,
      url: (() => {
        const raw = cardData.connections.external_vercel.replace(/:5432\//, ":6432/");
        const [base, query] = raw.split("?");
        const params = new URLSearchParams(query || "");

        if (isPrismaMode) {
          params.set("pgbouncer", "true");
        } else {
          params.delete("pgbouncer");
        }

        if (isServerlessMode) {
          params.set("connection_limit", "1");
        } else {
          params.delete("connection_limit");
        }

        const qs = params.toString();
        return qs ? `${base}?${qs}` : base;
      })(),
      desc: "Connect serverless apps (Vercel, Next.js, AWS Lambda, Prisma, Drizzle) through high-performance PgBouncer on port 6432.",
      helperCmd: null,
      tip: (() => {
        if (isPrismaMode && isServerlessMode) {
          return "Serverless + Prisma Mode: Appends &pgbouncer=true & &connection_limit=1 (ideal for Vercel, Next.js, & AWS Lambda).";
        }
        if (isPrismaMode && !isServerlessMode) {
          return "Dedicated + Prisma Mode: Appends &pgbouncer=true (no connection limit, allows full pool on persistent servers).";
        }
        if (!isPrismaMode && isServerlessMode) {
          return "Serverless Mode: Appends &connection_limit=1 for serverless functions with standard SQL/Drizzle drivers.";
        }
        return "Standard Pooled: Clean transaction-pooled connection string (port 6432).";
      })(),
    },
  ] as const;

  const currentTab = tabs.find((t) => t.id === activeTab) || tabs[0];

  const directUrlSnippet = (activeTab === "external" && isPrismaMode)
    ? `\n# Direct URL for Prisma migrations (npx prisma migrate dev via local SSH tunnel)\nDIRECT_URL="${cardData.connections.ssh_tunnel}"`
    : "";

  const envBlock = `# MindZed PostgreSQL (${cardData.database}) - ${currentTab.label}${isPrismaMode && activeTab === "external" ? " (Prisma Ready)" : ""}${isServerlessMode && activeTab === "external" ? " (Serverless)" : ""}
DATABASE_URL="${currentTab.url}"${directUrlSnippet}
PG_HOST="${currentTab.id === 'dokploy' ? 'postgres-databases-sharedpostgres-kooq42' : currentTab.id === 'ssh' ? 'localhost' : extractedExtHost}"
PG_PORT="${currentTab.portBadge}"
PG_USER="${cardData.username}"
PG_PASSWORD="${isManaged ? '••••••••••••••••' : cardData.password}"
PG_DATABASE="${cardData.database}"
`;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm cursor-pointer"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl bg-[#111114] border border-zinc-750 p-6 shadow-2xl z-10 overflow-y-auto scrollbar-thin"
        >
          {/* Header Banner */}
          <div className="flex items-start justify-between pb-4 border-b border-zinc-800">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-white font-mono">{cardData.database}</h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 font-semibold">
                    Active & Ready
                  </span>
                </div>
                <p className="text-xs text-zinc-400">PostgreSQL instance on Oracle VPS</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
              title="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Credentials Summary Box */}
          <div className="my-4 p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[10px] text-zinc-500 font-mono block">DATABASE NAME</span>
                <span className="font-mono text-white font-semibold truncate block text-xs">{cardData.database}</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 font-mono block">DATABASE USER</span>
                <span className="font-mono text-sky-400 font-semibold truncate block text-xs">{cardData.username}</span>
              </div>
            </div>

            <div className="pt-2.5 border-t border-zinc-850">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-zinc-500 font-mono">DATABASE PASSWORD</span>
                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={isResetting}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 font-mono flex items-center gap-1 hover:underline cursor-pointer disabled:opacity-50"
                  title="Generate a new secure 32-character crypto password"
                >
                  <RefreshCw className={`h-3 w-3 ${isResetting ? "animate-spin" : ""}`} />
                  <span>{isResetting ? "Rotating..." : isManaged ? "Set New Key" : "Rotate Password"}</span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 font-mono text-xs px-2.5 py-1.5 rounded-lg bg-black/60 border border-zinc-800 text-zinc-200 select-all overflow-x-auto whitespace-nowrap">
                  {isManaged
                    ? "•••••••••••••••• (Encrypted in PostgreSQL)"
                    : showPassword
                    ? cardData.password
                    : "••••••••••••••••••••••••••••••••"}
                </div>
                {!isManaged && (
                  <>
                    <button
                      onClick={() => handleCopy(cardData.password, "pw")}
                      className="p-1.5 rounded-lg bg-zinc-850 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                      title="Copy password"
                    >
                      {copiedKey === "pw" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={() => setShowPassword(!showPassword)}
                      className="p-1.5 rounded-lg bg-zinc-850 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Feedback Banners */}
          {resetSuccess && (
            <div className="mb-3 px-3 py-2 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>New password generated and saved to your browser vault! Connection strings updated.</span>
            </div>
          )}
          {resetError && (
            <div className="mb-3 px-3 py-2 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{resetError}</span>
            </div>
          )}
          {isManaged && !resetSuccess && (
            <div className="mb-3 px-3 py-2 rounded-xl bg-amber-950/20 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between gap-2">
              <span className="text-[11px]">
                PostgreSQL only stores encrypted passwords (SCRAM-SHA-256). Click <strong>Set New Key</strong> to generate a fresh password.
              </span>
              <button
                onClick={handleResetPassword}
                disabled={isResetting}
                className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-[11px] font-semibold transition-colors shrink-0 cursor-pointer"
              >
                {isResetting ? "Generating..." : "Generate Password"}
              </button>
            </div>
          )}

          {/* Tab Navigation */}
          <div className="flex items-center gap-1 border-b border-zinc-800 pb-2 mb-3 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                    isActive
                      ? "bg-zinc-800 text-white border border-zinc-700 shadow-sm"
                      : "text-zinc-400 hover:text-white hover:bg-zinc-850"
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${isActive ? "text-emerald-400" : "text-zinc-500"}`} />
                  <span>{tab.label}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                    isActive ? "bg-emerald-500/20 text-emerald-300 font-semibold" : "bg-zinc-800/80 text-zinc-500"
                  }`}>
                    {tab.portBadge}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <p>{currentTab.desc}</p>
            </div>

            {/* Tip pill */}
            {currentTab.tip && (
              <div className="px-3 py-1.5 rounded-lg bg-zinc-900/80 border border-zinc-800/80 text-[11px] text-zinc-400 flex items-center gap-2 font-mono">
                <span className="text-emerald-400 font-bold">INFO:</span>
                <span>{currentTab.tip}</span>
              </div>
            )}

            {/* Configuration Switches (Active on External Tab) */}
            {activeTab === "external" && (
              <div className="space-y-2">
                {/* Serverless Switch */}
                <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-[#181622] to-[#121217] border border-amber-500/25">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1 rounded-md bg-amber-500/10 text-amber-400">
                      <Zap className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white">Serverless Mode (Vercel / Lambda)</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-medium">
                          &connection_limit=1
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-400 mt-0.5">
                        {isServerlessMode
                          ? "Caps 1 connection per ephemeral instance to prevent connection spikes"
                          : "Dedicated / Long-running server mode (allows standard pooled connections)"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[11px] font-mono font-medium ${isServerlessMode ? "text-amber-400" : "text-zinc-500"}`}>
                      {isServerlessMode ? "Serverless (ON)" : "Dedicated (OFF)"}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isServerlessMode}
                      onClick={() => setIsServerlessMode(!isServerlessMode)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        isServerlessMode ? "bg-amber-500" : "bg-zinc-700"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isServerlessMode ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Prisma Switch */}
                <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-[#141A29] to-[#121217] border border-indigo-500/25">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse ml-1" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white">Prisma Friendly URL</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 font-medium">
                          &pgbouncer=true
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-400 mt-0.5">
                        {isPrismaMode
                          ? "Disables prepared statements across pooled PgBouncer transactions"
                          : "Standard query parameters for Drizzle, Kysely, or raw pg drivers"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[11px] font-mono font-medium ${isPrismaMode ? "text-indigo-400" : "text-zinc-500"}`}>
                      {isPrismaMode ? "Prisma Mode (ON)" : "Standard (OFF)"}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isPrismaMode}
                      onClick={() => setIsPrismaMode(!isPrismaMode)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        isPrismaMode ? "bg-indigo-500" : "bg-zinc-700"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          isPrismaMode ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Sleek Single-Line Connection URL Code Block */}
            <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-3 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                <span className="text-zinc-500 uppercase tracking-wider text-[10px] font-semibold">DATABASE URL ({currentTab.portBadge})</span>
                <button
                  onClick={() => handleCopy(currentTab.url, "url")}
                  className="px-2.5 py-1 rounded-lg bg-zinc-850 hover:bg-zinc-750 text-white transition-all flex items-center gap-1.5 text-xs font-sans font-medium cursor-pointer"
                >
                  {copiedKey === "url" ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-emerald-400 font-semibold">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy URL</span>
                    </>
                  )}
                </button>
              </div>
              <div className="p-2.5 rounded-lg bg-black/80 border border-zinc-800/80 font-mono text-xs text-emerald-400 overflow-x-auto whitespace-nowrap select-all scrollbar-thin">
                {getMaskedUrl(currentTab.url)}
              </div>
            </div>

            {/* SSH helper command if applicable */}
            {currentTab.helperCmd && (
              <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-3 space-y-1">
                <span className="text-[10px] text-zinc-500 font-mono block">RUN TO OPEN LOCAL TUNNEL:</span>
                <div className="flex items-center justify-between gap-2 font-mono text-xs text-amber-300/90">
                  <span className="truncate">{currentTab.helperCmd}</span>
                  <button
                    onClick={() => handleCopy(currentTab.helperCmd!, "sshCmd")}
                    className="p-1 rounded text-zinc-400 hover:text-white"
                  >
                    {copiedKey === "sshCmd" ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-4 mt-4 border-t border-zinc-800">
            <button
              onClick={() => handleCopy(envBlock, "env")}
              className="px-3.5 py-2 rounded-xl text-xs font-medium text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 transition-colors flex items-center gap-2 cursor-pointer"
            >
              {copiedKey === "env" ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="font-semibold text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Key className="h-3.5 w-3.5 text-zinc-400" />
                  <span>Copy .env Block</span>
                </>
              )}
            </button>

            <button
              onClick={onClose}
              className="px-5 py-2 rounded-xl text-xs font-semibold text-black bg-white hover:bg-zinc-200 transition-colors cursor-pointer shadow"
            >
              Done
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
