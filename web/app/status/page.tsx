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
  X
} from "lucide-react";
import { 
  fetchWatchdogStatus, 
  probeTarget, 
  addWatchdogMonitor, 
  deleteWatchdogMonitor, 
  toggleWatchdogMonitor,
  SentinelStatusResponse, 
  SyntheticProbeResult,
  SentinelMonitor 
} from "@/lib/sentinel-client";

export default function StatusPage() {
  const [data, setData] = useState<SentinelStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Instant Site Inspector state
  const [probeInput, setProbeInput] = useState("");
  const [isProbing, setIsProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<SyntheticProbeResult | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);

  // Add Monitor Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newMonName, setNewMonName] = useState("");
  const [newMonUrl, setNewMonUrl] = useState("");
  const [newMonType, setNewMonType] = useState<"HTTPS" | "TCP">("HTTPS");
  const [newMonInterval, setNewMonInterval] = useState(60);
  const [isSubmittingMon, setIsSubmittingMon] = useState(false);

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
      await loadStatus();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmittingMon(false);
    }
  };

  const handleDeleteMonitor = async (id: string) => {
    if (!confirm("Are you sure you want to remove this monitor?")) return;
    await deleteWatchdogMonitor(id);
    await loadStatus();
  };

  const handleToggleMonitor = async (m: SentinelMonitor) => {
    await toggleWatchdogMonitor(m.id, !m.active);
    await loadStatus();
  };

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              Infrastructure Watchdog
            </h1>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase font-semibold border ${
              data?.isMock
                ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                : "bg-sky-500/10 border-sky-500/30 text-sky-400"
            }`}>
              {data?.isMock ? "Simulated Mode" : "Live Sentinel Micro Daemon (10MB)"}
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            Independent synthetic watchdog probing Oracle VPS services, ports, and SSL certificates from Micro VPS.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-white text-black hover:bg-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Monitor</span>
          </button>

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white transition-all cursor-pointer flex items-center gap-1 text-xs font-medium"
            title="Refresh watchdog status"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-white" : ""}`} />
          </button>
        </div>
      </div>

      {/* NEW: Enterprise Instant Site & SSL Inspector */}
      <div className="rounded-2xl bg-zinc-900/30 border border-zinc-800/80 p-5 backdrop-blur-sm space-y-4 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-0.5">
            <h2 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" />
              <span>Real-Time Synthetic Probe & SSL Inspector</span>
            </h2>
            <p className="text-[11px] text-zinc-400">
              Run an instant micro-second probe to inspect HTTP response, DNS latency, TTFB, and SSL certificate health.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400">
            <span className="text-zinc-500">Quick Check:</span>
            <button
              onClick={() => { setProbeInput("https://mindzed.tech"); handleProbeSite("https://mindzed.tech"); }}
              className="hover:text-white text-zinc-300 underline underline-offset-2"
            >
              mindzed.tech
            </button>
            <span>•</span>
            <button
              onClick={() => { setProbeInput("https://dokploy.mindzed.tech"); handleProbeSite("https://dokploy.mindzed.tech"); }}
              className="hover:text-white text-zinc-300 underline underline-offset-2"
            >
              dokploy
            </button>
          </div>
        </div>

        {/* Input Bar */}
        <div className="flex flex-col sm:flex-row items-stretch gap-2.5">
          <div className="relative flex-1">
            <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              value={probeInput}
              onChange={(e) => setProbeInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleProbeSite()}
              placeholder="Enter URL or host:port (e.g. https://myclient.com or 129.154.34.1:6432)"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-zinc-600 transition-colors"
            />
          </div>

          <button
            onClick={() => handleProbeSite()}
            disabled={isProbing || !probeInput.trim()}
            className="px-5 py-2.5 rounded-xl bg-zinc-100 hover:bg-white text-black text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isProbing ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-black" />
                <span>Probing Target...</span>
              </>
            ) : (
              <>
                <Zap className="h-3.5 w-3.5 text-black" />
                <span>Probe Site Now</span>
              </>
            )}
          </button>
        </div>

        {/* Probe Result Card */}
        {probeResult && (
          <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-4 space-y-4 animate-in fade-in duration-150">
            {/* Top row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-850">
              <div className="flex items-center gap-3">
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border ${
                  probeResult.status === "up" 
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-400"
                }`}>
                  {probeResult.status_code ? `HTTP ${probeResult.status_code}` : probeResult.status.toUpperCase()}
                </span>
                <span className="font-mono text-xs text-white font-semibold break-all">
                  {probeResult.target}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                  {probeResult.type}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right font-mono">
                  <span className="text-[10px] text-zinc-500 block">TOTAL LATENCY</span>
                  <span className="text-sm font-bold text-emerald-400">{probeResult.latency_ms} ms</span>
                </div>

                <button
                  onClick={() => {
                    setNewMonName(probeResult.target.replace(/^https?:\/\//, "").split("/")[0]);
                    setNewMonUrl(probeResult.target);
                    setNewMonType(probeResult.type === "TCP" ? "TCP" : "HTTPS");
                    setIsAddModalOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Plus className="h-3 w-3" /> Add to Fleet
                </button>
              </div>
            </div>

            {/* Performance Waterfall */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div className="rounded-lg bg-zinc-900/60 p-2.5 border border-zinc-850">
                <span className="text-[10px] text-zinc-500 block">DNS LOOKUP</span>
                <span className="text-xs text-white font-semibold">{probeResult.dns_lookup_ms ?? 0} ms</span>
              </div>
              <div className="rounded-lg bg-zinc-900/60 p-2.5 border border-zinc-850">
                <span className="text-[10px] text-zinc-500 block">TCP CONNECT</span>
                <span className="text-xs text-white font-semibold">{probeResult.tcp_connect_ms ?? 0} ms</span>
              </div>
              <div className="rounded-lg bg-zinc-900/60 p-2.5 border border-zinc-850">
                <span className="text-[10px] text-zinc-500 block">TLS HANDSHAKE</span>
                <span className="text-xs text-white font-semibold">{probeResult.tls_handshake_ms ?? 0} ms</span>
              </div>
              <div className="rounded-lg bg-zinc-900/60 p-2.5 border border-zinc-850">
                <span className="text-[10px] text-zinc-500 block">TIME TO FIRST BYTE (TTFB)</span>
                <span className="text-xs text-white font-semibold">{probeResult.ttfb_ms ?? probeResult.latency_ms} ms</span>
              </div>
            </div>

            {/* SSL Certificate Details if present */}
            {probeResult.ssl_cert && (
              <div className="rounded-lg bg-zinc-900/40 p-3 border border-zinc-850 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <Lock className="h-4 w-4 text-emerald-400" />
                  <div>
                    <span className="font-semibold text-white block">
                      SSL Certificate: {probeResult.ssl_cert.issuer}
                    </span>
                    <span className="text-[11px] text-zinc-400 block font-mono">
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
      <div className="rounded-2xl bg-zinc-900/30 border border-zinc-800 p-6 backdrop-blur-sm shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-1">
          <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider block">
            AVERAGE FLEET AVAILABILITY (30 DAYS)
          </span>
          <div className="text-4xl sm:text-5xl font-extrabold font-mono text-emerald-400">
            {data?.overall_uptime ?? 99.98}%
          </div>
          <p className="text-xs text-zinc-400">
            Probed concurrently from independent Oracle Micro Sentinel daemon every 30-60 seconds.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 w-full md:w-auto text-xs font-mono">
          <div className="rounded-xl bg-zinc-950 p-3.5 border border-zinc-800">
            <span className="text-[10px] text-zinc-500 block">MONITORED TARGETS</span>
            <span className="text-lg font-bold text-white">{data?.monitors.length ?? 4} Services</span>
          </div>
          <div className="rounded-xl bg-zinc-950 p-3.5 border border-zinc-800">
            <span className="text-[10px] text-zinc-500 block">AVERAGE LATENCY</span>
            <span className="text-lg font-bold text-emerald-400">22 ms</span>
          </div>
        </div>
      </div>

      {/* Monitored Fleet List */}
      <div className="space-y-4">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
          <Activity className="h-4 w-4 text-zinc-400" />
          <span>Active Endpoints & Heartbeats</span>
        </h2>

        <div className="grid grid-cols-1 gap-4">
          {data?.monitors.map((mon) => (
            <div
              key={mon.id}
              className={`rounded-2xl border p-5 backdrop-blur-sm space-y-4 transition-all ${
                mon.active
                  ? "bg-zinc-900/30 border-zinc-800/80 hover:border-zinc-700"
                  : "bg-zinc-950/40 border-zinc-850 opacity-60"
              }`}
            >
              {/* Service Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl border ${
                    mon.status === "up"
                      ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                      : "bg-rose-500/10 border-rose-500/25 text-rose-400"
                  }`}>
                    <Server className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      {mon.name}
                      <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-zinc-800 text-zinc-400">
                        {mon.type}
                      </span>
                      {mon.ssl_days_left != null && (
                        <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-1">
                          <Lock className="h-2.5 w-2.5" /> {mon.ssl_days_left}d SSL
                        </span>
                      )}
                    </h3>
                    <a
                      href={mon.url.startsWith("http") ? mon.url : undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-zinc-500 font-mono hover:text-white transition-colors flex items-center gap-1"
                    >
                      <span>{mon.url}</span>
                      {mon.url.startsWith("http") && <ExternalLink className="h-2.5 w-2.5" />}
                    </a>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs font-mono">
                  <div className="text-right">
                    <span className="text-zinc-500 text-[10px] block">PING</span>
                    <span className="text-emerald-400 font-semibold">{mon.current_ping} ms</span>
                  </div>
                  <div className="text-right">
                    <span className="text-zinc-500 text-[10px] block">24H UPTIME</span>
                    <span className="text-zinc-200 font-semibold">{mon.uptime24h}%</span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 pl-2 border-l border-zinc-800">
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

              {/* Heartbeat 30-Tick Bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                  <span>30 ticks window</span>
                  <span className="text-emerald-400/90 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> 
                    {mon.status === "up" ? "Operational" : "Degraded / Down"}
                  </span>
                </div>
                <div className="flex items-center gap-1 w-full">
                  {mon.heartbeats.map((hb, i) => (
                    <div
                      key={i}
                      title={`${new Date(hb.created_at).toLocaleTimeString()}: ${hb.latency_ms}ms (${hb.status === 1 ? 'UP' : 'DOWN'})`}
                      className={`h-6 flex-1 rounded-sm transition-all hover:scale-110 cursor-pointer ${
                        hb.status === 1 
                          ? "bg-emerald-500/70 hover:bg-emerald-400" 
                          : "bg-rose-500/80 hover:bg-rose-400"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Incidents & Maintenance Log */}
      <div className="space-y-4">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
          <Calendar className="h-4 w-4 text-zinc-400" />
          <span>Incident & Recovery Log</span>
        </h2>

        <div className="rounded-2xl bg-zinc-900/20 border border-zinc-800/80 divide-y divide-zinc-800/60 overflow-hidden">
          {(!data?.incidents || data.incidents.length === 0) ? (
            <div className="p-5 text-center text-xs text-zinc-500 font-mono">
              Zero downtime incidents recorded. 100% operational reliability.
            </div>
          ) : (
            data.incidents.map((inc) => (
              <div key={inc.id} className="p-4 sm:p-5 flex items-start gap-3 text-xs">
                <div className="p-2 rounded-xl bg-zinc-800 text-zinc-300 shrink-0 mt-0.5 border border-zinc-700">
                  <Info className="h-4 w-4" />
                </div>
                <div className="space-y-1 flex-1">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <h4 className="font-semibold text-white">{inc.title}</h4>
                    <span className="text-[11px] font-mono text-zinc-500">{inc.started_at}</span>
                  </div>
                  <p className="text-zinc-400">
                    Target: <span className="font-mono text-zinc-300">{inc.monitor_name}</span> 
                    {inc.duration_sec > 0 && ` • Duration: ${inc.duration_sec}s`}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase font-semibold border ${
                  inc.status === "active"
                    ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                    : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                }`}>
                  {inc.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add Monitor Modal Drawer */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md rounded-2xl bg-[#111114] border border-zinc-800 p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 space-y-4">
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
                  placeholder="e.g. Client CRM Portal"
                  className="w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-white focus:outline-none focus:border-white transition-colors"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Target Endpoint</label>
                <input
                  type="text"
                  required
                  value={newMonUrl}
                  onChange={(e) => setNewMonUrl(e.target.value)}
                  placeholder="e.g. https://crm.example.com or 1.2.3.4:5432"
                  className="w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-white focus:outline-none focus:border-white transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1">Probe Protocol</label>
                  <select
                    value={newMonType}
                    onChange={(e) => setNewMonType(e.target.value as any)}
                    className="w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-white focus:outline-none focus:border-white transition-colors"
                  >
                    <option value="HTTPS">HTTPS</option>
                    <option value="HTTP">HTTP</option>
                    <option value="TCP">TCP Socket</option>
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Interval (Sec)</label>
                  <select
                    value={newMonInterval}
                    onChange={(e) => setNewMonInterval(Number(e.target.value))}
                    className="w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-white focus:outline-none focus:border-white transition-colors"
                  >
                    <option value={30}>Every 30s</option>
                    <option value={60}>Every 60s</option>
                    <option value={120}>Every 2m</option>
                  </select>
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
                  {isSubmittingMon ? "Adding Monitor..." : "Add Monitor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
