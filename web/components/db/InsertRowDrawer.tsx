"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Sparkles, AlertCircle, Loader2, Database, Check } from "lucide-react";
import { ExplorerColumn, insertTableRow } from "@/lib/agent-client";

interface InsertRowDrawerProps {
  isOpen: boolean;
  database: string;
  table: string;
  columns: ExplorerColumn[];
  onClose: () => void;
  onInserted: (row: Record<string, any>) => void;
}

export default function InsertRowDrawer({
  isOpen,
  database,
  table,
  columns,
  onClose,
  onInserted,
}: InsertRowDrawerProps) {
  // Store values as string or boolean or null
  const [values, setValues] = useState<Record<string, any>>({});
  const [nullFlags, setNullFlags] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleValueChange = (colName: string, val: any) => {
    setValues((prev) => ({ ...prev, [colName]: val }));
    if (nullFlags[colName]) {
      setNullFlags((prev) => ({ ...prev, [colName]: false }));
    }
  };

  const toggleNull = (colName: string) => {
    const next = !nullFlags[colName];
    setNullFlags((prev) => ({ ...prev, [colName]: next }));
    if (next) {
      setValues((prev) => ({ ...prev, [colName]: null }));
    }
  };

  const handleGenerateUUID = (colName: string) => {
    const uuid = crypto.randomUUID();
    handleValueChange(colName, uuid);
  };

  const handleSetNow = (colName: string) => {
    handleValueChange(colName, new Date().toISOString());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const payload: Record<string, any> = {};

    for (const col of columns) {
      // If user checked NULL
      if (nullFlags[col.name]) {
        payload[col.name] = null;
        continue;
      }

      const val = values[col.name];

      // If omitted or empty string and column has default or is PK auto-generated, let Postgres handle default
      if (val === undefined || val === "") {
        if (col.default_value || col.is_primary_key) {
          continue; // don't send to let Postgres use DEFAULT
        }
        if (col.is_nullable) {
          payload[col.name] = null;
          continue;
        }
      }

      // Type conversions
      const udt = col.udt_name.toLowerCase();
      if (udt === "bool") {
        payload[col.name] = val === true || val === "true";
      } else if (["int2", "int4", "int8", "serial", "bigserial"].includes(udt)) {
        if (val !== undefined && val !== "") {
          const parsed = parseInt(val, 10);
          if (isNaN(parsed)) {
            setError(`Column '${col.name}' must be a valid integer.`);
            setLoading(false);
            return;
          }
          payload[col.name] = parsed;
        }
      } else if (["numeric", "float4", "float8"].includes(udt)) {
        if (val !== undefined && val !== "") {
          const parsed = parseFloat(val);
          if (isNaN(parsed)) {
            setError(`Column '${col.name}' must be a valid decimal number.`);
            setLoading(false);
            return;
          }
          payload[col.name] = parsed;
        }
      } else if (["json", "jsonb"].includes(udt)) {
        if (typeof val === "string" && val.trim() !== "") {
          try {
            payload[col.name] = JSON.parse(val);
          } catch (jsonErr: any) {
            setError(`Column '${col.name}' has invalid JSON: ${jsonErr.message}`);
            setLoading(false);
            return;
          }
        }
      } else {
        payload[col.name] = val;
      }
    }

    try {
      const res = await insertTableRow(database, table, payload);
      if (!res.success) {
        setError(res.error || "Failed to insert record");
        setLoading(false);
        return;
      }

      setLoading(false);
      onInserted(res.record || payload);
      onClose();
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred");
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-hidden">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        />

        {/* Slide-over panel */}
        <div className="fixed inset-y-0 right-0 flex max-w-full pl-10 pointer-events-none">
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="w-screen max-w-xl pointer-events-auto bg-[#0F172A] border-l border-white/10 shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between bg-[#131F37]/50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white flex items-center gap-2">
                    Insert Row into <span className="font-mono text-emerald-400">{table}</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Target Database: <span className="font-mono text-slate-300">{database}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error Banner */}
            {error && (
              <div className="mx-6 mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-start gap-2.5 text-rose-400 text-xs">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span className="flex-1">{error}</span>
              </div>
            )}

            {/* Form Fields */}
            <form id="insert-row-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {columns.map((col) => {
                const udt = col.udt_name.toLowerCase();
                const isPk = col.is_primary_key;
                const isNull = !!nullFlags[col.name];
                const rawVal = values[col.name];

                return (
                  <div
                    key={col.name}
                    className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-semibold text-slate-200 font-mono">
                          {col.name}
                        </label>
                        <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-slate-800 text-slate-400 border border-slate-700/50">
                          {col.udt_name}
                        </span>
                        {isPk && (
                          <span className="px-1.5 py-0.2 text-[9px] font-semibold uppercase tracking-wider rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            PK
                          </span>
                        )}
                        {!col.is_nullable && !isPk && (
                          <span className="text-[10px] text-rose-400 font-medium">*required</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {udt === "uuid" && (
                          <button
                            type="button"
                            onClick={() => handleGenerateUUID(col.name)}
                            className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20"
                          >
                            <Sparkles className="w-3 h-3" /> Gen UUID
                          </button>
                        )}
                        {(udt === "timestamptz" || udt === "timestamp") && (
                          <button
                            type="button"
                            onClick={() => handleSetNow(col.name)}
                            className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20"
                          >
                            Now()
                          </button>
                        )}
                        {col.is_nullable && (
                          <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-400 hover:text-slate-300">
                            <input
                              type="checkbox"
                              checked={isNull}
                              onChange={() => toggleNull(col.name)}
                              className="rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-0 w-3.5 h-3.5"
                            />
                            <span>Set NULL</span>
                          </label>
                        )}
                      </div>
                    </div>

                    {/* Column Input */}
                    {isNull ? (
                      <div className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/5 text-slate-500 text-xs italic">
                        NULL (Value will be inserted as SQL NULL)
                      </div>
                    ) : udt === "bool" ? (
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleValueChange(col.name, true)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                            rawVal === true || rawVal === "true"
                              ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                              : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
                          }`}
                        >
                          TRUE
                        </button>
                        <button
                          type="button"
                          onClick={() => handleValueChange(col.name, false)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                            rawVal === false || rawVal === "false"
                              ? "bg-rose-500/20 border-rose-500/40 text-rose-300"
                              : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
                          }`}
                        >
                          FALSE
                        </button>
                        {col.default_value && (
                          <span className="text-[11px] text-slate-500">
                            (default: <code className="font-mono text-slate-400">{col.default_value}</code>)
                          </span>
                        )}
                      </div>
                    ) : ["json", "jsonb"].includes(udt) ? (
                      <div>
                        <textarea
                          rows={3}
                          value={rawVal || ""}
                          onChange={(e) => handleValueChange(col.name, e.target.value)}
                          placeholder='{"key": "value"}'
                          className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-y"
                        />
                      </div>
                    ) : (
                      <div>
                        <input
                          type={["int2", "int4", "int8", "numeric", "float4", "float8"].includes(udt) ? "number" : "text"}
                          step={["numeric", "float4", "float8"].includes(udt) ? "any" : "1"}
                          value={rawVal ?? ""}
                          onChange={(e) => handleValueChange(col.name, e.target.value)}
                          placeholder={
                            col.default_value
                              ? `Default: ${col.default_value}`
                              : isPk
                              ? "Auto-generated ID (or enter custom)"
                              : `Enter ${col.udt_name}...`
                          }
                          className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </form>

            {/* Footer Actions */}
            <div className="px-6 py-4 border-t border-white/10 bg-[#131F37]/50 flex items-center justify-between">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>

              <button
                type="submit"
                form="insert-row-form"
                disabled={loading}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Inserting...
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" /> Save Record
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
}
