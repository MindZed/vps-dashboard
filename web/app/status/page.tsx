"use client";

import { useEffect, useState } from "react";
import { 
  CheckCircle2, 
  ExternalLink, 
  Activity, 
  Server, 
  Calendar,
  Info,
  Search,
  Plus,
  ShieldCheck,
  RefreshCw,
  Trash2,
  Play,
  Pause,
  Lock,
  Globe,
  Clock,
  Zap,
  AlertTriangle,
  X,
  Sliders,
  Settings,
  ChevronRight,
  TrendingUp,
  BarChart2
} from "lucide-react";
import { 
  fetchWatchdogStatus, 
  probeTarget, 
  addWatchdogMonitor, 
  updateWatchdogMonitor,
  deleteWatchdogMonitor, 
  toggleWatchdogMonitor,
  SentinelStatusResponse, 
  SyntheticProbeResult,
  SentinelMonitor,
  UptimeBucket
} from "@/lib/sentinel-client";

type TimeWindow = "30d" | "7d" | "24h" | "ticks";

const INTERVAL_OPTIONS = [
  { value: 10, label: "10 sec", desc: "Real-time mission-critical" },
  { value: 30, label: "30 sec", desc: "Standard recommended" },
  { value: 120, label: "2 min", desc: "Balanced standard" },
  { value: 300, label: "5 min", desc: "Low-frequency ping" },
  { value: 1200, label: "20 min", desc: "Infrequent batch check" },
];

export default function StatusPage() {
  const [data, setData] = useState<SentinelStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("30d");

  // Instant Site Inspector state
  const [probeInput, setProbeInput] = useState("");
  const [isProbing, setIsProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<SyntheticProbeResult | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);

  // Add Monitor Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newMonName, setNewMonName] = useState("");
  const [newMonUrl, setNewMonUrl] = useState("");
  const [newMonType, setNewMonType] = useState<"HTTPS" | "HTTP" | "TCP">("HTTPS");
  const [newMonInterval, setNewMonInterval] = useState(30);
  const [isSubmittingMon, setIsSubmittingMon] = useState(false);

  // Edit Monitor Modal state
  const [editingMon, setEditingMon] = useState<SentinelMonitor | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editType, setEditType] = useState<"HTTPS" | "HTTP" | "TCP">("HTTPS");
  const [editInterval, setEditInterval] = useState(30);
  const [isUpdatingMon, setIsUpdatingMon] = useState(false);

  const loadStatus = async () => {
    try {
      const res = await fetchWatchdogStatus();
      setData(res);
    } catch (e) {
      console.error("Failed to fetch watchdog status", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    // Low frequency auto-refresh every 30 seconds
    const interval = setInterval(loadStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadStatus();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleProbeSite = async (targetToProbe?: string) => {
    const target = (targetToProbe || probeInput).trim();
    if (!target) return;

    setIsProbing(true);
    setProbeError(null);
    try {
      const res = await probeTarget(target);
      setProbeResult(res);
    } catch (e: any) {
      setProbeError(e.message || "Failed to probe site");
    } finally {
      setIsProbing(false);
    }
  };

  const handleAddMonitorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMonName.trim() || !newMonUrl.trim()) return;

    setIsSubmittingMon(true);
    try {
      await addWatchdogMonitor(newMonName.trim(), newMonUrl.trim(), newMonType, newMonInterval);
      setIsAddModalOpen(false);
      setNewMonName("");
      setNewMonUrl("");
      setNewMonInterval(30);
      await loadStatus();
    } catch (e) {
      console.error("Failed to add monitor", e);
    } finally {
      setIsSubmittingMon(false);
    }
  };

  const handleOpenEdit = (mon: SentinelMonitor) => {
    setEditingMon(mon);
    setEditName(mon.name);
    setEditUrl(mon.url);
    setEditType((mon.type as any) || "HTTPS");
    setEditInterval(mon.interval_sec || 30);
  };

  const handleUpdateMonitorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMon || !editName.trim() || !editUrl.trim()) return;

    setIsUpdatingMon(true);
    try {
      await updateWatchdogMonitor(editingMon.id, {
        name: editName.trim(),
        url: editUrl.trim(),
        type: editType,
        interval_sec: editInterval,
      });

      // Optimistic state update
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          monitors: prev.monitors.map((m) =>
            m.id === editingMon.id
              ? {
                  ...m,
                  name: editName.trim(),
                  url: editUrl.trim(),
                  type: editType,
                  interval_sec: editInterval,
                }
              : m
          ),
        };
      });

      setEditingMon(null);
      await loadStatus();
    } catch (e) {
      console.error("Failed to update monitor", e);
    } finally {
      setIsUpdatingMon(false);
    }
  };

  const handleDeleteMonitor = async (id: string) => {
    if (!confirm("Are you sure you want to delete this monitor?")) return;
    try {
      await deleteWatchdogMonitor(id);
      setData((prev) => prev ? { ...prev, monitors: prev.monitors.filter((m) => m.id !== id) } : null);
      await loadStatus();
    } catch (e) {
      console.error("Failed to delete monitor", e);
    }
  };

  const handleToggleMonitor = async (mon: SentinelMonitor) => {
    const nextState = !mon.active;
    try {
      await toggleWatchdogMonitor(mon.id, nextState);
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          monitors: prev.monitors.map((m) => m.id === mon.id ? { ...m, active: nextState } : m)
        };
      });
    } catch (e) {
      console.error("Failed to toggle monitor", e);
    }
  };

  const formatIntervalLabel = (sec?: number) => {
    if (!sec || sec === 30) return "30s";
    if (sec === 10) return "10s";
    if (sec === 60) return "1m";
    if (sec === 120) return "2m";
    if (sec === 300) return "5m";
    if (sec === 1200) return "20m";
    if (sec >= 60) return `${Math.round(sec / 60)}m`;
    return `${sec}s`;
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <span className="text-xs text-zinc-500 font-mono">Connecting to MindZed Sentinel Daemon...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4 sm:pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <span>MindZed Sentinel</span>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                Micro Watchdog
              </span>
            </h1>
            {data?.isMock && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400" title="Daemon fallback simulation mode">
                Simulated
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-zinc-400">
            Independent synthetic heartbeat monitoring, waterfall latency telemetry & SSL certificates from Oracle Micro VPS.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-semibold transition-colors shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Monitor</span>
          </button>

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Refresh status now"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin text-emerald-400" : ""}`} />
          </button>
        </div>
      </div>

      {/* Instant Synthetic Site Inspector */}
      <div className="rounded-2xl bg-zinc-900/40 border border-zinc-800/80 p-4 sm:p-5 backdrop-blur-sm space-y-4 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-sky-400" />
            <h2 className="text-sm font-semibold text-white">Instant Synthetic Site Inspector</h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
              net/http/httptrace
            </span>
          </div>
          <span className="text-xs text-zinc-500 font-mono hidden sm:inline">
            Probe any public URL or host:port on-demand
          </span>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={probeInput}
              onChange={(e) => setProbeInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleProbeSite()}
              placeholder="e.g. https://google.com, https://mindzed.tech, or 129.154.34.1:6432"
              className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3.5 py-2 text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
            />
          </div>
          <button
            onClick={() => handleProbeSite()}
            disabled={isProbing || !probeInput.trim()}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black text-xs font-semibold font-mono transition-colors shrink-0"
          >
            {isProbing ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>Probing...</span>
              </>
            ) : (
              <>
                <Zap className="h-3.5 w-3.5 fill-current" />
                <span>Inspect Target</span>
              </>
            )}
          </button>
        </div>

        {probeError && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{probeError}</span>
          </div>
        )}

        {probeResult && (
          <div className="rounded-xl bg-zinc-950/70 border border-zinc-800/80 p-4 space-y-4 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-850">
              <div className="flex items-center gap-3">
                <span className={`h-2.5 w-2.5 rounded-full ${probeResult.status === "up" ? "bg-emerald-400" : "bg-rose-500"}`} />
                <span className="font-mono text-xs font-bold text-white">{probeResult.target}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                  {probeResult.type}
                </span>
                {probeResult.status_code && (
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${probeResult.status_code < 400 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
                    HTTP {probeResult.status_code}
                  </span>
                )}
              </div>
              <div className="text-xs font-mono text-zinc-400 flex items-center gap-2">
                <span>Total Response:</span>
                <span className="text-emerald-400 font-bold">{probeResult.latency_ms} ms</span>
              </div>
            </div>

            {/* Waterfall Timing Breakdown */}
            <div className="space-y-2">
              <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-500 block">
                WATERFALL TIMING BREAKDOWN (net/http/httptrace)
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 block">DNS LOOKUP</span>
                  <span className="text-white font-semibold">{probeResult.dns_lookup_ms ?? 0} ms</span>
                </div>
                <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 block">TCP CONNECT</span>
                  <span className="text-white font-semibold">{probeResult.tcp_connect_ms ?? 0} ms</span>
                </div>
                <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 block">TLS HANDSHAKE</span>
                  <span className="text-white font-semibold">{probeResult.tls_handshake_ms ?? 0} ms</span>
                </div>
                <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800">
                  <span className="text-[10px] text-zinc-500 block">TIME TO FIRST BYTE (TTFB)</span>
                  <span className="text-emerald-400 font-semibold">{probeResult.ttfb_ms ?? probeResult.latency_ms} ms</span>
                </div>
              </div>
            </div>

            {/* SSL Certificate Details if present */}
            {probeResult.ssl_cert && (
              <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <Lock className="h-4 w-4 text-emerald-400" />
                  <div>
                    <span className="font-semibold text-white block">
                      SSL Certificate: {probeResult.ssl_cert.issuer}
                    </span>
                    <span className="text-[10px] text-zinc-400 font-mono block">
                      Issued for: {probeResult.ssl_cert.subject}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 font-mono">
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                    probeResult.ssl_cert.days_remaining > 15
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                  }`}>
                    {probeResult.ssl_cert.days_remaining} Days Remaining
                  </span>
                  <span className="text-[10px] text-zinc-500">
                    Expires: {new Date(probeResult.ssl_cert.valid_until).toLocaleDateString()}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Overall Fleet Availability Card */}
      <div className="rounded-2xl bg-zinc-900/30 border border-zinc-800 p-4 sm:p-6 backdrop-blur-sm shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-1">
          <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider block">
            AVERAGE FLEET AVAILABILITY (30 DAYS)
          </span>
          <div className="text-4xl sm:text-5xl font-extrabold font-mono text-emerald-400">
            {data?.overall_uptime ?? 99.98}%
          </div>
          <p className="text-xs text-zinc-400">
            Continuous probes recorded directly into embedded SQLite WAL database on secondary Micro VPS.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 w-full md:w-auto text-xs font-mono">
          <div className="rounded-xl bg-zinc-950 p-3 sm:p-3.5 border border-zinc-800">
            <span className="text-[10px] text-zinc-500 block">MONITORED TARGETS</span>
            <span className="text-base sm:text-lg font-bold text-white">{data?.monitors.length ?? 4} Services</span>
          </div>
          <div className="rounded-xl bg-zinc-950 p-3 sm:p-3.5 border border-zinc-800">
            <span className="text-[10px] text-zinc-500 block">MEMORY FOOTPRINT</span>
            <span className="text-base sm:text-lg font-bold text-emerald-400">~12 MB RAM</span>
          </div>
        </div>
      </div>

      {/* Monitored Fleet List with Operational Window Selector */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-400" />
            <span>Monitored Services & Operational Uptime</span>
          </h2>

          {/* Time Horizon Selector (Industry Standard) */}
          <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800 text-xs font-mono overflow-x-auto max-w-full">
            <button
              onClick={() => setTimeWindow("30d")}
              className={`px-2.5 sm:px-3 py-1 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap text-xs ${
                timeWindow === "30d" ? "bg-white text-black font-semibold shadow-sm" : "text-zinc-400 hover:text-white"
              }`}
            >
              <Calendar className="h-3 w-3" />
              <span>30 Days</span>
            </button>
            <button
              onClick={() => setTimeWindow("7d")}
              className={`px-2.5 sm:px-3 py-1 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap text-xs ${
                timeWindow === "7d" ? "bg-white text-black font-semibold shadow-sm" : "text-zinc-400 hover:text-white"
              }`}
            >
              <span>7 Days</span>
            </button>
            <button
              onClick={() => setTimeWindow("24h")}
              className={`px-2.5 sm:px-3 py-1 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap text-xs ${
                timeWindow === "24h" ? "bg-white text-black font-semibold shadow-sm" : "text-zinc-400 hover:text-white"
              }`}
            >
              <Clock className="h-3 w-3" />
              <span>24 Hours</span>
            </button>
            <button
              onClick={() => setTimeWindow("ticks")}
              className={`px-2.5 sm:px-3 py-1 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap text-xs ${
                timeWindow === "ticks" ? "bg-white text-black font-semibold shadow-sm" : "text-zinc-400 hover:text-white"
              }`}
            >
              <Zap className="h-3 w-3" />
              <span>Live Ticks</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {data?.monitors.map((mon) => {
            // Determine which bars to display according to timeWindow
            const buckets30 = mon.buckets_30d || [];
            const buckets7 = mon.buckets_7d || [];
            const buckets24 = mon.buckets_24h || [];

            let activeBuckets: UptimeBucket[] = [];
            let windowLabel = "30 Days";
            let startLabel = "30 days ago";
            let endLabel = "Today";

            if (timeWindow === "30d") {
              activeBuckets = buckets30;
              windowLabel = "30 Days Window";
              startLabel = "30 days ago";
              endLabel = "Today";
            } else if (timeWindow === "7d") {
              activeBuckets = buckets7;
              windowLabel = "7 Days Window";
              startLabel = "7 days ago";
              endLabel = "Today";
            } else if (timeWindow === "24h") {
              activeBuckets = buckets24;
              windowLabel = "24 Hours Window";
              startLabel = "24 hours ago";
              endLabel = "Now";
            } else {
              windowLabel = `Last ${mon.heartbeats.length} Probes`;
              startLabel = "Oldest tick";
              endLabel = "Latest tick";
            }

            return (
              <div
                key={mon.id}
                className={`rounded-2xl border p-4 sm:p-5 backdrop-blur-sm space-y-3 sm:space-y-4 transition-all ${
                  mon.active
                    ? "bg-zinc-900/30 border-zinc-800/80 hover:border-zinc-700"
                    : "bg-zinc-950/40 border-zinc-850 opacity-60"
                }`}
              >
                {/* Service Header Row */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex items-start justify-between gap-3 min-w-0">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`p-2.5 rounded-xl border shrink-0 mt-0.5 ${
                        mon.status === "up"
                          ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                          : "bg-rose-500/10 border-rose-500/25 text-rose-400"
                      }`}>
                        <Server className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <h3 className="text-sm font-semibold text-white break-words">
                            {mon.name}
                          </h3>
                          <span className="text-[10px] font-mono px-1.5 sm:px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 shrink-0">
                            {mon.type}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 sm:px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center gap-1 shrink-0" title="Configured probe frequency">
                            <Zap className="h-2.5 w-2.5" />
                            <span>{formatIntervalLabel(mon.interval_sec)} tick</span>
                          </span>
                          {mon.ssl_days_left != null && (
                            <span className="text-[10px] font-mono px-1.5 sm:px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-1 shrink-0">
                              <Lock className="h-2.5 w-2.5" /> {mon.ssl_days_left}d SSL
                            </span>
                          )}
                        </div>
                        <a
                          href={mon.url.startsWith("http") ? mon.url : undefined}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-zinc-500 font-mono hover:text-white transition-colors flex items-center gap-1 truncate mt-0.5 max-w-full"
                        >
                          <span className="truncate">{mon.url}</span>
                          {mon.url.startsWith("http") && <ExternalLink className="h-2.5 w-2.5 shrink-0" />}
                        </a>
                      </div>
                    </div>

                    {/* Mobile/Tablet Top-Right Action Buttons */}
                    <div className="flex items-center gap-1 shrink-0 lg:hidden">
                      <button
                        onClick={() => handleProbeSite(mon.url)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 transition-colors"
                        title="Run on-demand synthetic probe"
                      >
                        <Zap className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleOpenEdit(mon)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                        title="Edit monitor settings"
                      >
                        <Settings className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleToggleMonitor(mon)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                        title={mon.active ? "Pause monitor" : "Resume monitor"}
                      >
                        {mon.active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 text-emerald-400" />}
                      </button>
                      <button
                        onClick={() => handleDeleteMonitor(mon.id)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-950/20 transition-colors"
                        title="Delete monitor"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Desktop Inline Telemetry & Actions */}
                  <div className="hidden lg:flex items-center gap-5 text-xs font-mono shrink-0">
                    <div className="text-right">
                      <span className="text-zinc-500 text-[10px] block">CURRENT</span>
                      <span className="text-emerald-400 font-semibold">{mon.current_ping} ms</span>
                    </div>

                    <div className="text-right">
                      <span className="text-zinc-500 text-[10px] block">MIN / MAX</span>
                      <span className="text-zinc-300 font-semibold">
                        {mon.min_ping ?? mon.current_ping} / {mon.max_ping ?? mon.current_ping} ms
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-zinc-500 text-[10px] block">
                        {timeWindow === "24h" ? "24H UPTIME" : "30D UPTIME"}
                      </span>
                      <span className="text-white font-semibold">
                        {timeWindow === "24h" ? mon.uptime24h : mon.uptime30d}%
                      </span>
                    </div>

                    {/* Desktop Action Buttons */}
                    <div className="flex items-center gap-1 pl-3 border-l border-zinc-800">
                      <button
                        onClick={() => handleProbeSite(mon.url)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 transition-colors"
                        title="Run on-demand synthetic probe on this endpoint"
                      >
                        <Zap className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleOpenEdit(mon)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                        title="Edit monitor settings & tick interval"
                      >
                        <Settings className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleToggleMonitor(mon)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                        title={mon.active ? "Pause monitor" : "Resume monitor"}
                      >
                        {mon.active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 text-emerald-400" />}
                      </button>
                      <button
                        onClick={() => handleDeleteMonitor(mon.id)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-950/20 transition-colors"
                        title="Delete monitor"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Mobile/Tablet Dedicated Telemetry Stats Bar */}
                <div className="grid grid-cols-3 gap-2 py-2 px-3 rounded-xl bg-zinc-950/70 border border-zinc-850 text-xs font-mono lg:hidden">
                  <div>
                    <span className="text-zinc-500 text-[10px] block">CURRENT</span>
                    <span className="text-emerald-400 font-semibold">{mon.current_ping} ms</span>
                  </div>
                  <div className="text-center">
                    <span className="text-zinc-500 text-[10px] block">MIN / MAX</span>
                    <span className="text-zinc-300 font-semibold text-[11px]">
                      {mon.min_ping ?? mon.current_ping}/{mon.max_ping ?? mon.current_ping} ms
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-zinc-500 text-[10px] block">
                      {timeWindow === "24h" ? "24H UPTIME" : "30D UPTIME"}
                    </span>
                    <span className="text-white font-semibold">
                      {timeWindow === "24h" ? mon.uptime24h : mon.uptime30d}%
                    </span>
                  </div>
                </div>

                {/* Operational Timeline Bars */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                    <span className="text-zinc-400 font-semibold">{windowLabel}</span>
                    <span className="text-emerald-400/90 flex items-center gap-1.5 font-semibold">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> 
                      {mon.status === "up" ? "100% Operational" : "Degraded / Outage"}
                    </span>
                  </div>

                  {/* Render Aggregated Buckets (30d, 7d, 24h) OR Live Ticks */}
                  {timeWindow !== "ticks" ? (
                    <div className="flex items-center gap-0.5 sm:gap-1 w-full overflow-hidden">
                      {activeBuckets.map((bucket, i) => {
                        let barColor = "bg-emerald-500/80 hover:bg-emerald-400";
                        if (bucket.status === "no_data") {
                          barColor = "bg-zinc-800/60 hover:bg-zinc-700";
                        } else if (bucket.status === "down") {
                          barColor = "bg-rose-500 hover:bg-rose-400";
                        } else if (bucket.status === "degraded") {
                          barColor = "bg-amber-400 hover:bg-amber-300";
                        }

                        const tooltip = bucket.status === "no_data"
                          ? `${bucket.time_label}: No activity recorded prior to deployment`
                          : `${bucket.time_label}: ${bucket.uptime_percent}% uptime • ${bucket.avg_latency_ms}ms avg (${bucket.total_checks} checks)`;

                        return (
                          <div
                            key={i}
                            title={tooltip}
                            className={`h-7 flex-1 min-w-[3px] sm:min-w-[5px] rounded-xs sm:rounded-sm transition-all hover:scale-110 cursor-pointer ${barColor}`}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    /* Live Ticks (Raw 30-Heartbeat Stream) */
                    <div className="flex items-center gap-0.5 sm:gap-1 w-full overflow-hidden">
                      {mon.heartbeats.map((hb, i) => (
                        <div
                          key={i}
                          title={`${new Date(hb.created_at).toLocaleTimeString()}: ${hb.latency_ms}ms (${hb.status === 1 ? 'UP' : 'DOWN'})`}
                          className={`h-7 flex-1 min-w-[3px] sm:min-w-[5px] rounded-xs sm:rounded-sm transition-all hover:scale-110 cursor-pointer ${
                            hb.status === 1 
                              ? "bg-emerald-500/80 hover:bg-emerald-400" 
                              : "bg-rose-500 hover:bg-rose-400"
                          }`}
                        />
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[9px] text-zinc-500 font-mono">
                    <span>{startLabel}</span>
                    <span className="hidden sm:inline text-zinc-600">Hover bar for latency & check details</span>
                    <span>{endLabel}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Incidents Section */}
      <div className="space-y-4">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-zinc-400" />
          <span>Incident & Recovery Log</span>
        </h2>

        {data?.incidents && data.incidents.length > 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 overflow-hidden divide-y divide-zinc-800">
            {data.incidents.map((inc) => (
              <div key={inc.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold ${
                      inc.status === "resolved" 
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                        : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                    }`}>
                      {inc.status === "resolved" ? "Resolved" : "Active Outage"}
                    </span>
                    <span className="font-semibold text-white">{inc.title}</span>
                  </div>
                  {inc.error_msg && (
                    <p className="text-[11px] font-mono text-zinc-500">{inc.error_msg}</p>
                  )}
                </div>

                <div className="text-right font-mono text-[11px] text-zinc-500 shrink-0">
                  <div>{inc.started_at}</div>
                  {inc.duration_sec > 0 && (
                    <div className="text-zinc-400">Duration: {inc.duration_sec}s</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 rounded-2xl border border-zinc-800/80 bg-zinc-900/20 text-center text-xs text-zinc-500 font-mono">
            All systems fully operational. Zero incidents recorded in Sentinel SQLite.
          </div>
        )}
      </div>

      {/* Add Monitor Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-[#111114] border border-zinc-800 p-5 sm:p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">Add Synthetic Monitor</h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddMonitorSubmit} className="space-y-4 text-xs font-mono">
              <div>
                <label className="block text-zinc-400 mb-1">Friendly Name</label>
                <input
                  type="text"
                  required
                  value={newMonName}
                  onChange={(e) => setNewMonName(e.target.value)}
                  placeholder="e.g. Production API or Client Portal"
                  className="w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Target Endpoint</label>
                <input
                  type="text"
                  required
                  value={newMonUrl}
                  onChange={(e) => setNewMonUrl(e.target.value)}
                  placeholder="e.g. https://api.mindzed.tech or 129.154.34.1:6432"
                  className="w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Probe Protocol</label>
                <select
                  value={newMonType}
                  onChange={(e) => setNewMonType(e.target.value as any)}
                  className="w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                >
                  <option value="HTTPS">HTTPS (SSL + TTFB)</option>
                  <option value="HTTP">HTTP (Plain)</option>
                  <option value="TCP">TCP Socket Ping</option>
                </select>
              </div>

              {/* Tick / Interval Selector */}
              <div>
                <label className="block text-zinc-400 mb-1">Probe Frequency (Tick Window)</label>
                <div className="grid grid-cols-2 gap-2">
                  {INTERVAL_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setNewMonInterval(opt.value)}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        newMonInterval === opt.value
                          ? "bg-emerald-500/10 border-emerald-500 text-emerald-400"
                          : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      <div className="font-bold">{opt.label}</div>
                      <div className="text-[10px] text-zinc-500 truncate">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingMon}
                  className="px-4 py-2 rounded-xl bg-white hover:bg-zinc-200 text-black font-semibold transition-colors disabled:opacity-50"
                >
                  {isSubmittingMon ? "Creating..." : "Create Monitor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Monitor Modal */}
      {editingMon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-[#111114] border border-zinc-800 p-5 sm:p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-sky-400" />
                <h3 className="text-sm font-semibold text-white">Edit Monitor & Tick Time</h3>
              </div>
              <button
                onClick={() => setEditingMon(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateMonitorSubmit} className="space-y-4 text-xs font-mono">
              <div>
                <label className="block text-zinc-400 mb-1">Friendly Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-white focus:outline-none focus:border-sky-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Target Endpoint</label>
                <input
                  type="text"
                  required
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  className="w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-white focus:outline-none focus:border-sky-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Probe Protocol</label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value as any)}
                  className="w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-white focus:outline-none focus:border-sky-500 transition-colors"
                >
                  <option value="HTTPS">HTTPS (SSL + TTFB)</option>
                  <option value="HTTP">HTTP (Plain)</option>
                  <option value="TCP">TCP Socket Ping</option>
                </select>
              </div>

              {/* Tick / Interval Options */}
              <div>
                <label className="block text-zinc-400 mb-1">Probe Frequency (Tick Window)</label>
                <div className="grid grid-cols-2 gap-2">
                  {INTERVAL_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setEditInterval(opt.value)}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        editInterval === opt.value
                          ? "bg-sky-500/10 border-sky-500 text-sky-400"
                          : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      <div className="font-bold">{opt.label}</div>
                      <div className="text-[10px] text-zinc-500 truncate">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingMon(null)}
                  className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingMon}
                  className="px-4 py-2 rounded-xl bg-white hover:bg-zinc-200 text-black font-semibold transition-colors disabled:opacity-50"
                >
                  {isUpdatingMon ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
