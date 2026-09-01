"use client";

import { useState, useMemo } from "react";
import {
  Search,
  Download,
  Printer,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Calendar,
  Building2,
  Laptop,
  Smartphone,
  ChevronLeft,
  ChevronRight,
  Filter,
  History,
  FileText,
  Trash2,
  Share2,
  Eye,
  Activity,
  ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActivityDiffModal } from "../modals/activity-diff-modal";
import type { AuditLogEntry, UserBranch } from "../types";

interface AuditLogsTabProps {
  logs: AuditLogEntry[];
  branches: UserBranch[];
}

export function AuditLogsTab({ logs, branches }: AuditLogsTabProps) {
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedLogForDiff, setSelectedLogForDiff] = useState<AuditLogEntry | null>(null);
  const pageSize = 10;

  // 6 Activity Dashboard KPIs
  const totalActivitiesToday = logs.length;
  const activeUsersToday = new Set(logs.map((l) => l.userId)).size;
  const failedLogins = logs.filter((l) => l.action.toLowerCase().includes("failed login") || l.status === "failed").length;
  const criticalChanges = logs.filter((l) => l.action.toLowerCase().includes("role") || l.action.toLowerCase().includes("price") || l.action.toLowerCase().includes("deactivat")).length;
  const exportsPerformed = logs.filter((l) => l.action.toLowerCase().includes("export") || l.module.toLowerCase().includes("report")).length;
  const deletedRecords = logs.filter((l) => l.action.toLowerCase().includes("delete") || l.action.toLowerCase().includes("remove")).length;

  const modulesList = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => set.add(l.module));
    return Array.from(set);
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((log) => {
      if (q) {
        const matchUser = log.userName.toLowerCase().includes(q) || log.userEmail.toLowerCase().includes(q);
        const matchAction = log.action.toLowerCase().includes(q);
        const matchModule = log.module.toLowerCase().includes(q);
        const matchIp = (log.ipAddress || "").toLowerCase().includes(q);
        const matchDetails = (log.details || "").toLowerCase().includes(q);
        const matchRecord = (log.recordId || "").toLowerCase().includes(q);
        if (!matchUser && !matchAction && !matchModule && !matchIp && !matchDetails && !matchRecord) {
          return false;
        }
      }
      if (branchFilter !== "all" && log.branch.toLowerCase() !== branchFilter.toLowerCase()) {
        return false;
      }
      if (statusFilter !== "all" && log.status !== statusFilter) {
        return false;
      }
      if (moduleFilter !== "all" && log.module.toLowerCase() !== moduleFilter.toLowerCase()) {
        return false;
      }
      return true;
    });
  }, [logs, search, branchFilter, statusFilter, moduleFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filteredLogs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleExportCsv = () => {
    const headers = ["Log ID", "Timestamp", "User Name", "Email", "Role", "Action", "Module", "Page", "Record ID", "Old Value", "New Value", "Branch", "Device", "IP Address", "Status", "Details"];
    const rows = filteredLogs.map((l) => [
      `"${l.logId || l.id}"`,
      `"${new Date(l.timestamp).toLocaleString()}"`,
      `"${l.userName}"`,
      `"${l.userEmail}"`,
      `"${l.role || ""}"`,
      `"${l.action}"`,
      `"${l.module}"`,
      `"${l.page || ""}"`,
      `"${l.recordId || ""}"`,
      `"${l.oldValue || ""}"`,
      `"${l.newValue || ""}"`,
      `"${l.branch}"`,
      `"${l.device}"`,
      `"${l.ipAddress}"`,
      `"${l.status}"`,
      `"${(l.details || "").replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `thinksales_activity_logs_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-4">
      
      {/* Header and Controls */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-2xl border border-ledger-200 bg-white shadow-sm dark:border-ledger-800 dark:bg-slate-900">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-bold text-ink-900 dark:text-white">Centralized Enterprise Activity Log</h2>
          </div>
          <p className="text-xs text-ledger-500 dark:text-ledger-400">
            Forensic tracking of every operational transaction, before/after change deltas, authentication events, and administrative security actions
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleExportCsv} className="h-8 text-xs font-semibold">
            <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
          </Button>
          <Button size="sm" variant="outline" onClick={handlePrint} className="h-8 text-xs font-semibold">
            <Printer className="h-3.5 w-3.5 mr-1" /> Print
          </Button>
        </div>
      </div>

      {/* 6 Activity Dashboard KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-2xl border border-ledger-100 bg-white dark:border-ledger-800 dark:bg-slate-900 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ledger-400">Total Activities</span>
          <p className="text-xl font-bold text-ink-900 dark:text-white mt-1">{totalActivitiesToday}</p>
          <p className="text-[11px] text-blue-600 font-medium">Logged events</p>
        </div>

        <div className="p-3.5 rounded-2xl border border-ledger-100 bg-white dark:border-ledger-800 dark:bg-slate-900 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ledger-400">Active Users Today</span>
          <p className="text-xl font-bold text-ink-900 dark:text-white mt-1">{activeUsersToday}</p>
          <p className="text-[11px] text-emerald-600 font-medium">Unique actors</p>
        </div>

        <div className="p-3.5 rounded-2xl border border-ledger-100 bg-white dark:border-ledger-800 dark:bg-slate-900 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ledger-400">Failed Logins</span>
          <p className="text-xl font-bold text-red-600 dark:text-red-400 mt-1">{failedLogins}</p>
          <p className="text-[11px] text-red-500 font-medium">Security alerts</p>
        </div>

        <div className="p-3.5 rounded-2xl border border-ledger-100 bg-white dark:border-ledger-800 dark:bg-slate-900 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ledger-400">Critical Changes</span>
          <p className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">{criticalChanges}</p>
          <p className="text-[11px] text-amber-600 font-medium">Prices, roles & status</p>
        </div>

        <div className="p-3.5 rounded-2xl border border-ledger-100 bg-white dark:border-ledger-800 dark:bg-slate-900 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ledger-400">Exports Performed</span>
          <p className="text-xl font-bold text-ink-900 dark:text-white mt-1">{exportsPerformed}</p>
          <p className="text-[11px] text-ledger-400">Data downloads</p>
        </div>

        <div className="p-3.5 rounded-2xl border border-ledger-100 bg-white dark:border-ledger-800 dark:bg-slate-900 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ledger-400">Deleted Records</span>
          <p className="text-xl font-bold text-ink-900 dark:text-white mt-1">{deletedRecords}</p>
          <p className="text-[11px] text-ledger-400">Archived/Removed</p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="rounded-2xl border border-ledger-200 bg-white p-4 shadow-sm dark:border-ledger-800 dark:bg-slate-900 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ledger-400" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search user, action, record ID, IP..."
              className="h-8 pl-8 text-xs"
            />
          </div>

          <select
            value={moduleFilter}
            onChange={(e) => { setModuleFilter(e.target.value); setPage(1); }}
            className="h-8 rounded-lg border border-ledger-200 bg-white px-2 text-xs font-semibold dark:border-ledger-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="all">All Modules ({modulesList.length})</option>
            {modulesList.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          <select
            value={branchFilter}
            onChange={(e) => { setBranchFilter(e.target.value); setPage(1); }}
            className="h-8 rounded-lg border border-ledger-200 bg-white px-2 text-xs font-semibold dark:border-ledger-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="all">All Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.name}>{b.name}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="h-8 rounded-lg border border-ledger-200 bg-white px-2 text-xs font-semibold dark:border-ledger-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="all">All Statuses</option>
            <option value="success">Success</option>
            <option value="warning">Warning</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {/* Activity Log Data Table */}
      <div className="rounded-2xl border border-ledger-200 bg-white shadow-sm dark:border-ledger-800 dark:bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-ledger-100 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-ledger-400 dark:border-ledger-800 dark:bg-slate-800/60">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Actor / User</th>
                <th className="px-3 py-3">Action</th>
                <th className="px-3 py-3">Module & Record</th>
                <th className="px-4 py-3">Before & After Changes</th>
                <th className="px-3 py-3">Branch & IP</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Inspect</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-ledger-100 dark:divide-ledger-800">
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-ledger-400">
                    No activity log records match your filter parameters.
                  </td>
                </tr>
              ) : (
                pageItems.map((log) => (
                  <tr
                    key={log.id}
                    onClick={() => setSelectedLogForDiff(log)}
                    className="hover:bg-blue-50/40 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                  >
                    {/* Timestamp */}
                    <td className="px-4 py-3 font-mono text-[11px] text-ledger-400 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </td>

                    {/* Actor */}
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-bold text-ink-900 dark:text-white">{log.userName}</p>
                        <p className="text-[11px] text-ledger-400">{log.userEmail}</p>
                      </div>
                    </td>

                    {/* Action */}
                    <td className="px-3 py-3 font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                      {log.action}
                    </td>

                    {/* Module & Record ID */}
                    <td className="px-3 py-3">
                      <p className="font-semibold text-ink-900 dark:text-white">{log.module}</p>
                      <p className="text-[10px] text-ledger-400 font-mono truncate max-w-[140px]">
                        {log.recordId || log.recordType || log.page || "System"}
                      </p>
                    </td>

                    {/* Before & After Delta */}
                    <td className="px-4 py-3">
                      {log.oldValue && log.newValue ? (
                        <div className="flex items-center gap-1.5 font-mono text-[11px]">
                          <span className="text-red-600 dark:text-red-400 line-through truncate max-w-[100px]">{log.oldValue}</span>
                          <ArrowRight className="h-3 w-3 text-ledger-400 shrink-0" />
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold truncate max-w-[120px]">{log.newValue}</span>
                        </div>
                      ) : (
                        <span className="text-ledger-400 text-xs truncate max-w-[180px] block">{log.details || log.action}</span>
                      )}
                    </td>

                    {/* Branch & IP */}
                    <td className="px-3 py-3">
                      <p className="text-ink-900 dark:text-white font-medium">{log.branch}</p>
                      <p className="text-[10px] text-ledger-400 font-mono">{log.ipAddress}</p>
                    </td>

                    {/* Status */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      {log.status === "success" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" /> Success
                        </span>
                      ) : log.status === "warning" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                          <AlertTriangle className="h-3 w-3" /> Warning
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-950 dark:text-red-300">
                          <XCircle className="h-3 w-3" /> Failed
                        </span>
                      )}
                    </td>

                    {/* Inspect Button */}
                    <td className="px-3 py-3 text-right">
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-blue-600 hover:text-blue-700">
                        <Eye className="h-3.5 w-3.5 mr-1" /> View Diff
                      </Button>
                    </td>

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-ledger-100 dark:border-ledger-800 bg-white dark:bg-slate-900">
          <p className="text-xs text-ledger-400">
            Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredLogs.length)} of {filteredLogs.length} activity records
          </p>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs font-bold text-ink-900 dark:text-white px-2">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Before / After Diff Modal */}
      <ActivityDiffModal
        isOpen={Boolean(selectedLogForDiff)}
        onClose={() => setSelectedLogForDiff(null)}
        log={selectedLogForDiff}
      />

    </div>
  );
}
