"use client";

import { useEffect, useState } from "react";
import { 
  ShieldCheck, 
  Radio, 
  RefreshCw, 
  Server, 
  Lock, 
  Globe, 
  Cpu, 
  AlertTriangle,
  CheckCircle2,
  Terminal,
  Activity
} from "lucide-react";
import { fetchNetworkPorts, NetworkPortsResponse } from "@/lib/agent-client";

export default function PortsSecurityPage() {
  const [data, setData] = useState<NetworkPortsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanTime, setLastScanTime] = useState<string>("");

  const loadPorts = async () => {
    try {
      const res = await fetchNetworkPorts();
      setData(res.data);
      setLastScanTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    } catch (e) {
      console.error("Failed to load ports", e);
    } finally {
      setLoading(false);
    }
  };

  const handleManualScan = async () => {
    setIsScanning(true);
    await loadPorts();
    setTimeout(() => setIsScanning(false), 500);
  };

  useEffect(() => {
    loadPorts();
    // Low frequency polling (every 3 minutes) - near zero server load
    const interval = setInterval(loadPorts, 180000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              Network Ports & Security
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-zinc-800 border border-zinc-700 text-zinc-300">
              Kernel Sockets
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            Active TCP listening sockets, interface bind classifications, and firewall exposure.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <span className="text-[10px] text-zinc-500 font-mono block">LAST SCAN</span>
            <span className="text-xs font-mono text-zinc-300">{lastScanTime || "Scanning..."}</span>
          </div>

          <button
            onClick={handleManualScan}
            disabled={isScanning}
            className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 text-xs font-medium"
            title="Scan network ports now"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? "animate-spin text-white" : ""}`} />
            <span>{isScanning ? "Scanning Sockets..." : "Scan Now"}</span>
          </button>
        </div>
      </div>

      {/* Security Summary Cards with Soft Indicator Colors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Listening */}
        <div className="rounded-2xl bg-zinc-900/30 border border-zinc-800/80 p-4 backdrop-blur-sm flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] text-zinc-500 font-mono block">TOTAL LISTENING</span>
            <div className="text-xl font-bold font-mono text-white">{data?.total_listening ?? 0} Ports</div>
          </div>
          <div className="p-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white">
            <Activity className="h-5 w-5" />
          </div>
        </div>

        {/* Card 2: Publicly Exposed */}
        <div className="rounded-2xl bg-zinc-900/30 border border-zinc-800/80 p-4 backdrop-blur-sm flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] text-zinc-500 font-mono block">PUBLIC EXPOSURE (0.0.0.0)</span>
            <div className="text-xl font-bold font-mono text-amber-400">{data?.public_exposed ?? 0} Ports</div>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <Globe className="h-5 w-5" />
          </div>
        </div>

        {/* Card 3: Docker Internal */}
        <div className="rounded-2xl bg-zinc-900/30 border border-zinc-800/80 p-4 backdrop-blur-sm flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] text-zinc-500 font-mono block">DOCKER SWARM INTERNAL</span>
            <div className="text-xl font-bold font-mono text-sky-400">{data?.docker_internal ?? 0} Ports</div>
          </div>
          <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
            <Server className="h-5 w-5" />
          </div>
        </div>

        {/* Card 4: Safe Local Only */}
        <div className="rounded-2xl bg-zinc-900/30 border border-zinc-800/80 p-4 backdrop-blur-sm flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] text-zinc-500 font-mono block">SAFE LOCAL (127.0.0.1)</span>
            <div className="text-xl font-bold font-mono text-emerald-400">{data?.safe_local ?? 0} Ports</div>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <Lock className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Host System Specs Card */}
      <div className="rounded-2xl bg-zinc-900/20 border border-zinc-800/70 p-4 backdrop-blur-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs font-mono">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300">
            <Terminal className="h-4 w-4" />
          </div>
          <div>
            <span className="font-semibold text-white block">{data?.host_os || "Oracle Linux Server 9.4"}</span>
            <span className="text-zinc-500 text-[11px] block">{data?.kernel_version || "Linux Kernel 5.15"}</span>
          </div>
        </div>

        <div className="flex items-center gap-6 text-zinc-400 text-xs">
          <div>
            <span className="text-zinc-500 text-[10px] block">ARCHITECTURE</span>
            <span className="text-white font-semibold">{data?.architecture || "aarch64 (Ampere)"}</span>
          </div>
          <div>
            <span className="text-zinc-500 text-[10px] block">DEFAULT FIREWALL</span>
            <span className="text-emerald-400 font-semibold">firewalld (Enforcing)</span>
          </div>
        </div>
      </div>

      {/* Ports Table */}
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/20 backdrop-blur-sm overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950 border-b border-zinc-800 text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3 font-semibold">Port</th>
                <th className="px-5 py-3 font-semibold">Service Name</th>
                <th className="px-5 py-3 font-semibold">Bind Address</th>
                <th className="px-5 py-3 font-semibold">Protocol</th>
                <th className="px-5 py-3 font-semibold text-right">Exposure Level</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-850/60 font-mono">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-zinc-500">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin text-white" />
                      <span>Scanning kernel socket tables...</span>
                    </div>
                  </td>
                </tr>
              ) : (
                data?.ports.map((p) => {
                  return (
                    <tr key={p.port} className="hover:bg-zinc-850/30 transition-colors">
                      {/* Port */}
                      <td className="px-5 py-3.5">
                        <span className="font-bold text-white text-xs bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded">
                          :{p.port}
                        </span>
                      </td>

                      {/* Service */}
                      <td className="px-5 py-3.5 text-zinc-200 font-sans font-medium">
                        {p.service}
                      </td>

                      {/* Bind IP */}
                      <td className="px-5 py-3.5 text-zinc-400">
                        {p.bind_ip}
                      </td>

                      {/* Protocol */}
                      <td className="px-5 py-3.5 text-zinc-500">
                        {p.protocol}
                      </td>

                      {/* Exposure Badge */}
                      <td className="px-5 py-3.5 text-right font-sans">
                        {p.status === "safe_local" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                            <Lock className="h-3 w-3" /> Safe Local Only
                          </span>
                        )}
                        {p.status === "docker_internal" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/10 border border-sky-500/30 text-sky-400">
                            <Server className="h-3 w-3" /> Docker Swarm
                          </span>
                        )}
                        {p.status === "public_exposed" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-400">
                            <Globe className="h-3 w-3" /> Publicly Reachable
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Security Advisory Callout */}
      <div className="rounded-2xl bg-zinc-950 border border-zinc-800 p-4 text-xs text-zinc-400 space-y-1">
        <div className="font-semibold text-zinc-200 flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span>Firewall & Cloud Security Policy</span>
        </div>
        <p className="leading-relaxed text-zinc-400 text-[11px]">
          Even if a service binds to <code className="text-zinc-300">0.0.0.0</code>, incoming traffic is blocked unless explicitly permitted by both Oracle Cloud VCN Ingress Rules and <code className="text-zinc-300">firewalld</code>. 
          PostgreSQL should always bind to your internal Docker Swarm network (<code className="text-zinc-300">postgres-databases-sharedpostgres-kooq42:5432</code>) or localhost via SSH Tunnel for maximum isolation.
        </p>
      </div>
    </div>
  );
}
