"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Search, Filter, Plus, Download, Eye, Pencil, Printer,
  ChevronLeft, ChevronRight, ShoppingCart, Wallet, Clock3, CheckCircle2, Undo2, Gem, XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiFlipCard } from "@/components/charts/kpi-flip-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { SaleStatusMenu } from "@/components/sales/sale-status-menu";
import { useAppStore, THEMES } from "@/store/useAppStore";
import { getSaleInvoiceItems } from "@/app/(dashboard)/sales/actions";
import { buildInvoiceHtml } from "@/lib/sales/invoice-template";
import { cn } from "@/lib/utils";
import {
  formatCurrency, formatDateTime, formatInvoiceNumber,
  PAYMENT_STATUS_LABEL, SALE_STATUS_LABEL, type PaymentStatus, type SaleStatus,
} from "@/lib/sales/format";

export interface SaleListRow {
  id: string;
  saleNumber: number;
  customerName: string;
  customerPhone: string | null;
  saleDate: string; // ISO
  locationName: string | null;
  soldByName: string;
  primaryProductName: string | null;
  productLineCount: number;
  itemCount: number;
  total: number;
  amountPaid: number;
  paymentMethod: string | null;
  paymentStatus: PaymentStatus;
  status: SaleStatus;
  refundedAmount: number;
}

export interface SalesKpis {
  totalOrders: number;
  totalRevenue: number;
  outstandingBalance: number;
  fullyPaidOrders: number;
  partiallyPaidOrders: number;
  averageOrderValue: number;
  completedOrders: number;
  returnedAmount: number;
}

interface SalesListViewProps {
  sales: SaleListRow[];
  kpis: SalesKpis;
  currency: string;
  locations: string[];
  salesReps: string[];
  orgName: string;
  logoUrl?: string | null;
  showLogoOnInvoices?: boolean;
}

const STATUS_TABS: { key: "all" | SaleStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "completed", label: "Completed" },
  { key: "returned", label: "Returned" },
  { key: "cancelled", label: "Cancelled" },
];

const PAYMENT_BADGE_TONE: Record<PaymentStatus, "signal" | "amber" | "alert"> = {
  paid: "signal",
  partially_paid: "amber",
  pending: "alert",
};

const SALE_STATUS_BADGE_TONE: Record<SaleStatus, "signal" | "amber" | "alert" | "neutral"> = {
  completed: "signal",
  returned: "alert",
  cancelled: "neutral",
};

const ROWS_PER_PAGE_OPTIONS = [10, 50, 100, 1000] as const;

export function SalesListView({ sales, kpis, currency, locations, salesReps, orgName, logoUrl, showLogoOnInvoices }: SalesListViewProps) {
  const { activeTheme } = useAppStore();
  const theme = THEMES[activeTheme];
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | SaleStatus>("all");
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("all");
  const [salesRep, setSalesRep] = useState("all");
  const [paymentStatus, setPaymentStatus] = useState<"all" | PaymentStatus>("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState<number | "all">(10);

  const counts = useMemo(() => {
    const c: Record<"all" | SaleStatus, number> = { all: sales.length, completed: 0, returned: 0, cancelled: 0 };
    for (const s of sales) c[s.status] += 1;
    return c;
  }, [sales]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sales.filter((s) => {
      if (activeTab !== "all" && s.status !== activeTab) return false;
      if (paymentStatus !== "all" && s.paymentStatus !== paymentStatus) return false;
      if (location !== "all" && s.locationName !== location) return false;
      if (salesRep !== "all" && s.soldByName !== salesRep) return false;
      if (q) {
        const invoice = formatInvoiceNumber(s.saleNumber).toLowerCase();
        if (!invoice.includes(q) && !s.customerName.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [sales, activeTab, paymentStatus, location, salesRep, query]);

  const filteredKpis = useMemo(() => {
    const totalOrders = filtered.length;
    const totalRevenue = filtered.reduce((sum, s) => sum + s.total, 0);
    const outstandingBalance = filtered.reduce((sum, s) => sum + Math.max(0, s.total - s.amountPaid), 0);
    const completedOrders = filtered.filter((s) => s.status === "completed").length;
    const returnedAmount = filtered.filter((s) => s.status === "returned").reduce((sum, s) => sum + s.refundedAmount, 0);
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    return { totalOrders, totalRevenue, outstandingBalance, completedOrders, returnedAmount, averageOrderValue };
  }, [filtered]);

  const effectiveRowsPerPage = rowsPerPage === "all" ? Math.max(1, filtered.length) : rowsPerPage;
  const totalPages = rowsPerPage === "all" ? 1 : Math.max(1, Math.ceil(filtered.length / effectiveRowsPerPage));
  const clampedPage = Math.min(page, totalPages);
  const pageRows = rowsPerPage === "all" ? filtered : filtered.slice((clampedPage - 1) * effectiveRowsPerPage, clampedPage * effectiveRowsPerPage);
  const allChecked = pageRows.length > 0 && pageRows.every((r) => selected.includes(r.id));

  function toggleAll() {
    if (allChecked) {
      setSelected((prev) => prev.filter((id) => !pageRows.some((r) => r.id === id)));
    } else {
      setSelected((prev) => Array.from(new Set([...prev, ...pageRows.map((r) => r.id)])));
    }
  }

  function toggleRow(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handlePrint(sale: SaleListRow) {
    setPrintingId(sale.id);
    try {
      const items = await getSaleInvoiceItems(sale.id);
      const html = buildInvoiceHtml({
        orgName,
        logoUrl,
        showLogoOnInvoices,
        saleNumber: sale.saleNumber,
        saleDate: sale.saleDate,
        customerName: sale.customerName,
        soldByName: sale.soldByName,
        locationName: sale.locationName,
        paymentMethod: sale.paymentMethod,
        paymentStatus: sale.paymentStatus,
        subtotal: sale.total,
        total: sale.total,
        amountPaid: sale.amountPaid,
        currency,
        items
      });
      const win = window.open("", "_blank", "width=800,height=900");
      if (!win) return;
      win.document.write(html);
      win.document.close();
      win.focus();
      win.print();
    } finally {
      setPrintingId(null);
    }
  }

  function resetFilters() {
    setQuery("");
    setLocation("all");
    setSalesRep("all");
    setPaymentStatus("all");
    setActiveTab("all");
    setPage(1);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">Sales</h1>
          <p className="mt-0.5 text-sm text-ledger-500 dark:text-ledger-400">View and manage all sales transactions</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/sales/drafts"
            className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-ledger-200 px-4 text-sm font-medium text-ledger-600 hover:bg-ledger-50 dark:border-ledger-700 dark:text-ledger-300 dark:hover:bg-white/[0.06]"
          >
            <Pencil className="h-4 w-4" />
            Drafts &amp; Quotations
          </Link>
          <Button variant="outline" size="md">
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Link
            href="/sales/new"
            className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 text-sm font-medium text-white shadow-sm transition-all active:scale-[0.98]"
            style={{ background: theme.colors.primary }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = theme.colors.primaryMid; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = theme.colors.primary; }}
          >
            <Plus className="h-4 w-4" />
            New Sale
          </Link>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <KpiFlipCard
          color="blue"
          label="Total Sales"
          value={`${filteredKpis.totalOrders} orders`}
          icon={<ShoppingCart className="h-full w-full" />}
          detail="Total number of sales matching the current filters — across every status: completed, returned, and cancelled."
        />
        <KpiFlipCard
          color="green"
          label="Total Revenue"
          value={formatCurrency(filteredKpis.totalRevenue, currency)}
          icon={<Wallet className="h-full w-full" />}
          detail="Sum of the total on every filtered sale, regardless of how much of it has actually been paid so far."
          featured
        />
        <KpiFlipCard
          color="amber"
          label="Outstanding Balance"
          value={formatCurrency(filteredKpis.outstandingBalance, currency)}
          icon={<Clock3 className="h-full w-full" />}
          detail="Total still owed across the filtered sales — each sale's total minus whatever amount has been paid toward it."
        />
        <KpiFlipCard
          color="green"
          label="Completed Orders"
          value={`${filteredKpis.completedOrders}`}
          icon={<CheckCircle2 className="h-full w-full" />}
          detail="Filtered sales currently marked Completed — excludes any that have since been returned or cancelled."
        />
        <KpiFlipCard
          color="red"
          label="Returns"
          value={formatCurrency(filteredKpis.returnedAmount, currency)}
          icon={<Undo2 className="h-full w-full" />}
          detail="Total refunded amount across filtered sales marked as Returned."
        />
        <KpiFlipCard
          color="purple"
          label="Average Order Value"
          value={formatCurrency(filteredKpis.averageOrderValue, currency)}
          icon={<Gem className="h-full w-full" />}
          detail="Filtered total revenue divided by the number of filtered sales — the typical size of a single transaction."
        />
      </div>

      {/* Filter bar */}
      <Card accent="neutral">
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ledger-400" />
              <Input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                placeholder="Search by invoice or customer name..."
                className="pl-9"
              />
            </div>

            <div className="w-40">
              <label className="mb-1 block text-xs font-medium text-ledger-500">Branch</label>
              <Select value={location} onChange={(e) => { setLocation(e.target.value); setPage(1); }}>
                <option value="all">All Branches</option>
                {locations.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </Select>
            </div>

            <div className="w-40">
              <label className="mb-1 block text-xs font-medium text-ledger-500">Sales Rep</label>
              <Select value={salesRep} onChange={(e) => { setSalesRep(e.target.value); setPage(1); }}>
                <option value="all">All Sales Reps</option>
                {salesReps.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
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
              <Filter className="h-4 w-4" />
              More Filters
            </Button>
            <Button variant="ghost" size="md" onClick={resetFilters}>
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2">
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
        <div className="flex items-center gap-2 text-sm text-ledger-500">
          Rows per page
          <Select
            value={rowsPerPage}
            onChange={(e) => { setRowsPerPage(e.target.value === "all" ? "all" : Number(e.target.value)); setPage(1); }}
            className="h-8 w-24"
          >
            <option value="all">Show All</option>
            {ROWS_PER_PAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </Select>
        </div>
      </div>

      {/* Table */}
      <Card accent="neutral" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ledger-100 text-ink-900 dark:border-ledger-700 dark:text-white">
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} className="h-4 w-4 rounded border-ledger-300 accent-signal" />
                </th>
                <th className="px-3 py-3 min-w-[130px] font-semibold whitespace-nowrap">Invoice</th>
                <th className="px-3 py-3 min-w-[130px] font-semibold whitespace-nowrap">Date &amp; Time</th>
                <th className="px-3 py-3 min-w-[150px] font-semibold whitespace-nowrap">Customer</th>
                <th className="px-3 py-3 min-w-[130px] font-semibold whitespace-nowrap">Customer #</th>
                <th className="px-3 py-3 min-w-[120px] font-semibold whitespace-nowrap">Sold By</th>
                <th className="px-3 py-3 min-w-[180px] font-semibold whitespace-nowrap">Product</th>
                <th className="px-3 py-3 min-w-[80px] text-right font-semibold whitespace-nowrap">Items</th>
                <th className="px-3 py-3 min-w-[120px] text-right font-semibold whitespace-nowrap">Total</th>
                <th className="px-3 py-3 min-w-[140px] font-semibold whitespace-nowrap">Payment Method</th>
                <th className="px-3 py-3 min-w-[130px] font-semibold whitespace-nowrap">Payment Status</th>
                <th className="px-3 py-3 min-w-[120px] font-semibold whitespace-nowrap">Sales Status</th>
                <th className="px-3 py-3 min-w-[110px] font-semibold whitespace-nowrap">Branch</th>
                <th className="px-3 py-3 pr-4 min-w-[160px] text-right font-semibold whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700">
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={14} className="px-4 py-12 text-center text-ledger-400">
                    No sales match your filters.
                  </td>
                </tr>
              )}
              {pageRows.map((s) => {
                const { date, time } = formatDateTime(s.saleDate);
                return (
                  <tr key={s.id} className="hover:bg-ledger-50/60 dark:hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.includes(s.id)}
                        onChange={() => toggleRow(s.id)}
                        className="h-4 w-4 rounded border-ledger-300 accent-signal"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex items-center gap-1.5">
                        <Link href={`/sales/${s.id}`} className="font-mono text-[13px] font-medium text-signal hover:underline">
                          {formatInvoiceNumber(s.saleNumber)}
                        </Link>
                        {s.status === "returned" && (
                       <span
                         title="Returned"
                         className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white"
                         style={{ background: "#dd2d4a" }}
                       >
                       <Undo2 className="h-3 w-3" />
                        </span>
                            )}
                        {s.status === "cancelled" && (
                      <span
                        title="Cancelled"
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white"
                        style={{ background: "#bc6c25" }}
                      >
                   <XCircle className="h-3 w-3" />
                       </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">
                      {date}
                      <div className="text-xs text-ledger-400">{time}</div>
                    </td>
                    <td className="px-3 py-3 text-ink-900 dark:text-white">{s.customerName}</td>
                    <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">{s.customerPhone ?? "—"}</td>
                    <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">{s.soldByName}</td>
                    <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">
                      {s.primaryProductName ?? "—"}
                      {s.productLineCount > 1 && <span className="text-ledger-400"> +{s.productLineCount - 1} more</span>}
                    </td>
                    <td className="px-3 py-3 text-right text-ledger-600 dark:text-ledger-300">{s.itemCount}</td>
                    <td className="px-3 py-3 text-right font-mono font-medium text-ink-900 dark:text-white">
                      {formatCurrency(s.total, currency)}
                    </td>
                    <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">{s.paymentMethod ?? "—"}</td>
                    <td className="px-3 py-3">
                      <Badge tone={PAYMENT_BADGE_TONE[s.paymentStatus]}>{PAYMENT_STATUS_LABEL[s.paymentStatus]}</Badge>
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={SALE_STATUS_BADGE_TONE[s.status]}>{SALE_STATUS_LABEL[s.status]}</Badge>
                    </td>
                    <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">{s.locationName ?? "—"}</td>
                    <td className="px-3 py-3 pr-4">
                      <div className="flex items-center justify-end gap-1 text-ledger-400">
                        <Link href={`/sales/${s.id}`} className="rounded-md p-1.5 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white" title="View">
                          <Eye className="h-4 w-4" />
                        </Link>
                        <Link href={`/sales/${s.id}/edit`} className="rounded-md p-1.5 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white" title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={() => handlePrint(s)}
                          className="rounded-md p-1.5 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white"
                          title="Print"
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                        <SaleStatusMenu saleId={s.id} status={s.status} total={s.total} currency={currency} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ledger-100 px-4 py-3 dark:border-ledger-700">
          <p className="text-sm text-ledger-500">
            Showing {pageRows.length === 0 ? 0 : (clampedPage - 1) * effectiveRowsPerPage + 1}–
            {(clampedPage - 1) * effectiveRowsPerPage + pageRows.length} of {filtered.length} sales
          </p>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={clampedPage === 1}
                className="rounded-md border border-ledger-200 p-2 text-ledger-500 hover:bg-ledger-50 disabled:opacity-40 dark:border-ledger-700"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-2 text-sm text-ledger-600 dark:text-ledger-300">
                Page {clampedPage} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={clampedPage === totalPages}
                className="rounded-md border border-ledger-200 p-2 text-ledger-500 hover:bg-ledger-50 disabled:opacity-40 dark:border-ledger-700"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}