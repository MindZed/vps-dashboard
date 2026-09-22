"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { 
  Activity, 
  Database, 
  ArrowUpRight, 
  Layers, 
  RefreshCw,
  HardDrive,
  Clock,
  Network
} from "lucide-react";
import { fetchSystemVitals, SystemVitals, fetchDatabases } from "@/lib/agent-client";
import { fetchKumaStatus } from "@/lib/kuma-client";
import { ResourceDataPoint } from "@/components/charts/ResourceHistory";

// Dynamic imports for ECharts to ensure SSR safety
const VitalsGauge = dynamic(() => import("@/components/charts/VitalsGauge"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[200px] flex items-center justify-center text-zinc-500 font-mono text-xs">
      Loading minimal telemetry...
    </div>
  ),
});

const ResourceHistory = dynamic(() => import("@/components/charts/ResourceHistory"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[200px] flex items-center justify-center text-zinc-500 font-mono text-xs">
      Loading streaming graph...
    </div>
  ),
});

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  return `${h}h ${m}m`;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1000) return `${Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

export default function OverviewPage() {
  const [vitals, setVitals] = useState<SystemVitals | null>(null);
  const [history, setHistory] = useState<ResourceDataPoint[]>([]);
  const [dbCount, setDbCount] = useState<number>(3);
  const [kumaUptime, setKumaUptime] = useState<number>(99.98);
  const [isMock, setIsMock] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const pollVitals = async () => {
    try {
      const res = await fetchSystemVitals();
      setVitals(res.vitals);
      setIsMock(res.isMock);
      const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      setLastUpdated(timeStr);

      setHistory((prev) => {
        const next = [
          ...prev,
          {
            time: timeStr,
            cpu: res.vitals.cpu_usage_pct,
            ram: Math.round((res.vitals.ram_used_mb / res.vitals.ram_total_mb) * 1000) / 10,
          },
        ];
        return next.slice(-25);
      });
    } catch (e) {
      console.error("Failed to poll vitals", e);
    }
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await pollVitals();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  useEffect(() => {
    pollVitals();
    fetchDatabases().then((r) => setDbCount(r.databases.length));
    fetchKumaStatus().then((r) => setKumaUptime(r.overallUptime));

    const interval = setInterval(pollVitals, 3500);
    return () => clearInterval(interval);
  }, []);

  const ramPct = vitals ? Math.round((vitals.ram_used_mb / vitals.ram_total_mb) * 100) : 0;
  const diskPct = vitals ? Math.round((vitals.disk_used_gb / vitals.disk_total_gb) * 100) : 0;

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Infrastructure Vitals
            </h1>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase font-semibold border ${
              isMock 
                ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
            }`}>
              {isMock ? "Simulated" : "Live Agent"}
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            Oracle Cloud Ampere A1 (4 OCPU, 24 GB RAM) • Dokploy Swarm Network
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <span className="text-[10px] text-zinc-500 font-mono block">LAST TICK</span>
            <span className="text-xs font-mono text-zinc-300">{lastUpdated || "Syncing..."}</span>
          </div>

          <button
            onClick={handleManualRefresh}
            className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 text-xs font-medium"
            title="Refresh vitals now"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-white" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <Link
            href="/databases"
            className="px-4 py-2 rounded-xl text-xs font-semibold text-black bg-white hover:bg-zinc-200 transition-colors flex items-center gap-1.5 shadow"
          >
            <Database className="h-3.5 w-3.5" />
            <span>Manage Databases</span>
          </Link>
        </div>
      </div>

      {/* Main Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Minimalist Dual Gauges (Non-overlapping with Soft Color Accents) */}
        <div className="lg:col-span-5 rounded-2xl bg-zinc-900/30 border border-zinc-800/80 p-5 backdrop-blur-sm relative">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-zinc-400" />
              <h2 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">Core Resource Load</h2>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-mono">
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> CPU {vitals?.cpu_usage_pct ?? 0}%
              </span>
              <span className="flex items-center gap-1 text-sky-400 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-400" /> RAM {ramPct}%
              </span>
            </div>
          </div>

          {/* Minimalist ECharts Dials */}
          <VitalsGauge
            cpuPct={vitals?.cpu_usage_pct ?? 0}
            ramUsedMB={vitals?.ram_used_mb ?? 0}
            ramTotalMB={vitals?.ram_total_mb ?? 24150}
          />

          {/* Quick Metrics Footer */}
          <div className="grid grid-cols-2 gap-3 pt-3 mt-1 border-t border-zinc-800/60 text-xs">
            <div className="rounded-xl bg-zinc-950/80 p-2.5 border border-zinc-850">
              <span className="text-[10px] text-zinc-500 font-mono block">CPU ARCHITECTURE</span>
              <span className="text-zinc-200 font-semibold font-mono">ARM64 Neoverse-N1</span>
            </div>
            <div className="rounded-xl bg-zinc-950/80 p-2.5 border border-zinc-850">
              <span className="text-[10px] text-zinc-500 font-mono block">MEMORY POOL</span>
              <span className="text-zinc-200 font-semibold font-mono">
                {vitals ? `${Math.round(vitals.ram_used_mb / 1024)}GB / ${Math.round(vitals.ram_total_mb / 1024)}GB` : "..."}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Streaming Area Chart */}
        <div className="lg:col-span-7 rounded-2xl bg-zinc-900/30 border border-zinc-800/80 p-5 backdrop-blur-sm relative">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-zinc-400" />
              <h2 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">Streaming Telemetry</h2>
            </div>
            <span className="text-[11px] font-mono text-zinc-500">Live 3.5s Ticks</span>
          </div>

          <ResourceHistory data={history} />

          <div className="flex items-center justify-between pt-3 mt-1 border-t border-zinc-800/60 text-xs text-zinc-400 font-mono">
            <span className="flex items-center gap-1.5 text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Daemon footprint: &lt; 14 MB (Golang)
            </span>
            <span className="text-[11px] text-zinc-500">Ring buffer</span>
          </div>
        </div>
      </div>

      {/* Grid of Key Infrastructure Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: NVMe Root Disk */}
        <div className="rounded-2xl bg-zinc-900/30 border border-zinc-800/80 p-5 backdrop-blur-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Root NVMe Storage</span>
            <HardDrive className="h-4 w-4 text-amber-400/80" />
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-2xl font-bold font-mono text-white">
              {vitals?.disk_used_gb ?? 0} <span className="text-xs text-zinc-500 font-sans font-normal">GB</span>
            </div>
            <div className="text-xs font-mono text-zinc-400">
              of {vitals?.disk_total_gb ?? 100} GB
            </div>
          </div>
          <div className="space-y-1">
            <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-amber-400/80 h-full rounded-full transition-all duration-500"
                style={{ width: `${diskPct}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
              <span>{diskPct}% allocated</span>
              <span>{(vitals ? vitals.disk_total_gb - vitals.disk_used_gb : 0).toFixed(1)} GB free</span>
            </div>
          </div>
        </div>

        {/* Card 2: Host Uptime */}
        <div className="rounded-2xl bg-zinc-900/30 border border-zinc-800/80 p-5 backdrop-blur-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Host Uptime</span>
            <Clock className="h-4 w-4 text-zinc-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {vitals ? formatUptime(vitals.uptime_seconds) : "..."}
          </div>
          <p className="text-xs text-zinc-400">
            Continuous Linux runtime without reboot.
          </p>
        </div>

        {/* Card 3: Databases Fleet */}
        <Link
          href="/databases"
          className="group rounded-2xl bg-zinc-900/30 border border-zinc-800/80 hover:border-zinc-600 p-5 backdrop-blur-sm space-y-3 transition-all cursor-pointer block"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider group-hover:text-emerald-400 transition-colors">
              PostgreSQL Fleet
            </span>
            <ArrowUpRight className="h-4 w-4 text-zinc-500 group-hover:text-emerald-400 transition-colors" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400">
            {dbCount} <span className="text-xs text-zinc-500 font-sans font-normal">Databases</span>
          </div>
          <p className="text-xs text-zinc-400">
            Managed clusters inside Dokploy Swarm.
          </p>
        </Link>

        {/* Card 4: Uptime Kuma Watchdog */}
        <Link
          href="/status"
          className="group rounded-2xl bg-zinc-900/30 border border-zinc-800/80 hover:border-zinc-600 p-5 backdrop-blur-sm space-y-3 transition-all cursor-pointer block"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider group-hover:text-emerald-400 transition-colors">
              Uptime Watchdog
            </span>
            <ArrowUpRight className="h-4 w-4 text-zinc-500 group-hover:text-emerald-400 transition-colors" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400">
            {kumaUptime}% <span className="text-xs text-zinc-500 font-sans font-normal">Availability</span>
          </div>
          <p className="text-xs text-zinc-400">
            External heartbeat monitoring (GCP).
          </p>
        </Link>
      </div>

      {/* Network & Host Telemetry Bar */}
      <div className="rounded-2xl bg-zinc-900/20 border border-zinc-800/70 p-4 backdrop-blur-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300">
            <Network className="h-4 w-4" />
          </div>
          <div>
            <span className="font-semibold text-zinc-200">Network I/O Telemetry</span>
            <span className="text-zinc-500 block font-mono text-[11px]">
              Interface: eth0 (Cloudflare Tunnel ingress / egress)
            </span>
          </div>
        </div>

        <div className="flex items-center gap-6 font-mono text-xs">
          <div>
            <span className="text-zinc-500 text-[10px] block">TOTAL SENT</span>
            <span className="text-zinc-300 font-semibold">{formatBytes(vitals?.net_bytes_sent)}</span>
          </div>
          <div>
            <span className="text-zinc-500 text-[10px] block">TOTAL RECEIVED</span>
            <span className="text-zinc-300 font-semibold">{formatBytes(vitals?.net_bytes_recv)}</span>
          </div>
          <div>
            <span className="text-zinc-500 text-[10px] block">DAEMON ENDPOINT</span>
            <span className="text-white font-semibold">agent.mindzed.tech</span>
          </div>
        </div>
      </div>
    </div>
  );
}
