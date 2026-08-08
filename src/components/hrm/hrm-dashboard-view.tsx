"use client";

import * as React from "react";
import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import {
  Users, Banknote, TrendingUp, TrendingDown, Clock3, Plus, PlayCircle, FileBarChart,
  Settings, CalendarClock, UserPlus, ClipboardCheck, Wallet, Receipt,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardValue } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/sales/format";
import {
  EMPLOYMENT_TYPE_LABEL, EMPLOYMENT_TYPE_TONE, EMPLOYEE_STATUS_LABEL, EMPLOYEE_STATUS_TONE,
  deriveEmployeeStatus, formatEmployeeCode,
} from "@/lib/hrm/format";
import { ProcessPayrollDialog } from "@/components/hrm/process-payroll-dialog";
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
  const [payrollDialogOpen, setPayrollDialogOpen] = React.useState(false);
  const distributionTotal = distribution.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">HRM &amp; Payroll</h1>
          <p className="mt-0.5 text-sm text-ledger-500 dark:text-ledger-400">Home &gt; HRM &amp; Payroll</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/hrm/employees/new" className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-ink-900 px-4 text-sm font-medium text-white shadow-sm hover:bg-ink-950 dark:bg-white dark:text-ink-900">
            <Plus className="h-4 w-4" /> Add Employee
          </Link>
          <Button variant="outline" size="md" onClick={() => setPayrollDialogOpen(true)}><PlayCircle className="h-4 w-4" /> Run Payroll</Button>
          <Button variant="outline" size="md" disabled title="Not built yet"><FileBarChart className="h-4 w-4" /> Reports</Button>
          <Button variant="outline" size="md" disabled title="Not built yet"><Settings className="h-4 w-4" /> Settings</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        <Kpi icon={Users} accent="neutral" label="Total Employees" value={`${kpis.totalEmployees}`} />
        <Kpi icon={Banknote} accent="signal" label="Total Payroll (This Month)" value={formatCurrency(kpis.totalPayrollThisMonth, currency)} />
        <Kpi icon={TrendingUp} accent="signal" label="Net Pay (This Month)" value={formatCurrency(kpis.netPayThisMonth, currency)} />
        <Kpi icon={TrendingDown} accent="amber" label="Deductions (This Month)" value={formatCurrency(kpis.deductionsThisMonth, currency)} />
        <Kpi icon={Clock3} accent="alert" label="Pending Payments" value={`${kpis.pendingPayments}`} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_360px]">
        {/* Payroll Overview */}
        <Card accent="neutral">
          <CardHeader className="pb-2">
            <CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Payroll Overview</CardTitle>
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
            <CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Payroll Run</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 pt-0 text-sm">
            <Row label="Active Employees" value={`${activeEmployeeCount}`} />
            <Row label="Estimated Gross Pay" value={formatCurrency(grossPayPreview, currency)} />
            <div className="flex items-center justify-between">
              <span className="text-ledger-500">Status</span>
              <Badge tone="neutral">Not yet processed</Badge>
            </div>
            <Button variant="primary" size="md" onClick={() => setPayrollDialogOpen(true)} className="mt-2 w-full" disabled={activeEmployeeCount === 0}>
              <PlayCircle className="h-4 w-4" /> Process Payroll
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_320px]">
        {/* Employees preview */}
        <Card accent="neutral" className="overflow-hidden">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Employees</CardTitle>
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
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Quick Actions</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 pt-0">
              <QuickAction icon={UserPlus} label="Add Employee" href="/hrm/employees/new" />
              <QuickAction icon={PlayCircle} label="Run Payroll" onClick={() => setPayrollDialogOpen(true)} />
              <QuickAction icon={CalendarClock} label="Attendance" disabled />
              <QuickAction icon={ClipboardCheck} label="Leave Request" disabled />
              <QuickAction icon={Wallet} label="Salary Advance" disabled />
              <QuickAction icon={Receipt} label="Payslip" disabled />
            </CardContent>
          </Card>

          <Card accent="neutral">
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Upcoming Payments</CardTitle></CardHeader>
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
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Recent HR Activity</CardTitle></CardHeader>
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

      <ProcessPayrollDialog
        open={payrollDialogOpen}
        onClose={() => setPayrollDialogOpen(false)}
        activeEmployeeCount={activeEmployeeCount}
        grossPayPreview={grossPayPreview}
        currency={currency}
        onProcessed={() => {}}
      />
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ledger-500">{label}</span>
      <span className="font-medium text-ink-900 dark:text-white">{value}</span>
    </div>
  );
}

function QuickAction({ icon: Icon, label, href, onClick, disabled }: { icon: React.ComponentType<{ className?: string }>; label: string; href?: string; onClick?: () => void; disabled?: boolean }) {
  const content = (
    <div className={`flex flex-col items-center gap-1.5 rounded-md border border-ledger-100 p-3 text-center text-xs dark:border-ledger-700 ${disabled ? "opacity-40" : "hover:border-ledger-300 hover:bg-ledger-50 dark:hover:bg-white/[0.06]"}`}>
      <Icon className="h-4 w-4 text-ledger-500" />
      <span className="text-ledger-600 dark:text-ledger-300">{label}</span>
    </div>
  );
  if (disabled) return <div title="Not built yet">{content}</div>;
  if (href) return <Link href={href}>{content}</Link>;
  return <button onClick={onClick} className="w-full">{content}</button>;
}