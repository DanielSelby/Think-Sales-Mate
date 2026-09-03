"use client";

import Link from "next/link";
import {
  DollarSign, TrendingUp, PiggyBank, Receipt, Wallet,
  FileWarning, Boxes, AlertTriangle, Trophy, Sparkles,
  Plus, ArrowRight, ShoppingCart, Activity, ChevronRight,
  CheckCircle, Users,
} from "lucide-react";
import { TiltKpiCard, type TiltCardColor } from "@/components/charts/tilt-kpi-card";
import { RevenueExpenseChart } from "@/components/charts/revenue-expense-chart";
import { RevenueByProductChart } from "@/components/charts/revenue-by-product-chart";
import { useAppStore, THEMES } from "@/store/useAppStore";
import type { FinancialSummary } from "@/lib/accounting/metrics";
import { formatCurrency } from "@/lib/sales/format";

interface SaleRow {
  id:            string;
  total:         number;
  created_at:    string;
  customer_name: string | null;
}

interface Props {
  summary:        FinancialSummary;
  currency:       string;
  orgName:        string;
  lowStockItems:  { name: string; stock_quantity: number; low_stock_threshold: number }[];
  latestInsight:  { content: string; created_at: string } | null;
  recentSales:    SaleRow[];
}

export function DashboardContent({ summary, currency, orgName, lowStockItems, latestInsight, recentSales }: Props) {
  const { activeTheme } = useAppStore();
  const theme = THEMES[activeTheme];

  const h = new Date().getHours();
  const greeting = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const money = (value: number) => formatCurrency(value, currency);

  const kpis: { label: string; value: string; note: string; color: TiltCardColor; icon: React.ReactNode; trend?: number; backDetails?: { label: string; value: string }[]; solid?: boolean }[] = [
    {
      label: "Sales Today", value: money(summary.salesToday), note: "Live · today only", color: "blue", icon: <DollarSign className="h-full w-full" />, solid: true,
      backDetails: [
        { label: "Total Sales (30d)",  value: money(summary.revenue30d)  },
        { label: "No. of Sales",       value: String(summary.saleCount30d)      },
        { label: "Cash Flow",         value: money(summary.cashFlow30d) },
      ],
    },
    {
      label: "Revenue (30d)", value: money(summary.revenue30d), note: `${summary.saleCount30d} sales`, color: "green", icon: <TrendingUp className="h-full w-full" />, trend: summary.revenue30d > 0 ? 12.4 : undefined,
      backDetails: [
        { label: "Avg per Sale",   value: summary.saleCount30d > 0 ? money(summary.revenue30d / summary.saleCount30d) : money(0) },
        { label: "Expenses (30d)", value: money(summary.expenses30d)  },
        { label: "Net Profit",     value: money(summary.netProfit30d) },
      ],
    },
    {
      label: "Profit (30d)", value: money(summary.netProfit30d), note: summary.hasCostData ? "Net of COGS & exp." : "Add cost prices", color: summary.netProfit30d >= 0 ? "purple" : "red", icon: <PiggyBank className="h-full w-full" />,
      backDetails: [
        { label: "Revenue",  value: money(summary.revenue30d)  },
        { label: "Expenses", value: money(summary.expenses30d) },
        { label: "Margin",   value: summary.revenue30d > 0 ? `${((summary.netProfit30d / summary.revenue30d) * 100).toFixed(1)}%` : "0%" },
      ],
    },
    {
      label: "Expenses (30d)", value: money(summary.expenses30d), note: "Recorded expenses", color: "red", icon: <Receipt className="h-full w-full" />,
      backDetails: [
        { label: "Revenue",    value: money(summary.revenue30d)  },
        { label: "Net Profit", value: money(summary.netProfit30d) },
        { label: "Exp. Ratio", value: summary.revenue30d > 0 ? `${((summary.expenses30d / summary.revenue30d) * 100).toFixed(1)}%` : "0%" },
      ],
    },
    {
      label: "Cash Flow (30d)", value: money(summary.cashFlow30d), note: "Revenue + payments − expenses", color: summary.cashFlow30d >= 0 ? "teal" : "red", icon: <Wallet className="h-full w-full" />,
      backDetails: [
        { label: "Inflow",  value: money(summary.revenue30d)  },
        { label: "Outflow", value: money(summary.expenses30d) },
        { label: "Net",     value: money(summary.cashFlow30d) },
      ],
    },
    {
      label: "Invoices Due", value: money(summary.outstandingInvoicesTotal), note: `${summary.outstandingInvoicesCount} unpaid`, color: "amber", icon: <FileWarning className="h-full w-full" />,
      backDetails: [
        { label: "Unpaid Count", value: String(summary.outstandingInvoicesCount) },
        { label: "Total Value",  value: money(summary.outstandingInvoicesTotal) },
        { label: "Status",       value: summary.outstandingInvoicesCount === 0 ? "All clear ✓" : "Action needed" },
      ],
    },
    {
      label: "Inventory Value", value: money(summary.inventoryValue), note: "Active products at unit price", color: "teal", icon: <Boxes className="h-full w-full" />,
      backDetails: [
        { label: "Low Stock Items", value: String(summary.lowStockCount) },
        { label: "Total Value",     value: money(summary.inventoryValue) },
        { label: "Status",          value: summary.lowStockCount > 0 ? "Restock needed" : "Healthy ✓" },
      ],
    },
    {
      label: "Low Stock", value: String(summary.lowStockCount), note: summary.lowStockCount > 0 ? "Needs attention" : "All stocked", color: summary.lowStockCount > 0 ? "red" : "green", icon: <AlertTriangle className="h-full w-full" />,
      backDetails: [
        { label: "Inventory Value", value: money(summary.inventoryValue) },
        { label: "Alert Level",     value: summary.lowStockCount > 0 ? "⚠ Low stock" : "✓ All good"  },
        { label: "Action",          value: summary.lowStockCount > 0 ? "Reorder now" : "No action needed" },
      ],
    },
  ];

  const CARD_STYLE = {
    background: "#fff",
    borderRadius: "16px",
    border: "1px solid #f1f5f9",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)",
  };

  return (
    <div className="mx-auto max-w-7xl space-y-7">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{greeting} · Executive Overview</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{orgName}</h1>
          <p className="mt-1 text-sm text-slate-400">Last 30 days · updated live</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/sales/new">
            <button className="flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
              style={{ background: theme.colors.primary, boxShadow: `0 4px 14px ${theme.colors.primary}40` }}>
              <ShoppingCart className="h-4 w-4" /> New Sale
            </button>
          </Link>
          <Link href="/accounting/invoices/new">
            <button className="flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-semibold border transition-all hover:bg-slate-50 active:scale-95"
              style={{ borderColor: "#e2e8f0", color: "#475569" }}>
              <Plus className="h-4 w-4" /> New Invoice
            </button>
          </Link>
        </div>
      </div>

      {/* ── KPI Grid ── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpis.map(kpi => (
          <TiltKpiCard key={kpi.label} color={kpi.color} label={kpi.label}
            value={kpi.value} note={kpi.note} icon={kpi.icon}
            trend={kpi.trend} backDetails={kpi.backDetails} solid={(kpi as any).solid} />
        ))}
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Revenue vs Expenses */}
        <div className="lg:col-span-2 p-5" style={CARD_STYLE}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Financial Performance</p>
              <p className="text-sm font-bold text-slate-800 mt-0.5">Revenue vs Expenses · 30 days</p>
            </div>
            <Link href="/reports" className="flex items-center gap-1 text-xs font-semibold hover:underline"
              style={{ color: theme.colors.primary }}>
              Full report <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <RevenueExpenseChart data={summary.dailySeries30d} />
        </div>

        {/* AI Insights */}
        <div className="p-5 flex flex-col" style={CARD_STYLE}>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl shrink-0"
              style={{ background: "linear-gradient(135deg, #8b5cf6, #7c3aed)" }}>
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">AI Assistant</p>
              <p className="text-sm font-bold text-slate-800">Latest Insights</p>
            </div>
          </div>
          {latestInsight ? (
            <div className="flex-1 flex flex-col">
              <div className="flex-1 rounded-xl bg-violet-50/60 border border-violet-100 p-3">
                <p className="text-sm leading-relaxed text-slate-600 line-clamp-7">{latestInsight.content}</p>
              </div>
              <Link href="/ai" className="mt-3 flex items-center gap-1.5 text-xs font-semibold hover:underline" style={{ color: "#7c3aed" }}>
                View all insights <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-slate-100 py-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50">
                <Sparkles className="h-6 w-6 text-violet-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-600">No insights yet</p>
                <p className="text-xs text-slate-400 mt-0.5">Generate AI analysis of your business</p>
              </div>
              <Link href="/ai">
                <button className="flex items-center gap-1.5 h-8 px-4 rounded-xl text-xs font-bold text-white"
                  style={{ background: "linear-gradient(135deg, #8b5cf6, #7c3aed)" }}>
                  Generate now <ArrowRight className="h-3 w-3" />
                </button>
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Row ── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

        {/* Top Products */}
        <div className="p-5" style={CARD_STYLE}>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50">
              <Trophy className="h-4 w-4 text-amber-500" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Best Sellers</p>
              <p className="text-sm font-bold text-slate-800">By Revenue · 30d</p>
            </div>
          </div>
          {summary.revenueByProduct30d.length > 0 ? (
            <RevenueByProductChart data={summary.revenueByProduct30d} />
          ) : (
            <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-100">
              <Trophy className="h-8 w-8 text-slate-200" />
              <div className="text-center">
                <p className="text-sm font-medium text-slate-400">No product data yet</p>
                <p className="text-xs text-slate-300 mt-0.5">Record sales to see rankings</p>
              </div>
            </div>
          )}
        </div>

        {/* Recent Sales */}
        <div className="p-5" style={CARD_STYLE}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50">
                <Activity className="h-4 w-4 text-blue-500" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Activity</p>
                <p className="text-sm font-bold text-slate-800">Recent Sales</p>
              </div>
            </div>
            <Link href="/sales" className="text-xs font-semibold hover:underline" style={{ color: theme.colors.primary }}>View all →</Link>
          </div>
          {recentSales.length > 0 ? (
            <div className="space-y-1">
              {recentSales.map(s => (
                <Link key={s.id} href={`/sales/${s.id}`}
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 group-hover:bg-slate-200 transition-colors shrink-0">
                      <ShoppingCart className="h-3.5 w-3.5 text-slate-500" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-700">
                        {s.customer_name ?? `Sale #${s.id.slice(-6).toUpperCase()}`}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {new Date(s.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs font-bold text-slate-900">{money(s.total)}</p>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-100">
              <ShoppingCart className="h-8 w-8 text-slate-200" />
              <div className="text-center">
                <p className="text-sm font-medium text-slate-400">No sales yet</p>
                <Link href="/sales/new" className="text-xs font-semibold block mt-0.5" style={{ color: theme.colors.primary }}>
                  Record first sale →
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Low Stock */}
        <div className="p-5" style={CARD_STYLE}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${summary.lowStockCount > 0 ? "bg-red-50" : "bg-green-50"}`}>
                <AlertTriangle className={`h-4 w-4 ${summary.lowStockCount > 0 ? "text-red-500" : "text-green-500"}`} />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Alerts</p>
                <p className="text-sm font-bold text-slate-800">Stock Levels</p>
              </div>
            </div>
            <Link href="/inventory" className="text-xs font-semibold hover:underline" style={{ color: theme.colors.primary }}>Manage →</Link>
          </div>
          {lowStockItems.length > 0 ? (
            <div className="space-y-2">
              {lowStockItems.map((item, i) => {
                const pct = Math.min(100, Math.round((item.stock_quantity / Math.max(item.low_stock_threshold, 1)) * 100));
                return (
                  <div key={i} className="p-2.5 rounded-xl border border-red-50 bg-red-50/40">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-semibold text-slate-700 truncate flex-1 pr-2">{item.name}</p>
                      <span className="text-xs font-bold text-red-500 shrink-0">{item.stock_quantity} left</span>
                    </div>
                    <div className="h-1.5 bg-red-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-red-400" style={{ width: `${pct}%`, transition: "width 0.5s ease" }} />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">Min threshold: {item.low_stock_threshold}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-green-100">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-50">
                <CheckCircle className="h-6 w-6 text-green-500" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-green-700">All stocked</p>
                <p className="text-xs text-slate-400 mt-0.5">No items below threshold</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Best Sellers Banner ── */}
      {summary.bestSellers30d.length > 0 && (
        <div className="p-5" style={CARD_STYLE}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Leaderboard</p>
              <p className="text-sm font-bold text-slate-800">Top 5 products by units sold · last 30 days</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {summary.bestSellers30d.map((p, i) => {
              const COLORS = ["#22c55e","#3b82f6","#a855f7","#f59e0b","#14b8a6"];
              return (
                <div key={p.name} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white text-sm font-black"
                    style={{ background: COLORS[i % COLORS.length] }}>
                    {i + 1}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-700 truncate">{p.name}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{p.quantity} units · {money(p.revenue)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
