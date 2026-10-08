"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Search, Filter, Plus, Download, Eye, Pencil, Printer, FileText, FileSpreadsheet, Receipt,
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
import { useAccountingStore } from "@/lib/accounting/accounting-store";
import { getSaleInvoiceItems } from "@/app/(dashboard)/sales/actions";
import { buildInvoiceHtml, waitForInvoiceImages } from "@/lib/sales/invoice-template";
import { cn } from "@/lib/utils";
import {
  formatCurrency, formatDateTime, formatInvoiceNumber,
  PAYMENT_STATUS_LABEL, SALE_STATUS_LABEL, type PaymentStatus, type SaleStatus,
} from "@/lib/sales/format";
import { InvoiceFormatSelect } from "@/components/sales/invoice-format-select";
import { useInvoiceFormat, type SalesInvoiceTemplate } from "@/lib/sales/invoice-format";

export interface SaleListRow {
  id: string;
  saleNumber: number;
  customerName: string;
  customerPhone: string | null;
  saleDate: string; // ISO
  locationName: string | null;
  locationPhone: string | null;
  locationEmail: string | null;
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

function HistoryKpi({ label, value, icon, tone }: { label: string; value: number | string; icon: React.ReactNode; tone: "emerald" | "blue" | "amber" | "purple" }) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
    purple: "bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400",
  };
  return <div className="rounded-2xl border-0 bg-white p-5 shadow-card dark:bg-ink-900"><div className="flex items-center gap-3.5"><div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tones[tone]}`}>{icon}</div><div><p className="text-[11px] font-medium text-ledger-400">{label}</p><span className="font-display text-xl font-bold text-ink-900 dark:text-white">{value}</span></div></div><p className="mt-2 text-[10px] text-ledger-400">Current sales history records</p></div>;
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

type SalesDateFilter = "all" | "today" | "yesterday" | "month" | "year" | "custom";

export interface SalesDocumentKpis {
  drafts: number;
  quotations: number;
  proformas: number;
  convertedThisMonth: number;
}

interface SalesListViewProps {
  userId: string;
  sales: SaleListRow[];
  kpis: SalesKpis;
  currency: string;
  locations: string[];
  initialLocation?: string;
  salesReps: string[];
  orgName: string;
  systemName: string;
  logoUrl?: string | null;
  showLogoOnInvoices?: boolean;
  organizationPhone?: string | null;
  organizationEmail?: string | null;
  organizationWebsite?: string | null;
  showOrganizationContact?: boolean;
  invoiceTemplate?: SalesInvoiceTemplate;
  documentKpis: SalesDocumentKpis;
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

export function SalesListView({ userId, sales, kpis, currency, locations, initialLocation = "all", salesReps, orgName, systemName, logoUrl, showLogoOnInvoices, organizationPhone, organizationEmail, organizationWebsite, showOrganizationContact, invoiceTemplate, documentKpis }: SalesListViewProps) {
  const { activeTheme, darkMode } = useAppStore();
  const [invoiceFormat, setInvoiceFormat] = useInvoiceFormat(userId);
  const setBranch = useAccountingStore((state) => state.setBranch);
  const theme = THEMES[activeTheme];
  const salesHeaderBackground = darkMode
    ? `color-mix(in srgb, ${theme.colors.primary} 18%, #08111f)`
    : theme.colors.primaryPale;
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | SaleStatus>("all");
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState(initialLocation);
  const [salesRep, setSalesRep] = useState("all");
  const [paymentStatus, setPaymentStatus] = useState<"all" | PaymentStatus>("all");
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dateFilter, setDateFilter] = useState<SalesDateFilter>("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState<number | "all">(10);

  const paymentMethods = useMemo(
    () => Array.from(new Set(sales.map((s) => s.paymentMethod).filter(Boolean))) as string[],
    [sales]
  );

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

      const saleDate = new Date(s.saleDate);
      const saleDateKey = `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, "0")}-${String(saleDate.getDate()).padStart(2, "0")}`;
      if (dateFrom && saleDateKey < dateFrom) return false;
      if (dateTo && saleDateKey > dateTo) return false;
      if (paymentMethodFilter !== "all" && s.paymentMethod !== paymentMethodFilter) return false;
      return true;
    });
  }, [sales, activeTab, paymentStatus, location, salesRep, query, dateFrom, dateTo, paymentMethodFilter]);

  const filteredKpis = useMemo(() => {
    const totalOrders = filtered.length;
    const totalRevenue = filtered.reduce((sum, s) => sum + s.total, 0);
    const outstandingBalance = filtered.reduce((sum, s) => sum + Math.max(0, s.total - s.amountPaid), 0);
    const completedOrders = filtered.filter((s) => s.status === "completed").length;
    const returnedAmount = filtered.filter((s) => s.status === "returned").reduce((sum, s) => sum + s.refundedAmount, 0);
    const returnedSalesAmount = filtered.filter((s) => s.status === "returned").reduce((sum, s) => sum + s.total, 0);
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const totalReturns = filtered.filter((sale) => sale.status === "returned" || sale.refundedAmount > 0).length;
    return { totalOrders, totalRevenue, outstandingBalance, completedOrders, returnedAmount, returnedSalesAmount, totalReturns, averageOrderValue };
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
        systemName,
        logoUrl,
        showLogoOnInvoices,
        saleNumber: sale.saleNumber,
        saleDate: sale.saleDate,
        customerName: sale.customerName,
        customerPhone: sale.customerPhone,
        soldByName: sale.soldByName,
        locationName: sale.locationName,
        locationPhone: sale.locationPhone,
        locationEmail: sale.locationEmail,
        organizationPhone,
        organizationEmail,
        organizationWebsite,
        showOrganizationContact,
        invoiceTemplate,
        paymentMethod: sale.paymentMethod,
        paymentStatus: sale.paymentStatus,
        subtotal: sale.total,
        total: sale.total,
        amountPaid: sale.amountPaid,
        currency,
        items,
        printFormat: invoiceFormat
      });
      const win = window.open("", "_blank", "width=800,height=900");
      if (!win) return;
      win.document.write(html);
      win.document.close();
      await waitForInvoiceImages(win);
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
    setDateFrom("");
    setDateTo("");
    setDateFilter("all");
    setPaymentMethodFilter("all");
    setActiveTab("all");
    setPage(1);
  }

  function applyDateFilter(value: SalesDateFilter) {
    setDateFilter(value);
    setPage(1);
    if (value === "custom") return;
    if (value === "all") {
      setDateFrom("");
      setDateTo("");
      return;
    }

    const today = new Date();
    const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const end = new Date(start);
    if (value === "yesterday") {
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
    } else if (value === "month") {
      start.setDate(1);
    } else if (value === "year") {
      start.setMonth(0, 1);
    }
    setDateFrom(dateKey(start));
    setDateTo(dateKey(end));
  }

  return (
    <div
      className="sales-page sales-history-page flex h-full min-h-0 flex-col gap-4 overflow-hidden text-xs"
      style={{ "--sales-history-table-header": salesHeaderBackground } as React.CSSProperties}
    >
      {/* Header */}
      <div
        className="sales-page-header flex flex-wrap items-start justify-between gap-4 rounded-xl border px-4 py-4 sm:px-5"
        style={{
          background: salesHeaderBackground,
          borderColor: darkMode
            ? `color-mix(in srgb, ${theme.colors.primary} 36%, #334155)`
            : `color-mix(in srgb, ${theme.colors.primary} 24%, white)`,
        }}
      >
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-900 dark:text-white">Sales Transactions History</h1>
          <p className="mt-0.5 text-sm text-ledger-600 dark:text-ledger-300">Manage your sales drafts, quotations and invoices</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <InvoiceFormatSelect value={invoiceFormat} onChange={setInvoiceFormat} />
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
            New Document
          </Link>
        </div>
      </div>

      <nav className="flex items-center gap-6 overflow-x-auto border-b border-ledger-100 dark:border-ledger-700">
        {[
        { label: "All Sales", href: "/sales/all", icon: FileText },
        { label: "Drafts", href: "/sales/drafts?type=draft", icon: FileText },
          { label: "Quotations", href: "/sales/drafts?type=quotation", icon: FileText },
          { label: "Proformas", href: "/sales/drafts?type=proforma", icon: FileText },
          { label: "Sales Orders", href: "/orders?view=list", icon: FileSpreadsheet },
        ].map(({ label, href, icon: Icon }) => (
          <Link key={label} href={href} className={cn(
            "flex shrink-0 items-center gap-2 border-b-2 px-1 pb-3 text-xs font-medium",
            label === "All Sales" ? "border-signal text-signal" : "border-transparent text-ledger-500 hover:border-ledger-300 hover:text-ink-900"
          )}>
            <Icon className="h-3.5 w-3.5" /> {label}
          </Link>
        ))}
      </nav>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <HistoryKpi label="Total Sales" value={formatCurrency(filteredKpis.totalRevenue, currency)} icon={<Receipt className="h-5 w-5" />} tone="emerald" />
        <HistoryKpi label="Returned Sales" value={formatCurrency(filteredKpis.returnedSalesAmount, currency)} icon={<Undo2 className="h-5 w-5" />} tone="amber" />
        <HistoryKpi label="Total Returns" value={filteredKpis.totalReturns} icon={<Undo2 className="h-5 w-5" />} tone="amber" />
        <HistoryKpi label="Total Drafts" value={documentKpis.drafts} icon={<ShoppingCart className="h-5 w-5" />} tone="emerald" />
        <HistoryKpi label="Total Quotations & Proformas" value={documentKpis.quotations + documentKpis.proformas} icon={<Wallet className="h-5 w-5" />} tone="blue" />
        <HistoryKpi label="Converted This Month" value={documentKpis.convertedThisMonth} icon={<CheckCircle2 className="h-5 w-5" />} tone="purple" />
      </div>

      {/* Filter bar */}
      <Card accent="neutral" className="sales-filter-panel rounded-2xl border border-ledger-100 shadow-card dark:border-ledger-700">
        <CardContent className="pt-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink-900 dark:text-white"><Filter className="h-4 w-4 text-signal" /> Filters</div>
            <button type="button" onClick={resetFilters} className="text-xs font-medium text-signal hover:underline">Clear filters</button>
          </div>
          <div className="sales-filter-fields flex flex-wrap items-end gap-3">
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ledger-400" />
              <Input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                placeholder="Search by number, customer or reference..."
                className="sales-search-input pl-9"
                style={{
                  backgroundColor: darkMode ? "#000000" : theme.colors.primaryPale,
                  borderColor: darkMode ? "#334155" : `${theme.colors.primary}35`,
                }}
              />
            </div>

            <div className="w-40">
              <label className="mb-1 block text-xs font-medium text-ledger-500">Date Range</label>
              <Select value={dateFilter} onChange={(e) => applyDateFilter(e.target.value as SalesDateFilter)}>
                <option value="all">All Dates</option>
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="month">This Month</option>
                <option value="year">This Year</option>
                {dateFilter === "custom" && <option value="custom">Custom Range</option>}
              </Select>
            </div>

            <div className="w-40">
              <label className="mb-1 block text-xs font-medium text-ledger-500">Branch</label>
              <Select value={location} onChange={(e) => { setLocation(e.target.value); setBranch(e.target.value); setPage(1); }}>
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

            <Button variant="outline" size="md" onClick={() => setShowMoreFilters((s) => !s)}>
              <Filter className="h-4 w-4" />
              More Filters
            </Button>
            <Button variant="ghost" size="md" onClick={resetFilters}>
              Clear
            </Button>
          </div>

          {showMoreFilters && (
            <div className="sales-filter-fields mt-3 flex flex-wrap items-end gap-3 border-t border-ledger-100 pt-3 dark:border-ledger-700">
              <div className="w-40">
                <label className="mb-1 block text-xs font-medium text-ledger-500">Date From</label>
                <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDateFilter("custom"); setPage(1); }} />
              </div>
              <div className="w-40">
                <label className="mb-1 block text-xs font-medium text-ledger-500">Date To</label>
                <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDateFilter("custom"); setPage(1); }} />
              </div>
              <div className="w-44">
                <label className="mb-1 block text-xs font-medium text-ledger-500">Payment Type</label>
                <Select value={paymentMethodFilter} onChange={(e) => { setPaymentMethodFilter(e.target.value); setPage(1); }}>
                  <option value="all">All Payment Types</option>
                  {paymentMethods.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </Select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
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
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="sales-history-table w-full min-w-[1180px] text-left text-xs">
            <thead className="border-b border-ledger-100 text-[11px] font-semibold text-ledger-500 dark:border-ledger-700">
              <tr>
                <th className="px-4 py-3 min-w-[150px]">DOCUMENT</th>
                <th className="px-4 py-3 min-w-[170px]">CUSTOMER</th>
                <th className="px-4 py-3 min-w-[130px]">BRANCH</th>
                <th className="px-4 py-3 min-w-[130px]">DATE &amp; TIME</th>
                <th className="px-4 py-3 min-w-[160px]">PRODUCT</th>
                <th className="px-4 py-3 min-w-[130px] text-right">AMOUNT</th>
                <th className="px-4 py-3 min-w-[120px]">STATUS</th>
                <th className="px-4 py-3 min-w-[130px]">CREATED BY</th>
                <th className="px-4 py-3 pr-4 min-w-[150px] text-center">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700/50">
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-14 text-center text-ledger-400">
                    No sales match your filters.
                  </td>
                </tr>
              )}
              {pageRows.map((s) => {
                const { date, time } = formatDateTime(s.saleDate);
                return (
                  <tr key={s.id} className="transition-colors hover:bg-ledger-50/40 dark:hover:bg-white/[0.02]">
                    <td className="px-4 py-3.5">
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
                    <td className="px-4 py-3.5 text-ink-900 dark:text-white">{s.customerName}</td>
                    <td className="px-4 py-3.5 text-ledger-600 dark:text-ledger-300">{s.locationName ?? "—"}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-ledger-600 dark:text-ledger-300">{date}<div className="text-xs text-ledger-400">{time}</div></td>
                    <td className="px-4 py-3.5 text-ledger-600 dark:text-ledger-300">
                      {s.primaryProductName ?? "—"}
                      {s.productLineCount > 1 && <span className="ml-1 text-[10px] text-ledger-400">+{s.productLineCount - 1} more</span>}
                    </td>
                    <td className="px-4 py-3.5 text-right font-medium text-ink-900 dark:text-white">
                      {formatCurrency(s.total, currency)}
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge tone={SALE_STATUS_BADGE_TONE[s.status]}>{SALE_STATUS_LABEL[s.status]}</Badge>
                    </td>
                    <td className="px-4 py-3.5 text-ledger-600 dark:text-ledger-300">{s.soldByName}</td>
                    <td className="px-4 py-3.5 pr-4">
                      <div className="flex items-center justify-end gap-1 text-ledger-400">
                        <Link href={`/sales/${s.id}`} className="rounded-md p-1.5 text-ledger-500 hover:bg-ledger-100 dark:text-ledger-300 dark:hover:bg-white/[0.08]" title="View">
                          <Eye className="h-4 w-4" strokeWidth={2.25} />
                        </Link>
                        {s.status === "completed" && <Link href={`/sales/${s.id}/edit`} className="rounded-md p-1.5 text-ledger-500 hover:bg-ledger-100 dark:text-ledger-300 dark:hover:bg-white/[0.08]" title="Edit">
                          <Pencil className="h-4 w-4" strokeWidth={2.25} />
                        </Link>}
                        <button
                          onClick={() => handlePrint(s)}
                          className="rounded-md p-1.5 text-ledger-500 hover:bg-ledger-100 dark:text-ledger-300 dark:hover:bg-white/[0.08]"
                          title="Print"
                        >
                          <Printer className="h-4 w-4" strokeWidth={2.25} />
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
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-t border-ledger-100 p-4 text-xs dark:border-ledger-700">
          <p className="text-ledger-400">
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
              <span className="px-2 text-xs text-ledger-600 dark:text-ledger-300">
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
      </div>
    </div>
  );
}