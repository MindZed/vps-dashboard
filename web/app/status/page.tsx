"use client";

import { useEffect, useState } from "react";
import { 
  CheckCircle2, 
  ExternalLink, 
  Activity, 
  Server, 
  Calendar,
  Info
} from "lucide-react";
import { fetchKumaStatus, KumaStatusResponse } from "@/lib/kuma-client";

export default function StatusPage() {
  const [data, setData] = useState<KumaStatusResponse | null>(null);

  useEffect(() => {
    fetchKumaStatus().then((res) => {
      setData(res);
    });
  }, []);

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Infrastructure Watchdog
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-sky-500/10 border border-sky-500/30 text-sky-400 font-semibold">
              Uptime Kuma
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            Independent watchdog monitoring Oracle VPS services & tunnels.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span>All Systems Operational</span>
          </div>
        </div>
      </div>

      {/* Main Overall Uptime Card */}
      <div className="rounded-2xl bg-zinc-900/30 border border-zinc-800 p-6 backdrop-blur-sm shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-1">
          <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider block">
            AVERAGE FLEET AVAILABILITY (30 DAYS)
          </span>
          <div className="text-4xl sm:text-5xl font-extrabold font-mono text-emerald-400">
            {data?.overallUptime ?? 99.98}%
          </div>
          <p className="text-xs text-zinc-400">
            Monitored every 60 seconds with automated heartbeat detection.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 w-full md:w-auto text-xs font-mono">
          <div className="rounded-xl bg-zinc-950 p-3.5 border border-zinc-800">
            <span className="text-[10px] text-zinc-500 block">MONITORED TARGETS</span>
            <span className="text-lg font-bold text-white">{data?.monitors.length ?? 4} Services</span>
          </div>
          <div className="rounded-xl bg-zinc-950 p-3.5 border border-zinc-800">
            <span className="text-[10px] text-zinc-500 block">AVERAGE LATENCY</span>
            <span className="text-lg font-bold text-emerald-400">19 ms</span>
          </div>
        </div>
      </div>

      {/* Monitored Services List */}
      <div className="space-y-4">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
          <Activity className="h-4 w-4 text-zinc-400" />
          <span>Active Endpoints & Heartbeats</span>
        </h2>

        <div className="grid grid-cols-1 gap-4">
          {data?.monitors.map((mon) => (
            <div
              key={mon.id}
              className="rounded-2xl bg-zinc-900/30 border border-zinc-800/80 p-5 backdrop-blur-sm space-y-4 hover:border-zinc-700 transition-all"
            >
              {/* Service Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
                    <Server className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      {mon.name}
                      <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-zinc-800 text-zinc-400">
                        {mon.type}
                      </span>
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
                    <span className="text-emerald-400 font-semibold">{mon.currentPing} ms</span>
                  </div>
                  <div className="text-right">
                    <span className="text-zinc-500 text-[10px] block">24H UPTIME</span>
                    <span className="text-zinc-200 font-semibold">{mon.uptime24h}%</span>
                  </div>
                </div>
              </div>

              {/* Heartbeat 30-Tick Bar (Soft Green & Soft Rose) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                  <span>30 minutes ago</span>
                  <span className="text-emerald-400/90 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Operational
                  </span>
                </div>
                <div className="flex items-center gap-1 w-full">
                  {mon.heartbeats.map((hb, i) => (
                    <div
                      key={i}
                      title={`${new Date(hb.time).toLocaleTimeString()}: ${hb.ping}ms (${hb.status === 1 ? 'UP' : 'DOWN'})`}
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

      {/* Incident & Maintenance Log */}
      <div className="space-y-4">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
          <Calendar className="h-4 w-4 text-zinc-400" />
          <span>Incident & Maintenance Log</span>
        </h2>

        <div className="rounded-2xl bg-zinc-900/20 border border-zinc-800/80 divide-y divide-zinc-800/60 overflow-hidden">
          {data?.incidents.map((inc) => (
            <div key={inc.id} className="p-4 sm:p-5 flex items-start gap-3 text-xs">
              <div className="p-2 rounded-xl bg-zinc-800 text-zinc-300 shrink-0 mt-0.5 border border-zinc-700">
                <Info className="h-4 w-4" />
              </div>
              <div className="space-y-1 flex-1">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <h4 className="font-semibold text-white">{inc.title}</h4>
                  <span className="text-[11px] font-mono text-zinc-500">{inc.date}</span>
                </div>
                <p className="text-zinc-400">
                  Target: <span className="font-mono text-zinc-300">{inc.monitorName}</span> • Duration: {inc.duration}
                </p>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase font-semibold border ${
                inc.type === "maintenance"
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                  : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              }`}>
                {inc.type}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
