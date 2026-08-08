"use client";

import * as React from "react";
import Link from "next/link";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Search, Filter, Plus, Download, Upload, X, RefreshCw, Users, UserCheck, CalendarOff, Building2, UserPlus2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardValue } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  EMPLOYMENT_TYPE_LABEL, EMPLOYMENT_TYPE_TONE, EMPLOYEE_STATUS_LABEL, EMPLOYEE_STATUS_TONE,
  deriveEmployeeStatus, formatEmployeeCode, type EmployeeDisplayStatus,
} from "@/lib/hrm/format";
import { EmployeeRowMenu } from "@/components/hrm/employees/employee-row-menu";
import type { EmploymentType } from "@/types/database";

export interface EmployeeRow {
  id: string;
  name: string;
  email: string | null;
  employeeNumber: number;
  department: string | null;
  jobTitle: string | null;
  employmentType: EmploymentType;
  monthlySalary: number;
  status: "active" | "inactive";
  onLeaveUntil: string | null;
  hireDate: string;
}

export interface EmployeeKpis {
  totalEmployees: number;
  activeEmployees: number;
  onLeave: number;
  departmentCount: number;
  newHiresThisMonth: number;
}

export interface EmploymentTypeSlice { type: EmploymentType; count: number; }
export interface DepartmentSlice { department: string; count: number; }
export interface RecentHire { id: string; name: string; jobTitle: string | null; hireDate: string; }

interface EmployeeListViewProps {
  employees: EmployeeRow[];
  kpis: EmployeeKpis;
  currency: string;
  departments: string[];
  employmentOverview: EmploymentTypeSlice[];
  departmentDistribution: DepartmentSlice[];
  recentHires: RecentHire[];
}

const OVERVIEW_COLORS: Record<EmploymentType, string> = {
  full_time: "#1d8f5e",
  contract: "#a8781f",
  part_time: "#3b82f6",
  intern: "#68655c",
};
const ROWS_PER_PAGE_OPTIONS = [10, 25, 50];

export function EmployeeListView({ employees, kpis, currency, departments, employmentOverview, departmentDistribution, recentHires }: EmployeeListViewProps) {
  const [query, setQuery] = React.useState("");
  const [department, setDepartment] = React.useState("all");
  const [employmentType, setEmploymentType] = React.useState<"all" | EmploymentType>("all");
  const [status, setStatus] = React.useState<"all" | EmployeeDisplayStatus>("all");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [page, setPage] = React.useState(1);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);
  const [notice, setNotice] = React.useState<{ message: string; tone: "success" | "error" } | null>(null);

  function showNotice(message: string, tone: "success" | "error" = "success") {
    setNotice({ message, tone });
    setTimeout(() => setNotice(null), 4000);
  }

  const withDisplayStatus = React.useMemo(
    () => employees.map((e) => ({ ...e, displayStatus: deriveEmployeeStatus(e.status, e.onLeaveUntil) })),
    [employees]
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return withDisplayStatus.filter((e) => {
      if (department !== "all" && e.department !== department) return false;
      if (employmentType !== "all" && e.employmentType !== employmentType) return false;
      if (status !== "all" && e.displayStatus !== status) return false;
      if (q) {
        const matches = e.name.toLowerCase().includes(q) || formatEmployeeCode(e.employeeNumber).toLowerCase().includes(q) || (e.email ?? "").toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [withDisplayStatus, query, department, employmentType, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const clampedPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((clampedPage - 1) * rowsPerPage, clampedPage * rowsPerPage);
  const allChecked = pageRows.length > 0 && pageRows.every((r) => selected.includes(r.id));

  function toggleAll() {
    if (allChecked) setSelected((prev) => prev.filter((id) => !pageRows.some((r) => r.id === id)));
    else setSelected((prev) => Array.from(new Set([...prev, ...pageRows.map((r) => r.id)])));
  }
  function toggleRow(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function exportCsv() {
    const header = ["Employee ID", "Name", "Email", "Department", "Position", "Employment Type", "Status", "Joining Date", "Monthly Salary"];
    const rows = filtered.map((e) => [
      formatEmployeeCode(e.employeeNumber), e.name, e.email ?? "", e.department ?? "", e.jobTitle ?? "",
      EMPLOYMENT_TYPE_LABEL[e.employmentType], EMPLOYEE_STATUS_LABEL[e.displayStatus], e.hireDate, e.monthlySalary,
    ]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `employees-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const overviewTotal = employmentOverview.reduce((sum, o) => sum + o.count, 0);
  const maxDeptCount = Math.max(1, ...departmentDistribution.map((d) => d.count));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">Employees</h1>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-ledger-500 dark:text-ledger-400">Home &gt; HRM &amp; Payroll &gt; Employees</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="md"><Upload className="h-4 w-4" /> Import</Button>
          <Button variant="outline" size="md" onClick={exportCsv}><Download className="h-4 w-4" /> Export</Button>
          <Link href="/hrm/employees/new" className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-ink-900 px-4 text-sm font-medium text-white shadow-sm hover:bg-ink-950 dark:bg-white dark:text-ink-900">
            <Plus className="h-4 w-4" /> Add Employee
          </Link>
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
            <Kpi icon={Users} accent="neutral" label="Total Employees" value={`${kpis.totalEmployees}`} />
            <Kpi icon={UserCheck} accent="signal" label="Active Employees" value={`${kpis.activeEmployees}`} />
            <Kpi icon={CalendarOff} accent="amber" label="On Leave" value={`${kpis.onLeave}`} />
            <Kpi icon={Building2} accent="neutral" label="Departments" value={`${kpis.departmentCount}`} />
            <Kpi icon={UserPlus2} accent="signal" label="New Hires (This Month)" value={`${kpis.newHiresThisMonth}`} />
          </div>

          {/* Filters */}
          <Card accent="neutral">
            <CardContent className="pt-5">
              <div className="flex flex-wrap items-end gap-3">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ledger-400" />
                  <Input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search employees by name, ID, email..." className="pl-9" />
                </div>
                <div className="w-44">
                  <label className="mb-1 block text-xs font-medium text-ledger-500">Department</label>
                  <Select value={department} onChange={(e) => { setDepartment(e.target.value); setPage(1); }}>
                    <option value="all">All Departments</option>
                    {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                  </Select>
                </div>
                <div className="w-40">
                  <label className="mb-1 block text-xs font-medium text-ledger-500">Employment Type</label>
                  <Select value={employmentType} onChange={(e) => { setEmploymentType(e.target.value as "all" | EmploymentType); setPage(1); }}>
                    <option value="all">All Types</option>
                    <option value="full_time">Full Time</option>
                    <option value="part_time">Part Time</option>
                    <option value="contract">Contract</option>
                    <option value="intern">Intern</option>
                  </Select>
                </div>
                <div className="w-36">
                  <label className="mb-1 block text-xs font-medium text-ledger-500">Status</label>
                  <Select value={status} onChange={(e) => { setStatus(e.target.value as "all" | EmployeeDisplayStatus); setPage(1); }}>
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="on_leave">On Leave</option>
                    <option value="inactive">Inactive</option>
                  </Select>
                </div>
                <Button variant="outline" size="md"><Filter className="h-4 w-4" /> More Filters</Button>
                <Button variant="ghost" size="md" onClick={() => { setQuery(""); setDepartment("all"); setEmploymentType("all"); setStatus("all"); setPage(1); }}>
                  <RefreshCw className="h-4 w-4" /> Clear
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card accent="neutral" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-white dark:bg-ink-900">
                  <tr className="border-b border-ledger-100 text-ledger-400 dark:border-ledger-700">
                    <th className="w-10 px-4 py-3"><input type="checkbox" checked={allChecked} onChange={toggleAll} className="h-4 w-4 rounded border-ledger-300 accent-signal" /></th>
                    <th className="w-8 px-3 py-3 font-medium">#</th>
                    <th className="px-3 py-3 font-medium">Employee</th>
                    <th className="px-3 py-3 font-medium">Employee ID</th>
                    <th className="px-3 py-3 font-medium">Department</th>
                    <th className="px-3 py-3 font-medium">Position</th>
                    <th className="px-3 py-3 font-medium">Employment Type</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Joining Date</th>
                    <th className="px-3 py-3 pr-4 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700">
                  {pageRows.length === 0 && (
                    <tr><td colSpan={10} className="px-4 py-12 text-center text-ledger-400">No employees match your filters.</td></tr>
                  )}
                  {pageRows.map((e, i) => (
                    <tr key={e.id} className="hover:bg-ledger-50/60 dark:hover:bg-white/[0.03]">
                      <td className="px-4 py-3"><input type="checkbox" checked={selected.includes(e.id)} onChange={() => toggleRow(e.id)} className="h-4 w-4 rounded border-ledger-300 accent-signal" /></td>
                      <td className="px-3 py-3 text-ledger-400">{(clampedPage - 1) * rowsPerPage + i + 1}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-900 text-xs font-semibold text-white dark:bg-white dark:text-ink-900">
                            {e.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink-900 dark:text-white">{e.name}</p>
                            <p className="truncate text-xs text-ledger-400">{e.email ?? "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-ledger-500">{formatEmployeeCode(e.employeeNumber)}</td>
                      <td className="px-3 py-3">{e.department ? <Badge tone="neutral">{e.department}</Badge> : "—"}</td>
                      <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">{e.jobTitle ?? "—"}</td>
                      <td className="px-3 py-3"><Badge tone={EMPLOYMENT_TYPE_TONE[e.employmentType]}>{EMPLOYMENT_TYPE_LABEL[e.employmentType]}</Badge></td>
                      <td className="px-3 py-3"><Badge tone={EMPLOYEE_STATUS_TONE[e.displayStatus]}>{EMPLOYEE_STATUS_LABEL[e.displayStatus]}</Badge></td>
                      <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">{new Date(e.hireDate).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" })}</td>
                      <td className="px-3 py-3 pr-4">
                        <EmployeeRowMenu employeeId={e.id} employeeName={e.name} status={e.status} onNotice={showNotice} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ledger-100 px-4 py-3 dark:border-ledger-700">
              <p className="text-sm text-ledger-500">
                Showing {pageRows.length === 0 ? 0 : (clampedPage - 1) * rowsPerPage + 1}–{(clampedPage - 1) * rowsPerPage + pageRows.length} of {filtered.length} employees
              </p>
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
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Employee Overview</CardTitle></CardHeader>
            <CardContent className="pt-0">
              {overviewTotal === 0 ? <p className="text-sm text-ledger-400">No employees yet.</p> : (
                <>
                  <div className="relative mx-auto h-36 w-36">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={employmentOverview.map((o) => ({ name: EMPLOYMENT_TYPE_LABEL[o.type], value: o.count }))} dataKey="value" innerRadius={42} outerRadius={62} paddingAngle={2}>
                          {employmentOverview.map((o, i) => <Cell key={i} fill={OVERVIEW_COLORS[o.type]} stroke="none" />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="font-display text-lg font-semibold text-ink-900 dark:text-white">{overviewTotal}</span>
                      <span className="text-[10px] text-ledger-400">Total</span>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {employmentOverview.map((o) => (
                      <div key={o.type} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-ledger-500"><span className="h-2 w-2 rounded-full" style={{ background: OVERVIEW_COLORS[o.type] }} /> {EMPLOYMENT_TYPE_LABEL[o.type]}</span>
                        <span className="font-medium text-ink-900 dark:text-white">{o.count} ({Math.round((o.count / overviewTotal) * 100)}%)</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card accent="neutral">
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Department Distribution</CardTitle></CardHeader>
            <CardContent className="space-y-3 pt-0">
              {departmentDistribution.length === 0 && <p className="text-sm text-ledger-400">No departments yet.</p>}
              {departmentDistribution.map((d) => (
                <div key={d.department}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="truncate text-ink-900 dark:text-white">{d.department}</span>
                    <span className="font-mono text-xs text-ledger-500">{d.count}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-ledger-100 dark:bg-white/[0.06]">
                    <div className="h-1.5 rounded-full bg-signal" style={{ width: `${(d.count / maxDeptCount) * 100}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card accent="neutral">
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Recent Hires</CardTitle></CardHeader>
            <CardContent className="space-y-2.5 pt-0">
              {recentHires.length === 0 && <p className="text-sm text-ledger-400">No recent hires.</p>}
              {recentHires.map((h) => (
                <div key={h.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="text-ink-900 dark:text-white">{h.name}</p>
                    <p className="text-xs text-ledger-400">{h.jobTitle ?? "—"}</p>
                  </div>
                  <span className="text-xs text-ledger-400">{new Date(h.hireDate).toLocaleDateString("en-GH", { day: "2-digit", month: "short" })}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, accent, label, value }: { icon: React.ComponentType<{ className?: string }>; accent: "neutral" | "signal" | "alert" | "amber"; label: string; value: string }) {
  return (
    <Card accent={accent}>
      <CardHeader className="pb-1"><div className="flex items-center gap-2"><Icon className="h-4 w-4 text-ledger-400" /><CardTitle>{label}</CardTitle></div></CardHeader>
      <CardContent className="pt-0"><CardValue className="text-xl">{value}</CardValue></CardContent>
    </Card>
  );
}