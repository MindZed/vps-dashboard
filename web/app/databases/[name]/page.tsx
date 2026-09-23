"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Database,
  Table,
  Terminal,
  Plus,
  Search,
  RefreshCw,
  ArrowUpDown,
  Filter,
  Download,
  Trash2,
  KeyRound,
  Check,
  X,
  AlertCircle,
  Play,
  Clock,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ChevronDown,
  Layers,
  Code2,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import {
  ExplorerTable,
  ExplorerColumn,
  ExplorerIndex,
  FilterRule,
  fetchTables,
  fetchTableSchema,
  fetchTableRows,
  insertTableRow,
  updateTableRow,
  deleteTableRows,
  executeSqlQuery,
  SqlQueryResponse,
  fetchDatabases,
  DatabaseSummary,
  CreateDatabaseResponse,
  getSavedDatabaseCredentials,
} from "@/lib/agent-client";
import VisualTableBuilderModal from "@/components/db/VisualTableBuilderModal";
import InsertRowDrawer from "@/components/db/InsertRowDrawer";
import ConnectionCard from "@/components/db/ConnectionCard";

export default function DatabaseStudioPage() {
  const params = useParams();
  const router = useRouter();
  const dbName = typeof params.name === "string" ? decodeURIComponent(params.name) : "";

  // Mode: "explorer" | "sql"
  const [activeTab, setActiveTab] = useState<"explorer" | "sql">("explorer");

  // Database & Table state
  const [tables, setTables] = useState<ExplorerTable[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [tableSearch, setTableSearch] = useState("");
  const [loadingTables, setLoadingTables] = useState(true);

  // Schema state
  const [columns, setColumns] = useState<ExplorerColumn[]>([]);
  const [indexes, setIndexes] = useState<ExplorerIndex[]>([]);
  const [subView, setSubView] = useState<"data" | "schema">("data");

  // Grid Data state
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [totalRows, setTotalRows] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [sortColumn, setSortColumn] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [rowSearch, setRowSearch] = useState<string>("");
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [showFilterBuilder, setShowFilterBuilder] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);

  // Selection & Inline Editing
  const [selectedRowPks, setSelectedRowPks] = useState<Set<any>>(new Set());
  const [editingCell, setEditingCell] = useState<{
    pk: any;
    column: string;
    originalVal: any;
    val: string;
  } | null>(null);
  const [savingCell, setSavingCell] = useState(false);

  // Modals & Drawers
  const [isNewTableModalOpen, setIsNewTableModalOpen] = useState(false);
  const [isInsertDrawerOpen, setIsInsertDrawerOpen] = useState(false);
  const [connectionModalData, setConnectionModalData] = useState<CreateDatabaseResponse | null>(null);

  // Notifications
  const [toastMsg, setToastMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMsg({ type, text });
    setTimeout(() => setToastMsg(null), 3500);
  };

  // SQL Console state
  const [sqlQuery, setSqlQuery] = useState<string>("");
  const [sqlRunning, setSqlRunning] = useState(false);
  const [sqlResult, setSqlResult] = useState<SqlQueryResponse | null>(null);

  // Identify Primary Key column for the active table
  const primaryKeyCol = useMemo(() => {
    return columns.find((c) => c.is_primary_key)?.name || "id";
  }, [columns]);

  // Load Tables
  const loadTablesList = useCallback(async (selectFirst = false) => {
    if (!dbName) return;
    setLoadingTables(true);
    try {
      const list = await fetchTables(dbName);
      setTables(list);
      if (list.length > 0) {
        if (selectFirst || !selectedTable || !list.some((t) => t.name === selectedTable)) {
          setSelectedTable(list[0].name);
        }
      } else {
        setSelectedTable("");
        setRows([]);
        setColumns([]);
      }
    } catch (err: any) {
      showToast(err.message || "Failed to load database tables", "error");
    } finally {
      setLoadingTables(false);
    }
  }, [dbName, selectedTable]);

  useEffect(() => {
    loadTablesList(true);
  }, [dbName]);

  // Load Schema when selected table changes
  const loadSchema = useCallback(async () => {
    if (!dbName || !selectedTable) return;
    try {
      const schemaData = await fetchTableSchema(dbName, selectedTable);
      setColumns(schemaData.columns);
      setIndexes(schemaData.indexes);
    } catch (err: any) {
      console.error("Failed to load schema", err);
    }
  }, [dbName, selectedTable]);

  useEffect(() => {
    if (selectedTable) {
      loadSchema();
      setPage(1);
      setSelectedRowPks(new Set());
      setEditingCell(null);
    }
  }, [selectedTable, loadSchema]);

  // Load Rows when table, page, sort, or filters change
  const loadRowsData = useCallback(async () => {
    if (!dbName || !selectedTable) return;
    setLoadingRows(true);
    try {
      const res = await fetchTableRows(dbName, selectedTable, {
        page,
        limit: pageSize,
        sort_column: sortColumn || undefined,
        sort_order: sortOrder,
        search: rowSearch || undefined,
        filters: filters.length > 0 ? filters : undefined,
      });
      setRows(res.rows || []);
      setTotalRows(res.total_count || 0);
    } catch (err: any) {
      showToast(err.message || "Failed to fetch rows", "error");
    } finally {
      setLoadingRows(false);
    }
  }, [dbName, selectedTable, page, pageSize, sortColumn, sortOrder, rowSearch, filters]);

  useEffect(() => {
    if (selectedTable && activeTab === "explorer" && subView === "data") {
      loadRowsData();
    }
  }, [selectedTable, page, pageSize, sortColumn, sortOrder, filters, activeTab, subView]);

  // Pre-fill SQL console snippet when switching to SQL tab
  useEffect(() => {
    if (activeTab === "sql" && !sqlQuery) {
      if (selectedTable) {
        setSqlQuery(`-- Quick query for '${selectedTable}'\nSELECT * FROM ${selectedTable} LIMIT 25;`);
      } else {
        setSqlQuery(`-- Explore database schema and relations\nSELECT table_name, table_type \nFROM information_schema.tables \nWHERE table_schema = 'public'\nORDER BY table_name;`);
      }
    }
  }, [activeTab, selectedTable, sqlQuery]);

  // Sort Handler
  const handleSort = (colName: string) => {
    if (sortColumn === colName) {
      if (sortOrder === "asc") setSortOrder("desc");
      else {
        setSortColumn("");
        setSortOrder("asc");
      }
    } else {
      setSortColumn(colName);
      setSortOrder("asc");
    }
  };

  // Row selection toggle
  const toggleSelectRow = (pkVal: any) => {
    const next = new Set(selectedRowPks);
    if (next.has(pkVal)) next.delete(pkVal);
    else next.add(pkVal);
    setSelectedRowPks(next);
  };

  const toggleSelectAll = () => {
    if (selectedRowPks.size === rows.length) {
      setSelectedRowPks(new Set());
    } else {
      const allPks = new Set(rows.map((r) => r[primaryKeyCol]));
      setSelectedRowPks(allPks);
    }
  };

  // Delete selected rows
  const handleDeleteSelected = async () => {
    if (selectedRowPks.size === 0) return;
    const confirmDelete = window.confirm(
      `Are you sure you want to permanently delete ${selectedRowPks.size} record(s) from '${selectedTable}'?`
    );
    if (!confirmDelete) return;

    try {
      const pks = Array.from(selectedRowPks);
      const res = await deleteTableRows(dbName, selectedTable, primaryKeyCol, pks);
      if (res.success) {
        showToast(`Deleted ${res.deleted_count ?? pks.length} row(s)`);
        setSelectedRowPks(new Set());
        loadRowsData();
        loadTablesList();
      } else {
        showToast(res.error || "Failed to delete rows", "error");
      }
    } catch (e: any) {
      showToast(e.message || "Delete error", "error");
    }
  };

  // Inline cell save
  const handleSaveCell = async () => {
    if (!editingCell) return;
    const { pk, column, originalVal, val } = editingCell;
    if (String(originalVal) === val) {
      setEditingCell(null);
      return;
    }

    setSavingCell(true);
    try {
      // Find col schema
      const colDef = columns.find((c) => c.name === column);
      let parsedVal: any = val;
      const udt = colDef?.udt_name.toLowerCase() || "";

      if (val === "" && colDef?.is_nullable) {
        parsedVal = null;
      } else if (udt === "bool") {
        parsedVal = val.toLowerCase() === "true";
      } else if (["int2", "int4", "int8"].includes(udt)) {
        parsedVal = parseInt(val, 10);
      } else if (["numeric", "float4", "float8"].includes(udt)) {
        parsedVal = parseFloat(val);
      } else if (["json", "jsonb"].includes(udt)) {
        parsedVal = JSON.parse(val);
      }

      const res = await updateTableRow(dbName, selectedTable, primaryKeyCol, pk, {
        [column]: parsedVal,
      });

      if (res.success) {
        setRows((prev) =>
          prev.map((r) => (r[primaryKeyCol] === pk ? { ...r, [column]: parsedVal } : r))
        );
        showToast(`Updated '${column}'`);
      } else {
        showToast(res.error || "Update failed", "error");
      }
    } catch (e: any) {
      showToast(e.message || "Failed to parse or save value", "error");
    } finally {
      setSavingCell(false);
      setEditingCell(null);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (rows.length === 0) return;
    const headers = columns.map((c) => c.name).join(",");
    const csvRows = rows.map((r) =>
      columns
        .map((c) => {
          const v = r[c.name];
          if (v === null || v === undefined) return "";
          const str = typeof v === "object" ? JSON.stringify(v) : String(v);
          return `"${str.replace(/"/g, '""')}"`;
        })
        .join(",")
    );
    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...csvRows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${dbName}_${selectedTable}_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Downloaded CSV export");
  };

  // Run SQL
  const handleExecuteSql = async () => {
    if (!sqlQuery.trim() || sqlRunning) return;
    setSqlRunning(true);
    setSqlResult(null);
    try {
      const res = await executeSqlQuery(dbName, sqlQuery);
      setSqlResult(res);
      if (res.success) {
        showToast(`Executed in ${res.duration_ms.toFixed(1)}ms`);
      } else {
        showToast(res.error || "Query failed", "error");
      }
    } catch (e: any) {
      showToast(e.message || "Execution failed", "error");
    } finally {
      setSqlRunning(false);
    }
  };

  // Open Connection Info modal
  const handleOpenConnectionInfo = async () => {
    try {
      const res = await fetchDatabases();
      const currentDb = res.databases.find((d) => d.name === dbName);
      if (currentDb) {
        const cachedCreds = getSavedDatabaseCredentials(currentDb.name);
        const externalHost = res.clusterInfo?.external_host || window.location.hostname;
        const pgbouncerPort = res.clusterInfo?.pgbouncer_port || "6432";
        const passwordToDisplay = cachedCreds?.password || "••••••••";

        const correctedVercelUrl = `postgresql://${currentDb.owner}:${passwordToDisplay}@${externalHost}:${pgbouncerPort}/${currentDb.name}?sslmode=disable`;

        setConnectionModalData({
          success: true,
          database: currentDb.name,
          username: currentDb.owner,
          password: passwordToDisplay,
          connections: {
            dokploy_internal: currentDb.connections?.dokploy_internal || "",
            ssh_tunnel: currentDb.connections?.ssh_tunnel || "",
            external_vercel: correctedVercelUrl,
          },
          created_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Filter tables by sidebar search
  const filteredTables = useMemo(() => {
    if (!tableSearch) return tables;
    return tables.filter((t) => t.name.toLowerCase().includes(tableSearch.toLowerCase()));
  }, [tables, tableSearch]);

  const totalPages = Math.ceil(totalRows / pageSize) || 1;

  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100 flex flex-col font-sans selection:bg-emerald-500/20 selection:text-emerald-300">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-4 right-6 z-50 px-4 py-2.5 rounded-xl shadow-2xl border text-xs font-medium flex items-center gap-2 backdrop-blur-md ${
              toastMsg.type === "error"
                ? "bg-rose-950/80 border-rose-500/30 text-rose-200"
                : "bg-emerald-950/80 border-emerald-500/30 text-emerald-200"
            }`}
          >
            {toastMsg.type === "error" ? (
              <AlertCircle className="w-4 h-4 text-rose-400" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            )}
            <span>{toastMsg.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Navbar (Neon / Supabase header style) */}
      <header className="h-14 border-b border-white/10 bg-[#0C1222]/80 backdrop-blur-md px-5 flex items-center justify-between z-30 sticky top-0">
        <div className="flex items-center gap-3">
          <Link
            href="/databases"
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors py-1 px-2 rounded-lg hover:bg-white/5"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Databases</span>
          </Link>
          <span className="text-slate-600">/</span>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Database className="w-3.5 h-3.5" />
            </div>
            <span className="font-semibold text-sm text-white font-mono">{dbName}</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              v16.1 · PgBouncer Pool
            </span>
          </div>
        </div>

        {/* Center Tabs: Table Editor vs SQL Console */}
        <div className="flex items-center bg-[#131C31] p-1 rounded-xl border border-white/10">
          <button
            onClick={() => setActiveTab("explorer")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === "explorer"
                ? "bg-emerald-500/20 text-emerald-300 shadow-sm border border-emerald-500/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            <span>Table Editor</span>
          </button>
          <button
            onClick={() => setActiveTab("sql")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === "sql"
                ? "bg-indigo-500/20 text-indigo-300 shadow-sm border border-indigo-500/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>SQL Console</span>
          </button>
        </div>

        {/* Right Tools */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleOpenConnectionInfo}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
          >
            <KeyRound className="w-3.5 h-3.5 text-amber-400" />
            <span>Connection Info</span>
          </button>
        </div>
      </header>

      {/* Main Studio Body: Sidebar + Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar (Tables & Schemas) */}
        <aside className="w-64 border-r border-white/10 bg-[#0C1222]/40 flex flex-col shrink-0">
          {/* Sidebar Top: Action & Search */}
          <div className="p-3 border-b border-white/10 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider font-mono">
                Tables ({tables.length})
              </span>
              <button
                onClick={() => setIsNewTableModalOpen(true)}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-medium shadow-sm transition-colors"
              >
                <Plus className="w-3 h-3" />
                <span>New Table</span>
              </button>
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Filter tables..."
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 bg-black/40 border border-white/10 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
          </div>

          {/* Tables List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loadingTables ? (
              <div className="flex items-center justify-center p-8 text-xs text-slate-500 gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                <span>Reading catalogs...</span>
              </div>
            ) : filteredTables.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                <Table className="w-6 h-6 mx-auto mb-2 text-slate-600" />
                <p>No tables found.</p>
                <button
                  onClick={() => setIsNewTableModalOpen(true)}
                  className="mt-2 text-emerald-400 hover:underline"
                >
                  Create one now
                </button>
              </div>
            ) : (
              filteredTables.map((tbl) => {
                const isSelected = selectedTable === tbl.name;
                const sizeKb = Math.round(tbl.size_bytes / 1024);
                return (
                  <button
                    key={tbl.name}
                    onClick={() => {
                      setSelectedTable(tbl.name);
                      if (activeTab !== "explorer") setActiveTab("explorer");
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-mono transition-all text-left group ${
                      isSelected
                        ? "bg-emerald-500/15 text-emerald-300 font-medium border border-emerald-500/30"
                        : "text-slate-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Table
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isSelected ? "text-emerald-400" : "text-slate-500 group-hover:text-slate-300"
                        }`}
                      />
                      <span className="truncate">{tbl.name}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 group-hover:text-slate-400 shrink-0">
                      {tbl.estimated_rows}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Right Canvas: Workspace */}
        <main className="flex-1 flex flex-col overflow-hidden bg-[#0A0E1A]">
          {activeTab === "explorer" ? (
            /* TAB 1: TABLE EXPLORER */
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Table Toolbar */}
              <div className="px-5 py-3 border-b border-white/10 bg-[#0C1222]/60 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div>
                    <h2 className="text-sm font-semibold text-white font-mono flex items-center gap-2">
                      <span>{selectedTable || "Select a table"}</span>
                      {selectedTable && (
                        <span className="text-[11px] font-sans font-normal text-slate-400">
                          ({totalRows.toLocaleString()} {totalRows === 1 ? "row" : "rows"})
                        </span>
                      )}
                    </h2>
                  </div>

                  {/* Subview switch: Data vs Schema */}
                  {selectedTable && (
                    <div className="flex items-center bg-black/40 p-0.5 rounded-lg border border-white/10 text-xs">
                      <button
                        onClick={() => setSubView("data")}
                        className={`px-3 py-1 rounded-md transition-colors ${
                          subView === "data"
                            ? "bg-white/10 text-white font-medium shadow-sm"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        Data Grid
                      </button>
                      <button
                        onClick={() => setSubView("schema")}
                        className={`px-3 py-1 rounded-md transition-colors ${
                          subView === "schema"
                            ? "bg-white/10 text-white font-medium shadow-sm"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        Schema ({columns.length})
                      </button>
                    </div>
                  )}
                </div>

                {/* Right Action Bar */}
                {selectedTable && (
                  <div className="flex items-center gap-2">
                    {subView === "data" && (
                      <>
                        {/* Search in table */}
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                          <input
                            type="text"
                            placeholder="Search rows..."
                            value={rowSearch}
                            onChange={(e) => setRowSearch(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                setPage(1);
                                loadRowsData();
                              }
                            }}
                            className="w-44 pl-8 pr-2.5 py-1.5 bg-black/40 border border-white/10 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                          />
                        </div>

                        {/* Filter Drawer Toggle */}
                        <button
                          onClick={() => setShowFilterBuilder(!showFilterBuilder)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            filters.length > 0 || showFilterBuilder
                              ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                              : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white"
                          }`}
                        >
                          <Filter className="w-3 h-3" />
                          <span>Filters {filters.length > 0 && `(${filters.length})`}</span>
                        </button>

                        {/* Export CSV */}
                        <button
                          onClick={handleExportCSV}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                          title="Export table rows as CSV"
                        >
                          <Download className="w-3 h-3" />
                          <span>Export</span>
                        </button>

                        {/* Delete Selected (when checked) */}
                        {selectedRowPks.size > 0 && (
                          <button
                            onClick={handleDeleteSelected}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Delete ({selectedRowPks.size})</span>
                          </button>
                        )}

                        {/* Insert Row Drawer Trigger */}
                        <button
                          onClick={() => setIsInsertDrawerOpen(true)}
                          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Insert Row</span>
                        </button>
                      </>
                    )}

                    {/* Reload */}
                    <button
                      onClick={() => {
                        loadRowsData();
                        loadSchema();
                        loadTablesList();
                      }}
                      className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                      title="Reload table data"
                    >
                      <RefreshCw className={`w-4 h-4 ${loadingRows ? "animate-spin text-emerald-400" : ""}`} />
                    </button>
                  </div>
                )}
              </div>

              {/* Filter Builder Panel (when open) */}
              {showFilterBuilder && (
                <div className="px-5 py-3 bg-[#111827] border-b border-white/10 flex flex-wrap items-center gap-3 text-xs">
                  <span className="text-slate-400 font-medium">Filter rules:</span>
                  {filters.map((f, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 bg-black/40 px-3 py-1 rounded-lg border border-white/10 font-mono"
                    >
                      <span className="text-emerald-400">{f.column}</span>
                      <span className="text-slate-500">{f.operator}</span>
                      <span className="text-slate-300">&quot;{f.value}&quot;</span>
                      <button
                        onClick={() => setFilters(filters.filter((_, i) => i !== idx))}
                        className="text-slate-500 hover:text-rose-400 ml-1"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}

                  {/* Add Filter */}
                  <div className="flex items-center gap-2">
                    <select
                      id="new-filter-col"
                      className="bg-black/60 border border-white/10 rounded-md px-2 py-1 text-slate-200 text-xs font-mono"
                    >
                      {columns.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>

                    <select
                      id="new-filter-op"
                      className="bg-black/60 border border-white/10 rounded-md px-2 py-1 text-slate-200 text-xs font-mono"
                    >
                      <option value="eq">=</option>
                      <option value="neq">!=</option>
                      <option value="gt">&gt;</option>
                      <option value="lt">&lt;</option>
                      <option value="contains">contains</option>
                      <option value="is_null">is null</option>
                      <option value="is_not_null">is not null</option>
                    </select>

                    <input
                      id="new-filter-val"
                      type="text"
                      placeholder="value..."
                      className="bg-black/60 border border-white/10 rounded-md px-2 py-1 text-slate-200 text-xs font-mono w-28"
                    />

                    <button
                      onClick={() => {
                        const colEl = document.getElementById("new-filter-col") as HTMLSelectElement;
                        const opEl = document.getElementById("new-filter-op") as HTMLSelectElement;
                        const valEl = document.getElementById("new-filter-val") as HTMLInputElement;
                        if (colEl && opEl && valEl) {
                          setFilters([
                            ...filters,
                            {
                              column: colEl.value,
                              operator: opEl.value as any,
                              value: valEl.value,
                            },
                          ]);
                          valEl.value = "";
                        }
                      }}
                      className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/15 text-slate-200 font-medium"
                    >
                      Apply
                    </button>
                    {filters.length > 0 && (
                      <button
                        onClick={() => setFilters([])}
                        className="text-slate-500 hover:text-white underline text-[11px]"
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Data Grid or Schema View */}
              {subView === "data" ? (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex-1 overflow-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      {/* Sticky Table Header */}
                      <thead className="bg-[#0F172A] border-b border-white/10 sticky top-0 z-20 select-none">
                        <tr>
                          {/* Row selection checkbox header */}
                          <th className="w-10 px-3 py-2.5 border-r border-white/5 text-center">
                            <input
                              type="checkbox"
                              checked={rows.length > 0 && selectedRowPks.size === rows.length}
                              onChange={toggleSelectAll}
                              className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
                            />
                          </th>

                          {/* Dynamic column headers */}
                          {columns.map((col) => {
                            const isSorted = sortColumn === col.name;
                            return (
                              <th
                                key={col.name}
                                onClick={() => handleSort(col.name)}
                                className="px-4 py-2.5 font-mono text-[11px] font-semibold text-slate-300 border-r border-white/5 hover:bg-white/[0.03] cursor-pointer transition-colors whitespace-nowrap"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5">
                                    <span>{col.name}</span>
                                    <span className="text-[9px] px-1 py-0.2 rounded bg-black/40 text-slate-500 border border-slate-800">
                                      {col.udt_name}
                                    </span>
                                    {col.is_primary_key && (
                                      <span
                                        className="text-amber-400 text-[10px]"
                                        title="Primary Key"
                                      >
                                        🔑
                                      </span>
                                    )}
                                  </div>
                                  <ArrowUpDown
                                    className={`w-3 h-3 transition-colors ${
                                      isSorted ? "text-emerald-400 font-bold" : "text-slate-600 hover:text-slate-400"
                                    }`}
                                  />
                                </div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>

                      {/* Rows Body */}
                      <tbody className="divide-y divide-white/5 font-mono">
                        {loadingRows ? (
                          <tr>
                            <td
                              colSpan={columns.length + 1}
                              className="px-6 py-16 text-center text-slate-500"
                            >
                              <div className="flex items-center justify-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                                <span>Querying records...</span>
                              </div>
                            </td>
                          </tr>
                        ) : rows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={columns.length + 1}
                              className="px-6 py-16 text-center text-slate-500"
                            >
                              <div className="max-w-xs mx-auto space-y-2">
                                <Table className="w-8 h-8 text-slate-700 mx-auto" />
                                <p className="text-slate-400 font-sans text-xs">No records found</p>
                                <button
                                  onClick={() => setIsInsertDrawerOpen(true)}
                                  className="text-emerald-400 hover:underline text-xs font-sans font-medium"
                                >
                                  Insert the first row
                                </button>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          rows.map((row, rowIdx) => {
                            const pkVal = row[primaryKeyCol];
                            const isSelected = selectedRowPks.has(pkVal);

                            return (
                              <tr
                                key={pkVal ?? rowIdx}
                                className={`transition-colors group ${
                                  isSelected
                                    ? "bg-emerald-500/10 hover:bg-emerald-500/15"
                                    : "hover:bg-white/[0.02]"
                                }`}
                              >
                                {/* Checkbox */}
                                <td className="w-10 px-3 py-2 border-r border-white/5 text-center">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleSelectRow(pkVal)}
                                    className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
                                  />
                                </td>

                                {/* Cells */}
                                {columns.map((col) => {
                                  const cellVal = row[col.name];
                                  const isEditing =
                                    editingCell?.pk === pkVal && editingCell?.column === col.name;

                                  return (
                                    <td
                                      key={col.name}
                                      onDoubleClick={() => {
                                        setEditingCell({
                                          pk: pkVal,
                                          column: col.name,
                                          originalVal: cellVal,
                                          val:
                                            cellVal === null || cellVal === undefined
                                              ? ""
                                              : typeof cellVal === "object"
                                              ? JSON.stringify(cellVal)
                                              : String(cellVal),
                                        });
                                      }}
                                      className="px-4 py-2 border-r border-white/5 max-w-xs truncate cursor-cell relative"
                                    >
                                      {isEditing ? (
                                        <div className="flex items-center gap-1.5">
                                          <input
                                            autoFocus
                                            type="text"
                                            value={editingCell.val}
                                            onChange={(e) =>
                                              setEditingCell({ ...editingCell, val: e.target.value })
                                            }
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter") handleSaveCell();
                                              if (e.key === "Escape") setEditingCell(null);
                                            }}
                                            className="w-full px-2 py-0.5 bg-black border border-emerald-500 rounded text-xs text-white focus:outline-none"
                                          />
                                          <button
                                            onClick={handleSaveCell}
                                            disabled={savingCell}
                                            className="text-emerald-400 hover:text-emerald-300"
                                          >
                                            <Check className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            onClick={() => setEditingCell(null)}
                                            className="text-slate-500 hover:text-slate-300"
                                          >
                                            <X className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      ) : cellVal === null || cellVal === undefined ? (
                                        <span className="text-slate-600 italic text-[11px]">NULL</span>
                                      ) : col.udt_name.toLowerCase() === "bool" ? (
                                        <span
                                          className={`px-1.5 py-0.2 rounded text-[10px] font-semibold uppercase ${
                                            cellVal
                                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                              : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                          }`}
                                        >
                                          {String(cellVal)}
                                        </span>
                                      ) : typeof cellVal === "object" ? (
                                        <span
                                          className="text-slate-400 text-[11px] truncate block"
                                          title={JSON.stringify(cellVal, null, 2)}
                                        >
                                          {JSON.stringify(cellVal)}
                                        </span>
                                      ) : (
                                        <span
                                          className="text-slate-200 text-xs truncate block"
                                          title={String(cellVal)}
                                        >
                                          {String(cellVal)}
                                        </span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Grid Pagination Footer */}
                  <div className="h-12 px-5 border-t border-white/10 bg-[#0C1222]/80 flex items-center justify-between text-xs text-slate-400 shrink-0">
                    <div className="flex items-center gap-3">
                      <span>
                        Showing {rows.length === 0 ? 0 : (page - 1) * pageSize + 1} -{" "}
                        {Math.min(page * pageSize, totalRows)} of {totalRows.toLocaleString()} rows
                      </span>
                      <select
                        value={pageSize}
                        onChange={(e) => {
                          setPageSize(Number(e.target.value));
                          setPage(1);
                        }}
                        className="bg-black/40 border border-white/10 rounded px-2 py-0.5 text-xs text-slate-300 focus:outline-none"
                      >
                        <option value={25}>25 / page</option>
                        <option value={50}>50 / page</option>
                        <option value={100}>100 / page</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="p-1 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-40 transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="font-mono text-slate-300">
                        {page} / {totalPages}
                      </span>
                      <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        className="p-1 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-40 transition-colors"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* TAB 1 SUBVIEW: SCHEMA & INDEXES */
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {/* Columns Definition */}
                  <div className="rounded-xl border border-white/10 bg-slate-900/40 overflow-hidden">
                    <div className="px-5 py-3 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider font-mono">
                        Columns ({columns.length})
                      </h3>
                    </div>
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-black/30 border-b border-white/5 text-slate-400 text-[10px] uppercase">
                        <tr>
                          <th className="px-4 py-2.5">Name</th>
                          <th className="px-4 py-2.5">Data Type</th>
                          <th className="px-4 py-2.5">Nullable</th>
                          <th className="px-4 py-2.5">Primary Key</th>
                          <th className="px-4 py-2.5">Default Expression</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {columns.map((c) => (
                          <tr key={c.name} className="hover:bg-white/[0.02]">
                            <td className="px-4 py-2.5 text-white font-semibold">{c.name}</td>
                            <td className="px-4 py-2.5 text-emerald-400">{c.udt_name}</td>
                            <td className="px-4 py-2.5">
                              {c.is_nullable ? (
                                <span className="text-slate-400">YES</span>
                              ) : (
                                <span className="text-rose-400 font-semibold">NO</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              {c.is_primary_key ? (
                                <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px]">
                                  PRIMARY KEY
                                </span>
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-slate-400">{c.default_value || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Indexes Definition */}
                  <div className="rounded-xl border border-white/10 bg-slate-900/40 overflow-hidden">
                    <div className="px-5 py-3 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider font-mono">
                        Indexes ({indexes.length})
                      </h3>
                    </div>
                    {indexes.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500">
                        No secondary indexes found on this table.
                      </div>
                    ) : (
                      <div className="p-4 space-y-2">
                        {indexes.map((idx) => (
                          <div
                            key={idx.name}
                            className="p-3 rounded-lg bg-black/40 border border-white/5 font-mono text-xs"
                          >
                            <span className="text-emerald-400 font-semibold">{idx.name}</span>
                            <pre className="mt-1 text-[11px] text-slate-400 overflow-x-auto whitespace-pre-wrap">
                              {idx.definition}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* TAB 2: SQL CONSOLE */
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* SQL Console Header Toolbar */}
              <div className="px-5 py-3 border-b border-white/10 bg-[#0C1222]/60 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 overflow-x-auto">
                  <span className="text-xs text-slate-400 shrink-0 font-medium">Quick Snippets:</span>
                  <button
                    onClick={() =>
                      setSqlQuery(
                        `SELECT * FROM ${selectedTable || "information_schema.tables"} LIMIT 25;`
                      )
                    }
                    className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-slate-300 font-mono transition-colors shrink-0"
                  >
                    Select 25 Rows
                  </button>
                  <button
                    onClick={() =>
                      setSqlQuery(
                        `SELECT relname AS table_name, pg_size_pretty(pg_total_relation_size(relid)) AS total_size \nFROM pg_catalog.pg_statio_user_tables \nORDER BY pg_total_relation_size(relid) DESC;`
                      )
                    }
                    className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-slate-300 font-mono transition-colors shrink-0"
                  >
                    Table Storage Sizes
                  </button>
                  <button
                    onClick={() =>
                      setSqlQuery(
                        `SELECT count(*), state \nFROM pg_stat_activity \nWHERE datname = current_database() \nGROUP BY state;`
                      )
                    }
                    className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-slate-300 font-mono transition-colors shrink-0"
                  >
                    Connection Stats
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
                    Ctrl + Enter to run
                  </span>
                  <button
                    onClick={handleExecuteSql}
                    disabled={sqlRunning || !sqlQuery.trim()}
                    className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 disabled:opacity-50 transition-colors"
                  >
                    {sqlRunning ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Executing...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Run Query</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Editor + Results Split */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* SQL Editor Area */}
                <div className="h-48 border-b border-white/10 bg-[#0B0F19] relative">
                  <textarea
                    value={sqlQuery}
                    onChange={(e) => setSqlQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                        e.preventDefault();
                        handleExecuteSql();
                      }
                    }}
                    placeholder="-- Write standard PostgreSQL query here... (e.g. SELECT * FROM students;)"
                    className="w-full h-full p-4 bg-transparent text-slate-100 font-mono text-xs focus:outline-none resize-none selection:bg-indigo-500/30 leading-relaxed"
                    spellCheck={false}
                  />
                </div>

                {/* SQL Results Area */}
                <div className="flex-1 flex flex-col overflow-hidden bg-[#080C14]">
                  {/* Results Header Status */}
                  <div className="px-5 py-2.5 border-b border-white/5 bg-[#0C1222]/40 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 font-mono text-slate-400">
                      {sqlResult?.success ? (
                        <span className="text-emerald-400 flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5" />
                          <span>
                            {sqlResult.row_count ?? sqlResult.rows_affected ?? 0} row(s) returned
                          </span>
                        </span>
                      ) : sqlResult?.error ? (
                        <span className="text-rose-400 flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>Execution Error</span>
                        </span>
                      ) : (
                        <span>Ready to execute</span>
                      )}

                      {sqlResult?.duration_ms !== undefined && sqlResult.duration_ms > 0 && (
                        <span className="text-slate-500">
                          in {sqlResult.duration_ms.toFixed(1)} ms
                        </span>
                      )}
                    </div>

                    {sqlResult?.rows && sqlResult.rows.length > 0 && (
                      <button
                        onClick={() => {
                          const cols = sqlResult.columns || Object.keys(sqlResult.rows![0]);
                          const headers = cols.join(",");
                          const csvRows = sqlResult.rows!.map((r) =>
                            cols
                              .map((c) => {
                                const v = r[c];
                                if (v === null || v === undefined) return "";
                                const str = typeof v === "object" ? JSON.stringify(v) : String(v);
                                return `"${str.replace(/"/g, '""')}"`;
                              })
                              .join(",")
                          );
                          const csv = "data:text/csv;charset=utf-8," + [headers, ...csvRows].join("\n");
                          const link = document.createElement("a");
                          link.setAttribute("href", encodeURI(csv));
                          link.setAttribute("download", `${dbName}_query_results.csv`);
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        }}
                        className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white"
                      >
                        <Download className="w-3 h-3" />
                        <span>Export CSV</span>
                      </button>
                    )}
                  </div>

                  {/* Results Data Table or Error Output */}
                  <div className="flex-1 overflow-auto">
                    {sqlResult?.error ? (
                      <div className="p-6">
                        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 font-mono text-xs text-rose-300 whitespace-pre-wrap">
                          {sqlResult.error}
                        </div>
                      </div>
                    ) : sqlResult?.rows && sqlResult.rows.length > 0 ? (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-[#0F172A] border-b border-white/10 sticky top-0 z-10 select-none">
                          <tr>
                            {(sqlResult.columns || Object.keys(sqlResult.rows[0])).map((col) => (
                              <th
                                key={col}
                                className="px-4 py-2.5 font-mono text-[11px] font-semibold text-slate-300 border-r border-white/5 whitespace-nowrap"
                              >
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 font-mono">
                          {sqlResult.rows.map((row, rIdx) => {
                            const cols = sqlResult.columns || Object.keys(sqlResult.rows![0]);
                            return (
                              <tr key={rIdx} className="hover:bg-white/[0.02]">
                                {cols.map((c) => {
                                  const v = row[c];
                                  return (
                                    <td
                                      key={c}
                                      className="px-4 py-2 border-r border-white/5 max-w-sm truncate"
                                    >
                                      {v === null || v === undefined ? (
                                        <span className="text-slate-600 italic">NULL</span>
                                      ) : typeof v === "object" ? (
                                        <span className="text-slate-400 truncate block">
                                          {JSON.stringify(v)}
                                        </span>
                                      ) : (
                                        <span className="text-slate-200 truncate block">{String(v)}</span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : sqlResult ? (
                      <div className="p-8 text-center text-xs text-slate-500">
                        Query returned 0 rows.
                      </div>
                    ) : (
                      <div className="p-12 text-center text-xs text-slate-600">
                        <Terminal className="w-8 h-8 mx-auto mb-2 text-slate-700" />
                        <p>Write an SQL query above and click &quot;Run Query&quot; (or Ctrl+Enter)</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Modals & Drawers */}
      <VisualTableBuilderModal
        isOpen={isNewTableModalOpen}
        database={dbName}
        onClose={() => setIsNewTableModalOpen(false)}
        onCreated={(tblName) => {
          showToast(`Table '${tblName}' created successfully`);
          loadTablesList();
          setSelectedTable(tblName);
        }}
      />

      <InsertRowDrawer
        isOpen={isInsertDrawerOpen}
        database={dbName}
        table={selectedTable}
        columns={columns}
        onClose={() => setIsInsertDrawerOpen(false)}
        onInserted={() => {
          showToast(`Record inserted into '${selectedTable}'`);
          loadRowsData();
          loadTablesList();
        }}
      />

      {/* Connection Info Modal */}
      {connectionModalData && (
        <ConnectionCard
          data={connectionModalData}
          onClose={() => setConnectionModalData(null)}
        />
      )}
    </div>
  );
}
