"use client";

import * as React from "react";
import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import {
  Users, Banknote, TrendingUp, TrendingDown, Clock3, Plus, PlayCircle, FileBarChart,
  CalendarClock, UserPlus, ClipboardCheck, Wallet, Receipt,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/sales/format";
import {
  EMPLOYMENT_TYPE_LABEL, EMPLOYMENT_TYPE_TONE, EMPLOYEE_STATUS_LABEL, EMPLOYEE_STATUS_TONE,
  deriveEmployeeStatus, formatEmployeeCode,
} from "@/lib/hrm/format";
import { PayrollKpi } from "@/components/hrm/payroll-kpi";
import type { EmploymentType } from "@/types/database";

export interface DashboardKpis {
  totalEmployees: number;
  totalPayrollThisMonth: number;
  netPayThisMonth: number;
  deductionsThisMonth: number;
  pendingPayments: number;
}

export interface PayrollHistoryPoint {
  label: string;
  gross: number;
  deductions: number;
  net: number;
}

export interface DistributionSlice {
  name: string;
  value: number;
}

export interface EmployeePreviewRow {
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
}

export interface UpcomingPayment {
  id: string;
  employeeName: string;
  amount: number;
  paymentDate: string;
}

export interface HrActivity {
  id: string;
  label: string;
  createdAt: string;
}

interface HrmDashboardViewProps {
  kpis: DashboardKpis;
  payrollHistory: PayrollHistoryPoint[];
  distribution: DistributionSlice[];
  employeesPreview: EmployeePreviewRow[];
  totalEmployeeCount: number;
  activeEmployeeCount: number;
  grossPayPreview: number;
  currency: string;
  upcomingPayments: UpcomingPayment[];
  recentActivity: HrActivity[];
}

const DISTRIBUTION_COLORS = ["#3b82f6", "#a855f7", "#b8402f", "#a8781f", "#68655c"];

export function HrmDashboardView({
  kpis, payrollHistory, distribution, employeesPreview, totalEmployeeCount, activeEmployeeCount,
  grossPayPreview, currency, upcomingPayments, recentActivity,
}: HrmDashboardViewProps) {
  const distributionTotal = distribution.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="mx-auto max-w-[1680px] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#dce8f2] bg-white p-4 shadow-sm dark:border-ledger-700 dark:bg-ink-900">
        <div>
          <p className="mb-1 text-[11px] font-semibold text-[var(--theme-primary)]">HRM &amp; Payroll <span className="mx-1 text-slate-300">›</span> Overview</p>
          <h1 className="text-xl font-bold text-[#12345a] dark:text-white">HRM &amp; Payroll Overview</h1>
          <p className="text-xs text-ledger-500 dark:text-ledger-400">Monitor employees, payroll costs and upcoming payments.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/hrm/employees/new" className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-xs font-semibold text-white shadow-sm" style={{ backgroundColor: "var(--theme-primary)" }}>
            <Plus className="h-4 w-4" /> Add Employee
          </Link>
          <Link href="/hrm/payroll" className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-200 dark:hover:bg-ink-800">
            <PlayCircle className="h-4 w-4" /> Run Payroll
          </Link>
          <Link href="/hrm/reports" className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-200 dark:hover:bg-ink-800">
            <FileBarChart className="h-4 w-4" /> Reports
          </Link>
          <Link href="/hrm/payslips" className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-200 dark:hover:bg-ink-800">
            <Receipt className="h-4 w-4" /> Payslips
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        <PayrollKpi tone="blue" label="Total Employees" value={`${kpis.totalEmployees}`} icon={<Users className="h-4 w-4" />} />
        <PayrollKpi tone="green" label="Total Payroll (This Month)" value={formatCurrency(kpis.totalPayrollThisMonth, currency)} icon={<Banknote className="h-4 w-4" />} />
        <PayrollKpi tone="teal" label="Net Pay (This Month)" value={formatCurrency(kpis.netPayThisMonth, currency)} icon={<TrendingUp className="h-4 w-4" />} />
        <PayrollKpi tone="purple" label="Deductions (This Month)" value={formatCurrency(kpis.deductionsThisMonth, currency)} icon={<TrendingDown className="h-4 w-4" />} />
        <PayrollKpi tone="orange" label="Pending Payments" value={`${kpis.pendingPayments}`} icon={<Clock3 className="h-4 w-4" />} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_360px]">
        {/* Payroll Overview */}
        <Card accent="neutral">
          <CardHeader className="pb-2">
            <CardTitle className="normal-case tracking-normal text-sm font-bold text-[#12345a] dark:text-white">Payroll Overview</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {payrollHistory.length === 0 ? (
              <p className="py-10 text-center text-sm text-ledger-400">No payroll runs yet — process your first payroll to see trends here.</p>
            ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
                <div>
                  <p className="mb-2 text-xs font-medium text-ledger-500">Gross Pay / Deductions / Net Pay by run</p>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={payrollHistory}>
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#b3ab97" />
                        <YAxis tick={{ fontSize: 11 }} stroke="#b3ab97" />
                        <Tooltip formatter={(v: number) => formatCurrency(v, currency)} />
                        <Bar dataKey="gross" name="Gross Pay" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="deductions" name="Deductions" fill="#b8402f" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="net" name="Net Pay" fill="#1d8f5e" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-ledger-500">Latest Run Distribution</p>
                  {distributionTotal === 0 ? (
                    <p className="text-sm text-ledger-400">No breakdown available.</p>
                  ) : (
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={distribution} dataKey="value" innerRadius={40} outerRadius={65} paddingAngle={2}>
                            {distribution.map((_, i) => <Cell key={i} fill={DISTRIBUTION_COLORS[i % DISTRIBUTION_COLORS.length]} stroke="none" />)}
                          </Pie>
                          <Tooltip formatter={(v: number) => formatCurrency(v, currency)} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payroll Run */}
        <Card accent="signal">
          <CardHeader className="pb-2">
            <CardTitle className="normal-case tracking-normal text-sm font-bold text-[#12345a] dark:text-white">Payroll Run</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 pt-0 text-sm">
            <Row label="Active Employees" value={`${activeEmployeeCount}`} />
            <Row label="Estimated Gross Pay" value={formatCurrency(grossPayPreview, currency)} />
            <div className="flex items-center justify-between">
              <span className="text-ledger-500">Status</span>
              <Badge tone="neutral">Not yet processed</Badge>
            </div>
            <Link href="/hrm/payroll" className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg px-4 text-xs font-semibold text-white shadow-sm disabled:opacity-50" style={{ backgroundColor: "var(--theme-primary)" }}>
              <PlayCircle className="h-4 w-4" /> Process Payroll
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_320px]">
        {/* Employees preview */}
        <Card accent="neutral" className="overflow-hidden">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="normal-case tracking-normal text-sm font-bold text-[#12345a] dark:text-white">Employees</CardTitle>
            <Link href="/hrm/employees" className="text-xs font-medium text-signal hover:underline">View all {totalEmployeeCount} →</Link>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto rounded-md border border-ledger-100 dark:border-ledger-700">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-ledger-100 bg-ledger-50/60 text-xs text-ledger-400 dark:border-ledger-700 dark:bg-white/[0.03]">
                    <th className="px-3 py-2 font-medium">Employee</th>
                    <th className="px-3 py-2 font-medium">Department</th>
                    <th className="px-3 py-2 font-medium">Employment Type</th>
                    <th className="px-3 py-2 text-right font-medium">Basic Salary</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700">
                  {employeesPreview.map((e) => {
                    const displayStatus = deriveEmployeeStatus(e.status, e.onLeaveUntil);
                    return (
                      <tr key={e.id} className="hover:bg-ledger-50/60 dark:hover:bg-white/[0.03]">
                        <td className="px-3 py-2.5">
                          <p className="text-ink-900 dark:text-white">{e.name}</p>
                          <p className="font-mono text-xs text-ledger-400">{formatEmployeeCode(e.employeeNumber)}</p>
                        </td>
                        <td className="px-3 py-2.5">{e.department ? <Badge tone="neutral">{e.department}</Badge> : "—"}</td>
                        <td className="px-3 py-2.5"><Badge tone={EMPLOYMENT_TYPE_TONE[e.employmentType]}>{EMPLOYMENT_TYPE_LABEL[e.employmentType]}</Badge></td>
                        <td className="px-3 py-2.5 text-right font-mono text-ink-900 dark:text-white">{formatCurrency(e.monthlySalary, currency)}</td>
                        <td className="px-3 py-2.5"><Badge tone={EMPLOYEE_STATUS_TONE[displayStatus]}>{EMPLOYEE_STATUS_LABEL[displayStatus]}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Sidebar */}
        <div className="space-y-5">
          <Card accent="neutral">
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-sm font-bold text-[#12345a] dark:text-white">Quick Actions</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 pt-0">
              <QuickAction icon={UserPlus} label="Add Employee" href="/hrm/employees/new" />
              <QuickAction icon={PlayCircle} label="Run Payroll" href="/hrm/payroll" />
              <QuickAction icon={CalendarClock} label="Attendance" href="/hrm/attendance" />
              <QuickAction icon={ClipboardCheck} label="Leave Request" href="/hrm/leave" />
              <QuickAction icon={Wallet} label="Payroll Records" href="/hrm/payroll" />
              <QuickAction icon={Receipt} label="Payslip" href="/hrm/payslips" />
            </CardContent>
          </Card>

          <Card accent="neutral">
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-sm font-bold text-[#12345a] dark:text-white">Upcoming Payments</CardTitle></CardHeader>
            <CardContent className="space-y-2.5 pt-0">
              {upcomingPayments.length === 0 && <p className="text-sm text-ledger-400">No upcoming payments scheduled.</p>}
              {upcomingPayments.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="text-ink-900 dark:text-white">{p.employeeName}</p>
                    <p className="text-xs text-ledger-400">{new Date(p.paymentDate).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" })}</p>
                  </div>
                  <span className="font-mono text-ledger-600 dark:text-ledger-300">{formatCurrency(p.amount, currency)}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card accent="neutral">
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-sm font-bold text-[#12345a] dark:text-white">Recent HR Activity</CardTitle></CardHeader>
            <CardContent className="space-y-2.5 pt-0">
              {recentActivity.length === 0 && <p className="text-sm text-ledger-400">No recent activity.</p>}
              {recentActivity.map((a) => (
                <div key={a.id} className="text-sm">
                  <p className="text-ink-900 dark:text-white">{a.label}</p>
                  <p className="text-xs text-ledger-400">
                    {new Date(a.createdAt).toLocaleDateString("en-GH", { day: "2-digit", month: "short" })}, {new Date(a.createdAt).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

    </div>
  );
}


function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ledger-500">{label}</span>
      <span className="font-medium text-ink-900 dark:text-white">{value}</span>
    </div>
  );
}

function QuickAction({ icon: Icon, label, href }: { icon: React.ComponentType<{ className?: string }>; label: string; href: string }) {
  const content = (
    <div className="flex flex-col items-center gap-1.5 rounded-md border border-ledger-100 p-3 text-center text-xs hover:border-ledger-300 hover:bg-ledger-50 dark:border-ledger-700 dark:hover:bg-white/[0.06]">
      <Icon className="h-4 w-4 text-ledger-500" />
      <span className="text-ledger-600 dark:text-ledger-300">{label}</span>
    </div>
  );
  return <Link href={href}>{content}</Link>;
}