"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, FlaskConical, Database, AlertCircle, ShieldAlert, Loader2, ArrowRight, Zap } from "lucide-react";
import { cloneDatabaseApi, CreateDatabaseResponse, DatabaseSummary } from "@/lib/agent-client";

interface CloneTestModalProps {
  sourceDb: DatabaseSummary | null;
  isOpen: boolean;
  onClose: () => void;
  onCloned: (clonedData: CreateDatabaseResponse) => void;
}

export default function CloneTestModal({
  sourceDb,
  isOpen,
  onClose,
  onCloned,
}: CloneTestModalProps) {
  const [targetName, setTargetName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sourceDb) {
      // Auto-compute sensible target database name
      const src = sourceDb.name;
      let defaultTarget = "";
      if (src.startsWith("db_")) {
        const parts = src.split("_");
        if (parts.length >= 3) {
          const proj = parts.slice(1, parts.length - 1).join("_");
          defaultTarget = `db_${proj}_test`;
        } else {
          defaultTarget = `${src}_test`;
        }
      } else {
        defaultTarget = `db_${src}_test`;
      }
      setTargetName(defaultTarget);
      setError(null);
    }
  }, [sourceDb]);

  if (!isOpen || !sourceDb) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetName.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await cloneDatabaseApi({
        source_database: sourceDb.name,
        target_database: targetName.trim().toLowerCase(),
        environment: "test",
      });

      onCloned(res.data);
      onClose();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={loading ? undefined : onClose}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm"
        />

        {/* Modal card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.15 }}
          className="relative w-full max-w-lg rounded-2xl bg-[#111114] border border-purple-500/30 p-6 shadow-2xl z-10 overflow-hidden space-y-5"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
                <FlaskConical className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <span>Create Testing Clone</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300">
                    Ephemeral Test Sandbox
                  </span>
                </h3>
                <p className="text-xs text-zinc-400">
                  Instant clone of schema, tables & data from running database
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              disabled={loading}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 text-xs font-mono">
            {/* Visual Fork Preview */}
            <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-zinc-800/80 flex items-center justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <span className="text-[10px] uppercase text-zinc-500 font-sans font-semibold block">
                  SOURCE DATABASE
                </span>
                <div className="flex items-center gap-2">
                  <Database className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                  <span className="font-bold text-white truncate text-xs">{sourceDb.name}</span>
                </div>
                <span className="text-[10px] text-zinc-500 font-sans block">
                  {sourceDb.size_mb} MB • Owner: {sourceDb.owner}
                </span>
              </div>

              <div className="flex items-center justify-center p-2 rounded-lg bg-zinc-900 border border-zinc-800 shrink-0 text-purple-400">
                <ArrowRight className="h-4 w-4" />
              </div>

              <div className="space-y-1 min-w-0 text-right">
                <span className="text-[10px] uppercase text-purple-400 font-sans font-semibold block">
                  TARGET CLONE
                </span>
                <span className="font-bold text-purple-300 truncate text-xs block">
                  {targetName || "db_<project>_test"}
                </span>
                <span className="text-[10px] text-zinc-500 font-sans block">
                  Environment: <strong className="text-purple-400">test</strong>
                </span>
              </div>
            </div>

            {/* Target DB Name Input */}
            <div className="space-y-1.5">
              <label className="block text-zinc-300 font-semibold text-xs font-sans">
                TARGET CLONE DATABASE NAME
              </label>
              <input
                type="text"
                required
                value={targetName}
                onChange={(e) => setTargetName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                placeholder="e.g. db_school_erp_test"
                disabled={loading}
                className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3.5 py-2.5 text-xs text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-purple-500 transition-colors"
              />
              <span className="text-[10px] text-zinc-500 block font-sans">
                Only alphanumeric characters and underscores allowed.
              </span>
            </div>

            {/* Ephemeral Notice */}
            <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/25 text-purple-200 text-xs font-sans space-y-1 leading-relaxed">
              <div className="flex items-center gap-1.5 font-semibold text-purple-300">
                <Zap className="h-3.5 w-3.5 fill-current" />
                <span>Temporary Test Database</span>
              </div>
              <p className="text-[11px] text-purple-200/80">
                This clone is tagged as <strong>test</strong>. Automated backup schedules and delete locks are excluded by default so you can freely experiment, run schema migrations, and discard it with one click when finished.
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-sans flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-800 font-sans">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !targetName.trim()}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow-md shadow-purple-950/40"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Cloning Database...</span>
                  </>
                ) : (
                  <>
                    <FlaskConical className="h-3.5 w-3.5" />
                    <span>Clone Database Now</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
