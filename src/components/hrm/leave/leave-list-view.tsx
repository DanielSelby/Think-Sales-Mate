"use client";

import * as React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import {
  Search, Filter, Plus, Download, X, RefreshCw, Users, CalendarOff, Clock3, CheckCircle2, XCircle,
  ChevronLeft, ChevronRight, Settings,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  LEAVE_STATUS_LABEL, LEAVE_STATUS_TONE, BALANCE_BUCKET_LABEL, BALANCE_BUCKET_COLOR, type BalanceBucket,
} from "@/lib/hrm/leave";
import { LeaveRowMenu } from "@/components/hrm/leave/leave-row-menu";
import { KpiFlipCard } from "@/components/charts/kpi-flip-card";
import { NewLeaveRequestDialog, type EmployeeOption } from "@/components/hrm/leave/new-leave-request-dialog";
import type { LeaveTypeOption } from "@/app/(dashboard)/hrm/leave/actions";
import type { LeaveStatus } from "@/types/database";

export interface LeaveRequestRow {
  id: string;
  employeeName: string;
  department: string | null;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  status: LeaveStatus;
  appliedOn: string;
}

export interface LeaveKpis {
  totalEmployees: number;
  onLeaveToday: number;
  pendingRequests: number;
  approvedThisMonth: number;
  rejectedThisMonth: number;
}

export interface BalanceBucketSlice { bucket: BalanceBucket; count: number; }
export interface LeaveTypeSummarySlice { name: string; count: number; }
export interface UpcomingLeave { id: string; employeeName: string; leaveTypeName: string; startDate: string; endDate: string; }
export interface CalendarLeaveDay { date: string; employeeNames: string[]; }

interface LeaveListViewProps {
  requests: LeaveRequestRow[];
  kpis: LeaveKpis;
  departments: string[];
  leaveTypes: LeaveTypeOption[];
  employees: EmployeeOption[];
  balanceOverview: BalanceBucketSlice[];
  typeSummary: LeaveTypeSummarySlice[];
  upcomingLeaves: UpcomingLeave[];
  calendarDays: CalendarLeaveDay[];
}

const ROWS_PER_PAGE_OPTIONS = [10, 25, 50];

export function LeaveListView({
  requests, kpis, departments, leaveTypes, employees, balanceOverview, typeSummary, upcomingLeaves, calendarDays,
}: LeaveListViewProps) {
  const [query, setQuery] = React.useState("");
  const [department, setDepartment] = React.useState("all");
  const [leaveType, setLeaveType] = React.useState("all");
  const [status, setStatus] = React.useState<"all" | LeaveStatus>("all");
  const [page, setPage] = React.useState(1);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);
  const [notice, setNotice] = React.useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [calendarMonth, setCalendarMonth] = React.useState(() => new Date());

  function showNotice(message: string, tone: "success" | "error" = "success") {
    setNotice({ message, tone });
    setTimeout(() => setNotice(null), 4000);
  }

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return requests.filter((r) => {
      if (department !== "all" && r.department !== department) return false;
      if (leaveType !== "all" && r.leaveTypeName !== leaveType) return false;
      if (status !== "all" && r.status !== status) return false;
      if (q && !r.employeeName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [requests, query, department, leaveType, status]);

  const filteredKpis = React.useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayIso = now.toISOString().slice(0, 10);
    const onLeaveToday = filtered.filter((r) => r.status === "approved" && r.startDate <= todayIso && r.endDate >= todayIso).length;
    const pendingRequests = filtered.filter((r) => r.status === "pending").length;
    const approvedThisMonth = filtered.filter((r) => r.status === "approved" && new Date(r.appliedOn) >= startOfMonth).length;
    const rejectedThisMonth = filtered.filter((r) => r.status === "rejected" && new Date(r.appliedOn) >= startOfMonth).length;
    return { onLeaveToday, pendingRequests, approvedThisMonth, rejectedThisMonth };
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const clampedPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((clampedPage - 1) * rowsPerPage, clampedPage * rowsPerPage);

  function exportCsv() {
    const header = ["Employee", "Department", "Leave Type", "Start Date", "End Date", "Duration", "Status", "Applied On"];
    const rows = filtered.map((r) => [r.employeeName, r.department ?? "", r.leaveTypeName, r.startDate, r.endDate, r.durationDays, LEAVE_STATUS_LABEL[r.status], r.appliedOn]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leave-requests-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const balanceTotal = balanceOverview.reduce((sum, b) => sum + b.count, 0);
  const maxTypeCount = Math.max(1, ...typeSummary.map((t) => t.count));

  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = firstDay.getDay();
  const leaveByDate = new Map(calendarDays.map((d) => [d.date, d.employeeNames]));
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">Leave Management</h1>
          <p className="mt-0.5 text-sm text-ledger-500 dark:text-ledger-400">Home &gt; HRM &amp; Payroll &gt; Leave Management</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="md" onClick={exportCsv}><Download className="h-4 w-4" /> Export Report</Button>
          <Button variant="outline" size="md" disabled title="Not built yet"><Settings className="h-4 w-4" /> Leave Settings</Button>
          <Button variant="primary" size="md" onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4" /> New Leave Request</Button>
        </div>
      </div>

      {notice && (
        <div className={cn(
          "flex items-center justify-between gap-2 rounded-md border px-4 py-2.5 text-sm",
          notice.tone === "success" ? "border-signal/30 bg-signal-soft text-ink-900 dark:bg-signal/10 dark:text-white" : "border-alert/30 bg-alert-soft text-alert"
        )}>
          {notice.message}
          <button onClick={() => setNotice(null)}><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
            <KpiFlipCard color="blue" label="Total Employees" value={`${kpis.totalEmployees}`} icon={<Users className="h-full w-full" />} detail="Org-wide employee headcount — not scoped to these leave filters." />
            <KpiFlipCard color="green" label="On Leave Today" value={`${filteredKpis.onLeaveToday}`} icon={<CalendarOff className="h-full w-full" />} detail="Filtered, approved requests covering today's date." featured />
            <KpiFlipCard color="amber" label="Pending Requests" value={`${filteredKpis.pendingRequests}`} icon={<Clock3 className="h-full w-full" />} detail="Filtered requests awaiting a decision." />
            <KpiFlipCard color="teal" label="Approved (This Month)" value={`${filteredKpis.approvedThisMonth}`} icon={<CheckCircle2 className="h-full w-full" />} detail="Filtered requests approved since the 1st of this month." />
            <KpiFlipCard color="red" label="Rejected (This Month)" value={`${filteredKpis.rejectedThisMonth}`} icon={<XCircle className="h-full w-full" />} detail="Filtered requests rejected since the 1st of this month." />
          </div>

          <Card accent="neutral">
            <CardContent className="pt-5">
              <div className="flex flex-wrap items-end gap-3">
                <div className="relative min-w-[200px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ledger-400" />
                  <Input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search by employee name, ID..." className="pl-9" />
                </div>
                <div className="w-40">
                  <label className="mb-1 block text-xs font-medium text-ledger-500">Department</label>
                  <Select value={department} onChange={(e) => { setDepartment(e.target.value); setPage(1); }}>
                    <option value="all">All Departments</option>
                    {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                  </Select>
                </div>
                <div className="w-40">
                  <label className="mb-1 block text-xs font-medium text-ledger-500">Leave Type</label>
                  <Select value={leaveType} onChange={(e) => { setLeaveType(e.target.value); setPage(1); }}>
                    <option value="all">All Leave Types</option>
                    {leaveTypes.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                  </Select>
                </div>
                <div className="w-36">
                  <label className="mb-1 block text-xs font-medium text-ledger-500">Status</label>
                  <Select value={status} onChange={(e) => { setStatus(e.target.value as "all" | LeaveStatus); setPage(1); }}>
                    <option value="all">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </Select>
                </div>
                <Button variant="outline" size="md"><Filter className="h-4 w-4" /> Filters</Button>
                <Button variant="ghost" size="md" onClick={() => { setQuery(""); setDepartment("all"); setLeaveType("all"); setStatus("all"); setPage(1); }}>
                  <RefreshCw className="h-4 w-4" /> Clear
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card accent="neutral" className="overflow-hidden">
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Leave Requests</CardTitle></CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-white dark:bg-ink-900">
                  <tr className="border-b border-ledger-100 text-ledger-400 dark:border-ledger-700">
                    <th className="w-8 px-3 py-3 font-medium">#</th>
                    <th className="px-3 py-3 font-medium">Employee</th>
                    <th className="px-3 py-3 font-medium">Department</th>
                    <th className="px-3 py-3 font-medium">Leave Type</th>
                    <th className="px-3 py-3 font-medium">Start Date</th>
                    <th className="px-3 py-3 font-medium">End Date</th>
                    <th className="px-3 py-3 font-medium">Duration</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Applied On</th>
                    <th className="px-3 py-3 pr-4 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700">
                  {pageRows.length === 0 && (
                    <tr><td colSpan={10} className="px-4 py-12 text-center text-ledger-400">No leave requests match your filters.</td></tr>
                  )}
                  {pageRows.map((r, i) => (
                    <tr key={r.id} className="hover:bg-ledger-50/60 dark:hover:bg-white/[0.03]">
                      <td className="px-3 py-3 text-ledger-400">{(clampedPage - 1) * rowsPerPage + i + 1}</td>
                      <td className="px-3 py-3 text-ink-900 dark:text-white">{r.employeeName}</td>
                      <td className="px-3 py-3">{r.department ? <Badge tone="neutral">{r.department}</Badge> : "—"}</td>
                      <td className="px-3 py-3"><Badge tone="neutral">{r.leaveTypeName}</Badge></td>
                      <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">{new Date(r.startDate).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" })}</td>
                      <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">{new Date(r.endDate).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" })}</td>
                      <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">{r.durationDays} Day{r.durationDays === 1 ? "" : "s"}</td>
                      <td className="px-3 py-3"><Badge tone={LEAVE_STATUS_TONE[r.status]}>{LEAVE_STATUS_LABEL[r.status]}</Badge></td>
                      <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">{new Date(r.appliedOn).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" })}</td>
                      <td className="px-3 py-3 pr-4"><LeaveRowMenu requestId={r.id} status={r.status} onNotice={showNotice} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ledger-100 px-4 py-3 dark:border-ledger-700">
              <p className="text-sm text-ledger-500">Showing {pageRows.length === 0 ? 0 : (clampedPage - 1) * rowsPerPage + 1}–{(clampedPage - 1) * rowsPerPage + pageRows.length} of {filtered.length} requests</p>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-sm text-ledger-500">
                  Rows per page
                  <Select value={rowsPerPage} onChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(1); }} className="h-8 w-20">
                    {ROWS_PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                  </Select>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={clampedPage === 1} className="rounded-md border border-ledger-200 p-2 text-ledger-500 hover:bg-ledger-50 disabled:opacity-40 dark:border-ledger-700">‹</button>
                  <span className="px-2 text-sm text-ledger-600 dark:text-ledger-300">Page {clampedPage} of {totalPages}</span>
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={clampedPage === totalPages} className="rounded-md border border-ledger-200 p-2 text-ledger-500 hover:bg-ledger-50 disabled:opacity-40 dark:border-ledger-700">›</button>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card accent="neutral">
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Leave Balance Overview</CardTitle></CardHeader>
            <CardContent className="pt-0">
              {balanceTotal === 0 ? <p className="text-sm text-ledger-400">No balances recorded yet.</p> : (
                <>
                  <div className="relative mx-auto h-36 w-36">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={balanceOverview.map((b) => ({ name: BALANCE_BUCKET_LABEL[b.bucket], value: b.count }))} dataKey="value" innerRadius={42} outerRadius={62} paddingAngle={2}>
                          {balanceOverview.map((b, i) => <Cell key={i} fill={BALANCE_BUCKET_COLOR[b.bucket]} stroke="none" />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="font-display text-lg font-semibold text-ink-900 dark:text-white">{balanceTotal}</span>
                      <span className="text-[10px] text-ledger-400">Employees</span>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {balanceOverview.map((b) => (
                      <div key={b.bucket} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-ledger-500"><span className="h-2 w-2 rounded-full" style={{ background: BALANCE_BUCKET_COLOR[b.bucket] }} /> {BALANCE_BUCKET_LABEL[b.bucket]}</span>
                        <span className="font-medium text-ink-900 dark:text-white">{b.count} ({Math.round((b.count / balanceTotal) * 100)}%)</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card accent="neutral">
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Leave Calendar</CardTitle>
              <div className="flex items-center gap-1">
                <button onClick={() => setCalendarMonth(new Date(year, month - 1, 1))} className="rounded p-1 text-ledger-400 hover:bg-ledger-100 dark:hover:bg-white/[0.06]"><ChevronLeft className="h-3.5 w-3.5" /></button>
                <span className="text-xs text-ledger-500">{calendarMonth.toLocaleDateString("en-GH", { month: "short", year: "numeric" })}</span>
                <button onClick={() => setCalendarMonth(new Date(year, month + 1, 1))} className="rounded p-1 text-ledger-400 hover:bg-ledger-100 dark:hover:bg-white/[0.06]"><ChevronRight className="h-3.5 w-3.5" /></button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-ledger-400">
                {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => <div key={d}>{d}</div>)}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {Array.from({ length: startWeekday }).map((_, i) => <div key={`pad-${i}`} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const dayNum = i + 1;
                  const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
                  const onLeave = leaveByDate.get(iso);
                  const isToday = iso === todayIso;
                  return (
                    <div
                      key={iso}
                      title={onLeave?.join(", ")}
                      className={cn(
                        "flex h-7 items-center justify-center rounded-md text-xs",
                        isToday && "ring-1 ring-signal",
                        onLeave ? "bg-amber-soft text-amber font-medium dark:bg-amber/10" : "text-ledger-600 dark:text-ledger-300"
                      )}
                    >
                      {dayNum}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card accent="neutral">
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Leave Type Summary (This Month)</CardTitle></CardHeader>
            <CardContent className="space-y-3 pt-0">
              {typeSummary.length === 0 && <p className="text-sm text-ledger-400">No requests this month.</p>}
              {typeSummary.map((t) => (
                <div key={t.name}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="truncate text-ink-900 dark:text-white">{t.name}</span>
                    <span className="font-mono text-xs text-ledger-500">{t.count}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-ledger-100 dark:bg-white/[0.06]">
                    <div className="h-1.5 rounded-full bg-signal" style={{ width: `${(t.count / maxTypeCount) * 100}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card accent="neutral">
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Upcoming Leaves</CardTitle></CardHeader>
            <CardContent className="space-y-2.5 pt-0">
              {upcomingLeaves.length === 0 && <p className="text-sm text-ledger-400">No upcoming leaves.</p>}
              {upcomingLeaves.map((u) => (
                <div key={u.id} className="text-sm">
                  <p className="text-ink-900 dark:text-white">{u.employeeName}</p>
                  <p className="text-xs text-ledger-400">{u.leaveTypeName} · {new Date(u.startDate).toLocaleDateString("en-GH", { day: "2-digit", month: "short" })} – {new Date(u.endDate).toLocaleDateString("en-GH", { day: "2-digit", month: "short" })}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <NewLeaveRequestDialog open={dialogOpen} onClose={() => setDialogOpen(false)} employees={employees} leaveTypes={leaveTypes} onCreated={() => showNotice("Leave request submitted")} />
    </div>
  );
}

