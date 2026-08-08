"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import {
  Search, Filter, Plus, Download, Upload, X, RefreshCw, LayoutGrid, CheckCircle2,
  Wallet, Star, Gauge, Pencil, Trash2, Power,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardValue } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/sales/format";
import { CATEGORY_ICONS, CATEGORY_COLORS, CATEGORY_STATUS_LABEL, CATEGORY_STATUS_TONE, type CategoryIconKey, type CategoryColorKey } from "@/lib/expenses/categories";
import { CategoryDialog, type EditingCategory } from "@/components/expenses/categories/category-dialog";
import { toggleExpenseCategoryStatus, deleteExpenseCategory } from "@/app/(dashboard)/expenses/categories/actions";
import type { ExpenseCategoryStatus } from "@/types/database";

export interface CategoryRow {
  id: string;
  name: string;
  icon: CategoryIconKey;
  color: CategoryColorKey;
  description: string | null;
  department: string | null;
  budgetLimit: number | null;
  totalExpenses: number;
  transactions: number;
  status: ExpenseCategoryStatus;
  createdByName: string;
  updatedAt: string;
}

export interface CategoryKpis {
  totalCategories: number;
  activeCategories: number;
  monthlyExpenses: number;
  mostUsedCategory: string | null;
  mostUsedPercent: number;
  budgetUtilization: number | null;
}

export interface CategoryActivity {
  id: string;
  label: string;
  categoryName: string;
  createdAt: string;
}

interface CategoryListViewProps {
  categories: CategoryRow[];
  kpis: CategoryKpis;
  currency: string;
  departments: string[];
  recentActivity: CategoryActivity[];
}

const ROWS_PER_PAGE_OPTIONS = [10, 25, 50];

export function CategoryListView({ categories, kpis, currency, departments, recentActivity }: CategoryListViewProps) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<"all" | ExpenseCategoryStatus>("all");
  const [department, setDepartment] = React.useState("all");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [page, setPage] = React.useState(1);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);
  const [notice, setNotice] = React.useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<EditingCategory | null>(null);

  function showNotice(message: string, tone: "success" | "error" = "success") {
    setNotice({ message, tone });
    setTimeout(() => setNotice(null), 4000);
  }

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return categories.filter((c) => {
      if (status !== "all" && c.status !== status) return false;
      if (department !== "all" && c.department !== department) return false;
      if (q && !c.name.toLowerCase().includes(q) && !(c.description ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [categories, query, status, department]);

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

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(c: CategoryRow) {
    setEditing({ id: c.id, name: c.name, icon: c.icon, color: c.color, description: c.description, department: c.department, budgetLimit: c.budgetLimit });
    setDialogOpen(true);
  }

  async function handleToggle(c: CategoryRow) {
    const next = c.status === "active" ? "inactive" : "active";
    const result = await toggleExpenseCategoryStatus(c.id, next);
    if (!result.ok) return showNotice(result.error ?? "Something went wrong.", "error");
    showNotice(`${c.name} ${next === "active" ? "activated" : "deactivated"}`);
    router.refresh();
  }

  async function handleDelete(c: CategoryRow) {
    const result = await deleteExpenseCategory(c.id);
    if (!result.ok) return showNotice(result.error ?? "Something went wrong.", "error");
    showNotice(`${c.name} deleted`);
    router.refresh();
  }

  function exportCsv() {
    const header = ["Category", "Description", "Department", "Budget Limit", "Total Expenses", "Transactions", "Status"];
    const rows = filtered.map((c) => [c.name, c.description ?? "", c.department ?? "", c.budgetLimit ?? "", c.totalExpenses, c.transactions, CATEGORY_STATUS_LABEL[c.status]]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expense-categories-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const topCategories = [...categories].sort((a, b) => b.totalExpenses - a.totalExpenses).slice(0, 5);
  const distributionTotal = categories.reduce((sum, c) => sum + c.totalExpenses, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">Expense Categories</h1>
          <p className="mt-0.5 text-sm text-ledger-500 dark:text-ledger-400">{categories.length} categories configured</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="md"><Upload className="h-4 w-4" /> Import</Button>
          <Button variant="outline" size="md" onClick={exportCsv}><Download className="h-4 w-4" /> Export</Button>
          <Button variant="primary" size="md" onClick={openAdd}><Plus className="h-4 w-4" /> Add Category</Button>
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
            <Kpi icon={LayoutGrid} accent="neutral" label="Total Categories" value={`${kpis.totalCategories}`} />
            <Kpi icon={CheckCircle2} accent="signal" label="Active Categories" value={`${kpis.activeCategories}`} />
            <Kpi icon={Wallet} accent="amber" label="Monthly Expenses" value={formatCurrency(kpis.monthlyExpenses, currency)} />
            <Kpi icon={Star} accent="neutral" label="Most Used Category" value={kpis.mostUsedCategory ?? "—"} sub={kpis.mostUsedCategory ? `${kpis.mostUsedPercent}% of total` : undefined} />
            <Kpi icon={Gauge} accent="alert" label="Budget Utilization" value={kpis.budgetUtilization === null ? "—" : `${kpis.budgetUtilization}%`} />
          </div>

          {/* Filters */}
          <Card accent="neutral">
            <CardContent className="pt-5">
              <div className="flex flex-wrap items-end gap-3">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ledger-400" />
                  <Input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search categories..." className="pl-9" />
                </div>
                <div className="w-36">
                  <label className="mb-1 block text-xs font-medium text-ledger-500">Status</label>
                  <Select value={status} onChange={(e) => { setStatus(e.target.value as "all" | ExpenseCategoryStatus); setPage(1); }}>
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </Select>
                </div>
                <div className="w-44">
                  <label className="mb-1 block text-xs font-medium text-ledger-500">Department</label>
                  <Select value={department} onChange={(e) => { setDepartment(e.target.value); setPage(1); }}>
                    <option value="all">All Departments</option>
                    {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                  </Select>
                </div>
                <Button variant="outline" size="md"><Filter className="h-4 w-4" /> More Filters</Button>
                <Button variant="ghost" size="md" onClick={() => { setQuery(""); setStatus("all"); setDepartment("all"); setPage(1); }}>
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
                    <th className="px-3 py-3 font-medium">Category Name</th>
                    <th className="px-3 py-3 font-medium">Description</th>
                    <th className="px-3 py-3 font-medium">Department</th>
                    <th className="px-3 py-3 text-right font-medium">Budget Limit</th>
                    <th className="px-3 py-3 text-right font-medium">Total Expenses</th>
                    <th className="px-3 py-3 text-right font-medium">Transactions</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Created By</th>
                    <th className="px-3 py-3 pr-4 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700">
                  {pageRows.length === 0 && (
                    <tr><td colSpan={11} className="px-4 py-12 text-center text-ledger-400">No categories match your filters.</td></tr>
                  )}
                  {pageRows.map((c, i) => {
                    const Icon = CATEGORY_ICONS[c.icon];
                    const palette = CATEGORY_COLORS[c.color];
                    return (
                      <tr key={c.id} className="hover:bg-ledger-50/60 dark:hover:bg-white/[0.03]">
                        <td className="px-4 py-3"><input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggleRow(c.id)} className="h-4 w-4 rounded border-ledger-300 accent-signal" /></td>
                        <td className="px-3 py-3 text-ledger-400">{(clampedPage - 1) * rowsPerPage + i + 1}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white", palette.bg)}>
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="font-medium text-ink-900 dark:text-white">{c.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">{c.description ?? "—"}</td>
                        <td className="px-3 py-3">{c.department ? <Badge tone="neutral">{c.department}</Badge> : "—"}</td>
                        <td className="px-3 py-3 text-right font-mono text-ledger-600 dark:text-ledger-300">{c.budgetLimit ? formatCurrency(c.budgetLimit, currency) : "—"}</td>
                        <td className="px-3 py-3 text-right font-mono font-medium text-ink-900 dark:text-white">{formatCurrency(c.totalExpenses, currency)}</td>
                        <td className="px-3 py-3 text-right text-ledger-600 dark:text-ledger-300">{c.transactions}</td>
                        <td className="px-3 py-3"><Badge tone={CATEGORY_STATUS_TONE[c.status]}>{CATEGORY_STATUS_LABEL[c.status]}</Badge></td>
                        <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">{c.createdByName}</td>
                        <td className="px-3 py-3 pr-4">
                          <div className="flex items-center justify-end gap-1 text-ledger-400">
                            <button onClick={() => openEdit(c)} className="rounded-md p-1.5 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white" title="Edit">
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button onClick={() => handleToggle(c)} className="rounded-md p-1.5 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white" title={c.status === "active" ? "Deactivate" : "Activate"}>
                              <Power className="h-4 w-4" />
                            </button>
                            <button onClick={() => handleDelete(c)} className="rounded-md p-1.5 text-alert/70 hover:bg-alert-soft hover:text-alert" title="Delete">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ledger-100 px-4 py-3 dark:border-ledger-700">
              <p className="text-sm text-ledger-500">
                Showing {pageRows.length === 0 ? 0 : (clampedPage - 1) * rowsPerPage + 1}–{(clampedPage - 1) * rowsPerPage + pageRows.length} of {filtered.length} categories
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
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Expense Category Distribution</CardTitle></CardHeader>
            <CardContent className="pt-0">
              {distributionTotal === 0 ? <p className="text-sm text-ledger-400">No expenses recorded yet.</p> : (
                <>
                  <div className="relative mx-auto h-40 w-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={topCategories.map((c) => ({ name: c.name, value: c.totalExpenses }))} dataKey="value" innerRadius={48} outerRadius={70} paddingAngle={2}>
                          {topCategories.map((c, i) => <Cell key={i} fill={CATEGORY_COLORS[c.color].hex} stroke="none" />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => formatCurrency(v, currency)} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="font-display text-lg font-semibold text-ink-900 dark:text-white">{formatCurrency(distributionTotal, currency)}</span>
                      <span className="text-[10px] text-ledger-400">Total</span>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {topCategories.map((c) => (
                      <div key={c.id} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-ledger-500"><span className={cn("h-2 w-2 rounded-full", CATEGORY_COLORS[c.color].bg)} /> {c.name}</span>
                        <span className="font-medium text-ink-900 dark:text-white">{distributionTotal ? Math.round((c.totalExpenses / distributionTotal) * 100) : 0}%</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card accent="neutral">
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Top Expense Categories (By Spending)</CardTitle></CardHeader>
            <CardContent className="space-y-2.5 pt-0">
              {topCategories.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <span className="truncate text-ink-900 dark:text-white">{c.name}</span>
                  <span className="font-mono text-xs text-ledger-500">{formatCurrency(c.totalExpenses, currency)}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card accent="neutral">
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Recent Category Activity</CardTitle></CardHeader>
            <CardContent className="space-y-3 pt-0">
              {recentActivity.length === 0 && <p className="text-sm text-ledger-400">No recent activity.</p>}
              {recentActivity.map((a) => (
                <div key={a.id} className="text-sm">
                  <p className="text-ink-900 dark:text-white">{a.label} <span className="font-medium">{a.categoryName}</span></p>
                  <p className="text-xs text-ledger-400">{new Date(a.createdAt).toLocaleDateString("en-GH", { day: "2-digit", month: "short" })}, {new Date(a.createdAt).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card accent="neutral">
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Quick Actions</CardTitle></CardHeader>
            <CardContent className="space-y-1 pt-0">
              <button onClick={openAdd} className="flex w-full items-center justify-between rounded-md px-2 py-2 text-sm text-ink-900 hover:bg-ledger-50 dark:text-white dark:hover:bg-white/[0.06]">
                Add Category
              </button>
            </CardContent>
          </Card>
        </div>
      </div>

      <CategoryDialog open={dialogOpen} onClose={() => setDialogOpen(false)} editing={editing} onSaved={(name) => showNotice(editing ? `${name} updated` : `${name} added`)} />
    </div>
  );
}

function Kpi({ icon: Icon, accent, label, value, sub }: { icon: React.ComponentType<{ className?: string }>; accent: "neutral" | "signal" | "alert" | "amber"; label: string; value: string; sub?: string }) {
  return (
    <Card accent={accent}>
      <CardHeader className="pb-1"><div className="flex items-center gap-2"><Icon className="h-4 w-4 text-ledger-400" /><CardTitle>{label}</CardTitle></div></CardHeader>
      <CardContent className="pt-0">
        <CardValue className="text-xl">{value}</CardValue>
        {sub && <p className="mt-0.5 text-xs text-ledger-400">{sub}</p>}
      </CardContent>
    </Card>
  );
}