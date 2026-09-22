"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Database, Check, AlertCircle, ShieldCheck, Loader2 } from "lucide-react";
import { createDatabaseApi, CreateDatabaseResponse } from "@/lib/agent-client";

interface CreateDbModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (dbData: CreateDatabaseResponse) => void;
}

export default function CreateDbModal({ isOpen, onClose, onCreated }: CreateDbModalProps) {
  const [projectName, setProjectName] = useState("");
  const [environment, setEnvironment] = useState<"prod" | "staging" | "dev">("prod");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const isValidName = /^[a-zA-Z0-9_]+$/.test(projectName.trim());
  const cleanProject = projectName.trim().toLowerCase();
  const previewDbName = cleanProject ? `db_${cleanProject}_${environment}` : `db_<project>_${environment}`;
  const previewUserName = cleanProject ? `usr_${cleanProject}` : `usr_<project>`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidName || !projectName.trim()) return;

    setError(null);
    setLoading(true);
    setStep(1);

    const stepInterval = setInterval(() => {
      setStep((prev) => (prev < 3 ? prev + 1 : prev));
    }, 500);

    try {
      const res = await createDatabaseApi({
        project_name: cleanProject,
        environment,
      });

      clearInterval(stepInterval);
      setStep(4);
      setTimeout(() => {
        setLoading(false);
        setStep(0);
        setProjectName("");
        onCreated(res.data);
      }, 400);
    } catch (err: unknown) {
      clearInterval(stepInterval);
      setLoading(false);
      setStep(0);
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg);
    }
  };

  const environments = [
    { id: "prod", label: "Production", activeClass: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
    { id: "staging", label: "Staging", activeClass: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
    { id: "dev", label: "Development", activeClass: "border-sky-500/40 bg-sky-500/10 text-sky-300" },
  ] as const;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={loading ? undefined : onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.15 }}
            className="relative w-full max-w-lg rounded-2xl bg-[#111114] border border-zinc-750 p-6 shadow-2xl z-10 overflow-hidden"
          >
            <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    Provision Database
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
                      Isolated
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400">PostgreSQL database with dedicated role credentials</p>
                </div>
              </div>
              {!loading && (
                <button
                  onClick={onClose}
                  className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            {loading ? (
              <div className="py-10 flex flex-col items-center justify-center text-center space-y-4">
                <div className="relative flex h-12 w-12 items-center justify-center">
                  <Loader2 className="h-7 w-7 text-white animate-spin" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-zinc-200">
                    {step === 1 && "Connecting to PostgreSQL Swarm..."}
                    {step === 2 && "Creating database & generating 32-char crypto key..."}
                    {step === 3 && "Setting ownership & compiling connection strings..."}
                    {step >= 4 && "Database Ready!"}
                  </h4>
                  <p className="text-xs text-zinc-500 font-mono">
                    Target: {previewDbName}
                  </p>
                </div>
                <div className="w-48 bg-zinc-800 rounded-full h-1 overflow-hidden">
                  <div
                    className="bg-emerald-400 h-full transition-all duration-300"
                    style={{ width: `${(step / 4) * 100}%` }}
                  />
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center justify-between">
                    <span>PROJECT IDENTIFIER</span>
                    {projectName && (
                      <span className={`text-[10px] font-mono flex items-center gap-1 ${
                        isValidName ? "text-emerald-400" : "text-amber-400"
                      }`}>
                        {isValidName ? (
                          <>
                            <Check className="h-3 w-3" /> Valid identifier
                          </>
                        ) : (
                          <>
                            <AlertCircle className="h-3 w-3" /> Alphanumeric + underscore
                          </>
                        )}
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    required
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="e.g. client_crm, analytics_store"
                    className="w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3.5 py-2.5 text-white font-mono text-xs focus:border-white focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    ENVIRONMENT
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {environments.map((env) => {
                      const isSelected = environment === env.id;
                      return (
                        <button
                          key={env.id}
                          type="button"
                          onClick={() => setEnvironment(env.id)}
                          className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all flex flex-col items-center gap-0.5 cursor-pointer ${
                            isSelected
                              ? env.activeClass + " shadow-sm font-semibold"
                              : "border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-white"
                          }`}
                        >
                          <span>{env.label}</span>
                          <span className="text-[10px] font-mono opacity-80">{env.id}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-3 space-y-2">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 flex items-center justify-between">
                    <span>Generated Schema Spec</span>
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div>
                      <span className="text-zinc-500 text-[10px]">DATABASE</span>
                      <div className="text-white truncate font-semibold">{previewDbName}</div>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[10px]">OWNER USER</span>
                      <div className="text-zinc-300 truncate font-semibold">{previewUserName}</div>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!isValidName || !projectName.trim()}
                    className="px-5 py-2.5 rounded-xl text-xs font-semibold text-black bg-white hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 cursor-pointer shadow"
                  >
                    <Database className="h-4 w-4" />
                    Provision Database
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
