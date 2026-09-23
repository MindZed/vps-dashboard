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
  CheckCircle2
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
    }
  }, [data]);

  if (!cardData) return null;

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

  const tabs = [
    {
      id: "dokploy",
      label: "Dokploy Internal",
      portBadge: "5432",
      icon: Server,
      url: cardData.connections.dokploy_internal,
      desc: "For microservices deployed inside the Docker Swarm network on Oracle VPS (direct internal port 5432).",
      helperCmd: null,
      tip: "Use for Dokploy backend containers and microservices on the internal Docker network.",
    },
    {
      id: "ssh",
      label: "Local SSH Tunnel",
      portBadge: "5433",
      icon: Terminal,
      url: cardData.connections.ssh_tunnel,
      desc: "Connect local GUI tools (DBeaver, TablePlus, pgAdmin) securely through an encrypted SSH tunnel.",
      helperCmd: `ssh -L 5433:postgres-databases-sharedpostgres-kooq42:5432 opc@129.154.34.1`,
      tip: "Run the command below in your local terminal to forward port 5433 securely to your workstation.",
    },
    {
      id: "external",
      label: "Pooled / Vercel (PgBouncer)",
      portBadge: "6432",
      icon: Globe,
      url: cardData.connections.external_vercel.replace(/:5432\//, ":6432/"),
      desc: "Connect serverless apps (Vercel, Next.js, AWS Lambda, Prisma) through high-performance PgBouncer on port 6432.",
      helperCmd: null,
      tip: "PgBouncer reuses connections in transaction pooling mode. Direct port 5432 is blocked externally for security.",
    },
  ] as const;

  const currentTab = tabs.find((t) => t.id === activeTab) || tabs[0];

  const envBlock = `# MindZed PostgreSQL (${cardData.database}) - ${currentTab.label}
DATABASE_URL="${currentTab.url}"
PG_HOST="${currentTab.id === 'dokploy' ? 'postgres-databases-sharedpostgres-kooq42' : currentTab.id === 'ssh' ? 'localhost' : '129.154.34.1'}"
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
          className="fixed inset-0 bg-black/80 backdrop-blur-sm"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          className="relative w-full max-w-2xl rounded-2xl bg-[#111114] border border-zinc-750 p-6 shadow-2xl z-10 overflow-hidden"
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
              className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Credentials Summary Pill Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 my-4 p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs">
            <div>
              <span className="text-[10px] text-zinc-500 font-mono block">DATABASE NAME</span>
              <span className="font-mono text-white font-semibold truncate block">{cardData.database}</span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 font-mono block">DATABASE USER</span>
              <span className="font-mono text-sky-400 font-semibold truncate block">{cardData.username}</span>
            </div>
            <div className="col-span-2 sm:col-span-1 flex flex-col justify-center">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] text-zinc-500 font-mono block">PASSWORD</span>
                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={isResetting}
                  className="text-[10px] text-emerald-400 hover:text-emerald-300 font-mono flex items-center gap-1 hover:underline cursor-pointer disabled:opacity-50"
                  title="Generate a new secure 32-character crypto password"
                >
                  <RefreshCw className={`h-2.5 w-2.5 ${isResetting ? "animate-spin" : ""}`} />
                  <span>{isResetting ? "Rotating..." : isManaged ? "Set New Key" : "Rotate"}</span>
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-zinc-200 font-semibold truncate">
                  {isManaged
                    ? "••••••••••••••••"
                    : showPassword
                    ? cardData.password
                    : "••••••••••••••••"}
                </span>
                {!isManaged && (
                  <button
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-zinc-500 hover:text-white p-0.5"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
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

            {/* Connection URL Code Block */}
            <div className="relative rounded-xl bg-zinc-950 border border-zinc-800 p-3.5 font-mono text-xs text-zinc-200 break-all select-all flex items-center justify-between gap-3">
              <span className="overflow-x-auto text-white">{getMaskedUrl(currentTab.url)}</span>
              <button
                onClick={() => handleCopy(currentTab.url, "url")}
                className="shrink-0 p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white transition-all flex items-center gap-1.5 text-xs font-sans font-medium cursor-pointer"
              >
                {copiedKey === "url" ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-semibold">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
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
