import Link from "next/link";
import {
  DollarSign,
  TrendingUp,
  PiggyBank,
  ShoppingCart,
  Receipt,
  Wallet,
  Boxes,
  AlertTriangle,
  Sparkles,
  ArrowRight
} from "lucide-react";
import type { FinancialSummary, ActivityItem, DateRange } from "@/lib/accounting/metrics";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { KpiFlipCard, type KpiFlipColor } from "@/components/charts/kpi-flip-card";
import { RevenueExpenseChart } from "@/components/charts/revenue-expense-chart";
import { RevenueByProductChart } from "@/components/charts/revenue-by-product-chart";
import { SalesOverviewChart } from "@/components/charts/sales-overview-chart";
import { BusinessHealthCard } from "@/components/charts/business-health-card";
import { CashFlowSection } from "@/components/charts/cash-flow-section";
import { TopSellingTable } from "@/components/charts/top-selling-table";
import { InventorySummaryCard } from "@/components/charts/inventory-summary-card";
import { RecentActivityFeed } from "@/components/charts/recent-activity-feed";
import { ProfitOverviewChart } from "@/components/charts/profit-overview-chart";
import { BranchPerformanceCard } from "@/components/charts/branch-performance-card";
import { DateRangeFilter } from "@/components/charts/date-range-filter";
import { DashboardFilters, type FilterOption } from "@/components/charts/dashboard-filters";
import { formatMoney } from "@/lib/currency";
import { DashboardMotionItem } from "@/components/charts/dashboard-motion-item";

interface Kpi {
  label: string;
  value: string;
  color: KpiFlipColor;
  icon: React.ReactNode;
  trend?: FinancialSummary["trends"]["revenue"];
  detail: string;
  featured?: boolean;
}

export function DashboardContent({
  summary,
  orgName,
  currency,
  latestInsight,
  recentActivity,
  branches,
  categories,
  currentRange
}: {
  summary: FinancialSummary;
  orgName: string;
  currency: string;
  latestInsight: { content: string; created_at: string } | null;
  recentActivity: ActivityItem[];
  branches: FilterOption[];
  categories: FilterOption[];
  currentRange: DateRange;
}) {
  const insightLines = latestInsight
    ? latestInsight.content
        .split(/\n+/)
        .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z])/))
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 5)
    : [];

  const kpis: Kpi[] = [
    {
      label: "Sales today",
      value: formatMoney(summary.salesToday, currency),
      color: "green",
      featured: true,
      icon: <DollarSign className="h-full w-full" />,
      detail: `Total recorded so far today, live from your Sales module.`
    },
    {
      label: "Total sales",
      value: formatMoney(summary.revenue30d, currency),
      color: "blue",
      icon: <TrendingUp className="h-full w-full" />,
      trend: summary.trends.revenue,
      detail: `Revenue across ${summary.saleCount30d} sale${summary.saleCount30d === 1 ? "" : "s"} in ${summary.periodLabel}.`
    },
    {
      label: "Gross profit",
      value: formatMoney(summary.grossProfit30d, currency),
      color: "green",
      icon: <PiggyBank className="h-full w-full" />,
      trend: summary.trends.grossProfit,
      detail: summary.hasCostData
        ? "Revenue minus cost of goods sold for this period."
        : "Incomplete — add cost prices in Inventory for full accuracy."
    },
    {
      label: "Total orders",
      value: String(summary.saleCount30d),
      color: "purple",
      icon: <ShoppingCart className="h-full w-full" />,
      trend: summary.trends.orders,
      detail: `Average order value: ${formatMoney(summary.avgOrderValue, currency)}.`
    },
    {
      label: "Total expenses",
      value: formatMoney(summary.expenses30d, currency),
      color: "amber",
      icon: <Receipt className="h-full w-full" />,
      trend: summary.trends.expenses,
      detail: `Recorded across the Accounting module for ${summary.periodLabel}.`
    },
    {
      label: "Net profit",
      value: formatMoney(summary.netProfit30d, currency),
      color: summary.netProfit30d >= 0 ? "green" : "red",
      icon: <Wallet className="h-full w-full" />,
      trend: summary.trends.netProfit,
      detail: "Gross profit minus expenses for this period."
    },
    {
      label: "Inventory value",
      value: formatMoney(summary.inventoryValue, currency),
      color: "teal",
      icon: <Boxes className="h-full w-full" />,
      detail: `${summary.totalActiveProducts} active product${summary.totalActiveProducts === 1 ? "" : "s"} on hand.`
    },
    {
      label: "Low stock alerts",
      value: String(summary.lowStockCount),
      color: summary.lowStockCount > 0 ? "red" : "green",
      icon: <AlertTriangle className="h-full w-full" />,
      detail:
        summary.lowStockCount > 0
          ? `${summary.outOfStockCount} of these are completely out of stock.`
          : "Everything is above its reorder threshold."
    }
  ];

  return (
   <div className="dashboard-motion space-y-6 [&_.rounded-card]:!border-0 [&_.flip-face]:!border-0">
      <DashboardMotionItem className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">{orgName}</h1>
          <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">
            Welcome back — here&apos;s what&apos;s happening with your business, {summary.periodLabel}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFilter from={currentRange.from} to={currentRange.to} />
          <DashboardFilters branches={branches} categories={categories} />
        </div>
      </DashboardMotionItem>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpis.map((kpi, index) => (
          <DashboardMotionItem key={kpi.label} delay={0.06 + index * 0.055} hover>
            <KpiFlipCard
              color={kpi.color}
              label={kpi.label}
              value={kpi.value}
              icon={kpi.icon}
              trend={kpi.trend}
              trendSuffix={kpi.trend ? `vs prior period` : undefined}
              detail={kpi.detail}
              featured={kpi.featured}
              borderClassName="border-white dark:border-white"
            />
          </DashboardMotionItem>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DashboardMotionItem className="h-full lg:col-span-1" delay={0.12} hover>
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Sales overview</CardTitle>
          </CardHeader>
          <CardContent>
            <SalesOverviewChart
              data={summary.dailySeries30d}
              currency={currency}
              totalRevenue={summary.revenue30d}
              trend={summary.trends.revenue}
              avgDailySales={summary.avgDailySales}
              bestDay={summary.bestDay}
              orderCount={summary.saleCount30d}
              avgOrderValue={summary.avgOrderValue}
            />
          </CardContent>
        </Card>
        </DashboardMotionItem>

        <DashboardMotionItem className="h-full" delay={0.18} hover>
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Sales by product &amp; category</CardTitle>
          </CardHeader>
          <CardContent>
            {summary.revenueByProduct30d.length > 0 || summary.revenueByCategory30d.length > 0 ? (
              <RevenueByProductChart
                data={summary.revenueByProduct30d}
                categoryData={summary.revenueByCategory30d}
                currency={currency}
              />
            ) : (
              <div className="flex h-44 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-ledger-200 text-center dark:border-ledger-700">
                <p className="text-sm text-ledger-400">No sales in this period yet.</p>
              </div>
            )}
          </CardContent>
        </Card>
        </DashboardMotionItem>

      </div>

      <DashboardMotionItem delay={0.12} hover>
        {/* Branch comparison is intentionally full-width and stands alone. */}
        <BranchPerformanceCard
          branches={summary.branchPerformance}
          currency={currency}
        />
      </DashboardMotionItem>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DashboardMotionItem className="h-full" delay={0.12} hover>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Business health</CardTitle>
            </CardHeader>
            <CardContent>
              <BusinessHealthCard summary={summary} />
            </CardContent>
          </Card>
        </DashboardMotionItem>

        <DashboardMotionItem className="h-full" delay={0.18} hover>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Inventory summary</CardTitle>
            </CardHeader>
            <CardContent>
              <InventorySummaryCard
                totalProducts={summary.totalActiveProducts}
                lowStockCount={summary.lowStockCount}
                outOfStockCount={summary.outOfStockCount}
                inventoryValue={summary.inventoryValue}
                currency={currency}
              />
            </CardContent>
          </Card>
        </DashboardMotionItem>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DashboardMotionItem className="h-full" delay={0.12} hover>
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Cash flow</CardTitle>
          </CardHeader>
          <CardContent>
            <CashFlowSection
              data={summary.dailySeries30d}
              currency={currency}
              cashIn={summary.cashIn30d}
              cashOut={summary.cashOut30d}
              netCashFlow={summary.cashFlow30d}
            />
          </CardContent>
        </Card>
        </DashboardMotionItem>

        <DashboardMotionItem className="h-full" delay={0.18} hover>
        <Card className="h-full">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Top selling products</CardTitle>
              <Link href="/reports/sales" className="text-xs font-medium text-signal hover:underline">
                View all
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <TopSellingTable products={summary.bestSellers30d} currency={currency} />
          </CardContent>
        </Card>
        </DashboardMotionItem>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DashboardMotionItem className="h-full" delay={0.12} hover>
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Sales vs expenses vs profit</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueExpenseChart data={summary.dailySeries30d} currency={currency} />
          </CardContent>
        </Card>
        </DashboardMotionItem>

        <DashboardMotionItem className="h-full" delay={0.18} hover>
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Profit overview (cumulative)</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfitOverviewChart data={summary.dailySeries30d} currency={currency} />
          </CardContent>
        </Card>
        </DashboardMotionItem>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DashboardMotionItem className="h-full" delay={0.12} hover>
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            <RecentActivityFeed items={recentActivity} currency={currency} />
          </CardContent>
        </Card>
        </DashboardMotionItem>

        <DashboardMotionItem className="h-full" delay={0.18} hover>
        <Card accent="signal" className="h-full">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>AI insights</CardTitle>
              <Sparkles className="h-4 w-4 text-signal" />
            </div>
          </CardHeader>
          <CardContent>
            {insightLines.length > 0 ? (
              <div className="space-y-3">
                <ul className="space-y-2">
                  {insightLines.map((line, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-ledger-600 dark:text-ledger-300">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-signal" />
                      {line}
                    </li>
                  ))}
                </ul>
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
        </DashboardMotionItem>
      </div>
    </div>
  );
}