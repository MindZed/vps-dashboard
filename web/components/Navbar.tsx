"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { 
  Activity, 
  Database, 
  ShieldCheck, 
  Settings, 
  Radio, 
  CheckCircle2,
  X,
  Server,
  Terminal,
  Shield,
  Users,
  UserPlus,
  Trash2,
  Lock
} from "lucide-react";
import { 
  checkAgentHealth, 
  getAgentConfig, 
  generateSecretKey,
  fetchWhitelist,
  claimAdmin,
  addWhitelistUser,
  removeWhitelistUser,
  WhitelistResponse
} from "@/lib/agent-client";
import { useLiveVitals } from "@/lib/use-live-vitals";

export default function Navbar() {
  const pathname = usePathname();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [agentStatus, setAgentStatus] = useState<{
    ok: boolean;
    latencyMs: number;
    isMock: boolean;
  }>({ ok: true, latencyMs: 24, isMock: true });

  // Real-time live vitals hook (active across all pages, sleeps on background tab)
  const { cpuPct, ramPct } = useLiveVitals(4500);

  // Settings form state
  const [agentUrl, setAgentUrl] = useState("https://agent.mindzed.tech");
  const [agentSecret, setAgentSecret] = useState("mindzed-insecure-dev-secret-change-me");
  const [demoMode, setDemoMode] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Whitelist state
  const [whitelist, setWhitelist] = useState<WhitelistResponse | null>(null);
  const [newUsername, setNewUsername] = useState("");
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [whitelistMsg, setWhitelistMsg] = useState<string | null>(null);

  useEffect(() => {
    const config = getAgentConfig();
    setAgentUrl(config.baseUrl);
    setAgentSecret(config.secret);
    setDemoMode(config.forceDemo);

    const updateStatus = async () => {
      const res = await checkAgentHealth();
      setAgentStatus({
        ok: res.ok,
        latencyMs: res.latencyMs,
        isMock: res.isMock,
      });
    };

    updateStatus();
    const interval = setInterval(updateStatus, 8000);
    return () => clearInterval(interval);
  }, []);

  const loadWhitelist = async () => {
    try {
      const res = await fetchWhitelist();
      setWhitelist(res);
    } catch (e) {
      console.error("Failed to load whitelist", e);
    }
  };

  useEffect(() => {
    if (isSettingsOpen) {
      loadWhitelist();
    }
  }, [isSettingsOpen]);

  const handleSaveSettings = () => {
    localStorage.setItem("mindzed_agent_url", agentUrl.trim());
    localStorage.setItem("mindzed_agent_secret", agentSecret.trim());
    localStorage.setItem("mindzed_demo_mode", demoMode ? "true" : "false");
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      setIsSettingsOpen(false);
      window.location.reload();
    }, 800);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${agentUrl.trim()}/health`, {
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        setTestResult(`Online: Agent v${data.version || "1.0.0"} • Postgres: ${data.postgres || "connected"}`);
      } else {
        setTestResult(`HTTP ${res.status}: Agent returned error`);
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      setTestResult(`Connection failed: ${errMsg}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleClaimAdminRole = async (username: string) => {
    if (!username.trim()) return;
    const res = await claimAdmin(username.trim());
    if (res.success) {
      setWhitelistMsg(`Claimed @${username} as Primary Admin!`);
      loadWhitelist();
    } else {
      setWhitelistMsg(res.error || "Claim failed");
    }
  };

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) return;
    setIsAddingUser(true);
    const res = await addWhitelistUser(newUsername.trim(), "member");
    setIsAddingUser(false);
    if (res.success) {
      setNewUsername("");
      setWhitelistMsg(`Added @${newUsername.trim()} to whitelist`);
      loadWhitelist();
    } else {
      setWhitelistMsg(res.error || "Failed to add user");
    }
  };

  const handleRemoveUser = async (username: string) => {
    const res = await removeWhitelistUser(username);
    if (res.success) {
      setWhitelistMsg(`Removed @${username}`);
      loadWhitelist();
    } else {
      setWhitelistMsg(res.error || "Failed to remove user");
    }
  };

  const navItems = [
    { label: "Overview", href: "/", icon: Activity },
    { label: "Databases", href: "/databases", icon: Database, badge: "Neon", badgeColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" },
    { label: "Ports", href: "/ports", icon: Shield, badge: "Security", badgeColor: "bg-amber-500/10 text-amber-400 border-amber-500/25" },
    { label: "Watchdog", href: "/status", icon: ShieldCheck, badge: "Kuma", badgeColor: "bg-sky-500/10 text-sky-400 border-sky-500/25" },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-zinc-800/80 bg-[#09090b]/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo & Brand */}
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 border border-zinc-700/80 text-white group-hover:border-zinc-500 transition-colors">
                <Terminal className="h-4 w-4 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-xs tracking-wider text-white flex items-center gap-1.5 font-mono">
                  MINDZED <span className="text-[10px] text-zinc-400 font-semibold px-1 py-0.2 rounded bg-zinc-800 border border-zinc-700">HUB</span>
                </span>
                <span className="text-[9px] text-zinc-500 tracking-wider">ORACLE VPS & DB</span>
              </div>
            </Link>

            {/* Navigation tabs */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isActive
                        ? "text-white bg-zinc-800 border border-zinc-700 shadow-sm"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850"
                    }`}
                  >
                    <Icon className={`h-3.5 w-3.5 ${isActive ? "text-white" : "text-zinc-400"}`} />
                    <span>{item.label}</span>
                    {item.badge && (
                      <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono uppercase font-semibold border ${item.badgeColor}`}>
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Action Tools: Persistent CPU/RAM Mini Pill + Agent Status */}
          <div className="flex items-center gap-2.5">
            {/* Global Live CPU & RAM Telemetry Pill (Active on every page!) */}
            <div className="hidden sm:flex items-center gap-3 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 font-mono text-[11px] text-zinc-300">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-zinc-500 font-semibold">CPU</span>
                <span className="font-bold text-white">{cpuPct}%</span>
                <div className="w-10 bg-zinc-800 rounded-full h-1 overflow-hidden">
                  <div
                    className="bg-emerald-400 h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, cpuPct)}%` }}
                  />
                </div>
              </div>
              <span className="text-zinc-700">•</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-zinc-500 font-semibold">RAM</span>
                <span className="font-bold text-white">{ramPct}%</span>
                <div className="w-10 bg-zinc-800 rounded-full h-1 overflow-hidden">
                  <div
                    className="bg-sky-400 h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, ramPct)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Live Agent Status Pill */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-all text-zinc-300 cursor-pointer"
              title="Click to configure VPS Agent connection"
            >
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  agentStatus.isMock ? "bg-amber-400" : "bg-emerald-400"
                }`} />
                <span className={`relative inline-flex rounded-full h-2 w-2 ${
                  agentStatus.isMock ? "bg-amber-400" : "bg-emerald-400"
                }`} />
              </span>
              <span className="font-mono text-[11px] text-zinc-300">
                {agentStatus.isMock ? "Simulated" : `VPS ${agentStatus.latencyMs}ms`}
              </span>
            </button>

            {/* Config Settings Trigger */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors border border-transparent hover:border-zinc-700"
              aria-label="Agent Configuration"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Mobile Navigation bar */}
        <div className="flex md:hidden border-t border-zinc-850 px-4 py-2 justify-around bg-zinc-950/80">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium ${
                  isActive ? "text-white bg-zinc-800 border border-zinc-700" : "text-zinc-400"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </header>

      {/* Settings Modal Drawer (with Whitelist & Team Management) */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-[#111114] border border-zinc-800 p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white">
                  <Server className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Hub Configuration & Access</h3>
                  <p className="text-xs text-zinc-400">Oracle VPS endpoint and GitHub team access</p>
                </div>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Section 1: Endpoint & Secret Key */}
            <div className="space-y-3.5 text-xs">
              <h4 className="text-[10px] font-mono uppercase text-zinc-400 tracking-wider">
                1. VPS Agent Endpoint & Key
              </h4>

              <div>
                <label className="block font-medium text-zinc-300 mb-1">
                  Go Agent HTTPS URL
                </label>
                <input
                  type="text"
                  value={agentUrl}
                  onChange={(e) => setAgentUrl(e.target.value)}
                  placeholder="https://agent.mindzed.tech"
                  className="w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-white font-mono focus:border-white focus:outline-none transition-colors"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-medium text-zinc-300">
                    Agent Secret Key (<span className="font-mono text-zinc-400">X-Agent-Secret</span>)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const newKey = generateSecretKey();
                      setAgentSecret(newKey);
                      navigator.clipboard.writeText(newKey);
                      alert("Generated new 48-char secure key and copied to clipboard!");
                    }}
                    className="text-[11px] font-mono text-emerald-400 hover:text-emerald-300 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    + Generate New Key
                  </button>
                </div>
                <input
                  type="text"
                  value={agentSecret}
                  onChange={(e) => setAgentSecret(e.target.value)}
                  placeholder="Paste or generate a 32+ char key"
                  className="w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-white font-mono text-xs focus:border-white focus:outline-none transition-colors"
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  Pass this exact key to Dokploy or VPS: <code className="text-zinc-400 font-mono">AGENT_SECRET=...</code>
                </p>
              </div>

              {/* Force Demo Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                <div>
                  <div className="font-medium text-zinc-200">Simulated Demo Mode</div>
                  <div className="text-[11px] text-zinc-400">Run with synthetic telemetry without live VPS.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setDemoMode(!demoMode)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    demoMode ? "bg-white" : "bg-zinc-700"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-zinc-950 shadow ring-0 transition duration-200 ease-in-out ${
                      demoMode ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {testResult && (
                <div className={`p-3 rounded-xl border text-xs font-mono break-all ${
                  testResult.startsWith("Online") 
                    ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-300"
                    : "bg-rose-950/30 border-rose-500/30 text-rose-300"
                }`}>
                  {testResult}
                </div>
              )}
            </div>

            {/* Section 2: GitHub Whitelist & Team Management (First-User Admin) */}
            <div className="space-y-3 pt-3 border-t border-zinc-800 text-xs">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-mono uppercase text-zinc-400 tracking-wider flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-zinc-400" />
                  <span>2. GitHub Whitelist & Team Access</span>
                </h4>
                {whitelist?.admin ? (
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                    Admin: @{whitelist.admin}
                  </span>
                ) : (
                  <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                    No Admin Claimed Yet
                  </span>
                )}
              </div>

              {!whitelist?.has_admin ? (
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
                  <p className="text-zinc-300 text-xs">
                    The first account to claim will become the primary <strong>Admin</strong>.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Your GitHub username (e.g. Seven)"
                      id="claim_username_input"
                      className="flex-1 rounded-xl bg-zinc-900 border border-zinc-700 px-3 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-white"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const input = document.getElementById("claim_username_input") as HTMLInputElement;
                        if (input && input.value) handleClaimAdminRole(input.value);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-white text-black font-semibold text-xs hover:bg-zinc-200 transition-colors"
                    >
                      Claim Admin
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {/* Add Friend Input */}
                  <form onSubmit={handleAddFriend} className="flex gap-2">
                    <input
                      type="text"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      placeholder="Friend's GitHub handle (e.g. octocat)"
                      className="flex-1 rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-white"
                    />
                    <button
                      type="submit"
                      disabled={isAddingUser || !newUsername.trim()}
                      className="px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-xs border border-zinc-700 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      <span>Invite</span>
                    </button>
                  </form>

                  {/* Whitelist Members List */}
                  <div className="rounded-xl bg-zinc-950 border border-zinc-800 divide-y divide-zinc-850/60 max-h-36 overflow-y-auto">
                    {whitelist.users.map((u) => (
                      <div key={u.username} className="px-3 py-2 flex items-center justify-between text-xs font-mono">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-semibold">@{u.username}</span>
                          <span className={`text-[9px] px-1.5 py-0.2 rounded uppercase ${
                            u.role === "admin"
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                              : "bg-zinc-800 text-zinc-400"
                          }`}>
                            {u.role}
                          </span>
                        </div>
                        {u.role !== "admin" && (
                          <button
                            type="button"
                            onClick={() => handleRemoveUser(u.username)}
                            className="text-zinc-500 hover:text-rose-400 p-1"
                            title="Remove from whitelist"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {whitelistMsg && (
                <div className="text-[11px] font-mono text-zinc-400">
                  {whitelistMsg}
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting}
                className="px-3 py-2 rounded-xl text-xs font-medium text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-750 transition-colors flex items-center gap-1.5"
              >
                <Radio className={`h-3.5 w-3.5 ${isTesting ? "animate-spin text-white" : ""}`} />
                {isTesting ? "Testing..." : "Test Endpoint"}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-black bg-white hover:bg-zinc-200 shadow transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  {saveSuccess ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Saved!
                    </>
                  ) : (
                    "Save & Apply"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
