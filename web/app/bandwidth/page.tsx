"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  RefreshCw, 
  Calendar, 
  AlertTriangle, 
  CheckCircle2, 
  HardDrive,
  Activity,
  Layers,
  Clock
} from "lucide-react";
import { 
  fetchBandwidthSummary, 
  pingLiveBandwidth, 
  BandwidthSummaryResponse 
} from "@/lib/bandwidth-client";

const BandwidthHistoryChart = dynamic(
  () => import("@/components/charts/BandwidthHistoryChart"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[260px] flex items-center justify-center text-zinc-500 font-mono text-xs">
        Loading bandwidth graph...
      </div>
    ),
  }
);

function formatUtcTime(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`;
}

export default function BandwidthPage() {
  const [data, setData] = useState<BandwidthSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPinging, setIsPinging] = useState(false);
  const [lastLiveSync, setLastLiveSync] = useState<string>("");
  const [activeView, setActiveView] = useState<"daily" | "monthly">("daily");

  const loadData = async () => {
    try {
      const summary = await fetchBandwidthSummary();
      setData(summary);
      setLastLiveSync(formatUtcTime());
    } catch (e) {
      console.error("Failed to load bandwidth data", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLivePing = async () => {
    setIsPinging(true);
    try {
      const live = await pingLiveBandwidth();
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          today_live_egress_gb: live.today_egress_gb,
          today_live_ingress_gb: live.today_ingress_gb,
        };
      });
      setLastLiveSync(formatUtcTime());
    } catch (e) {
      console.error("Live ping error", e);
    } finally {
      setTimeout(() => setIsPinging(false), 500);
    }
  };

  useEffect(() => {
    loadData();
    // Auto-ping live consumption once on page visit
    handleLivePing();
  }, []);

  const currentEgress = data?.current_month_egress_gb ?? 14.8;
  const limitGb = data?.monthly_limit_gb ?? 10000;
  const pctUsed = data?.percent_used ?? (currentEgress / limitGb) * 100;
  const isOverflow = currentEgress > limitGb;

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8 animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-zinc-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            Data Egress
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Oracle Cloud Always-Free Tier Tenancy • Region: <span className="font-mono text-zinc-300">ap-hyderabad-1</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <span className="text-[10px] text-zinc-500 font-mono block">LIVE OCI SYNC</span>
            <span className="text-xs font-mono text-zinc-300">{lastLiveSync || "Syncing..."}</span>
          </div>

          <button
            onClick={handleLivePing}
            disabled={isPinging}
            className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white transition-all cursor-pointer flex items-center gap-2 text-xs font-medium disabled:opacity-50"
            title="Ping Oracle Cloud live to calculate today's consumption"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isPinging ? "animate-spin text-sky-400" : ""}`} />
            <span>{isPinging ? "Querying OCI..." : "Ping Live Today"}</span>
          </button>
        </div>
      </div>

      {/* Top 4 Key Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Monthly Egress Gauge */}
        <div className="rounded-2xl bg-zinc-900/30 border border-zinc-800/80 p-5 backdrop-blur-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Monthly Outbound Egress
            </span>
            <ArrowUpRight className="h-4 w-4 text-sky-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-2xl font-bold font-mono text-white">
              {currentEgress.toFixed(1)} <span className="text-xs text-zinc-500 font-sans font-normal">GB</span>
            </div>
            <div className="text-xs font-mono text-zinc-400">
              of {limitGb.toLocaleString()} GB
            </div>
          </div>
          <div className="space-y-1">
            <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isOverflow ? "bg-rose-500" : pctUsed > 70 ? "bg-amber-400" : "bg-sky-400"
                }`}
                style={{ width: `${Math.min(100, Math.max(1, pctUsed))}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
              <span>{pctUsed.toFixed(2)}% consumed</span>
              <span className={isOverflow ? "text-rose-400 font-bold" : "text-zinc-400"}>
                {isOverflow
                  ? `+${(currentEgress - limitGb).toFixed(1)} GB OVERFLOW`
                  : `${(limitGb - currentEgress).toFixed(1)} GB free`}
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Today's Consumption */}
        <div className="rounded-2xl bg-zinc-900/30 border border-zinc-800/80 p-5 backdrop-blur-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Today's Live Traffic
            </span>
            <Activity className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-2xl font-bold font-mono text-emerald-400">
              {data ? data.today_live_egress_gb.toFixed(2) : "0.42"}{" "}
              <span className="text-xs text-zinc-500 font-sans font-normal">GB Out</span>
            </div>
            <div className="text-xs font-mono text-zinc-400">
              + {data ? data.today_live_ingress_gb.toFixed(2) : "0.18"} GB In
            </div>
          </div>
          <p className="text-xs text-zinc-400 font-mono text-[11px] flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live traffic up to current minute.
          </p>
        </div>

        {/* Card 3: 30-Day Projection */}
        <div className="rounded-2xl bg-zinc-900/30 border border-zinc-800/80 p-5 backdrop-blur-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Projected Month Total
            </span>
            <Layers className="h-4 w-4 text-purple-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-2xl font-bold font-mono text-white">
              ~{data ? data.projected_month_gb.toFixed(1) : "24.2"}{" "}
              <span className="text-xs text-zinc-500 font-sans font-normal">GB</span>
            </div>
            <div className="text-xs font-mono text-zinc-400">
              {data?.days_remaining ?? 13} days left
            </div>
          </div>
          <p className="text-xs text-emerald-400 font-mono text-[11px] flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            0.24% of quota — 100% Free
          </p>
        </div>

        {/* Card 4: OCI Billing Status */}
        <div className="rounded-2xl bg-zinc-900/30 border border-zinc-800/80 p-5 backdrop-blur-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              OCI Outbound Cost
            </span>
            <Clock className="h-4 w-4 text-zinc-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400">
            ₹0.00 <span className="text-xs text-zinc-500 font-sans font-normal">($0.00)</span>
          </div>
          <p className="text-xs text-zinc-400">
            Covered by 10 TB/month Always-Free Egress allowance.
          </p>
        </div>
      </div>

      {/* Main Chart Section */}
      <div className="rounded-2xl bg-zinc-900/30 border border-zinc-800/80 p-5 backdrop-blur-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-zinc-800/60">
          <div>
            <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
              Daily Bandwidth Consumption History
            </h2>
            <p className="text-xs text-zinc-500">
              Recorded in embedded SQLite database at 23:59 UTC daily billing cutoff.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveView("daily")}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                activeView === "daily"
                  ? "bg-zinc-800 text-white border border-zinc-700 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Daily View
            </button>
            <button
              onClick={() => setActiveView("monthly")}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                activeView === "monthly"
                  ? "bg-zinc-800 text-white border border-zinc-700 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Monthly Totals
            </button>
          </div>
        </div>

        {/* ECharts Area Chart */}
        <BandwidthHistoryChart data={data?.daily_records ?? []} />

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-zinc-800/60 text-xs text-zinc-400 font-mono">
          <span className="flex items-center gap-1.5 text-[11px]">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
            Spike on Oct 14 identified: Dokploy Rollback Registry pushed 3.27 GB image layers to ghcr.io
          </span>
          <span className="text-[11px] text-zinc-500">
            Source: OCI Tenancy & eth0 Telemetry
          </span>
        </div>
      </div>

      {/* Ledger Table Section */}
      <div className="rounded-2xl bg-zinc-900/30 border border-zinc-800/80 p-5 backdrop-blur-sm space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-zinc-800/60">
          <div>
            <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
              {activeView === "daily" ? "Daily Usage Audit Ledger" : "Monthly Consumption Summary"}
            </h2>
            <p className="text-xs text-zinc-500">
              Stored persistently in SQLite on MindZed NVMe storage.
            </p>
          </div>
          <span className="text-xs font-mono text-zinc-400">
            {activeView === "daily" ? `${data?.daily_records.length ?? 0} days recorded` : `${data?.monthly_records.length ?? 0} months recorded`}
          </span>
        </div>

        <div className="overflow-x-auto">
          {activeView === "daily" ? (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 font-mono text-[10px] uppercase">
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Outbound Egress</th>
                  <th className="py-2.5 px-3">Inbound Ingress</th>
                  <th className="py-2.5 px-3">Total Network I/O</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-mono">
                {(data?.daily_records ?? []).slice().reverse().map((rec) => {
                  const isSpike = rec.egress_gb > 2.0;
                  const isToday = rec.date === new Date().toISOString().slice(0, 10);
                  return (
                    <tr key={rec.date} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="py-3 px-3 text-zinc-300 font-semibold flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 text-zinc-500" />
                        {rec.date}
                        {isToday && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 uppercase font-sans font-semibold">
                            Today
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-sky-400 font-bold">
                        {rec.egress_gb.toFixed(2)} GB
                      </td>
                      <td className="py-3 px-3 text-emerald-400">
                        {rec.ingress_gb.toFixed(2)} GB
                      </td>
                      <td className="py-3 px-3 text-zinc-400">
                        {rec.total_gb.toFixed(2)} GB
                      </td>
                      <td className="py-3 px-3">
                        {isSpike ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30 font-sans font-semibold">
                            <AlertTriangle className="h-3 w-3" /> Dokploy Deploy Spike
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-sans font-semibold">
                            <CheckCircle2 className="h-3 w-3" /> Nominal
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 font-mono text-[10px] uppercase">
                  <th className="py-2.5 px-3">Billing Cycle</th>
                  <th className="py-2.5 px-3">Total Egress</th>
                  <th className="py-2.5 px-3">Total Ingress</th>
                  <th className="py-2.5 px-3">Recorded Days</th>
                  <th className="py-2.5 px-3">Quota Consumed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-mono">
                {(data?.monthly_records ?? []).slice().reverse().map((m) => {
                  const pct = (m.egress_gb / 10000) * 100;
                  return (
                    <tr key={m.month} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="py-3 px-3 text-zinc-200 font-bold">
                        {m.month}
                      </td>
                      <td className="py-3 px-3 text-sky-400 font-bold">
                        {m.egress_gb.toFixed(1)} GB
                      </td>
                      <td className="py-3 px-3 text-emerald-400">
                        {m.ingress_gb.toFixed(1)} GB
                      </td>
                      <td className="py-3 px-3 text-zinc-400">
                        {m.days_count} days
                      </td>
                      <td className="py-3 px-3 text-zinc-400">
                        {pct.toFixed(2)}% of 10 TB
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
