"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Trash2, Table, KeyRound, AlertCircle, Loader2 } from "lucide-react";
import { ColumnSpec, createTableVisual } from "@/lib/agent-client";

interface VisualTableBuilderModalProps {
  isOpen: boolean;
  database: string;
  onClose: () => void;
  onCreated: (tableName: string) => void;
}

const SUPPORTED_TYPES = [
  { value: "uuid", label: "uuid (Unique identifier)" },
  { value: "text", label: "text (Unlimited length string)" },
  { value: "varchar", label: "varchar(255) (Short string)" },
  { value: "integer", label: "integer (32-bit signed int)" },
  { value: "bigint", label: "bigint (64-bit int / ID)" },
  { value: "boolean", label: "boolean (true / false)" },
  { value: "timestamptz", label: "timestamptz (Timestamp with time zone)" },
  { value: "timestamp", label: "timestamp (Timestamp without timezone)" },
  { value: "date", label: "date (Calendar date)" },
  { value: "jsonb", label: "jsonb (Structured JSON binary)" },
  { value: "numeric", label: "numeric (Exact decimals / currency)" },
  { value: "float8", label: "float8 (Double precision floating point)" },
  { value: "serial", label: "serial (Auto-incrementing integer)" },
];

export default function VisualTableBuilderModal({
  isOpen,
  database,
  onClose,
  onCreated,
}: VisualTableBuilderModalProps) {
  const [tableName, setTableName] = useState("");
  const [columns, setColumns] = useState<ColumnSpec[]>([
    { name: "id", type: "uuid", is_primary_key: true, is_nullable: false, default_value: "gen_random_uuid()" },
    { name: "created_at", type: "timestamptz", is_primary_key: false, is_nullable: false, default_value: "now()" },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddColumn = () => {
    setColumns([
      ...columns,
      { name: "", type: "text", is_primary_key: false, is_nullable: true, default_value: "" },
    ]);
  };

  const handleRemoveColumn = (index: number) => {
    if (columns.length <= 1) return;
    setColumns(columns.filter((_, i) => i !== index));
  };

  const handleColumnChange = (index: number, field: keyof ColumnSpec, val: any) => {
    const next = [...columns];
    next[index] = { ...next[index], [field]: val };

    // If setting as primary key, it must not be nullable
    if (field === "is_primary_key" && val === true) {
      next[index].is_nullable = false;
    }
    setColumns(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = tableName.trim().toLowerCase();
    if (!cleanName) {
      setError("Table name is required");
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(cleanName)) {
      setError("Table name must contain only letters, numbers, and underscores");
      return;
    }

    for (const c of columns) {
      if (!c.name.trim()) {
        setError("All columns must have a valid name");
        return;
      }
      if (!/^[a-zA-Z0-9_]+$/.test(c.name.trim())) {
        setError(`Column name '${c.name}' must contain only letters, numbers, and underscores`);
        return;
      }
    }

    setLoading(true);
    setError(null);

    const res = await createTableVisual(database, cleanName, columns);
    setLoading(false);

    if (res.success) {
      onCreated(cleanName);
      onClose();
    } else {
      setError(res.error || "Failed to create table");
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={loading ? undefined : onClose}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm cursor-pointer"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          className="relative w-full max-w-3xl rounded-2xl bg-[#111114] border border-zinc-800 p-6 shadow-2xl z-10 max-h-[90vh] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800 shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
                <Table className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Create New Table</h3>
                <p className="text-xs text-zinc-400">
                  Visual schema designer for <span className="text-emerald-400 font-mono">{database}</span>
                </p>
              </div>
            </div>
            {!loading && (
              <button
                onClick={onClose}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
            {error && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                TABLE NAME
              </label>
              <input
                type="text"
                required
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                placeholder="e.g. users, products, orders"
                className="w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3.5 py-2 text-white font-mono text-xs focus:border-emerald-400 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-zinc-300">
                  COLUMNS SPECIFICATION
                </label>
                <button
                  type="button"
                  onClick={handleAddColumn}
                  className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-emerald-400 text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  <span>Add Column</span>
                </button>
              </div>

              <div className="space-y-2">
                {columns.map((col, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80 flex flex-wrap sm:flex-nowrap items-center gap-2 text-xs"
                  >
                    {/* Column Name */}
                    <div className="w-full sm:w-1/3">
                      <span className="text-[10px] text-zinc-500 font-mono block sm:hidden">Name</span>
                      <input
                        type="text"
                        required
                        value={col.name}
                        onChange={(e) => handleColumnChange(idx, "name", e.target.value)}
                        placeholder="column_name"
                        className="w-full rounded-lg bg-zinc-900 border border-zinc-700/80 px-2.5 py-1.5 text-white font-mono text-xs focus:border-emerald-400 focus:outline-none"
                      />
                    </div>

                    {/* Type Selector */}
                    <div className="w-full sm:w-1/3">
                      <span className="text-[10px] text-zinc-500 font-mono block sm:hidden">Type</span>
                      <select
                        value={col.type}
                        onChange={(e) => handleColumnChange(idx, "type", e.target.value)}
                        className="w-full rounded-lg bg-zinc-900 border border-zinc-700/80 px-2 py-1.5 text-zinc-200 font-mono text-xs focus:border-emerald-400 focus:outline-none"
                      >
                        {SUPPORTED_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Default value */}
                    <div className="w-full sm:w-1/4">
                      <span className="text-[10px] text-zinc-500 font-mono block sm:hidden">Default</span>
                      <input
                        type="text"
                        value={col.default_value || ""}
                        onChange={(e) => handleColumnChange(idx, "default_value", e.target.value)}
                        placeholder="default (e.g. now())"
                        className="w-full rounded-lg bg-zinc-900 border border-zinc-700/80 px-2.5 py-1.5 text-zinc-300 font-mono text-xs focus:border-emerald-400 focus:outline-none"
                      />
                    </div>

                    {/* Toggles */}
                    <div className="flex items-center gap-3 shrink-0 pt-1 sm:pt-0">
                      <label className="flex items-center gap-1 cursor-pointer text-[11px] text-zinc-400 hover:text-white" title="Primary Key">
                        <input
                          type="checkbox"
                          checked={col.is_primary_key || false}
                          onChange={(e) => handleColumnChange(idx, "is_primary_key", e.target.checked)}
                          className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0"
                        />
                        <KeyRound className="h-3 w-3 text-amber-400" />
                        <span>PK</span>
                      </label>

                      <label className="flex items-center gap-1 cursor-pointer text-[11px] text-zinc-400 hover:text-white" title="Allow NULL">
                        <input
                          type="checkbox"
                          checked={col.is_nullable ?? true}
                          disabled={col.is_primary_key}
                          onChange={(e) => handleColumnChange(idx, "is_nullable", e.target.checked)}
                          className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0"
                        />
                        <span>Null</span>
                      </label>

                      <button
                        type="button"
                        onClick={() => handleRemoveColumn(idx)}
                        disabled={columns.length <= 1}
                        className="p-1 rounded text-zinc-500 hover:text-rose-400 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Remove column"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !tableName.trim()}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold text-black bg-white hover:bg-zinc-200 disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer shadow"
              >
                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>{loading ? "Creating..." : "Create Table"}</span>
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
