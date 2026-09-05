"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import {
  Search, Filter, Plus, Download, Printer, ShoppingBag, Clock3, PackageCheck,
  AlertTriangle, Wallet, Banknote, X, RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDateTime, PAYMENT_STATUS_LABEL, type PaymentStatus } from "@/lib/sales/format";
import { PURCHASE_STATUS_LABEL, PURCHASE_STATUS_TONE, formatPurchaseNumber } from "@/lib/purchases/format";
import { PurchaseRowMenu } from "@/components/purchases/purchase-row-menu";
import { KpiFlipCard } from "@/components/charts/kpi-flip-card";
import type { PurchaseStatus } from "@/types/database";
import { useAppStore, THEMES } from "@/store/useAppStore";
import { useAccountingStore } from "@/lib/accounting/accounting-store";

export interface PurchaseRow {
  id: string;
  purchaseNumber: number;
  date: string;
  createdAt: string;
  invoiceNumber: string | null;
  supplierName: string;
  locationName: string;
  itemCount: number;
  primaryProductName: string | null;
  total: number;
  paidAmount: number;
  paymentStatus: PaymentStatus;
  status: PurchaseStatus;
  createdByName: string;
  expectedDeliveryDate: string | null;
}

export interface PurchaseKpis {
  totalPurchases: number;
  totalValue: number;
  pendingOrders: number;
  receivedOrders: number;
  overdueDeliveries: number;
  outstandingPayments: number;
}

export interface AnalyticsSlice {
  status: PurchaseStatus;
  count: number;
}

export interface TopSupplier {
  name: string;
  total: number;
}

export interface CategoryBreakdown {
  name: string;
  total: number;
}

export interface RecentActivity {
  id: string;
  label: string;
  purchaseNumber: number;
  actorName: string;
  createdAt: string;
}

interface PurchaseListViewProps {
  purchases: PurchaseRow[];
  kpis: PurchaseKpis;
  currency: string;
  suppliers: string[];
  locations: string[];
  initialLocation?: string;
  overview: AnalyticsSlice[];
  topSuppliers: TopSupplier[];
  categories: CategoryBreakdown[];
  recentActivity: RecentActivity[];
}

const STATUS_TABS: { key: "all" | PurchaseStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "ordered", label: "Ordered" },
  { key: "partially_received", label: "Partially Received" },
  { key: "received", label: "Received" },
  { key: "cancelled", label: "Cancelled" },
];

const DONUT_COLORS: Record<PurchaseStatus, string> = {
  received: "#1d8f5e",
  partially_received: "#a8781f",
  ordered: "#68655c",
  draft: "#b3ab97",
  cancelled: "#b8402f",
};

const ROWS_PER_PAGE_OPTIONS = [10, 25, 50];

export function PurchaseListView({
  purchases, kpis, currency, suppliers, locations, initialLocation = "all", overview, topSuppliers, categories, recentActivity,
}: PurchaseListViewProps) {
  const { activeTheme } = useAppStore();
  const setBranch = useAccountingStore((state) => state.setBranch);
  const theme = THEMES[activeTheme];
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = React.useState<"all" | PurchaseStatus>("all");
  const [query, setQuery] = React.useState("");
  const [supplier, setSupplier] = React.useState(() => searchParams.get("supplier") ?? "all");
  const [location, setLocation] = React.useState(initialLocation);
  const [paymentStatus, setPaymentStatus] = React.useState<"all" | PaymentStatus>("all");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [page, setPage] = React.useState(1);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);
  const [notice, setNotice] = React.useState<{ message: string; tone: "success" | "error" } | null>(null);

  React.useEffect(() => {
    setLocation(initialLocation);
    setPage(1);
  }, [initialLocation]);

  function showNotice(message: string, tone: "success" | "error" = "success") {
    setNotice({ message, tone });
    setTimeout(() => setNotice(null), 4000);
  }

  const counts = React.useMemo(() => {
    const c: Record<"all" | PurchaseStatus, number> = {
      all: purchases.length, draft: 0, ordered: 0, partially_received: 0, received: 0, cancelled: 0,
    };
    for (const p of purchases) c[p.status] += 1;
    return c;
  }, [purchases]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return purchases.filter((p) => {
      if (activeTab !== "all" && p.status !== activeTab) return false;
      if (supplier !== "all" && p.supplierName !== supplier) return false;
      if (location !== "all" && p.locationName !== location) return false;
      if (paymentStatus !== "all" && p.paymentStatus !== paymentStatus) return false;
      if (q) {
        const poNumber = formatPurchaseNumber(p.purchaseNumber).toLowerCase();
        const invoiceNumber = (p.invoiceNumber ?? "").toLowerCase();
        const matches =
          poNumber.includes(q) ||
          invoiceNumber.includes(q) ||
          p.supplierName.toLowerCase().includes(q) ||
          (p.primaryProductName ?? "").toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [purchases, activeTab, supplier, location, paymentStatus, query]);

  const filteredKpis = React.useMemo(() => {
    const totalPurchases = filtered.length;
    const totalValue = filtered.reduce((sum, p) => sum + p.total, 0);
    const pendingOrders = filtered.filter((p) => p.status === "draft" || p.status === "ordered" || p.status === "partially_received").length;
    const receivedOrders = filtered.filter((p) => p.status === "received").length;
    const overdueDeliveries = filtered.filter(
      (p) => p.expectedDeliveryDate && new Date(p.expectedDeliveryDate) < new Date() && p.status !== "received" && p.status !== "cancelled"
    ).length;
    const outstandingPayments = filtered.reduce((sum, p) => sum + Math.max(0, p.total - p.paidAmount), 0);
    return { totalPurchases, totalValue, pendingOrders, receivedOrders, overdueDeliveries, outstandingPayments };
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

  const donutData = overview.map((slice) => ({
    name: PURCHASE_STATUS_LABEL[slice.status],
    value: slice.count,
    color: DONUT_COLORS[slice.status],
  }));
  const donutTotal = donutData.reduce((sum, d) => sum + d.value, 0);
  const maxSupplierTotal = Math.max(1, ...topSuppliers.map((s) => s.total));
  const maxCategoryTotal = Math.max(1, ...categories.map((c) => c.total));

  return (
    <div className="space-y-4 text-xs">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-900 dark:text-white">All Purchases</h1>
          <p className="mt-0.5 text-sm text-ledger-500 dark:text-ledger-400">
            {purchases.length} purchase orders across all suppliers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="md">
            <Download className="h-4 w-4" /> Export
          </Button>
          <Button variant="outline" size="md" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Link
            href="/purchases/new"
            className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 text-sm font-medium text-white shadow-sm transition-all active:scale-[0.98]"
            style={{ background: theme.colors.primary }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = theme.colors.primaryMid; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = theme.colors.primary; }}
          >
            <Plus className="h-4 w-4" /> New Purchase
          </Link>
        </div>
      </div>

      {notice && (
        <div
          className={cn(
            "flex items-center justify-between gap-2 rounded-md border px-4 py-2.5 text-sm",
            notice.tone === "success"
              ? "border-signal/30 bg-signal-soft text-ink-900 dark:bg-signal/10 dark:text-white"
              : "border-alert/30 bg-alert-soft text-alert"
          )}
        >
          {notice.message}
          <button onClick={() => setNotice(null)}><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Main column — KPIs, filters, table now run full width         */}
      {/* ------------------------------------------------------------- */}
      <div className="space-y-5">
        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
          <KpiFlipCard color="blue" label="Total Purchases" value={`${filteredKpis.totalPurchases}`} icon={<ShoppingBag className="h-full w-full" />} detail="Number of purchase orders matching the current filters." />
          <KpiFlipCard color="green" label="Total Value" value={formatCurrency(filteredKpis.totalValue, currency)} icon={<Banknote className="h-full w-full" />} detail="Combined total across every purchase order matching the current filters." featured />
          <KpiFlipCard color="amber" label="Pending Orders" value={`${filteredKpis.pendingOrders}`} icon={<Clock3 className="h-full w-full" />} detail="Orders still in Draft, Ordered, or Partially Received status." />
          <KpiFlipCard color="green" label="Received Orders" value={`${filteredKpis.receivedOrders}`} icon={<PackageCheck className="h-full w-full" />} detail="Orders fully marked as Received." />
          <KpiFlipCard color="red" label="Overdue Deliveries" value={`${filteredKpis.overdueDeliveries}`} icon={<AlertTriangle className="h-full w-full" />} detail="Orders past their expected delivery date that haven't been received or cancelled." />
          <KpiFlipCard color="purple" label="Outstanding Payments" value={formatCurrency(filteredKpis.outstandingPayments, currency)} icon={<Wallet className="h-full w-full" />} detail="Total still owed across these purchase orders." />
        </div>

        {/* Filters */}
        <Card accent="neutral">
          <CardContent className="pt-5">
            <div className="flex flex-wrap items-end gap-3">
              <div className="relative min-w-[240px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ledger-400" />
                <Input
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                  placeholder="Search by PO No., supplier, product, or invoice..."
                  className="pl-9"
                />
              </div>
              <div className="w-44">
                <label className="mb-1 block text-xs font-medium text-ledger-500">Supplier</label>
                <Select value={supplier} onChange={(e) => { setSupplier(e.target.value); setPage(1); }}>
                  <option value="all">All Suppliers</option>
                  {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </div>
              <div className="w-40">
                <label className="mb-1 block text-xs font-medium text-ledger-500">Location</label>
                <Select value={location} onChange={(e) => { setLocation(e.target.value); setBranch(e.target.value); setPage(1); }}>
                  <option value="all">All Locations</option>
                  {locations.map((l) => <option key={l} value={l}>{l}</option>)}
                </Select>
              </div>
              <div className="w-40">
                <label className="mb-1 block text-xs font-medium text-ledger-500">Payment Status</label>
                <Select value={paymentStatus} onChange={(e) => { setPaymentStatus(e.target.value as "all" | PaymentStatus); setPage(1); }}>
                  <option value="all">All</option>
                  <option value="paid">Paid</option>
                  <option value="partially_paid">Partially Paid</option>
                  <option value="pending">Pending</option>
                </Select>
              </div>
              <Button variant="outline" size="md">
                <Filter className="h-4 w-4" /> More Filters
              </Button>
              <Button
                variant="ghost"
                size="md"
                onClick={() => { setQuery(""); setSupplier("all"); setLocation("all"); setPaymentStatus("all"); setActiveTab("all"); setPage(1); }}
              >
                <RefreshCw className="h-4 w-4" /> Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tabs + bulk actions + rows-per-page */}
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
          <div className="flex items-center gap-3">
            {selected.length > 0 && (
              <Button variant="outline" size="md">
                Bulk Actions ({selected.length})
              </Button>
            )}
            <div className="flex items-center gap-2 text-sm text-ledger-500">
              Rows per page
              <Select value={rowsPerPage} onChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(1); }} className="h-8 w-20">
                {ROWS_PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </div>
          </div>
        </div>

        {/* Table */}
        <Card accent="neutral" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-white dark:bg-ink-900">
                <tr className="border-b border-ledger-100 text-ledger-400 dark:border-ledger-700">
                  <th className="w-10 px-4 py-3">
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} className="h-4 w-4 rounded border-ledger-300 accent-signal" />
                  </th>
                  <th className="px-3 py-3 font-semibold">PO Number</th>
                  <th className="px-3 py-3 font-semibold">Invoice No.</th>
                  <th className="px-3 py-3 font-semibold">Date</th>
                  <th className="px-3 py-3 font-semibold">Supplier</th>
                  <th className="px-3 py-3 font-semibold">Location</th>
                  <th className="px-3 py-3 font-semibold">Products</th>
                  <th className="px-3 py-3 text-right font-semibold">Total Amount</th>
                  <th className="px-3 py-3 font-semibold">Payment</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Created By</th>
                  <th className="px-3 py-3 pr-4 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700">
                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-4 py-12 text-center text-ledger-400">
                      No purchases match your filters.
                    </td>
                  </tr>
                )}
                {pageRows.map((p) => {
                  // purchase_date is a DATE column with no time component —
                  // deriving a "time" from it always yields midnight, so the
                  // date and time below are pulled from two different
                  // fields on purpose: `date` (the purchase date the user
                  // chose) and `createdAt` (the real save timestamp).
                  const { date } = formatDateTime(p.date);
                  const { time } = formatDateTime(p.createdAt);
                  const overdue = p.expectedDeliveryDate
                    && new Date(p.expectedDeliveryDate) < new Date()
                    && p.status !== "received" && p.status !== "cancelled";
                  return (
                    <tr key={p.id} className="hover:bg-ledger-50/60 dark:hover:bg-white/[0.03]">
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggleRow(p.id)} className="h-4 w-4 rounded border-ledger-300 accent-signal" />
                      </td>
                      <td className="px-3 py-3">
                        <Link href={`/purchases/${p.id}`} className="font-mono text-[13px] font-medium text-signal hover:underline">
                          {formatPurchaseNumber(p.purchaseNumber)}
                        </Link>
                        {overdue && <Badge tone="alert" className="ml-2">Overdue</Badge>}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-ledger-500">{p.invoiceNumber ?? "—"}</td>
                      <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">
                        {date}<div className="text-xs text-ledger-400">{time}</div>
                      </td>
                      <td className="px-3 py-3 text-ink-900 dark:text-white">{p.supplierName}</td>
                      <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">{p.locationName}</td>
                      <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">
                        {p.primaryProductName ?? "—"}
                        {p.itemCount > 1 && <span className="text-ledger-400"> +{p.itemCount - 1} more</span>}
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-medium text-ink-900 dark:text-white">
                        {formatCurrency(p.total, currency)}
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={p.paymentStatus === "paid" ? "signal" : p.paymentStatus === "partially_paid" ? "amber" : "alert"}>
                          {PAYMENT_STATUS_LABEL[p.paymentStatus]}
                        </Badge>
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={PURCHASE_STATUS_TONE[p.status]}>{PURCHASE_STATUS_LABEL[p.status]}</Badge>
                      </td>
                      <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">{p.createdByName}</td>
                      <td className="px-3 py-3 pr-4">
                        <PurchaseRowMenu
                          purchaseId={p.id}
                          purchaseNumber={p.purchaseNumber}
                          status={p.status}
                          total={p.total}
                          paidAmount={p.paidAmount}
                          currency={currency}
                          supplierName={p.supplierName}
                          onNotice={showNotice}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ledger-100 px-4 py-3 dark:border-ledger-700">
            <p className="text-sm text-ledger-500">
              Showing {pageRows.length === 0 ? 0 : (clampedPage - 1) * rowsPerPage + 1}–
              {(clampedPage - 1) * rowsPerPage + pageRows.length} of {filtered.length} purchases
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={clampedPage === 1} className="rounded-md border border-ledger-200 p-2 text-ledger-500 hover:bg-ledger-50 disabled:opacity-40 dark:border-ledger-700">‹</button>
              <span className="px-2 text-sm text-ledger-600 dark:text-ledger-300">Page {clampedPage} of {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={clampedPage === totalPages} className="rounded-md border border-ledger-200 p-2 text-ledger-500 hover:bg-ledger-50 disabled:opacity-40 dark:border-ledger-700">›</button>
            </div>
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Analytics panel — moved below the table, laid out as a row    */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <Card accent="neutral">
          <CardHeader className="pb-2">
            <CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">
              Purchase Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="relative mx-auto h-40 w-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donutData} dataKey="value" innerRadius={48} outerRadius={70} paddingAngle={2}>
                    {donutData.map((d, i) => <Cell key={i} fill={d.color} stroke="none" />)}
                  </Pie>
                  <Tooltip formatter={(v: number, n: string) => [`${v}`, n]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-display text-xl font-semibold text-ink-900 dark:text-white">{donutTotal}</span>
                <span className="text-xs text-ledger-400">Total</span>
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              {donutData.map((d) => (
                <div key={d.name} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-ledger-500">
                    <span className="h-2 w-2 rounded-full" style={{ background: d.color }} /> {d.name}
                  </span>
                  <span className="font-medium text-ink-900 dark:text-white">
                    {d.value} ({donutTotal ? Math.round((d.value / donutTotal) * 100) : 0}%)
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card accent="neutral">
          <CardHeader className="pb-2">
            <CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">
              Top Suppliers
            </CardTitle>
          </CardHeader>
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

        {categories.length > 0 && (
          <Card accent="neutral">
            <CardHeader className="pb-2">
              <CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">
                Purchase Categories
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {categories.map((c) => (
                <div key={c.name}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="truncate text-ink-900 dark:text-white">{c.name}</span>
                    <span className="font-mono text-xs text-ledger-500">{formatCurrency(c.total, currency)}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-ledger-100 dark:bg-white/[0.06]">
                    <div className="h-1.5 rounded-full bg-amber" style={{ width: `${(c.total / maxCategoryTotal) * 100}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card accent="neutral">
          <CardHeader className="pb-2">
            <CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {recentActivity.length === 0 && <p className="text-sm text-ledger-400">No recent activity.</p>}
            {recentActivity.map((a) => {
              const { date } = formatDateTime(a.createdAt);
              return (
                <div key={a.id} className="text-sm">
                  <p className="text-ink-900 dark:text-white">
                    {a.label} <span className="font-mono text-xs text-ledger-500">{formatPurchaseNumber(a.purchaseNumber)}</span>
                  </p>
                  <p className="text-xs text-ledger-400">{a.actorName} · {date}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}