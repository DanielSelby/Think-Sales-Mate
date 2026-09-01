"use client";

import { useState, useMemo } from "react";
import {
  Laptop,
  Smartphone,
  Globe,
  Clock,
  LogOut,
  ShieldAlert,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
  Printer,
  ShieldCheck,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { INITIAL_LOGIN_SESSIONS } from "../constants";
import type { LoginSession } from "../types";

interface LoginSessionsTabProps {
  canManage: boolean;
}

export function LoginSessionsTab({ canManage }: LoginSessionsTabProps) {
  const [sessions, setSessions] = useState<LoginSession[]>(INITIAL_LOGIN_SESSIONS);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleEndSession = (sessionId: string, userName: string) => {
    if (!canManage) return;
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId || s.sessionId === sessionId
          ? { ...s, status: "logged_out", logoutTime: new Date().toISOString() }
          : s
      )
    );
    showToast(`Terminated active login session for ${userName}.`);
  };

  const handleEndAllSessions = () => {
    if (!canManage) return;
    if (!confirm("Are you sure you want to terminate ALL active login sessions across the enterprise?")) return;
    setSessions((prev) =>
      prev.map((s) => ({ ...s, status: "logged_out", logoutTime: new Date().toISOString() }))
    );
    showToast("All active user sessions have been terminated.");
  };

  const handleExportCsv = () => {
    const headers = ["Session ID", "User", "Email", "Role", "Branch", "Login Time", "Last Activity", "Duration (mins)", "Device", "Browser", "OS", "IP Address", "Status"];
    const rows = filteredSessions.map((s) => [
      `"${s.sessionId}"`,
      `"${s.userName}"`,
      `"${s.userEmail}"`,
      `"${s.role}"`,
      `"${s.branch}"`,
      `"${new Date(s.loginTime).toLocaleString()}"`,
      `"${new Date(s.lastActivity).toLocaleString()}"`,
      s.durationMinutes,
      `"${s.device}"`,
      `"${s.browser}"`,
      `"${s.os}"`,
      `"${s.ipAddress}"`,
      `"${s.status}"`
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `thinksales_login_sessions_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  // KPIs
  const activeCount = sessions.filter((s) => s.status === "active").length;
  const timedOutCount = sessions.filter((s) => s.status === "timed_out").length;
  const avgDuration = Math.round(
    sessions.reduce((acc, s) => acc + s.durationMinutes, 0) / (sessions.length || 1)
  );

  const filteredSessions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessions.filter((s) => {
      if (q && !s.userName.toLowerCase().includes(q) && !s.userEmail.toLowerCase().includes(q) && !s.ipAddress.toLowerCase().includes(q) && !s.device.toLowerCase().includes(q)) {
        return false;
      }
      if (statusFilter !== "all" && s.status !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [sessions, search, statusFilter]);

  return (
    <div className="space-y-4">
      
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-16 right-6 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-2xl animate-in slide-in-from-top-3 border border-slate-700">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-2xl border border-ledger-200 bg-white shadow-sm dark:border-ledger-800 dark:bg-slate-900">
        <div>
          <div className="flex items-center gap-2">
            <Laptop className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-bold text-ink-900 dark:text-white">Active Login Sessions & Device Monitoring</h2>
          </div>
          <p className="text-xs text-ledger-500 dark:text-ledger-400">
            Real-time tracking of authenticated devices, IP geolocations, inactivity timeouts, and force-logout controls
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleExportCsv} className="h-8 text-xs">
            <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
          </Button>

          <Button size="sm" variant="outline" onClick={handlePrint} className="h-8 text-xs">
            <Printer className="h-3.5 w-3.5 mr-1" /> Print
          </Button>

          {canManage && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleEndAllSessions}
              className="h-8 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 border-red-200 dark:border-red-900 font-bold"
            >
              <LogOut className="h-3.5 w-3.5 mr-1" /> End All User Sessions
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl border border-ledger-100 bg-white dark:border-ledger-800 dark:bg-slate-900 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ledger-400">Live Active Sessions</span>
          <div className="flex items-center gap-2 mt-1">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xl font-bold text-ink-900 dark:text-white">{activeCount}</span>
          </div>
          <p className="text-[11px] text-emerald-600 mt-0.5">Authenticated users online</p>
        </div>

        <div className="p-4 rounded-2xl border border-ledger-100 bg-white dark:border-ledger-800 dark:bg-slate-900 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ledger-400">Avg Session Duration</span>
          <div className="flex items-center gap-2 mt-1">
            <Clock className="h-4 w-4 text-blue-600" />
            <span className="text-xl font-bold text-ink-900 dark:text-white">{avgDuration}m</span>
          </div>
          <p className="text-[11px] text-ledger-400 mt-0.5">Inactivity limit: 30 mins</p>
        </div>

        <div className="p-4 rounded-2xl border border-ledger-100 bg-white dark:border-ledger-800 dark:bg-slate-900 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ledger-400">Inactivity Timeouts</span>
          <div className="flex items-center gap-2 mt-1">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span className="text-xl font-bold text-ink-900 dark:text-white">{timedOutCount}</span>
          </div>
          <p className="text-[11px] text-amber-600 mt-0.5">Auto-terminated (30m)</p>
        </div>

        <div className="p-4 rounded-2xl border border-ledger-100 bg-white dark:border-ledger-800 dark:bg-slate-900 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ledger-400">Device Types</span>
          <p className="text-base font-bold text-ink-900 dark:text-white mt-1">65% Desktop / 35% Mobile</p>
          <p className="text-[11px] text-ledger-400 mt-0.5">Windows, macOS, iOS, Android</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-ledger-100 bg-white dark:border-ledger-800 dark:bg-slate-900">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ledger-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search user, IP, device..."
            className="h-8 pl-8 text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-ledger-400">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 rounded-lg border border-ledger-200 bg-white px-2.5 text-xs font-semibold dark:border-ledger-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="all">All Session Statuses</option>
            <option value="active">Active Now</option>
            <option value="timed_out">Timed Out</option>
            <option value="logged_out">Logged Out</option>
            <option value="expired">Expired</option>
          </select>
        </div>
      </div>

      {/* Sessions Data Table */}
      <div className="rounded-2xl border border-ledger-200 bg-white shadow-sm dark:border-ledger-800 dark:bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-ledger-100 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-ledger-400 dark:border-ledger-800 dark:bg-slate-800/60">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Device & Browser</th>
                <th className="px-3 py-3">IP Address</th>
                <th className="px-3 py-3">Login Time</th>
                <th className="px-3 py-3">Last Activity</th>
                <th className="px-3 py-3">Duration</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-ledger-100 dark:divide-ledger-800">
              {filteredSessions.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                  
                  {/* User */}
                  <td className="px-4 py-3">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="font-bold text-ink-900 dark:text-white">{s.userName}</p>
                        {s.isCurrent && (
                          <span className="rounded bg-blue-100 px-1.5 py-0.2 text-[9px] font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-ledger-400">{s.userEmail} • {s.branch}</p>
                    </div>
                  </td>

                  {/* Device & Browser */}
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-semibold text-ink-900 dark:text-white">{s.device}</p>
                      <p className="text-[11px] text-ledger-400 font-mono">{s.browser} ({s.os})</p>
                    </div>
                  </td>

                  {/* IP Address */}
                  <td className="px-3 py-3">
                    <p className="font-mono text-ink-900 dark:text-white">{s.ipAddress}</p>
                    <p className="text-[10px] text-ledger-400">{s.location}</p>
                  </td>

                  {/* Login Time */}
                  <td className="px-3 py-3 text-ledger-500 dark:text-ledger-400 font-mono text-[11px]">
                    {new Date(s.loginTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </td>

                  {/* Last Activity */}
                  <td className="px-3 py-3 text-ledger-500 dark:text-ledger-400 font-mono text-[11px]">
                    {new Date(s.lastActivity).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </td>

                  {/* Duration */}
                  <td className="px-3 py-3 font-semibold font-mono text-ink-900 dark:text-white">
                    {s.durationMinutes}m
                  </td>

                  {/* Status */}
                  <td className="px-3 py-3 whitespace-nowrap">
                    {s.status === "active" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Active
                      </span>
                    ) : s.status === "timed_out" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                        Timed Out
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        Logged Out
                      </span>
                    )}
                  </td>

                  {/* Action */}
                  <td className="px-4 py-3 text-right">
                    {s.status === "active" && !s.isCurrent && canManage && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEndSession(s.id, s.userName)}
                        className="h-7 text-[11px] text-red-600 hover:bg-red-50 dark:text-red-400 border-red-200 dark:border-red-900"
                      >
                        Force Logout
                      </Button>
                    )}
                  </td>

                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
