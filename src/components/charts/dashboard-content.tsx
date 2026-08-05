import Link from "next/link";
import {
  DollarSign,
  TrendingUp,
  PiggyBank,
  Receipt,
  Wallet,
  FileWarning,
  Boxes,
  AlertTriangle,
  Trophy,
  Sparkles,
  Plus,
  ArrowRight
} from "lucide-react";
import type { FinancialSummary } from "@/lib/accounting/metrics";
import { formatMoney } from "@/lib/currency";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TiltKpiCard, type TiltCardColor } from "@/components/charts/tilt-kpi-card";
import { RevenueExpenseChart } from "@/components/charts/revenue-expense-chart";
import { RevenueByProductChart } from "@/components/charts/revenue-by-product-chart";

interface LowStockItem {
  name: string;
  stock_quantity: number;
  low_stock_threshold: number;
}

interface RecentSale {
  id: string;
  total: number;
  created_at: string;
  customer_name: string | null;
}

interface Kpi {
  label: string;
  value: string;
  note: string;
  color: TiltCardColor;
  icon: React.ReactNode;
}

export function DashboardContent({
  summary,
  orgName,
  currency,
  lowStockItems,
  latestInsight,
  recentSales
}: {
  summary: FinancialSummary;
  orgName: string;
  currency: string;
  lowStockItems: LowStockItem[];
  latestInsight: { content: string; created_at: string } | null;
  recentSales: RecentSale[];
}) {
  const kpis: Kpi[] = [
    {
      label: "Sales today",
      value: formatMoney(summary.salesToday, currency),
      note: "Live",
      color: "blue",
      icon: <DollarSign className="h-full w-full" />
    },
    {
      label: "Revenue (30d)",
      value: formatMoney(summary.revenue30d, currency),
      note: `${summary.saleCount30d} sale${summary.saleCount30d === 1 ? "" : "s"}`,
      color: "green",
      icon: <TrendingUp className="h-full w-full" />
    },
    {
      label: "Profit (30d)",
      value: formatMoney(summary.netProfit30d, currency),
      note: summary.hasCostData ? "Net of COGS & expenses" : "Add cost prices for full accuracy",
      color: summary.netProfit30d >= 0 ? "purple" : "red",
      icon: <PiggyBank className="h-full w-full" />
    },
    {
      label: "Expenses (30d)",
      value: formatMoney(summary.expenses30d, currency),
      note: "Live",
      color: "red",
      icon: <Receipt className="h-full w-full" />
    },
    {
      label: "Cash flow (30d)",
      value: formatMoney(summary.cashFlow30d, currency),
      note: "Live",
      color: summary.cashFlow30d >= 0 ? "teal" : "red",
      icon: <Wallet className="h-full w-full" />
    },
    {
      label: "Outstanding invoices",
      value: formatMoney(summary.outstandingInvoicesTotal, currency),
      note: `${summary.outstandingInvoicesCount} unpaid`,
      color: "amber",
      icon: <FileWarning className="h-full w-full" />
    },
    {
      label: "Inventory value",
      value: formatMoney(summary.inventoryValue, currency),
      note: "Live",
      color: "teal",
      icon: <Boxes className="h-full w-full" />
    },
    {
      label: "Low stock alerts",
      value: String(summary.lowStockCount),
      note: summary.lowStockCount > 0 ? "Needs attention" : "All stocked",
      color: summary.lowStockCount > 0 ? "red" : "green",
      icon: <AlertTriangle className="h-full w-full" />
    }
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ledger-400">Executive overview</p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink-900 dark:text-white">{orgName}</h1>
          <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">Last 30 days, updated live.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/sales/new">
            <Button>
              <Plus className="h-4 w-4" />
              New sale
            </Button>
          </Link>
          <Link href="/accounting/invoices/new">
            <Button variant="outline">
              <Plus className="h-4 w-4" />
              New invoice
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpis.map((kpi) => (
          <TiltKpiCard key={kpi.label} color={kpi.color} label={kpi.label} value={kpi.value} note={kpi.note} icon={kpi.icon} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue vs expenses (30d)</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueExpenseChart data={summary.dailySeries30d} currency={currency} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI insights</CardTitle>
          </CardHeader>
          <CardContent>
            {latestInsight ? (
              <div className="space-y-3">
                <p className="line-clamp-6 whitespace-pre-line text-sm leading-relaxed text-ledger-600 dark:text-ledger-300">
                  {latestInsight.content}
                </p>
                <Link href="/ai" className="inline-flex items-center gap-1 text-sm font-medium text-signal hover:underline">
                  View all insights
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ) : (
              <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-ledger-200 text-center dark:border-ledger-700">
                <Sparkles className="h-5 w-5 text-ledger-300" />
                <p className="px-4 text-sm text-ledger-400">No insights yet.</p>
                <Link href="/ai" className="text-sm font-medium text-signal hover:underline">
                  Generate now
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue by product (30d)</CardTitle>
          </CardHeader>
          <CardContent>
            {summary.revenueByProduct30d.length > 0 ? (
              <RevenueByProductChart data={summary.revenueByProduct30d} currency={currency} />
            ) : (
              <div className="flex h-44 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-ledger-200 text-center dark:border-ledger-700">
                <Trophy className="h-5 w-5 text-ledger-300" />
                <p className="text-sm text-ledger-400">Connect Inventory to rank products by revenue.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card accent={lowStockItems.length > 0 ? "alert" : "neutral"}>
          <CardHeader>
            <CardTitle>Low stock alerts</CardTitle>
          </CardHeader>
          <CardContent>
            {lowStockItems.length > 0 ? (
              <ul className="space-y-2">
                {lowStockItems.map((item, i) => (
                  <li key={i} className="flex items-center justify-between text-sm">
                    <span className="text-ink-900 dark:text-white">{item.name}</span>
                    <span className="figure rounded-full bg-alert-soft px-2 py-0.5 text-xs font-semibold text-alert">
                      {item.stock_quantity} left
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-ledger-200 text-center dark:border-ledger-700">
                <Boxes className="h-5 w-5 text-signal" />
                <p className="text-sm text-ledger-400">Everything is well stocked.</p>
              </div>
            )}
            <Link href="/inventory" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-signal hover:underline">
              Go to Inventory
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent sales</CardTitle>
        </CardHeader>
        <CardContent>
          {recentSales.length > 0 ? (
            <ul className="divide-y divide-ledger-50 dark:divide-ledger-700/50">
              {recentSales.map((sale) => (
                <li key={sale.id}>
                  <Link
                    href={`/sales/${sale.id}`}
                    className="flex items-center justify-between py-2.5 text-sm hover:text-signal"
                  >
                    <span className="text-ink-900 dark:text-white">{sale.customer_name ?? "Walk-in customer"}</span>
                    <span className="flex items-center gap-3 text-ledger-400">
                      <span>{new Date(sale.created_at).toLocaleDateString()}</span>
                      <span className="figure font-medium text-ink-900 dark:text-white">
                        {formatMoney(sale.total, currency)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex h-24 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-ledger-200 text-center dark:border-ledger-700">
              <p className="text-sm text-ledger-400">No sales recorded yet.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}