"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import {
  Search, Filter, Plus, Download, Upload, X, RefreshCw, Wallet, CalendarDays,
  CalendarClock, Clock3, AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/sales/format";
import {
  DISPLAY_STATUS_LABEL, DISPLAY_STATUS_TONE, deriveDisplayStatus, formatExpenseNumber, type DisplayStatus,
} from "@/lib/expenses/format";
import { ExpenseRowMenu } from "@/components/expenses/expense-row-menu";
import { KpiFlipCard } from "@/components/charts/kpi-flip-card";
import { useAppStore, THEMES } from "@/store/useAppStore";
import { bulkApproveExpenses, bulkDeleteExpenses } from "@/app/(dashboard)/expenses/actions";
import type { ExpenseStatus, ExpensePaymentStatus } from "@/types/database";

export interface ExpenseRow {
  id: string;
  expenseNumber: number;
  date: string;
  category: string;
  description: string | null;
  vendor: string | null;
  paymentMethod: string | null;
  amount: number;
  status: ExpenseStatus;
  paymentStatus: ExpensePaymentStatus;
  dueDate: string | null;
  paidOn: string | null;
  department: string | null;
}

export interface ExpenseKpis {
  totalExpenses: number;
  thisMonth: number;
  thisWeek: number;
  pendingApproval: number;
  overdue: number;
}

export interface CategorySlice { category: string; total: number; }
export interface ExpenseActivity { id: string; label: string; expenseNumber: number; category: string; createdAt: string; }

interface ExpenseListViewProps {
  expenses: ExpenseRow[];
  kpis: ExpenseKpis;
  currency: string;
  categories: string[];
  paymentMethods: string[];
  departments: string[];
  locations: { id: string; name: string }[];
  categoryBreakdown: CategorySlice[];
  recentActivity: ExpenseActivity[];
}

const STATUS_TABS: { key: "all" | DisplayStatus; label: string }[] = [
  { key: "all", label: "All Expenses" },
  { key: "pending_approval", label: "Pending Approval" },
  { key: "approved", label: "Approved" },
  { key: "paid", label: "Paid" },
  { key: "overdue", label: "Overdue" },
  { key: "rejected", label: "Rejected" },
];

const DONUT_COLORS = ["#1d8f5e", "#a8781f", "#68655c", "#b8402f", "#b3ab97", "#8b8677"];
const ROWS_PER_PAGE_OPTIONS = [10, 25, 50];

export function ExpenseListView({
  expenses, kpis, currency, categories, paymentMethods, departments, categoryBreakdown, recentActivity,
}: ExpenseListViewProps) {
  const router = useRouter();
  const { activeTheme } = useAppStore();
  const theme = THEMES[activeTheme];
  const [activeTab, setActiveTab] = React.useState<"all" | DisplayStatus>("all");
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState("all");
  const [paymentMethod, setPaymentMethod] = React.useState("all");
  const [department, setDepartment] = React.useState("all");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [page, setPage] = React.useState(1);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);
  const [notice, setNotice] = React.useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [bulkPending, setBulkPending] = React.useState(false);

  function showNotice(message: string, tone: "success" | "error" = "success") {
    setNotice({ message, tone });
    setTimeout(() => setNotice(null), 4000);
  }

  const withDisplayStatus = React.useMemo(
    () => expenses.map((e) => ({ ...e, displayStatus: deriveDisplayStatus(e.status, e.paymentStatus, e.dueDate) })),
    [expenses]
  );

  const counts = React.useMemo(() => {
    const c: Record<"all" | DisplayStatus, number> = { all: withDisplayStatus.length, pending_approval: 0, approved: 0, paid: 0, overdue: 0, rejected: 0 };
    for (const e of withDisplayStatus) c[e.displayStatus] += 1;
    return c;
  }, [withDisplayStatus]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return withDisplayStatus.filter((e) => {
      if (activeTab !== "all" && e.displayStatus !== activeTab) return false;
      if (category !== "all" && e.category !== category) return false;
      if (paymentMethod !== "all" && e.paymentMethod !== paymentMethod) return false;
      if (department !== "all" && e.department !== department) return false;
      if (q) {
        const matches =
          formatExpenseNumber(e.expenseNumber).toLowerCase().includes(q) ||
          (e.description ?? "").toLowerCase().includes(q) ||
          (e.vendor ?? "").toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [withDisplayStatus, activeTab, category, paymentMethod, department, query]);

  const filteredKpis = React.useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 6);
    const totalExpenses = filtered.reduce((sum, e) => sum + e.amount, 0);
    const thisMonth = filtered.filter((e) => new Date(e.date) >= startOfMonth).reduce((sum, e) => sum + e.amount, 0);
    const thisWeek = filtered.filter((e) => new Date(e.date) >= startOfWeek).reduce((sum, e) => sum + e.amount, 0);
    const pendingApproval = filtered.filter((e) => e.displayStatus === "pending_approval").reduce((sum, e) => sum + e.amount, 0);
    const overdue = filtered.filter((e) => e.displayStatus === "overdue").reduce((sum, e) => sum + e.amount, 0);
    return { totalExpenses, thisMonth, thisWeek, pendingApproval, overdue };
  }, [filtered]);

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
    const header = ["Expense No.", "Date", "Category", "Description", "Vendor", "Payment Method", "Amount", "Status", "Paid On"];
    const rows = filtered.map((e) => [
      formatExpenseNumber(e.expenseNumber), e.date, e.category, e.description ?? "", e.vendor ?? "",
      e.paymentMethod ?? "", e.amount, DISPLAY_STATUS_LABEL[e.displayStatus], e.paidOn ?? "",
    ]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleBulkApprove() {
    setBulkPending(true);
    const result = await bulkApproveExpenses(selected);
    setBulkPending(false);
    if (!result.ok) return showNotice(result.error ?? "Something went wrong.", "error");
    showNotice(`Approved ${result.affected} expense(s)`);
    setSelected([]);
    router.refresh();
  }

  async function handleBulkDelete() {
    setBulkPending(true);
    const result = await bulkDeleteExpenses(selected);
    setBulkPending(false);
    if (!result.ok) return showNotice(result.error ?? "Something went wrong.", "error");
    showNotice(`Deleted ${result.affected} expense(s)`);
    setSelected([]);
    router.refresh();
  }

  const donutTotal = categoryBreakdown.reduce((sum, c) => sum + c.total, 0);
  const maxCategoryTotal = Math.max(1, ...categoryBreakdown.map((c) => c.total));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">Expenses</h1>
          <p className="mt-0.5 text-sm text-ledger-500 dark:text-ledger-400">{expenses.length} expenses recorded</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="md"><Upload className="h-4 w-4" /> Import</Button>
          <Button variant="outline" size="md" onClick={exportCsv}><Download className="h-4 w-4" /> Export</Button>
          <Link
            href="/expenses/new"
            className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 text-sm font-medium text-white shadow-sm transition-all active:scale-[0.98]"
            style={{ background: theme.colors.primary }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = theme.colors.primaryMid; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = theme.colors.primary; }}
          >
            <Plus className="h-4 w-4" /> Add Expense
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
            <KpiFlipCard color="green" label="Total Expenses" value={formatCurrency(filteredKpis.totalExpenses, currency)} icon={<Wallet className="h-full w-full" />} detail="Sum of every expense matching the current filters." featured />
            <KpiFlipCard color="blue" label="This Month" value={formatCurrency(filteredKpis.thisMonth, currency)} icon={<CalendarDays className="h-full w-full" />} detail="Filtered expenses dated from the 1st of this month onward." />
            <KpiFlipCard color="teal" label="This Week" value={formatCurrency(filteredKpis.thisWeek, currency)} icon={<CalendarClock className="h-full w-full" />} detail="Filtered expenses dated within the last 7 days." />
            <KpiFlipCard color="amber" label="Pending Approval" value={formatCurrency(filteredKpis.pendingApproval, currency)} icon={<Clock3 className="h-full w-full" />} detail="Filtered expenses still awaiting approval." />
            <KpiFlipCard color="red" label="Overdue" value={formatCurrency(filteredKpis.overdue, currency)} icon={<AlertTriangle className="h-full w-full" />} detail="Filtered expenses past their due date and still unpaid." />
          </div>

          {/* Filters */}
          <Card accent="neutral">
            <CardContent className="pt-5">
              <div className="flex flex-wrap items-end gap-3">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ledger-400" />
                  <Input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search expenses..." className="pl-9" />
                </div>
                <div className="w-40">
                  <label className="mb-1 block text-xs font-medium text-ledger-500">Category</label>
                  <Select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
                    <option value="all">All Categories</option>
                    {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </div>
                <div className="w-40">
                  <label className="mb-1 block text-xs font-medium text-ledger-500">Payment Method</label>
                  <Select value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value); setPage(1); }}>
                    <option value="all">All Methods</option>
                    {paymentMethods.map((m) => <option key={m} value={m}>{m}</option>)}
                  </Select>
                </div>
                <div className="w-40">
                  <label className="mb-1 block text-xs font-medium text-ledger-500">Department</label>
                  <Select value={department} onChange={(e) => { setDepartment(e.target.value); setPage(1); }}>
                    <option value="all">All Departments</option>
                    {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                  </Select>
                </div>
                <Button variant="outline" size="md"><Filter className="h-4 w-4" /> More Filters</Button>
                <Button variant="ghost" size="md" onClick={() => { setQuery(""); setCategory("all"); setPaymentMethod("all"); setDepartment("all"); setActiveTab("all"); setPage(1); }}>
                  <RefreshCw className="h-4 w-4" /> Clear
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Tabs + bulk */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => { setActiveTab(tab.key); setPage(1); setSelected([]); }}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                    activeTab !== tab.key && "border border-ledger-200 text-ledger-600 hover:bg-ledger-50 dark:border-ledger-700 dark:text-ledger-300 dark:hover:bg-white/[0.06]"
                  )}
                  style={activeTab === tab.key ? { background: theme.colors.primary, color: "#fff" } : undefined}
                >
                  {tab.label} ({counts[tab.key]})
                </button>
              ))}
            </div>
            {selected.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-ledger-500">{selected.length} selected</span>
                <Button variant="outline" size="md" onClick={handleBulkApprove} disabled={bulkPending}>Approve</Button>
                <Button variant="destructive" size="md" onClick={handleBulkDelete} disabled={bulkPending}>Delete</Button>
              </div>
            )}
          </div>

          {/* Table */}
          <Card accent="neutral" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-white dark:bg-ink-900">
                  <tr className="border-b border-ledger-100 text-ink-900 dark:border-ledger-700 dark:text-white">
                    <th className="w-10 px-4 py-3"><input type="checkbox" checked={allChecked} onChange={toggleAll} className="h-4 w-4 rounded border-ledger-300 accent-signal" /></th>
                    <th className="px-3 py-3 font-semibold">Date</th>
                    <th className="px-3 py-3 font-semibold">Expense No.</th>
                    <th className="px-3 py-3 font-semibold">Category</th>
                    <th className="px-3 py-3 font-semibold">Description</th>
                    <th className="px-3 py-3 font-semibold">Vendor</th>
                    <th className="px-3 py-3 font-semibold">Payment Method</th>
                    <th className="px-3 py-3 text-right font-semibold">Amount</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 font-semibold">Paid On</th>
                    <th className="px-3 py-3 pr-4 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700">
                  {pageRows.length === 0 && (
                    <tr><td colSpan={11} className="px-4 py-12 text-center text-ledger-400">No expenses match your filters.</td></tr>
                  )}
                  {pageRows.map((e) => (
                    <tr key={e.id} className="hover:bg-ledger-50/60 dark:hover:bg-white/[0.03]">
                      <td className="px-4 py-3"><input type="checkbox" checked={selected.includes(e.id)} onChange={() => toggleRow(e.id)} className="h-4 w-4 rounded border-ledger-300 accent-signal" /></td>
                      <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">{new Date(e.date).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" })}</td>
                      <td className="px-3 py-3 font-mono text-[13px] text-signal">{formatExpenseNumber(e.expenseNumber)}</td>
                      <td className="px-3 py-3"><Badge tone="neutral">{e.category}</Badge></td>
                      <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">{e.description ?? "—"}</td>
                      <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">{e.vendor ?? "—"}</td>
                      <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">{e.paymentMethod ?? "—"}</td>
                      <td className="px-3 py-3 text-right font-mono font-medium text-ink-900 dark:text-white">{formatCurrency(e.amount, currency)}</td>
                      <td className="px-3 py-3"><Badge tone={DISPLAY_STATUS_TONE[e.displayStatus]}>{DISPLAY_STATUS_LABEL[e.displayStatus]}</Badge></td>
                      <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">{e.paidOn ? new Date(e.paidOn).toLocaleDateString("en-GH", { day: "2-digit", month: "short" }) : "—"}</td>
                      <td className="px-3 py-3 pr-4">
                        <ExpenseRowMenu expenseId={e.id} expenseNumber={e.expenseNumber} status={e.status} paymentStatus={e.paymentStatus} onNotice={showNotice} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ledger-100 px-4 py-3 dark:border-ledger-700">
              <p className="text-sm text-ledger-500">
                Showing {pageRows.length === 0 ? 0 : (clampedPage - 1) * rowsPerPage + 1}–{(clampedPage - 1) * rowsPerPage + pageRows.length} of {filtered.length} expenses
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
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Expense Overview</CardTitle></CardHeader>
            <CardContent className="pt-0">
              {donutTotal === 0 ? <p className="text-sm text-ledger-400">No expenses yet.</p> : (
                <>
                  <div className="relative mx-auto h-40 w-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={categoryBreakdown.map((c, i) => ({ name: c.category, value: c.total, color: DONUT_COLORS[i % DONUT_COLORS.length] }))} dataKey="value" innerRadius={48} outerRadius={70} paddingAngle={2}>
                          {categoryBreakdown.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} stroke="none" />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => formatCurrency(v, currency)} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="font-display text-lg font-semibold text-ink-900 dark:text-white">{formatCurrency(donutTotal, currency)}</span>
                      <span className="text-[10px] text-ledger-400">Total</span>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {categoryBreakdown.map((c, i) => (
                      <div key={c.category} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-ledger-500"><span className="h-2 w-2 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} /> {c.category}</span>
                        <span className="font-medium text-ink-900 dark:text-white">{Math.round((c.total / donutTotal) * 100)}% ({formatCurrency(c.total, currency)})</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card accent="neutral">
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Top Expense Categories</CardTitle></CardHeader>
            <CardContent className="space-y-3 pt-0">
              {categoryBreakdown.map((c) => (
                <div key={c.category}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="truncate text-ink-900 dark:text-white">{c.category}</span>
                    <span className="font-mono text-xs text-ledger-500">{formatCurrency(c.total, currency)}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-ledger-100 dark:bg-white/[0.06]">
                    <div className="h-1.5 rounded-full bg-signal" style={{ width: `${(c.total / maxCategoryTotal) * 100}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card accent="neutral">
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Recent Expense Activity</CardTitle></CardHeader>
            <CardContent className="space-y-3 pt-0">
              {recentActivity.length === 0 && <p className="text-sm text-ledger-400">No recent activity.</p>}
              {recentActivity.map((a) => (
                <div key={a.id} className="text-sm">
                  <p className="text-ink-900 dark:text-white">{a.label} <span className="font-mono text-xs text-ledger-500">{formatExpenseNumber(a.expenseNumber)}</span></p>
                  <p className="text-xs text-ledger-400">{a.category} · {new Date(a.createdAt).toLocaleDateString("en-GH", { day: "2-digit", month: "short" })}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

    </div>
  );
}

