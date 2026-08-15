"use client";

import { LineChart, Line, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import { formatMoney } from "@/lib/currency";
import type { DailyPoint, Trend } from "@/lib/accounting/metrics";

function CustomTooltip({ active, payload, label, currency }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-ledger-100 bg-white px-3 py-2 text-xs shadow-card-hover dark:border-ledger-700 dark:bg-ink-900">
      <p className="mb-1 font-semibold text-ink-900 dark:text-white">{label}</p>
      <p className="text-signal">{formatMoney(Number(payload[0]?.value ?? 0), currency)}</p>
    </div>
  );
}

export function SalesOverviewChart({
  data,
  currency,
  totalRevenue,
  trend,
  avgDailySales,
  bestDay,
  orderCount,
  avgOrderValue
}: {
  data: DailyPoint[];
  currency: string;
  totalRevenue: number;
  trend: Trend;
  avgDailySales: number;
  bestDay: { label: string; revenue: number } | null;
  orderCount: number;
  avgOrderValue: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      <div className="md:col-span-2">
        <p className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Total sales</p>
        <div className="mt-1 flex items-baseline gap-2">
          <p className="figure text-3xl font-semibold text-ink-900 dark:text-white">{formatMoney(totalRevenue, currency)}</p>
          {trend.pct !== null && (
            <span className={trend.direction === "up" ? "text-sm font-semibold text-signal" : "text-sm font-semibold text-alert"}>
              {trend.direction === "up" ? "↑" : "↓"} {Math.abs(trend.pct).toFixed(1)}%
            </span>
          )}
        </div>
        <div className="mt-4 h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} interval={Math.ceil(data.length / 6)} />
              <Tooltip content={<CustomTooltip currency={currency} />} />
              <Line type="monotone" dataKey="revenue" stroke="#1d8f5e" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-xs text-ledger-400">Average daily sales</p>
          <p className="figure text-sm font-semibold text-ink-900 dark:text-white">{formatMoney(avgDailySales, currency)}</p>
        </div>
        <div>
          <p className="text-xs text-ledger-400">Best day</p>
          <p className="text-sm font-semibold text-ink-900 dark:text-white">
            {bestDay ? `${bestDay.label} · ${formatMoney(bestDay.revenue, currency)}` : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-ledger-400">Orders</p>
          <p className="figure text-sm font-semibold text-ink-900 dark:text-white">{orderCount}</p>
        </div>
        <div>
          <p className="text-xs text-ledger-400">Average order value</p>
          <p className="figure text-sm font-semibold text-ink-900 dark:text-white">{formatMoney(avgOrderValue, currency)}</p>
        </div>
      </div>
    </div>
  );
}