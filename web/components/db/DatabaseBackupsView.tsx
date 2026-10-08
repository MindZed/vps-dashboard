"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Archive,
  Clock,
  RotateCcw,
  Download,
  Trash2,
  Plus,
  Check,
  AlertTriangle,
  RefreshCw,
  ShieldAlert,
  Calendar,
  Layers,
  Sparkles,
  Info,
  CheckCircle2,
  XCircle,
  X,
  FileCode2,
} from "lucide-react";
import {
  BackupItem,
  BackupScheduleConfig,
  fetchBackups,
  createBackup,
  restoreBackup,
  deleteBackup,
  getBackupSchedule,
  saveBackupSchedule,
  getBackupDownloadUrl,
  parseBackupFilename,
} from "@/lib/agent-client";
import { explainCronExpression, CRON_PRESETS } from "@/lib/cron-explainer";

interface DatabaseBackupsViewProps {
  dbName: string;
}

export default function DatabaseBackupsView({ dbName }: DatabaseBackupsViewProps) {
  // Backups state
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "manual" | "auto">("all");

  // Schedule state
  const [schedule, setSchedule] = useState<BackupScheduleConfig>({
    database: dbName,
    enabled: false,
    cron_expr: "0 2 * * *",
    sliding_window: 5,
  });
  const [loadingSchedule, setLoadingSchedule] = useState(true);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleSuccess, setScheduleSuccess] = useState(false);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [customBackupName, setCustomBackupName] = useState("");
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);

  const [backupToRestore, setBackupToRestore] = useState<BackupItem | null>(null);
  const [confirmDbInput, setConfirmDbInput] = useState("");
  const [isRestoring, setIsRestoring] = useState(false);

  const [backupToDelete, setBackupToDelete] = useState<BackupItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Notifications
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // Load backups and schedule
  const loadData = async () => {
    setLoading(true);
    try {
      const [backupsRes, schedRes] = await Promise.all([
        fetchBackups(dbName),
        getBackupSchedule(dbName),
      ]);
      if (backupsRes.success) {
        setBackups(backupsRes.backups);
      }
      if (schedRes.success && schedRes.schedule) {
        setSchedule(schedRes.schedule);
      }
    } catch (e) {
      console.error("Failed to load backups data", e);
    } finally {
      setLoading(false);
      setLoadingSchedule(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [dbName]);

  // Live crontab interpretation
  const cronExplanation = useMemo(() => {
    return explainCronExpression(schedule.cron_expr);
  }, [schedule.cron_expr]);

  // Filtered backups
  const filteredBackups = useMemo(() => {
    return backups.filter((b) => {
      const parsed = parseBackupFilename(b.filename, b.created_at);
      const matchesSearch =
        parsed.label.toLowerCase().includes(search.toLowerCase()) ||
        b.filename.toLowerCase().includes(search.toLowerCase());
      const matchesType = typeFilter === "all" || b.type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [backups, search, typeFilter]);

  // Format bytes
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Handle Create Backup
  const handleCreateBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customBackupName.trim();
    if (!clean) {
      showToast("Please provide a name for this backup", "error");
      return;
    }

    setIsCreatingBackup(true);
    try {
      const res = await createBackup(dbName, clean);
      if (res.success) {
        showToast(res.message || "Backup created successfully!");
        setIsCreateModalOpen(false);
        setCustomBackupName("");
        await loadData();
      } else {
        showToast(res.message || "Failed to create backup", "error");
      }
    } catch {
      showToast("Network error while creating backup", "error");
    } finally {
      setIsCreatingBackup(false);
    }
  };

  // Handle Save Schedule
  const handleSaveSchedule = async () => {
    if (!cronExplanation.isValid) {
      showToast("Please fix the crontab expression before saving", "error");
      return;
    }

    setSavingSchedule(true);
    try {
      const res = await saveBackupSchedule(schedule);
      if (res.success) {
        setScheduleSuccess(true);
        setTimeout(() => setScheduleSuccess(false), 3000);
        showToast("Auto-backup schedule updated successfully!");
        if (res.schedule) {
          setSchedule(res.schedule);
        }
      } else {
        showToast(res.message || "Failed to save schedule", "error");
      }
    } catch {
      showToast("Network error while saving schedule", "error");
    } finally {
      setSavingSchedule(false);
    }
  };

  // Handle Restore
  const handleConfirmRestore = async () => {
    if (!backupToRestore) return;
    if (confirmDbInput !== dbName) {
      showToast(`Please type '${dbName}' to confirm restoration`, "error");
      return;
    }

    setIsRestoring(true);
    try {
      const res = await restoreBackup(dbName, backupToRestore.filename);
      if (res.success) {
        showToast(`Database '${dbName}' restored successfully!`);
        setBackupToRestore(null);
        setConfirmDbInput("");
        await loadData();
      } else {
        showToast(res.message || "Restoration failed", "error");
      }
    } catch {
      showToast("Error executing restore", "error");
    } finally {
      setIsRestoring(false);
    }
  };

  // Handle Delete
  const handleConfirmDelete = async () => {
    if (!backupToDelete) return;

    setIsDeleting(true);
    try {
      const res = await deleteBackup(backupToDelete.filename);
      if (res.success) {
        showToast("Backup snapshot deleted successfully");
        setBackupToDelete(null);
        await loadData();
      } else {
        showToast(res.message || "Failed to delete backup", "error");
      }
    } catch {
      showToast("Error deleting backup", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border ${
              toast.type === "success"
                ? "bg-zinc-900 border-emerald-500/40 text-emerald-300"
                : "bg-zinc-900 border-rose-500/40 text-rose-300"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <span className="text-sm font-medium">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Banner / Actions */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <Archive className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-semibold text-zinc-100">
              Backups & Disaster Recovery
            </h2>
          </div>
          <p className="text-xs text-zinc-400 max-w-xl">
            Point-in-time PostgreSQL 18 snapshots with zero downtime. Create on-demand checkpoints or schedule automated cron backups with sliding window retention.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2.5 rounded-xl bg-zinc-800/70 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700/50 transition-colors"
            title="Refresh backups list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => {
              setCustomBackupName("");
              setIsCreateModalOpen(true);
            }}
            className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium text-sm shadow-lg shadow-purple-900/20 border border-purple-400/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            <span>Take Backup Now</span>
          </button>
        </div>
      </div>

      {/* Automated Backup Scheduler Card */}
      <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 space-y-5">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pb-4 border-b border-zinc-800/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-zinc-200">
                  Automated Backup Scheduler
                </h3>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-mono uppercase tracking-wider border ${
                    schedule.enabled
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "bg-zinc-800 border-zinc-700 text-zinc-400"
                  }`}
                >
                  {schedule.enabled ? "Active" : "Disabled"}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Automatically back up <span className="text-zinc-300 font-mono">{dbName}</span> via background crontab daemon.
              </p>
            </div>
          </div>

          {/* Toggle Switch */}
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={schedule.enabled}
              onChange={(e) => setSchedule({ ...schedule, enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
            <span className="ml-3 text-xs font-medium text-zinc-300">
              {schedule.enabled ? "Enabled" : "Disabled"}
            </span>
          </label>
        </div>

        {/* Schedule Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Crontab Expression & Presets */}
          <div className="lg:col-span-7 space-y-3">
            <label className="block text-xs font-medium text-zinc-300">
              Crontab Expression (5 Fields: min hour dom mon dow)
            </label>

            <div className="relative">
              <input
                type="text"
                value={schedule.cron_expr}
                onChange={(e) => setSchedule({ ...schedule, cron_expr: e.target.value })}
                placeholder="0 2 * * *"
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950/70 border border-zinc-800 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 text-sm font-mono text-zinc-100 placeholder:text-zinc-600 outline-none transition-all"
              />
            </div>

            {/* Live Literal Meaning Badge */}
            <div
              className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                cronExplanation.isValid
                  ? "bg-purple-500/5 border-purple-500/20 text-purple-200"
                  : "bg-rose-500/5 border-rose-500/20 text-rose-300"
              }`}
            >
              {cronExplanation.isValid ? (
                <Sparkles className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div>
                <span className="font-semibold block text-zinc-200 mb-0.5">
                  Literal Schedule Meaning:
                </span>
                <span className="leading-relaxed">{cronExplanation.explanation}</span>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] font-medium text-zinc-400">
                Quick Presets:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {CRON_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setSchedule({ ...schedule, cron_expr: preset.value })}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-all border ${
                      schedule.cron_expr === preset.value
                        ? "bg-purple-600/20 border-purple-500/40 text-purple-300 font-semibold"
                        : "bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Sliding Window Width (Max 5) */}
          <div className="lg:col-span-5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-zinc-400" />
                Sliding Window Retention (Max 5)
              </label>
              <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                {schedule.sliding_window} Backups
              </span>
            </div>

            {/* 1 to 5 Pill Selectors */}
            <div className="grid grid-cols-5 gap-1.5">
              {[1, 2, 3, 4, 5].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setSchedule({ ...schedule, sliding_window: num })}
                  className={`py-2 rounded-xl text-center text-xs font-mono font-semibold transition-all border ${
                    schedule.sliding_window === num
                      ? "bg-purple-600 text-white border-purple-500 shadow-lg shadow-purple-900/30"
                      : "bg-zinc-950/70 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>

            <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/60 text-[11px] text-zinc-400 space-y-1.5">
              <div className="flex items-center gap-1.5 text-zinc-300 font-medium">
                <Info className="w-3.5 h-3.5 text-purple-400" />
                <span>FIFO Sliding Window Rule</span>
              </div>
              <p className="leading-relaxed">
                When auto-backup completes, if automated snapshots exceed{" "}
                <strong className="text-zinc-200 font-mono">{schedule.sliding_window}</strong>, the oldest automated snapshot is automatically pruned from disk.
              </p>
              <p className="text-emerald-400/90 font-medium">
                ✓ Manual on-demand snapshots are permanent and NEVER deleted.
              </p>
            </div>

            {/* Next run & Status */}
            {schedule.next_run && schedule.enabled && (
              <div className="flex items-center gap-2 text-xs text-zinc-400 pt-1">
                <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                <span>Next scheduled run:</span>
                <span className="text-zinc-200 font-mono font-medium">
                  {new Date(schedule.next_run).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Save Schedule Action */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800/60">
          <button
            onClick={handleSaveSchedule}
            disabled={savingSchedule || !cronExplanation.isValid}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium border border-zinc-700/60 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savingSchedule ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-400" />
            ) : scheduleSuccess ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
            )}
            <span>{scheduleSuccess ? "Saved Successfully!" : "Save Schedule"}</span>
          </button>
        </div>
      </div>

      {/* Snapshots History Table */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-200">
              Snapshot History ({filteredBackups.length})
            </h3>
            <span className="text-xs text-zinc-500 font-mono">
              Total Storage: {formatBytes(backups.reduce((acc, b) => acc + b.size_bytes, 0))}
            </span>
          </div>

          {/* Filter Pills & Search */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="flex p-0.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs">
              {(["all", "manual", "auto"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-2.5 py-1 rounded-md capitalize font-medium transition-all ${
                    typeFilter === t
                      ? "bg-zinc-800 text-zinc-100 shadow"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search snapshots..."
              className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-700 w-36 sm:w-48"
            />
          </div>
        </div>

        {/* Table Container */}
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 overflow-hidden backdrop-blur-sm">
          {loading ? (
            <div className="p-12 text-center text-zinc-500 space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-purple-400" />
              <p className="text-xs">Loading snapshots for {dbName}...</p>
            </div>
          ) : filteredBackups.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-10 h-10 rounded-full bg-zinc-800/50 border border-zinc-700/50 flex items-center justify-center mx-auto text-zinc-400">
                <Archive className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-300">No backup snapshots found</p>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                  Click &ldquo;Take Backup Now&rdquo; to create your first on-demand checkpoint or enable the automated scheduler above.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800/80 bg-zinc-950/40 text-zinc-400 font-medium">
                    <th className="py-3 px-4">Snapshot Label</th>
                    <th className="py-3 px-4">Creation Date</th>
                    <th className="py-3 px-4">Creation Time</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Size</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {filteredBackups.map((item) => {
                    // Use parser to separate given name, date, time
                    const parsed = parseBackupFilename(item.filename, item.created_at);

                    return (
                      <tr
                        key={item.filename}
                        className="hover:bg-zinc-800/20 transition-colors group"
                      >
                        {/* Parsed Custom Label */}
                        <td className="py-3.5 px-4">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-zinc-100 text-sm">
                                {parsed.label}
                              </span>
                            </div>
                            <span className="text-[11px] font-mono text-zinc-500 block truncate max-w-xs" title={item.filename}>
                              {item.filename}
                            </span>
                          </div>
                        </td>

                        {/* Parsed Date */}
                        <td className="py-3.5 px-4 text-zinc-300">
                          <div className="flex items-center gap-1.5 font-medium">
                            <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                            <span>{parsed.displayDate}</span>
                          </div>
                        </td>

                        {/* Parsed Time */}
                        <td className="py-3.5 px-4 text-zinc-400">
                          <div className="space-y-0.5">
                            <div className="font-mono text-zinc-300">{parsed.displayTime}</div>
                            <div className="text-[10px] text-zinc-500">{parsed.relativeTime}</div>
                          </div>
                        </td>

                        {/* Type Badge */}
                        <td className="py-3.5 px-4">
                          {parsed.type === "auto" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                              <Clock className="w-3 h-3" />
                              Auto
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-purple-500/10 border border-purple-500/30 text-purple-400">
                              <FileCode2 className="w-3 h-3" />
                              Manual
                            </span>
                          )}
                        </td>

                        {/* Size */}
                        <td className="py-3.5 px-4 font-mono text-zinc-300">
                          {formatBytes(item.size_bytes)}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Restore Button */}
                            <button
                              onClick={() => {
                                setBackupToRestore(item);
                                setConfirmDbInput("");
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 hover:text-purple-200 border border-purple-500/30 font-medium text-xs flex items-center gap-1.5 transition-colors"
                              title="Restore this snapshot into database"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Restore</span>
                            </button>

                            {/* Download Button */}
                            <a
                              href={getBackupDownloadUrl(item.filename)}
                              download={item.filename}
                              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700/60 transition-colors"
                              title="Download .dump to local computer"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>

                            {/* Delete Button */}
                            <button
                              onClick={() => setBackupToDelete(item)}
                              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-rose-950/40 text-zinc-400 hover:text-rose-400 border border-zinc-700/60 hover:border-rose-800/40 transition-colors"
                              title="Delete snapshot"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* MODAL 1: Create Backup Modal (Asks for backup name) */}
      {/* ------------------------------------------------------------- */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
                    <Plus className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-semibold text-zinc-100">
                    Create Database Snapshot
                  </h3>
                </div>
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="p-1 text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-zinc-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateBackup} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-zinc-300">
                    Backup Label / Custom Name
                  </label>
                  <input
                    type="text"
                    required
                    value={customBackupName}
                    onChange={(e) => setCustomBackupName(e.target.value)}
                    placeholder="e.g. before-auth-migration, release-v2, clean-seed"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none"
                    autoFocus
                  />
                  <p className="text-[11px] text-zinc-500">
                    Use letters, numbers, hyphens or underscores.
                  </p>
                </div>

                {/* Live Name Preview */}
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                    Generated Snapshot Name Preview:
                  </span>
                  <div className="text-xs font-mono text-purple-300 break-all">
                    {customBackupName.trim()
                      ? customBackupName.trim().toLowerCase().replace(/[^a-z0-9_\-]+/g, "-")
                      : "your-name"}
                    __{dbName}__manual__[YYYYMMDD_HHMMSS].dump
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-1">
                    ℹ️ Current date & time will be automatically appended to create a unique point-in-time snapshot.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCreatingBackup || !customBackupName.trim()}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs shadow-lg shadow-purple-900/30 border border-purple-400/20 disabled:opacity-50 transition-all"
                  >
                    {isCreatingBackup ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Taking Snapshot...</span>
                      </>
                    ) : (
                      <>
                        <Archive className="w-3.5 h-3.5" />
                        <span>Take Backup</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------------- */}
      {/* MODAL 2: Restore Confirmation Modal (Shows Parsed Name, Date, Time) */}
      {/* ------------------------------------------------------------- */}
      <AnimatePresence>
        {backupToRestore && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg rounded-2xl bg-zinc-900 border border-rose-900/40 p-6 shadow-2xl space-y-5"
            >
              {(() => {
                const parsed = parseBackupFilename(backupToRestore.filename, backupToRestore.created_at);

                return (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
                        <ShieldAlert className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-zinc-100">
                          Confirm Database Restoration
                        </h3>
                        <p className="text-xs text-zinc-400">
                          Point-in-time recovery for <span className="font-mono text-zinc-300">{dbName}</span>
                        </p>
                      </div>
                    </div>

                    {/* Parsed Snapshot Details Card */}
                    <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                        <span className="text-xs text-zinc-400">Backup Label:</span>
                        <span className="text-sm font-semibold text-purple-300">
                          {parsed.label}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                        <span className="text-xs text-zinc-400">Creation Date:</span>
                        <span className="text-xs font-mono text-zinc-200">
                          {parsed.displayDate}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                        <span className="text-xs text-zinc-400">Creation Time:</span>
                        <span className="text-xs font-mono text-zinc-200">
                          {parsed.displayTime} ({parsed.relativeTime})
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                        <span className="text-xs text-zinc-400">Backup Type:</span>
                        <span className="text-xs font-mono capitalize text-zinc-200">
                          {parsed.type} snapshot
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-400">Archive Size:</span>
                        <span className="text-xs font-mono text-zinc-200">
                          {formatBytes(backupToRestore.size_bytes)}
                        </span>
                      </div>
                    </div>

                    {/* Safety Warning */}
                    <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200 space-y-2">
                      <div className="flex items-center gap-2 font-semibold text-rose-300">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>Warning: Data Overwrite</span>
                      </div>
                      <p className="leading-relaxed">
                        Restoring this backup will terminate existing active connections and overwrite existing tables in <strong className="font-mono">{dbName}</strong>.
                      </p>
                      <p className="text-emerald-300 text-[11px]">
                        🛡️ For your protection, an automatic safety rollback snapshot will be created immediately before restore starts.
                      </p>
                    </div>

                    {/* Confirmation Input */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-zinc-300">
                        Type <span className="font-mono text-rose-400 font-bold">{dbName}</span> to confirm:
                      </label>
                      <input
                        type="text"
                        value={confirmDbInput}
                        onChange={(e) => setConfirmDbInput(e.target.value)}
                        placeholder={dbName}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-rose-500 text-sm font-mono text-zinc-100 placeholder:text-zinc-600 outline-none"
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setBackupToRestore(null)}
                        disabled={isRestoring}
                        className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleConfirmRestore}
                        disabled={isRestoring || confirmDbInput !== dbName}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs shadow-lg shadow-rose-900/30 border border-rose-400/20 disabled:opacity-50 transition-all"
                      >
                        {isRestoring ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Restoring Database...</span>
                          </>
                        ) : (
                          <>
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Confirm & Restore</span>
                          </>
                        )}
                      </button>
                    </div>
                  </>
                );
              })()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------------- */}
      {/* MODAL 3: Delete Confirmation Modal */}
      {/* ------------------------------------------------------------- */}
      <AnimatePresence>
        {backupToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 p-5 shadow-2xl space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">
                    Delete Snapshot?
                  </h3>
                  <p className="text-xs text-zinc-400">
                    This file will be permanently removed from disk.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-300 break-all">
                {backupToDelete.filename}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setBackupToDelete(null)}
                  disabled={isDeleting}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs shadow-lg shadow-rose-900/30 disabled:opacity-50"
                >
                  {isDeleting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  <span>Delete</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
