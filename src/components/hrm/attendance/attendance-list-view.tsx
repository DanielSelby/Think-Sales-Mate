"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import {
  Search, Filter, ChevronLeft, ChevronRight, Calendar, Download, LogIn, X, RefreshCw,
  Users, CheckCircle2, XCircle, Clock3, LogOut as LogOutIcon, Plus, Settings, Upload, FileBarChart,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ATTENDANCE_STATUS_LABEL, ATTENDANCE_STATUS_TONE, WORK_TYPES, formatTime } from "@/lib/hrm/attendance";
import { AttendanceRowMenu } from "@/components/hrm/attendance/attendance-row-menu";
import { KpiFlipCard } from "@/components/charts/kpi-flip-card";
import { MarkAttendanceDialog, type EmployeeOption, type EditingAttendance } from "@/components/hrm/attendance/mark-attendance-dialog";
import { checkIn, bulkMarkAbsent } from "@/app/(dashboard)/hrm/attendance/actions";
import type { AttendanceStatus } from "@/types/database";

export interface AttendanceRow {
  recordId: string | null;
  employeeId: string;
  employeeName: string;
  department: string | null;
  checkIn: string | null;
  checkOut: string | null;
  totalHours: number;
  status: AttendanceStatus;
  workType: string;
}

export interface AttendanceKpis {
  totalEmployees: number;
  present: number;
  absent: number;
  late: number;
  earlyLeave: number;
}

export interface LateArrival { employeeName: string; checkIn: string; jobTitle: string | null; }
export interface AttendanceActivity { id: string; label: string; createdAt: string; }

interface AttendanceListViewProps {
  date: string;
  rows: AttendanceRow[];
  kpis: AttendanceKpis;
  departments: string[];
  employeeOptions: EmployeeOption[];
  currentEmployee: EmployeeOption | null;
  lateArrivals: LateArrival[];
  recentActivity: AttendanceActivity[];
}

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  present: "#1d8f5e",
  late: "#a8781f",
  absent: "#b8402f",
  early_leave: "#a855f7",
  on_leave: "#68655c",
};

const ROWS_PER_PAGE_OPTIONS = [10, 25, 50];

export function AttendanceListView({ date, rows, kpis, departments, employeeOptions, currentEmployee, lateArrivals, recentActivity }: AttendanceListViewProps) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [department, setDepartment] = React.useState("all");
  const [status, setStatus] = React.useState<"all" | AttendanceStatus>("all");
  const [page, setPage] = React.useState(1);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);
  const [notice, setNotice] = React.useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<EditingAttendance | null>(null);
  const [checkInWorkType, setCheckInWorkType] = React.useState<string>(WORK_TYPES[0]);
  const [isPending, startTransition] = React.useTransition();

  function showNotice(message: string, tone: "success" | "error" = "success") {
    setNotice({ message, tone });
    setTimeout(() => setNotice(null), 4000);
  }

  function goToDate(newDate: string) {
    router.push(`/hrm/attendance?date=${newDate}`);
  }
  function shiftDate(days: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    goToDate(d.toISOString().slice(0, 10));
  }

  function handleSelfCheckIn() {
    if (!currentEmployee) return;
    startTransition(async () => {
      const result = await checkIn(currentEmployee.id, checkInWorkType);
      if (!result.ok) return showNotice(result.error ?? "Something went wrong.", "error");
      showNotice("Checked in");
      router.refresh();
    });
  }

  function handleBulkAbsent() {
    startTransition(async () => {
      const result = await bulkMarkAbsent(date);
      if (!result.ok) return showNotice(result.error ?? "Something went wrong.", "error");
      showNotice(`${result.marked ?? 0} employee(s) marked absent`);
      router.refresh();
    });
  }

  function openEdit(row: AttendanceRow) {
    setEditing({
      employeeId: row.employeeId, workDate: date, status: row.status,
      checkIn: row.checkIn, checkOut: row.checkOut, workType: row.workType, notes: null,
    });
    setDialogOpen(true);
  }
  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (department !== "all" && r.department !== department) return false;
      if (status !== "all" && r.status !== status) return false;
      if (q && !r.employeeName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, query, department, status]);

  const filteredKpis = React.useMemo(() => {
    const totalEmployees = filtered.length;
    const present = filtered.filter((r) => r.status === "present").length;
    const absent = filtered.filter((r) => r.status === "absent").length;
    const late = filtered.filter((r) => r.status === "late").length;
    const earlyLeave = filtered.filter((r) => r.status === "early_leave").length;
    return { totalEmployees, present, absent, late, earlyLeave };
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const clampedPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((clampedPage - 1) * rowsPerPage, clampedPage * rowsPerPage);

  function exportCsv() {
    const header = ["Employee", "Department", "Check In", "Check Out", "Total Hours", "Status", "Work Type"];
    const csvRows = filtered.map((r) => [r.employeeName, r.department ?? "", formatTime(r.checkIn), formatTime(r.checkOut), r.totalHours, ATTENDANCE_STATUS_LABEL[r.status], r.workType]);
    const csv = [header, ...csvRows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const donutTotal = kpis.present + kpis.absent + kpis.late + kpis.earlyLeave;
  const donutData = [
    { name: "Present", value: kpis.present, color: STATUS_COLORS.present },
    { name: "Late", value: kpis.late, color: STATUS_COLORS.late },
    { name: "Absent", value: kpis.absent, color: STATUS_COLORS.absent },
    { name: "Early Leave", value: kpis.earlyLeave, color: STATUS_COLORS.early_leave },
  ].filter((d) => d.value > 0);

  const alreadyCheckedIn = currentEmployee ? rows.some((r) => r.employeeId === currentEmployee.id && r.checkIn) : false;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">Attendance</h1>
          <p className="mt-0.5 text-sm text-ledger-500 dark:text-ledger-400">Home &gt; HRM &amp; Payroll &gt; Attendance</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-ledger-200 bg-white px-3 py-1.5 text-sm dark:border-ledger-700 dark:bg-ink-900">
            <Calendar className="h-4 w-4 text-ledger-400" />
            {new Date(date).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" })}
          </div>
          <button onClick={() => shiftDate(-1)} className="rounded-md border border-ledger-200 p-2 text-ledger-500 hover:bg-ledger-50 dark:border-ledger-700"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => shiftDate(1)} className="rounded-md border border-ledger-200 p-2 text-ledger-500 hover:bg-ledger-50 dark:border-ledger-700"><ChevronRight className="h-4 w-4" /></button>
          <Button variant="outline" size="md" onClick={() => goToDate(new Date().toISOString().slice(0, 10))}>Today</Button>
          {currentEmployee ? (
            <Button variant="primary" size="md" onClick={handleSelfCheckIn} disabled={alreadyCheckedIn || isPending}>
              <LogIn className="h-4 w-4" /> {alreadyCheckedIn ? "Checked In" : "Check In"}
            </Button>
          ) : (
            <Button variant="outline" size="md" disabled title="No employee record matches your account email">
              <LogIn className="h-4 w-4" /> Check In
            </Button>
          )}
          <Button variant="outline" size="md" onClick={exportCsv}><Download className="h-4 w-4" /> Export</Button>
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
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
            <KpiFlipCard color="blue" label="Total Employees" value={`${filteredKpis.totalEmployees}`} icon={<Users className="h-full w-full" />} detail="Number of attendance rows matching the current filters." />
            <KpiFlipCard color="green" label="Present Today" value={`${filteredKpis.present} (${filteredKpis.totalEmployees ? Math.round((filteredKpis.present / filteredKpis.totalEmployees) * 100) : 0}%)`} icon={<CheckCircle2 className="h-full w-full" />} detail="Filtered employees marked Present today." featured />
            <KpiFlipCard color="red" label="Absent Today" value={`${filteredKpis.absent} (${filteredKpis.totalEmployees ? Math.round((filteredKpis.absent / filteredKpis.totalEmployees) * 100) : 0}%)`} icon={<XCircle className="h-full w-full" />} detail="Filtered employees marked Absent today." />
            <KpiFlipCard color="amber" label="Late Today" value={`${filteredKpis.late} (${filteredKpis.totalEmployees ? Math.round((filteredKpis.late / filteredKpis.totalEmployees) * 100) : 0}%)`} icon={<Clock3 className="h-full w-full" />} detail="Filtered employees marked Late today." />
            <KpiFlipCard color="purple" label="Early Leave" value={`${filteredKpis.earlyLeave} (${filteredKpis.totalEmployees ? Math.round((filteredKpis.earlyLeave / filteredKpis.totalEmployees) * 100) : 0}%)`} icon={<LogOutIcon className="h-full w-full" />} detail="Filtered employees who left early today." />
          </div>

          {/* Filters */}
          <Card accent="neutral">
            <CardContent className="pt-5">
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-44">
                  <label className="mb-1 block text-xs font-medium text-ledger-500">Department</label>
                  <Select value={department} onChange={(e) => { setDepartment(e.target.value); setPage(1); }}>
                    <option value="all">All Departments</option>
                    {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                  </Select>
                </div>
                <div className="w-36">
                  <label className="mb-1 block text-xs font-medium text-ledger-500">Status</label>
                  <Select value={status} onChange={(e) => { setStatus(e.target.value as "all" | AttendanceStatus); setPage(1); }}>
                    <option value="all">All Status</option>
                    {(["present", "late", "absent", "early_leave", "on_leave"] as AttendanceStatus[]).map((s) => <option key={s} value={s}>{ATTENDANCE_STATUS_LABEL[s]}</option>)}
                  </Select>
                </div>
                <div className="relative min-w-[200px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ledger-400" />
                  <Input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search employees..." className="pl-9" />
                </div>
                <Button variant="outline" size="md"><Filter className="h-4 w-4" /> Filters</Button>
                <Button variant="ghost" size="md" onClick={() => { setQuery(""); setDepartment("all"); setStatus("all"); setPage(1); }}>
                  <RefreshCw className="h-4 w-4" /> Clear
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card accent="neutral" className="overflow-hidden">
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Attendance Records</CardTitle>
              <Button variant="outline" size="sm" onClick={handleBulkAbsent} disabled={isPending}>Mark Unrecorded as Absent</Button>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-white dark:bg-ink-900">
                  <tr className="border-b border-ledger-100 text-ledger-400 dark:border-ledger-700">
                    <th className="w-8 px-3 py-3 font-medium">#</th>
                    <th className="px-3 py-3 font-medium">Employee</th>
                    <th className="px-3 py-3 font-medium">Department</th>
                    <th className="px-3 py-3 font-medium">Check In</th>
                    <th className="px-3 py-3 font-medium">Check Out</th>
                    <th className="px-3 py-3 font-medium">Total Hours</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Work Type</th>
                    <th className="px-3 py-3 pr-4 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700">
                  {pageRows.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-12 text-center text-ledger-400">No employees match your filters.</td></tr>
                  )}
                  {pageRows.map((r, i) => (
                    <tr key={r.employeeId} className="hover:bg-ledger-50/60 dark:hover:bg-white/[0.03]">
                      <td className="px-3 py-3 text-ledger-400">{(clampedPage - 1) * rowsPerPage + i + 1}</td>
                      <td className="px-3 py-3 text-ink-900 dark:text-white">{r.employeeName}</td>
                      <td className="px-3 py-3">{r.department ? <Badge tone="neutral">{r.department}</Badge> : "—"}</td>
                      <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">{formatTime(r.checkIn)}</td>
                      <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">{formatTime(r.checkOut)}</td>
                      <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">{r.totalHours > 0 ? `${Math.floor(r.totalHours)}h ${Math.round((r.totalHours % 1) * 60)}m` : "0h 00m"}</td>
                      <td className="px-3 py-3"><Badge tone={ATTENDANCE_STATUS_TONE[r.status]}>{ATTENDANCE_STATUS_LABEL[r.status]}</Badge></td>
                      <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">{r.recordId ? r.workType : "—"}</td>
                      <td className="px-3 py-3 pr-4">
                        <AttendanceRowMenu recordId={r.recordId} hasCheckOut={!!r.checkOut} onEdit={() => openEdit(r)} onNotice={showNotice} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ledger-100 px-4 py-3 dark:border-ledger-700">
              <p className="text-sm text-ledger-500">Showing {pageRows.length === 0 ? 0 : (clampedPage - 1) * rowsPerPage + 1}–{(clampedPage - 1) * rowsPerPage + pageRows.length} of {filtered.length} records</p>
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

        {/* Analytics */}
        <div className="space-y-5">
          <Card accent="neutral">
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Attendance Overview (Today)</CardTitle></CardHeader>
            <CardContent className="pt-0">
              {donutTotal === 0 ? <p className="text-sm text-ledger-400">No attendance recorded yet.</p> : (
                <>
                  <div className="relative mx-auto h-36 w-36">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={donutData} dataKey="value" innerRadius={42} outerRadius={62} paddingAngle={2}>
                          {donutData.map((d, i) => <Cell key={i} fill={d.color} stroke="none" />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="font-display text-lg font-semibold text-ink-900 dark:text-white">{kpis.totalEmployees}</span>
                      <span className="text-[10px] text-ledger-400">Total</span>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {donutData.map((d) => (
                      <div key={d.name} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-ledger-500"><span className="h-2 w-2 rounded-full" style={{ background: d.color }} /> {d.name}</span>
                        <span className="font-medium text-ink-900 dark:text-white">{d.value} ({Math.round((d.value / kpis.totalEmployees) * 100)}%)</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card accent="neutral">
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Late Arrivals (Today)</CardTitle></CardHeader>
            <CardContent className="space-y-2.5 pt-0">
              {lateArrivals.length === 0 && <p className="text-sm text-ledger-400">No late arrivals today.</p>}
              {lateArrivals.map((l, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="text-ink-900 dark:text-white">{l.employeeName}</p>
                    <p className="text-xs text-ledger-400">{l.jobTitle ?? "—"}</p>
                  </div>
                  <span className="font-mono text-xs text-amber">{formatTime(l.checkIn)}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card accent="neutral">
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Recent Attendance Activity</CardTitle></CardHeader>
            <CardContent className="space-y-2.5 pt-0">
              {recentActivity.length === 0 && <p className="text-sm text-ledger-400">No recent activity.</p>}
              {recentActivity.map((a) => (
                <div key={a.id} className="text-sm">
                  <p className="text-ink-900 dark:text-white">{a.label}</p>
                  <p className="text-xs text-ledger-400">{new Date(a.createdAt).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card accent="neutral">
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Quick Actions</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 pt-0">
              <QuickAction icon={Plus} label="Add Manual Entry" onClick={openAdd} />
              <QuickAction icon={Settings} label="Attendance Settings" disabled />
              <QuickAction icon={Upload} label="Import Attendance" disabled />
              <QuickAction icon={FileBarChart} label="Generate Report" onClick={exportCsv} />
            </CardContent>
          </Card>
        </div>
      </div>

      <MarkAttendanceDialog open={dialogOpen} onClose={() => setDialogOpen(false)} employees={employeeOptions} selectedDate={date} editing={editing} onSaved={() => showNotice("Attendance saved")} />
    </div>
  );
}


function QuickAction({ icon: Icon, label, onClick, disabled }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} title={disabled ? "Not built yet" : undefined} className={cn("flex flex-col items-center gap-1.5 rounded-md border border-ledger-100 p-3 text-center text-xs dark:border-ledger-700", disabled ? "opacity-40" : "hover:border-ledger-300 hover:bg-ledger-50 dark:hover:bg-white/[0.06]")}>
      <Icon className="h-4 w-4 text-ledger-500" />
      <span className="text-ledger-600 dark:text-ledger-300">{label}</span>
    </button>
  );
}