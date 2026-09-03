"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Receipt,
  PiggyBank,
  Activity,
  Filter,
  Download,
  FileText,
  Scale,
  Landmark,
  Percent,
  ClipboardList,
  Users,
  Settings,
  Tag,
  ArrowRight,
  Calendar,
  ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/sales/format";
import { logReportExport } from "@/app/(dashboard)/reports/actions";
import type {
  ReportKpis,
  ProfitLossLine,
  BalanceSheetSummary,
  RevenueExpensePoint,
  ExpenseCategorySlice,
  TopCustomerRow,
  TaxSummary
} from "@/lib/reports/calculations";
import type { RecentReportRow } from "@/app/(dashboard)/reports/actions";

const CATEGORY_COLORS = ["#2563eb", "#16a34a", "#7c3aed", "#d97706", "#0d9488", "#dc2626", "#94a3b8"];
const TABS = [
  "Financial Reports", "Sales Reports", "Purchase Reports", "Inventory Reports",
  "Tax Reports", "Customer Reports", "Supplier Reports", "Branch Reports",
  "Product Reports", "Expense Reports", "User Activity Reports", "Stock Movement Reports",
  "Profitability Reports", "Custom Reports"
];
const PERIOD_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "weekly", label: "This Week" },
  { value: "monthly", label: "This Month" },
  { value: "quarterly", label: "This Quarter" },
  { value: "yearly", label: "This Year" },
  { value: "custom", label: "Custom" }
];

interface ReportFiltersState {
  dateFrom: string;
  dateTo: string;
  locationId: string | null;
  period: string;
}

function fmt(value: number, currency: string) {
  return formatCurrency(value, currency);
}

function ChangeBadge({ value, invert = false }: { value: number; invert?: boolean }) {
  const positive = invert ? value <= 0 : value >= 0;
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${positive ? "text-signal" : "text-alert"}`}>
      {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.abs(value)}% vs last period
    </span>
  );
}

function csvEscape(value: string) {
  return value.includes(",") || value.includes('"') ? `"${value.replace(/"/g, '""')}"` : value;
}

export function ReportsDashboard({
  orgName,
  currency,
  canExport,
  locations,
  filters,
  kpis,
  profitAndLoss,
  balanceSheet,
  revenueExpenseSeries,
  expensesByCategory,
  topCustomers,
  taxSummary,
  recentReports
}: {
  orgName: string;
  currency: string;
  canExport: boolean;
  locations: { id: string; name: string }[];
  filters: ReportFiltersState;
  kpis: ReportKpis;
  profitAndLoss: ProfitLossLine[];
  balanceSheet: BalanceSheetSummary;
  revenueExpenseSeries: RevenueExpensePoint[];
  expensesByCategory: ExpenseCategorySlice[];
  topCustomers: TopCustomerRow[];
  taxSummary: TaxSummary;
  recentReports: RecentReportRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState("Financial Reports");
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState(filters.dateFrom);
  const [dateTo, setDateTo] = useState(filters.dateTo);
  const [locationId, setLocationId] = useState(filters.locationId ?? "all");
  const [period, setPeriod] = useState(filters.period);

  function applyFilters(overrides?: Partial<ReportFiltersState>) {
    const params = new URLSearchParams({
      from: overrides?.dateFrom ?? dateFrom,
      to: overrides?.dateTo ?? dateTo,
      location: overrides?.locationId ?? locationId,
      period: overrides?.period ?? period
    });
    router.push(`/reports?${params.toString()}`);
  }

  function clearFilters() {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const to = now.toISOString().slice(0, 10);
    setDateFrom(from);
    setDateTo(to);
    setLocationId("all");
    setPeriod("monthly");
    applyFilters({ dateFrom: from, dateTo: to, locationId: "all", period: "monthly" });
  }

  function saveReportView() {
    window.localStorage.setItem("thinksales-report-view", JSON.stringify({ dateFrom, dateTo, locationId, period, activeTab }));
    setNotice("Report view saved on this device.");
    window.setTimeout(() => setNotice(null), 2500);
  }

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleExportCsv() {
    const headers = ["Description", "Amount", "% of Revenue"];
    const rows = profitAndLoss.map((l) => [l.label, l.amount.toFixed(2), `${l.pctOfRevenue}%`]);
    const csv = [headers, ...rows].map((r) => r.map((c) => csvEscape(String(c))).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Profit-Loss-${dateFrom}-to-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    startTransition(() => {
      logReportExport(`Profit & Loss Statement — ${dateFrom} to ${dateTo}`, "Financial Report", "csv");
    });
    setShowExportMenu(false);
  }

  async function handleExportExcel() {
    const XLSX = await import("xlsx");
    const sheetData = profitAndLoss.map((l) => ({ Description: l.label, Amount: l.amount, "% of Revenue": `${l.pctOfRevenue}%` }));
    const worksheet = XLSX.utils.json_to_sheet(sheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Profit & Loss");
    XLSX.writeFile(workbook, `Profit-Loss-${dateFrom}-to-${dateTo}.xlsx`);
    startTransition(() => {
      logReportExport(`Profit & Loss Statement — ${dateFrom} to ${dateTo}`, "Financial Report", "excel");
    });
    setShowExportMenu(false);
  }

  function handleExportPdf() {
    const win = window.open("", "_blank", "width=800,height=900");
    if (!win) return;
    const rows = profitAndLoss
      .map(
        (l) =>
          `<tr${l.emphasis ? ' style="font-weight:700;border-top:2px solid #0f172a"' : ""}><td>${l.label}</td><td style="text-align:right">${fmt(l.amount, currency)}</td><td style="text-align:right">${l.pctOfRevenue}%</td></tr>`
      )
      .join("");
    win.document.write(`
      <html><head><title>Profit & Loss Statement</title>
      <style>body{font-family:sans-serif;padding:24px}table{width:100%;border-collapse:collapse;margin-top:16px}
      th,td{border-bottom:1px solid #eee;padding:8px 10px;text-align:left;font-size:13px}
      h2{margin-bottom:2px}.muted{color:#888;font-size:12px}</style></head>
      <body><h2>${orgName} — Profit & Loss Statement</h2>
      <p class="muted">${dateFrom} to ${dateTo}</p>
      <table><thead><tr><th>Description</th><th style="text-align:right">Amount</th><th style="text-align:right">% of Revenue</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <p style="font-size:11px;color:#888;margin-top:16px">Use your browser's print dialog to save this as a PDF.</p>
      </body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
    startTransition(() => {
      logReportExport(`Profit & Loss Statement — ${dateFrom} to ${dateTo}`, "Financial Report", "pdf");
    });
    setShowExportMenu(false);
  }

  const kpiCards = [
    { label: "Total Revenue", value: fmt(kpis.totalRevenue, currency), change: kpis.totalRevenueChange, icon: Wallet, bg: "bg-signal-soft", color: "text-signal" },
    { label: "Total Expenses", value: fmt(kpis.totalExpenses, currency), change: kpis.totalExpensesChange, icon: Receipt, bg: "bg-alert-soft", color: "text-alert", invert: true },
    { label: "Net Profit", value: fmt(kpis.netProfit, currency), change: kpis.netProfitChange, icon: PiggyBank, bg: "bg-signal-soft", color: "text-signal" },
    { label: "Gross Profit Margin", value: `${kpis.grossMargin}%`, change: kpis.grossMarginChange, icon: Activity, bg: "bg-amber-soft", color: "text-amber" },
    { label: "Operating Cash Flow", value: fmt(kpis.operatingCashFlow, currency), change: kpis.operatingCashFlowChange, icon: Landmark, bg: "bg-ledger-100 dark:bg-white/[0.06]", color: "text-ledger-500" }
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs text-ledger-400">Dashboard &gt; Reports</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-white">Reports</h1>
        </div>
      </div>

      {/* Category tabs */}
      <div className="overflow-x-auto border-b border-ledger-100 dark:border-ledger-700">
        <div className="flex min-w-max items-center justify-between gap-3">
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 px-3 pb-2.5 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "border-signal text-ink-900 dark:text-white"
                  : "border-transparent text-ledger-500 hover:text-ink-900 dark:text-ledger-400 dark:hover:text-white"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" className="mb-2">
          <FileText className="h-3.5 w-3.5" />
          Custom Report
        </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {kpiCards.map((kpi) => (
          <div key={kpi.label} className="rounded-card border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <div className="flex items-center gap-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${kpi.bg} ${kpi.color}`}>
                <kpi.icon className="h-4 w-4" />
              </div>
              <p className="truncate text-xs text-ledger-400">{kpi.label}</p>
            </div>
            <p className="figure mt-2 text-lg font-semibold text-ink-900 dark:text-white">{kpi.value}</p>
            <div className="mt-1">
              <ChangeBadge value={kpi.change} invert={kpi.invert} />
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      {notice && <p className="rounded-md bg-signal-soft px-3 py-2 text-sm text-signal">{notice}</p>}
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-ledger-100 bg-white p-3 shadow-card dark:border-ledger-700 dark:bg-ink-900">
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-ledger-400" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
          />
          <span className="text-ledger-400">–</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-9 rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
          />
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="h-9 rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
        >
          {PERIOD_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <select
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          className="h-9 rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
        >
          <option value="all">All Branches</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <Button variant="outline" size="sm" onClick={() => applyFilters()}>
          <Filter className="h-3.5 w-3.5" />
          Apply Filters
        </Button>
        <Button variant="ghost" size="sm" onClick={clearFilters}>Clear Filters</Button>
        <Button variant="ghost" size="sm" onClick={() => window.print()}>Print</Button>
        <Button variant="ghost" size="sm" onClick={saveReportView}>Save Report View</Button>
        <div className="relative ml-auto">
          <Button size="sm" disabled={!canExport} onClick={() => setShowExportMenu((s) => !s)}>
            <Download className="h-3.5 w-3.5" />
            Export Report
            <ChevronDown className="h-3 w-3" />
          </Button>
          {showExportMenu && (
            <div className="absolute right-0 top-10 z-10 w-40 rounded-md border border-ledger-100 bg-white py-1 shadow-card-hover dark:border-ledger-700 dark:bg-ink-900">
              <button onClick={handleExportPdf} className="block w-full px-3 py-2 text-left text-xs text-ledger-600 hover:bg-ledger-50 dark:text-ledger-300 dark:hover:bg-white/[0.06]">
                PDF
              </button>
              <button onClick={handleExportExcel} className="block w-full px-3 py-2 text-left text-xs text-ledger-600 hover:bg-ledger-50 dark:text-ledger-300 dark:hover:bg-white/[0.06]">
                Excel
              </button>
              <button onClick={handleExportCsv} className="block w-full px-3 py-2 text-left text-xs text-ledger-600 hover:bg-ledger-50 dark:text-ledger-300 dark:hover:bg-white/[0.06]">
                CSV
              </button>
            </div>
          )}
        </div>
      </div>

      {activeTab !== "Financial Reports" && (
        <ReportWorkspace
          tab={activeTab}
          currency={currency}
          kpis={kpis}
          profitAndLoss={profitAndLoss}
          dateFrom={dateFrom}
          dateTo={dateTo}
        />
      )}

      {activeTab === "Financial Reports" && (
        <>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* P&L */}
        <div id="profit-loss" className="rounded-card border border-ledger-100 bg-white p-5 shadow-card lg:col-span-2 dark:border-ledger-700 dark:bg-ink-900">
          <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Profit &amp; Loss Statement</h2>
          <table className="mt-3 w-full text-sm">
            <thead className="border-b border-ledger-100 text-left text-xs font-medium uppercase tracking-wide text-ledger-400 dark:border-ledger-700">
              <tr>
                <th className="pb-2">Description</th>
                <th className="pb-2 text-right">Amount ({currency})</th>
                <th className="pb-2 text-right">% of Revenue</th>
              </tr>
            </thead>
            <tbody>
              {profitAndLoss.map((line) => (
                <tr
                  key={line.label}
                  className={`border-b border-ledger-50 last:border-0 dark:border-ledger-700/50 ${line.emphasis ? "font-semibold" : ""}`}
                >
                  <td className="py-2 text-ink-900 dark:text-white">{line.label}</td>
                  <td className={`py-2 text-right figure ${line.amount < 0 ? "text-alert" : "text-ink-900 dark:text-white"}`}>
                    {fmt(line.amount, currency)}
                  </td>
                  <td className={`py-2 text-right figure ${line.pctOfRevenue < 0 ? "text-alert" : "text-signal"}`}>{line.pctOfRevenue}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Report shortcuts */}
        <div id="report-shortcuts" className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Report Shortcuts</h2>
          <ul className="mt-3 space-y-3">
            {[
              { label: "Profit & Loss Statement", desc: "Summary of income and expenses", icon: FileText, target: "profit-loss" },
              { label: "Balance Sheet", desc: "Overview of assets, liabilities & equity", icon: Scale, target: "balance-sheet" },
              { label: "Tax Summary", desc: "Tax collected and paid summary", icon: Percent, target: "tax-summary" },
              { label: "Expenses by Category", desc: "Where operating expenses went", icon: Tag, target: "expenses-category" },
              { label: "Top Customers", desc: "Highest revenue-generating customers", icon: Users, target: "top-customers" }
            ].map((shortcut) => (
              <li key={shortcut.label}>
                <button onClick={() => scrollTo(shortcut.target)} className="flex w-full items-start gap-3 rounded-md p-2 text-left hover:bg-ledger-50 dark:hover:bg-white/[0.04]">
                  <shortcut.icon className="mt-0.5 h-4 w-4 shrink-0 text-signal" />
                  <div>
                    <p className="text-sm font-medium text-ink-900 dark:text-white">{shortcut.label}</p>
                    <p className="text-xs text-ledger-400">{shortcut.desc}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Revenue vs Expenses chart */}
      <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Revenue vs Expenses</h2>
          <select
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              applyFilters({ period: e.target.value });
            }}
            className="h-8 rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
          >
            {PERIOD_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4 h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenueExpenseSeries} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="expFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#dc2626" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#dc2626" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-ledger-100 dark:text-ledger-700" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="currentColor" className="text-ledger-400" tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} stroke="currentColor" className="text-ledger-400" tickLine={false} axisLine={false} width={50} />
              <Tooltip formatter={(v: number) => fmt(v, currency)} />
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#2563eb" strokeWidth={2} fill="url(#revFill)" />
              <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#dc2626" strokeWidth={2} fill="url(#expFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Balance sheet */}
        <div id="balance-sheet" className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Balance Sheet Summary</h2>
          <p className="text-xs text-ledger-400">As at {dateTo} · simplified, derived from cash, inventory, AR/AP, and fixed assets</p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-signal">Assets</p>
              <dl className="mt-2 space-y-1.5 text-xs">
                <BsRow label="Current Assets" value={fmt(balanceSheet.currentAssets, currency)} />
                <BsRow label="Fixed Assets" value={fmt(balanceSheet.fixedAssets, currency)} />
                <BsRow label="Other Assets" value={fmt(balanceSheet.otherAssets, currency)} />
                <BsRow label="Total Assets" value={fmt(balanceSheet.totalAssets, currency)} emphasis />
              </dl>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-alert">Liabilities</p>
              <dl className="mt-2 space-y-1.5 text-xs">
                <BsRow label="Current Liabilities" value={fmt(balanceSheet.currentLiabilities, currency)} />
                <BsRow label="Long-Term Liabilities" value={fmt(balanceSheet.longTermLiabilities, currency)} />
                <BsRow label="Total Liabilities" value={fmt(balanceSheet.totalLiabilities, currency)} emphasis />
              </dl>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber">Equity</p>
              <dl className="mt-2 space-y-1.5 text-xs">
                <BsRow label="Owner's Equity" value={fmt(balanceSheet.ownersEquity, currency)} />
                <BsRow label="Total Equity" value={fmt(balanceSheet.totalEquity, currency)} emphasis />
              </dl>
            </div>
          </div>
        </div>

        {/* Expenses by category */}
        <div id="expenses-category" className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Expenses by Category</h2>
          {expensesByCategory.length === 0 ? (
            <p className="mt-6 text-center text-sm text-ledger-400">No approved expenses in this period.</p>
          ) : (
            <div className="mt-4 flex items-center gap-6">
              <div className="relative h-40 w-40 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={expensesByCategory} dataKey="amount" nameKey="category" innerRadius={45} outerRadius={70} paddingAngle={2}>
                      {expensesByCategory.map((_, i) => (
                        <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmt(v, currency)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="figure text-sm font-semibold text-ink-900 dark:text-white">
                    {fmt(expensesByCategory.reduce((s, c) => s + c.amount, 0), currency)}
                  </span>
                  <span className="text-[10px] uppercase text-ledger-400">Total</span>
                </div>
              </div>
              <ul className="flex-1 space-y-1.5">
                {expensesByCategory.map((c, i) => (
                  <li key={c.category} className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                    <span className="flex-1 truncate text-ledger-600 dark:text-ledger-300">{c.category}</span>
                    <span className="figure text-ledger-400">{c.pct}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Top customers */}
        <div id="top-customers" className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Top Revenue Customers</h2>
          <table className="mt-3 w-full text-sm">
            <thead className="border-b border-ledger-100 text-left text-xs font-medium uppercase tracking-wide text-ledger-400 dark:border-ledger-700">
              <tr>
                <th className="pb-2">#</th>
                <th className="pb-2">Customer</th>
                <th className="pb-2 text-right">Revenue ({currency})</th>
              </tr>
            </thead>
            <tbody>
              {topCustomers.map((c) => (
                <tr key={c.rank} className="border-b border-ledger-50 last:border-0 dark:border-ledger-700/50">
                  <td className="py-2 text-ledger-400">{c.rank}</td>
                  <td className="py-2 text-ink-900 dark:text-white">{c.customerName}</td>
                  <td className="py-2 text-right figure font-medium text-ink-900 dark:text-white">{fmt(c.revenue, currency)}</td>
                </tr>
              ))}
              {topCustomers.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-ledger-400">
                    No completed sales in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Tax summary */}
        <div id="tax-summary" className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Tax Summary</h2>
          <div className="mt-4 flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-signal-soft text-signal">
              <Percent className="h-5 w-5" />
            </div>
            <div>
              <p className="figure text-2xl font-semibold text-ink-900 dark:text-white">{fmt(taxSummary.taxCollected, currency)}</p>
              <p className="text-xs text-ledger-400">Tax collected on {taxSummary.salesCount} completed sale{taxSummary.salesCount === 1 ? "" : "s"}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent reports */}
      <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
        <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Recent Reports</h2>
        <table className="mt-3 w-full text-sm">
          <thead className="border-b border-ledger-100 text-left text-xs font-medium uppercase tracking-wide text-ledger-400 dark:border-ledger-700">
            <tr>
              <th className="pb-2">Report Name</th>
              <th className="pb-2">Type</th>
              <th className="pb-2">Date Generated</th>
              <th className="pb-2">Generated By</th>
              <th className="pb-2">Format</th>
            </tr>
          </thead>
          <tbody>
            {recentReports.map((r) => (
              <tr key={r.id} className="border-b border-ledger-50 last:border-0 dark:border-ledger-700/50">
                <td className="py-2 text-ink-900 dark:text-white">{r.reportName}</td>
                <td className="py-2 text-ledger-500 dark:text-ledger-400">{r.reportType}</td>
                <td className="py-2 text-ledger-500 dark:text-ledger-400">{new Date(r.createdAt).toLocaleString()}</td>
                <td className="py-2 text-ledger-500 dark:text-ledger-400">{r.generatedByEmail}</td>
                <td className="py-2 uppercase text-ledger-500 dark:text-ledger-400">{r.format}</td>
              </tr>
            ))}
            {recentReports.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-ledger-400">
                  No reports exported yet — use "Export Report" above to generate one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Report settings */}
      <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
        <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Report Settings</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SettingsLink icon={ClipboardList} label="Chart of Accounts" desc="View and manage accounts" href="/accounting" />
          <SettingsLink icon={Settings} label="Report Preferences" desc="Manage report formats & settings" href="/settings" />
        </div>
      </div>
        </>
      )}
    </div>
  );
}

const REPORTS_BY_TAB: Record<string, string[]> = {
  "Sales Reports": ["Sales by Product", "Sales by Category", "Sales by Customer", "Sales by Branch", "Sales Returns", "Discount Analysis"],
  "Purchase Reports": ["Purchases by Supplier", "Purchases by Product", "Purchase Return Report", "Supplier Performance"],
  "Inventory Reports": ["Current Inventory", "Inventory Valuation", "Inventory Aging", "Reorder Report", "Damaged Items", "Expired Items"],
  "Tax Reports": ["VAT Summary", "Sales Tax Collected", "Purchase Tax Paid", "Tax Liability"],
  "Customer Reports": ["Top Customers", "Customer Purchase History", "Outstanding Balances", "Customer Order Trends"],
  "Supplier Reports": ["Supplier Purchases", "Supplier Payment History", "Outstanding Supplier Balances"],
  "Branch Reports": ["Branch Performance Comparison", "Branch Stock Value", "Branch Expenses", "Branch Sales"],
  "Product Reports": ["Product Performance", "Product Sales Trend", "Product Profitability", "Slow Moving Products", "Fast Moving Products"],
  "Expense Reports": ["Expenses by Category", "Expenses by Branch", "Expenses by User"],
  "User Activity Reports": ["User Activity Timeline", "Most Active Users", "Inactive Users"],
  "Stock Movement Reports": ["Stock Transfer Report", "Stock Adjustment Report", "Inventory Movement Report"],
  "Profitability Reports": ["Product Profitability", "Branch Profitability", "Customer Profitability", "Category Profitability"],
  "Custom Reports": ["Report Builder", "Saved Templates", "Scheduled Reports", "Shared Reports"]
};

function ReportWorkspace({
  tab,
  currency,
  kpis,
  profitAndLoss,
  dateFrom,
  dateTo
}: {
  tab: string;
  currency: string;
  kpis: ReportKpis;
  profitAndLoss: ProfitLossLine[];
  dateFrom: string;
  dateTo: string;
}) {
  const reports = REPORTS_BY_TAB[tab] ?? [];
  const values = [
    ["Revenue", fmt(kpis.totalRevenue, currency)],
    ["Expenses", fmt(kpis.totalExpenses, currency)],
    ["Net Profit", fmt(kpis.netProfit, currency)],
    ["Gross Margin", `${kpis.grossMargin}%`]
  ];
  return (
    <div className="space-y-5">
      <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink-900 dark:text-white">{tab}</h2>
            <p className="mt-1 text-xs text-ledger-400">{dateFrom} to {dateTo} · filtered live data</p>
          </div>
          <span className="rounded-full bg-signal-soft px-2.5 py-1 text-xs font-medium text-signal">Connected to ERP data</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {values.map(([label, value]) => (
            <div key={label} className="rounded-md bg-ledger-50 p-3 dark:bg-white/[0.04]">
              <p className="text-xs text-ledger-400">{label}</p>
              <p className="figure mt-1 text-sm font-semibold text-ink-900 dark:text-white">{value}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
        <h3 className="text-sm font-semibold text-ink-900 dark:text-white">Available reports</h3>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {reports.map((report) => (
            <button key={report} className="rounded-md border border-ledger-100 p-3 text-left text-sm text-ink-900 hover:border-signal hover:bg-signal-soft dark:border-ledger-700 dark:text-white">
              {report}
              <span className="mt-1 block text-xs text-ledger-400">Uses the selected filters</span>
            </button>
          ))}
        </div>
        <p className="mt-4 text-xs text-ledger-400">Detailed transaction rows are available in the financial statement below after selecting Financial Reports.</p>
      </div>
      <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
        <h3 className="text-sm font-semibold text-ink-900 dark:text-white">Filtered transaction summary</h3>
        <table className="mt-3 w-full text-sm">
          <tbody>
            {profitAndLoss.slice(0, 6).map((line) => (
              <tr key={line.label} className="border-b border-ledger-50 last:border-0 dark:border-ledger-700/50">
                <td className="py-2 text-ink-900 dark:text-white">{line.label}</td>
                <td className="py-2 text-right figure text-ink-900 dark:text-white">{fmt(line.amount, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BsRow({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${emphasis ? "border-t border-ledger-100 pt-1.5 font-semibold dark:border-ledger-700" : ""}`}>
      <dt className="text-ledger-500 dark:text-ledger-400">{label}</dt>
      <dd className="figure text-ink-900 dark:text-white">{value}</dd>
    </div>
  );
}

function SettingsLink({ icon: Icon, label, desc, href }: { icon: React.ComponentType<{ className?: string }>; label: string; desc: string; href: string }) {
  return (
    <a href={href} className="flex items-center gap-3 rounded-md border border-ledger-100 p-3 hover:bg-ledger-50 dark:border-ledger-700 dark:hover:bg-white/[0.04]">
      <Icon className="h-4 w-4 shrink-0 text-ledger-400" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink-900 dark:text-white">{label}</p>
        <p className="text-xs text-ledger-400">{desc}</p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ledger-300" />
    </a>
  );
}