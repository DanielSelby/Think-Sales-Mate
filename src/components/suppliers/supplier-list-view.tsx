"use client";

import * as React from "react";
import {
  Search, Filter, Plus, Download, Upload, X, RefreshCw, Building2, CheckCircle2,
  Banknote, Wallet, Timer, ChevronRight, ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/sales/format";
import { SUPPLIER_STATUS_LABEL, SUPPLIER_STATUS_TONE } from "@/lib/suppliers/format";
import { SupplierRowMenu } from "@/components/suppliers/supplier-row-menu";
import { KpiFlipCard } from "@/components/charts/kpi-flip-card";
import { AddSupplierDialog } from "@/components/suppliers/add-supplier-dialog";
import { ImportSuppliersDialog } from "@/components/suppliers/import-suppliers-dialog";
import { bulkUpdateSupplierStatus, bulkDeleteSuppliers } from "@/app/(dashboard)/purchases/suppliers/actions";
import { useRouter } from "next/navigation";
import type { SupplierStatus } from "@/types/database";

export interface SupplierRow {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  category: string | null;
  country: string | null;
  paymentTerms: string | null;
  status: SupplierStatus;
  totalPurchases: number;
  outstanding: number;
}

export interface SupplierKpis {
  totalSuppliers: number;
  activeSuppliers: number;
  totalPurchaseValue: number;
  outstandingPayables: number;
  onTimeDeliveryRate: number | null;
}

export interface SupplierOverviewSlice {
  status: SupplierStatus;
  count: number;
}

export interface TopSupplierByValue {
  name: string;
  total: number;
}

export interface SupplierActivity {
  id: string;
  label: string;
  supplierName: string;
  createdAt: string;
}

interface SupplierListViewProps {
  suppliers: SupplierRow[];
  kpis: SupplierKpis;
  currency: string;
  categories: string[];
  countries: string[];
  overview: SupplierOverviewSlice[];
  topSuppliers: TopSupplierByValue[];
  recentActivity: SupplierActivity[];
}

const DONUT_COLORS: Record<SupplierStatus, string> = {
  active: "#1d8f5e",
  inactive: "#a8781f",
  blacklisted: "#b8402f",
};

const ROWS_PER_PAGE_OPTIONS = [10, 25, 50];

export function SupplierListView({
  suppliers, kpis, currency, categories, countries, overview, topSuppliers, recentActivity,
}: SupplierListViewProps) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState("all");
  const [status, setStatus] = React.useState<"all" | SupplierStatus>("all");
  const [country, setCountry] = React.useState("all");
  const [paymentTerms, setPaymentTerms] = React.useState("all");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [page, setPage] = React.useState(1);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);
  const [notice, setNotice] = React.useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [bulkPending, setBulkPending] = React.useState(false);

  function showNotice(message: string, tone: "success" | "error" = "success") {
    setNotice({ message, tone });
    setTimeout(() => setNotice(null), 4000);
  }

  const paymentTermsOptions = React.useMemo(
    () => Array.from(new Set(suppliers.map((s) => s.paymentTerms).filter(Boolean))) as string[],
    [suppliers]
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return suppliers.filter((s) => {
      if (category !== "all" && s.category !== category) return false;
      if (status !== "all" && s.status !== status) return false;
      if (country !== "all" && s.country !== country) return false;
      if (paymentTerms !== "all" && s.paymentTerms !== paymentTerms) return false;
      if (q) {
        const matches =
          s.name.toLowerCase().includes(q) ||
          (s.email ?? "").toLowerCase().includes(q) ||
          (s.phone ?? "").toLowerCase().includes(q) ||
          (s.category ?? "").toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [suppliers, query, category, status, country, paymentTerms]);

  const filteredKpis = React.useMemo(() => {
    const totalSuppliers = filtered.length;
    const activeSuppliers = filtered.filter((s) => s.status === "active").length;
    const totalPurchaseValue = filtered.reduce((sum, s) => sum + s.totalPurchases, 0);
    const outstandingPayables = filtered.reduce((sum, s) => sum + s.outstanding, 0);
    return { totalSuppliers, activeSuppliers, totalPurchaseValue, outstandingPayables };
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
    const header = ["Name", "Contact Person", "Phone", "Email", "Category", "Country", "Payment Terms", "Status", "Total Purchases", "Outstanding"];
    const rows = filtered.map((s) => [
      s.name, s.contactPerson ?? "", s.phone ?? "", s.email ?? "", s.category ?? "", s.country ?? "",
      s.paymentTerms ?? "", SUPPLIER_STATUS_LABEL[s.status], s.totalPurchases, s.outstanding,
    ]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `suppliers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleBulkStatus(next: SupplierStatus) {
    setBulkPending(true);
    const result = await bulkUpdateSupplierStatus(selected, next);
    setBulkPending(false);
    if (!result.ok) return showNotice(result.error ?? "Something went wrong.", "error");
    showNotice(`Updated ${result.updated} supplier(s)`);
    setSelected([]);
    router.refresh();
  }

  async function handleBulkDelete() {
    setBulkPending(true);
    const result = await bulkDeleteSuppliers(selected);
    setBulkPending(false);
    if (!result.ok) return showNotice(result.error ?? "Something went wrong.", "error");
    showNotice(result.error ?? `Deleted ${result.deleted} supplier(s)`, result.error ? "error" : "success");
    setSelected([]);
    router.refresh();
  }

  const donutTotal = overview.reduce((sum, s) => sum + s.count, 0);
  const maxSupplierTotal = Math.max(1, ...topSuppliers.map((s) => s.total));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">Suppliers</h1>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-ledger-500 dark:text-ledger-400">
            Purchases <ChevronRight className="h-3.5 w-3.5" /> All Suppliers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="md" onClick={exportCsv}>
            <Download className="h-4 w-4" /> Export
          </Button>
          <Button variant="outline" size="md" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" /> Import
          </Button>
          <Button variant="primary" size="md" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Add Supplier
          </Button>
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

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
            <KpiFlipCard color="blue" label="Total Suppliers" value={`${filteredKpis.totalSuppliers}`} icon={<Building2 className="h-full w-full" />} detail="Number of suppliers matching the current filters." />
            <KpiFlipCard color="green" label="Active Suppliers" value={`${filteredKpis.activeSuppliers}`} icon={<CheckCircle2 className="h-full w-full" />} detail="Filtered suppliers currently marked Active." featured />
            <KpiFlipCard color="amber" label="Total Purchases" value={formatCurrency(filteredKpis.totalPurchaseValue, currency)} icon={<Banknote className="h-full w-full" />} detail="Sum of total purchase value across the filtered suppliers." />
            <KpiFlipCard color="red" label="Outstanding Payables" value={formatCurrency(filteredKpis.outstandingPayables, currency)} icon={<Wallet className="h-full w-full" />} detail="Total still owed to the filtered suppliers." />
            <KpiFlipCard color="purple" label="On-Time Delivery" value={kpis.onTimeDeliveryRate === null ? "—" : `${kpis.onTimeDeliveryRate}%`} icon={<Timer className="h-full w-full" />} detail="Org-wide rate — SupplierRow doesn't carry delivery-timing data to scope this per-filter." />
          </div>

          {/* Filters */}
          <Card accent="neutral">
            <CardContent className="pt-5">
              <div className="flex flex-wrap items-end gap-3">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ledger-400" />
                  <Input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search by supplier name, email, phone, category..." className="pl-9" />
                </div>
                <div className="w-40">
                  <label className="mb-1 block text-xs font-medium text-ledger-500">Category</label>
                  <Select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
                    <option value="all">All Categories</option>
                    {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </div>
                <div className="w-36">
                  <label className="mb-1 block text-xs font-medium text-ledger-500">Status</label>
                  <Select value={status} onChange={(e) => { setStatus(e.target.value as "all" | SupplierStatus); setPage(1); }}>
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="blacklisted">Blacklisted</option>
                  </Select>
                </div>
                <div className="w-36">
                  <label className="mb-1 block text-xs font-medium text-ledger-500">Country</label>
                  <Select value={country} onChange={(e) => { setCountry(e.target.value); setPage(1); }}>
                    <option value="all">All Countries</option>
                    {countries.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </div>
                <div className="w-36">
                  <label className="mb-1 block text-xs font-medium text-ledger-500">Payment Terms</label>
                  <Select value={paymentTerms} onChange={(e) => { setPaymentTerms(e.target.value); setPage(1); }}>
                    <option value="all">All Terms</option>
                    {paymentTermsOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                  </Select>
                </div>
                <Button variant="outline" size="md"><Filter className="h-4 w-4" /> More Filters</Button>
                <Button variant="ghost" size="md" onClick={() => { setQuery(""); setCategory("all"); setStatus("all"); setCountry("all"); setPaymentTerms("all"); setPage(1); }}>
                  <RefreshCw className="h-4 w-4" /> Clear
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Toolbar: count + bulk actions */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ledger-500">
              <span className="font-medium text-ink-900 dark:text-white">All Suppliers</span> — {filtered.length}
            </p>
            {selected.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-ledger-500">{selected.length} selected</span>
                <Button variant="outline" size="md" onClick={() => handleBulkStatus("active")} disabled={bulkPending}>Activate</Button>
                <Button variant="outline" size="md" onClick={() => handleBulkStatus("inactive")} disabled={bulkPending}>Deactivate</Button>
                <Button variant="outline" size="md" onClick={exportCsv} disabled={bulkPending}>Export</Button>
                <Button variant="destructive" size="md" onClick={handleBulkDelete} disabled={bulkPending}>Delete</Button>
              </div>
            )}
          </div>

          {/* Table */}
          <Card accent="neutral" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-white dark:bg-ink-900">
                  <tr className="border-b border-ledger-100 text-ledger-400 dark:border-ledger-700">
                    <th className="w-10 px-4 py-3"><input type="checkbox" checked={allChecked} onChange={toggleAll} className="h-4 w-4 rounded border-ledger-300 accent-signal" /></th>
                    <th className="px-3 py-3 font-medium">Supplier Name</th>
                    <th className="px-3 py-3 font-medium">Contact Person</th>
                    <th className="px-3 py-3 font-medium">Phone</th>
                    <th className="px-3 py-3 font-medium">Email</th>
                    <th className="px-3 py-3 font-medium">Category</th>
                    <th className="px-3 py-3 font-medium">Payment Terms</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 text-right font-medium">Total Purchases</th>
                    <th className="px-3 py-3 text-right font-medium">Outstanding</th>
                    <th className="px-3 py-3 pr-4 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700">
                  {pageRows.length === 0 && (
                    <tr><td colSpan={11} className="px-4 py-12 text-center text-ledger-400">No suppliers match your filters.</td></tr>
                  )}
                  {pageRows.map((s) => (
                    <tr key={s.id} className="hover:bg-ledger-50/60 dark:hover:bg-white/[0.03]">
                      <td className="px-4 py-3"><input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggleRow(s.id)} className="h-4 w-4 rounded border-ledger-300 accent-signal" /></td>
                      <td className="px-3 py-3 font-medium text-ink-900 dark:text-white">{s.name}</td>
                      <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">{s.contactPerson ?? "—"}</td>
                      <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">{s.phone ?? "—"}</td>
                      <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">{s.email ?? "—"}</td>
                      <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">{s.category ?? "—"}</td>
                      <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">{s.paymentTerms ?? "—"}</td>
                      <td className="px-3 py-3"><Badge tone={SUPPLIER_STATUS_TONE[s.status]}>{SUPPLIER_STATUS_LABEL[s.status]}</Badge></td>
                      <td className="px-3 py-3 text-right font-mono font-medium text-ink-900 dark:text-white">{formatCurrency(s.totalPurchases, currency)}</td>
                      <td className="px-3 py-3 text-right font-mono text-ledger-600 dark:text-ledger-300">{formatCurrency(s.outstanding, currency)}</td>
                      <td className="px-3 py-3 pr-4">
                        <SupplierRowMenu supplierId={s.id} supplierName={s.name} status={s.status} onNotice={showNotice} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ledger-100 px-4 py-3 dark:border-ledger-700">
              <p className="text-sm text-ledger-500">
                Showing {pageRows.length === 0 ? 0 : (clampedPage - 1) * rowsPerPage + 1}–{(clampedPage - 1) * rowsPerPage + pageRows.length} of {filtered.length} suppliers
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

        {/* Analytics panel */}
        <div className="space-y-5">
          <Card accent="neutral">
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Supplier Overview</CardTitle></CardHeader>
            <CardContent className="space-y-2 pt-0">
              {overview.map((o) => (
                <div key={o.status} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-ledger-500">
                    <span className="h-2 w-2 rounded-full" style={{ background: DONUT_COLORS[o.status] }} />
                    {SUPPLIER_STATUS_LABEL[o.status]}
                  </span>
                  <span className="font-medium text-ink-900 dark:text-white">
                    {o.count} ({donutTotal ? Math.round((o.count / donutTotal) * 100) : 0}%)
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card accent="neutral">
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Top Suppliers (By Purchase Value)</CardTitle></CardHeader>
            <CardContent className="space-y-3 pt-0">
              {topSuppliers.length === 0 && <p className="text-sm text-ledger-400">No purchases yet.</p>}
              {topSuppliers.map((s) => (
                <div key={s.name}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="truncate text-ink-900 dark:text-white">{s.name}</span>
                    <span className="font-mono text-xs text-ledger-500">{formatCurrency(s.total, currency)}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-ledger-100 dark:bg-white/[0.06]">
                    <div className="h-1.5 rounded-full bg-signal" style={{ width: `${(s.total / maxSupplierTotal) * 100}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card accent="neutral">
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Recent Supplier Activity</CardTitle></CardHeader>
            <CardContent className="space-y-3 pt-0">
              {recentActivity.length === 0 && <p className="text-sm text-ledger-400">No recent activity.</p>}
              {recentActivity.map((a) => (
                <div key={a.id} className="text-sm">
                  <p className="text-ink-900 dark:text-white">{a.label} <span className="font-medium">{a.supplierName}</span></p>
                  <p className="text-xs text-ledger-400">{new Date(a.createdAt).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" })}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card accent="neutral">
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Quick Actions</CardTitle></CardHeader>
            <CardContent className="space-y-1 pt-0">
              <QuickAction label="Add New Supplier" onClick={() => setAddOpen(true)} />
              <QuickAction label="Import Suppliers" onClick={() => setImportOpen(true)} />
              <QuickAction label="Export Suppliers" onClick={exportCsv} />
            </CardContent>
          </Card>
        </div>
      </div>

      <AddSupplierDialog open={addOpen} onClose={() => setAddOpen(false)} currency={currency} onCreated={(name) => showNotice(`${name} added`)} />
      <ImportSuppliersDialog open={importOpen} onClose={() => setImportOpen(false)} onImported={(count) => showNotice(`Imported ${count} supplier(s)`)} />
    </div>
  );
}


function QuickAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between rounded-md px-2 py-2 text-sm text-ink-900 hover:bg-ledger-50 dark:text-white dark:hover:bg-white/[0.06]">
      {label} <ArrowRight className="h-3.5 w-3.5 text-ledger-400" />
    </button>
  );
}