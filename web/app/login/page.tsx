"use client";

import React, { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Shield, Key, AlertCircle, ArrowRight } from "lucide-react";

function GitHubIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  const [isGitHubLoading, setIsGitHubLoading] = useState(false);
  const [showKeyLogin, setShowKeyLogin] = useState(false);
  const [username, setUsername] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [keyError, setKeyError] = useState<string | null>(null);
  const [isKeyLoading, setIsKeyLoading] = useState(false);

  const handleGitHubSignIn = () => {
    setIsGitHubLoading(true);
    signIn("github", { callbackUrl });
  };

  const handleKeySignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !secretKey.trim()) {
      setKeyError("Please provide both username and master secret key.");
      return;
    }
    setIsKeyLoading(true);
    setKeyError(null);

    const res = await signIn("admin-key", {
      username: username.trim(),
      secretKey: secretKey.trim(),
      redirect: false,
      callbackUrl,
    });

    setIsKeyLoading(false);
    if (res?.error) {
      setKeyError("Invalid secret key. Check your AGENT_SECRET configuration.");
    } else if (res?.ok) {
      window.location.href = callbackUrl;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-8 backdrop-blur-xl shadow-2xl space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-zinc-800 border border-zinc-700 text-white mb-2 shadow-inner">
              <Shield className="h-6 w-6 text-zinc-200" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">ZeonCloud</h1>
            <p className="text-xs text-zinc-400">
              Oracle VPS Telemetry & PostgreSQL Cloud Management
            </p>
          </div>

          {/* Access Denied Warning */}
          {error === "AccessDenied" && (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
              <div>
                <span className="font-semibold block text-rose-200">Access Denied</span>
                Your GitHub account is not on the team whitelist. Please contact the administrator to grant access.
              </div>
            </div>
          )}

          {/* GitHub Sign In (Primary) */}
          <div className="space-y-3">
            <button
              onClick={handleGitHubSignIn}
              disabled={isGitHubLoading}
              className="w-full h-11 px-4 rounded-xl bg-white text-black font-semibold text-sm hover:bg-zinc-200 transition-all flex items-center justify-center gap-2.5 shadow-lg shadow-white/5 cursor-pointer disabled:opacity-50"
            >
              <GitHubIcon className="h-4 w-4" />
              <span>{isGitHubLoading ? "Redirecting to GitHub..." : "Continue with GitHub"}</span>
              {!isGitHubLoading && <ArrowRight className="h-3.5 w-3.5 ml-auto opacity-70" />}
            </button>

            <p className="text-[11px] text-center text-zinc-500">
              Secured with zero-database file whitelist (<code className="text-zinc-400 font-mono">whitelist.json</code>).
            </p>
          </div>

          {/* Divider */}
          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-800" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase font-mono tracking-wider">
              <button
                type="button"
                onClick={() => setShowKeyLogin(!showKeyLogin)}
                className="bg-zinc-900 px-2 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
              >
                {showKeyLogin ? "Hide Master Key Login" : "Or use Master Secret Key"}
              </button>
            </div>
          </div>

          {/* Emergency / Admin Secret Key Form */}
          {showKeyLogin && (
            <form onSubmit={handleKeySignIn} className="space-y-3.5 pt-1 text-xs">
              {keyError && (
                <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
                  {keyError}
                </div>
              )}

              <div>
                <label className="block text-zinc-400 font-medium mb-1">
                  Admin GitHub Handle
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. mindzed"
                  className="w-full h-9 rounded-lg bg-zinc-950 border border-zinc-800 px-3 text-white font-mono text-xs focus:border-zinc-500 focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-medium mb-1">
                  Master Secret Key (<code className="text-zinc-400 font-mono">AGENT_SECRET</code>)
                </label>
                <input
                  type="password"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  placeholder="Enter secret key from .env"
                  className="w-full h-9 rounded-lg bg-zinc-950 border border-zinc-800 px-3 text-white font-mono text-xs focus:border-zinc-500 focus:outline-none transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={isKeyLoading}
                className="w-full h-9 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-medium transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Key className="h-3.5 w-3.5" />
                <span>{isKeyLoading ? "Authenticating..." : "Authenticate with Key"}</span>
              </button>
            </form>
          )}

          {/* Footer info */}
          <div className="pt-2 text-center text-[11px] text-zinc-500 border-t border-zinc-850">
            <span>ZeonCloud Infrastructure Services • Oracle Linux Ampere</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-zinc-500 text-xs">Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}
