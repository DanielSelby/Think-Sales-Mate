"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ClipboardList,
  Clock3,
  DollarSign,
  type LucideIcon,
  Package,
  Plus,
  Receipt,
  Wrench,
} from "lucide-react";
import { formatCurrencyAmount } from "@/lib/currency";
import type { ServiceJobStatus } from "@/types/database";

type RangeKey = "today" | "last7" | "last30" | "thisMonth" | "lastMonth" | "custom";
type DashboardRange = { key: RangeKey; from: string; to: string };
type StatusSlice = { key: string; label: string; color: string; statuses: ServiceJobStatus[]; count: number };

export type ServiceDashboardData = {
  range: DashboardRange;
  previous: { from: string; to: string };
  kpis: {
    jobs: number;
    previousJobs: number;
    revenue: number;
    previousRevenue: number;
    payments: number;
    previousPayments: number;
    pendingJobs: number;
  };
  chart: Array<{ label: string; jobs: number; pending: number; revenue: number; payments: number }>;
  statuses: StatusSlice[];
  statusTotal: number;
  recentJobs: Array<{
    id: string;
    number: string;
    customer: string;
    serviceType: string;
    status: ServiceJobStatus;
    createdAt: string;
  }>;
  lowStock: Array<{
    id: string;
    name: string;
    sku: string;
    imageUrl: string | null;
    quantity: number;
    threshold: number;
  }>;
  permissions: {
    canViewAccounting: boolean;
    canViewInventory: boolean;
    canCreateJobs: boolean;
    canEditJobs: boolean;
    canCreateCustomers: boolean;
    canViewAppointments: boolean;
    canCreateAppointments: boolean;
  };
  currency: string;
};

const RANGE_OPTIONS: Array<{ value: RangeKey; label: string }> = [
  { value: "today", label: "Today" },
  { value: "last7", label: "Last 7 Days" },
  { value: "last30", label: "Last 30 Days" },
  { value: "thisMonth", label: "This Month" },
  { value: "lastMonth", label: "Last Month" },
  { value: "custom", label: "Custom Date Range" },
];

const STATUS_LABELS: Record<ServiceJobStatus, string> = {
  received: "Received",
  inspection: "Inspection",
  awaiting_quotation: "Awaiting quotation",
  awaiting_customer_approval: "Awaiting approval",
  approved: "Approved",
  rejected: "Rejected",
  in_progress: "In progress",
  awaiting_parts: "Awaiting parts",
  quality_check: "Quality check",
  ready_for_collection: "Ready for pickup",
  awaiting_payment: "Awaiting payment",
  completed: "Completed",
  closed: "Closed",
  cancelled: "Cancelled",
};

function percentageChange(current: number, previous: number) {
  return previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;
}

function formatShortDate(value: string) {
  if (value.length === 7) {
    return new Intl.DateTimeFormat(undefined, { month: "short", year: "2-digit" }).format(new Date(`${value}-01T00:00:00`));
  }
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

function MetricCard({
  title,
  value,
  icon: Icon,
  accent,
  series,
  change,
  comparisonLabel = "vs previous period",
  comparisonUnavailable = true,
}: {
  title: string;
  value: string;
  icon: LucideIcon;
  accent: string;
  series: number[];
  change: number | null;
  comparisonLabel?: string;
  comparisonUnavailable?: boolean;
}) {
  const positive = change !== null && change >= 0;
  return (
    <article className="relative min-h-32 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-ink-900 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ backgroundColor: accent }}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="truncate text-sm font-medium text-slate-600 dark:text-slate-300">{title}</p>
        </div>
        {change !== null ? (
          <span className={`inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold ${positive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {Math.abs(change)}%
          </span>
        ) : null}
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{value}</p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{change === null && comparisonUnavailable ? "Comparison unavailable" : comparisonLabel}</p>
        </div>
        <div className="h-10 w-24 shrink-0" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series.map((point, index) => ({ index, point }))}>
              <Area type="monotone" dataKey="point" stroke={accent} fill={accent} fillOpacity={0.14} strokeWidth={2} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </article>
  );
}

function DateRangeControl({ range }: { range: DashboardRange }) {
  const [selectedRange, setSelectedRange] = useState<RangeKey>(range.key);
  return (
    <form action="/service-center/dashboard" method="get" className="flex flex-wrap items-end gap-2">
      <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm dark:border-slate-700 dark:bg-ink-900 dark:text-slate-200">
        <CalendarDays className="h-4 w-4 text-slate-500" aria-hidden="true" />
        <span className="sr-only">Date range</span>
        <select name="range" value={selectedRange} onChange={(event) => {
          const value = RANGE_OPTIONS.find((option) => option.value === event.target.value)?.value;
          if (value) setSelectedRange(value);
        }} className="bg-transparent outline-none">
          {RANGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      {selectedRange === "custom" && (
        <>
          <label className="text-xs text-slate-500">From
            <input name="from" type="date" defaultValue={range.from} className="ml-2 rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-ink-900 dark:text-slate-200" />
          </label>
          <label className="text-xs text-slate-500">To
            <input name="to" type="date" defaultValue={range.to} className="ml-2 rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-ink-900 dark:text-slate-200" />
          </label>
        </>
      )}
      <button type="submit" className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2">
        Apply
      </button>
    </form>
  );
}

export function ServiceDashboard({ data }: { data: ServiceDashboardData }) {
  const { kpis, permissions } = data;
  const changeJobs = percentageChange(kpis.jobs, kpis.previousJobs);
  const changeRevenue = percentageChange(kpis.revenue, kpis.previousRevenue);
  const changePayments = percentageChange(kpis.payments, kpis.previousPayments);
  const jobsTrend = data.chart.map((point) => point.jobs);
  const revenueTrend = data.chart.map((point) => point.revenue);
  const paymentTrend = data.chart.map((point) => point.payments);
  const pendingTrend = data.chart.map((point) => point.pending);
  const percentages = data.statuses.map((status) => ({
    ...status,
    percentage: data.statusTotal ? Math.round(status.count * 100 / data.statusTotal) : 0,
  }));
  const canCreateQuotation = permissions.canEditJobs;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">Think Service &amp; Repairs</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Welcome back! Here’s what’s happening at your service center today.</p>
        </div>
        <DateRangeControl range={data.range} />
      </header>

      <section aria-label="Service performance summary" className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        <MetricCard title="Service Jobs" value={String(kpis.jobs)} icon={ClipboardList} accent="#2563eb" series={jobsTrend} change={changeJobs} />
        <MetricCard title="Revenue Invoiced" value={permissions.canViewAccounting ? formatCurrencyAmount(kpis.revenue, { code: data.currency }) : "Restricted"} icon={DollarSign} accent="#10a66a" series={revenueTrend} change={permissions.canViewAccounting ? changeRevenue : null} />
        <MetricCard title="Payments Received" value={permissions.canViewAccounting ? formatCurrencyAmount(kpis.payments, { code: data.currency }) : "Restricted"} icon={Receipt} accent="#7c3aed" series={paymentTrend} change={permissions.canViewAccounting ? changePayments : null} />
        <MetricCard title="Pending Jobs" value={String(kpis.pendingJobs)} icon={Clock3} accent="#f59e0b" series={pendingTrend} change={null} comparisonLabel="selected-period non-terminal jobs" comparisonUnavailable={false} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-ink-900 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Service Performance</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Jobs created and service invoices issued during the selected period.</p>
            </div>
            <div className="flex gap-4 text-xs text-slate-600 dark:text-slate-300">
              <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-blue-600" />Jobs</span>
              {permissions.canViewAccounting && <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-emerald-500" />Revenue</span>}
            </div>
          </div>
          {data.chart.length ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.chart} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="serviceJobsFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563eb" stopOpacity={0.2} /><stop offset="95%" stopColor="#2563eb" stopOpacity={0} /></linearGradient>
                    <linearGradient id="serviceRevenueFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.18} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tickFormatter={formatShortDate} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} minTickGap={20} />
                  <YAxis yAxisId="jobs" allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  {permissions.canViewAccounting && <YAxis yAxisId="revenue" orientation="right" hide />}
                  <Tooltip
                    labelFormatter={(label) => formatShortDate(String(label))}
                    formatter={(value, name) => [name === "revenue" ? formatCurrencyAmount(Number(value), { code: data.currency }) : value, name === "revenue" ? "Revenue" : "Jobs"]}
                    contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0", fontSize: 12 }}
                  />
                  <Area yAxisId="jobs" type="monotone" dataKey="jobs" name="jobs" stroke="#2563eb" fill="url(#serviceJobsFill)" strokeWidth={2.5} />
                  {permissions.canViewAccounting && <Area yAxisId="revenue" type="monotone" dataKey="revenue" name="revenue" stroke="#10b981" fill="url(#serviceRevenueFill)" strokeWidth={2.5} />}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center text-sm text-slate-500">No service activity in this date range.</div>
          )}
        </article>

        <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-ink-900 sm:p-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Jobs by Status</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Workflow statuses for jobs created in the selected period.</p>
          </div>
          <div className="mt-3 grid items-center gap-2 sm:grid-cols-[minmax(160px,1fr)_1fr]">
            <div className="relative mx-auto h-52 w-full max-w-[250px]">
              {data.statusTotal ? (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={percentages} dataKey="count" nameKey="label" innerRadius="62%" outerRadius="88%" paddingAngle={2} stroke="none">
                        {percentages.map((entry) => <Cell key={entry.key} fill={entry.color} />)}
                      </Pie>
                      <Tooltip formatter={(value, name) => [value, name]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <strong className="text-2xl font-bold text-slate-900 dark:text-white">{data.statusTotal}</strong>
                    <span className="text-xs text-slate-500">Total jobs</span>
                  </div>
                </>
              ) : <div className="flex h-full items-center justify-center text-sm text-slate-500">No jobs yet</div>}
            </div>
            <ul className="space-y-2">
              {percentages.map((status) => (
                <li key={status.key} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex min-w-0 items-center gap-2 text-slate-600 dark:text-slate-300">
                    <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: status.color }} />
                    <span className="truncate">{status.label}</span>
                  </span>
                  <span className="shrink-0 font-medium text-slate-800 dark:text-slate-200">{status.count} ({status.percentage}%)</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Completed includes handed-over jobs; Other includes declined and cancelled jobs.</p>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.45fr_1fr_0.95fr]">
        <article className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-ink-900">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 dark:border-slate-800 sm:px-5">
            <h2 className="font-semibold text-slate-900 dark:text-white">Recent Service Jobs</h2>
            <Link href="/service-center" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900 dark:text-blue-300">View all <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
          {data.recentJobs.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[610px] text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 dark:bg-ink-800 dark:text-slate-400">
                  <tr>{["Job #", "Customer", "Service Type", "Status", "Date"].map((item) => <th key={item} className="px-4 py-3 font-medium">{item}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.recentJobs.map((job) => (
                    <tr key={job.id} className="hover:bg-slate-50/70 dark:hover:bg-ink-800/60">
                      <td className="whitespace-nowrap px-4 py-3"><Link href={`/service-center#job-${job.id}`} className="font-semibold text-blue-700 hover:underline dark:text-blue-300">{job.number}</Link></td>
                      <td className="max-w-36 truncate px-4 py-3 text-slate-700 dark:text-slate-300">{job.customer}</td>
                      <td className="max-w-36 truncate px-4 py-3 text-slate-600 dark:text-slate-400">{job.serviceType}</td>
                      <td className="whitespace-nowrap px-4 py-3"><span className="rounded-full bg-blue-50 px-2 py-1 font-medium text-blue-800 dark:bg-blue-950/50 dark:text-blue-200">{STATUS_LABELS[job.status]}</span></td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400">{new Date(job.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="px-5 py-10 text-center text-sm text-slate-500">No service jobs were created in this period.</p>}
        </article>

        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-ink-900">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 dark:border-slate-800">
            <h2 className="font-semibold text-slate-900 dark:text-white">Low Stock Alerts</h2>
            {permissions.canViewInventory && <Link href="/inventory" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900 dark:text-blue-300">View all <ArrowRight className="h-3.5 w-3.5" /></Link>}
          </div>
          {!permissions.canViewInventory ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">Inventory data is restricted for your account.</p>
          ) : data.lowStock.length ? (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.lowStock.map((item) => (
                <li key={item.id}>
                  <Link href={`/inventory/${item.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-ink-800">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 dark:bg-ink-800">
                      {item.imageUrl ? <Image src={item.imageUrl} alt="" width={40} height={40} className="h-full w-full object-cover" unoptimized /> : <Package className="h-5 w-5 text-slate-500" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-slate-800 dark:text-slate-200">{item.name}</span>
                      <span className="mt-0.5 block text-[11px] text-rose-600 dark:text-rose-400">Stock: {item.quantity} · reorder at {item.threshold}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="px-4 py-8 text-center text-sm text-slate-500">No items are at or below their reorder level.</p>}
        </article>

        <article className="relative flex min-h-64 flex-col justify-end overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-blue-950 to-blue-700 p-5 text-white shadow-sm">
          <div aria-hidden="true" className="absolute -right-10 -top-8 h-48 w-48 rounded-full border-[24px] border-white/10" />
          <div aria-hidden="true" className="absolute right-8 top-10 flex h-24 w-24 rotate-12 items-center justify-center rounded-3xl border border-white/20 bg-white/10 backdrop-blur-sm">
            <Wrench className="h-12 w-12 text-cyan-100" />
          </div>
          <div className="relative z-10 max-w-xs">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider"><Activity className="h-3 w-3" /> Service excellence</span>
            <h2 className="mt-4 text-xl font-bold leading-tight">Keep Your Customers Happy</h2>
            <p className="mt-2 text-sm leading-relaxed text-blue-100">Deliver fast, reliable and professional service.</p>
            <Link href="/service-center" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-400">View services <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-ink-900 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="mr-2 font-semibold text-slate-900 dark:text-white">Quick Actions</h2>
          {permissions.canCreateJobs && <QuickAction href="/service-center#new-service-job" icon={Plus} label="New Service Job" />}
          {permissions.canCreateAppointments && <QuickAction href="/service-center#book-appointment" icon={CalendarDays} label="Book Appointment" />}
          {canCreateQuotation && <QuickAction href="/service-center#quotations" icon={Receipt} label="Create Quotation" />}
          {permissions.canCreateCustomers && <QuickAction href="/crm/new" icon={Plus} label="Add Customer" />}
          {permissions.canViewInventory && <QuickAction href="/inventory" icon={Package} label="Check Inventory" />}
          <QuickAction href="/service-center/reports" icon={Activity} label="View Reports" />
        </div>
        <p className="mt-3 text-[11px] text-slate-500">
          Revenue is the total amount of non-void service invoices issued in the period; payments are recorded service invoice payments. Pending jobs are non-terminal jobs created in the selected period.
        </p>
      </section>
    </div>
  );
}

function QuickAction({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link href={href} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-700 dark:bg-ink-800 dark:text-slate-200 dark:hover:border-blue-700 dark:hover:bg-blue-950/40">
      <Icon className="h-4 w-4 text-blue-600 dark:text-blue-300" aria-hidden="true" />
      {label}
    </Link>
  );
}
