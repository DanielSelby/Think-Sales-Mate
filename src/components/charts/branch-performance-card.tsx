"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import {
  Building2,
  TrendingUp,
  Table as TableIcon,
  BarChart3,
  CheckCircle2,
  Sparkles,
  ArrowUpRight,
  GitCompare,
  ArrowLeftRight,
} from "lucide-react";import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/currency";
import type { BranchPerformanceMetric } from "@/lib/accounting/metrics";
import { useAppStore, THEMES } from "@/store/useAppStore";

const BRANCH_COLORS = [
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#f59e0b",
  "#14b8a6",
  "#ec4899",
];

interface BranchPerformanceCardProps {
  branches: BranchPerformanceMetric[];
  currency?: string;
}

export function BranchPerformanceCard({
  branches = [],
  currency = "GHS",
}: BranchPerformanceCardProps) {
  const { activeTheme } = useAppStore();
  const theme = THEMES[activeTheme];

  const [viewMode, setViewMode] = useState<"table" | "chart">("table");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Branch-to-branch filter — narrows the table/chart down to just two
  // selected branches instead of always showing all of them.
  const [compareBranches, setCompareBranches] = useState(false);
  const [branchAId, setBranchAId] = useState<string>("");
  const [branchBId, setBranchBId] = useState<string>("");

  const branchA = branches.find((b) => b.id === branchAId) ?? null;
  const branchB = branches.find((b) => b.id === branchBId) ?? null;
  const displayBranches = compareBranches
    ? [branchA, branchB].filter((b): b is BranchPerformanceMetric => b !== null)
    : branches;

  const totalRevenue = displayBranches.reduce((sum, b) => sum + b.revenue, 0);
  const totalOrders = displayBranches.reduce((sum, b) => sum + b.orders, 0);
  const topBranch =
    displayBranches.length > 0 ? [...displayBranches].sort((a, b) => b.revenue - a.revenue)[0] : null;
  return (
    <Card className="col-span-1 lg:col-span-2">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold text-ink-900 dark:text-white">
              Branch Performance Comparison
            </CardTitle>
            <p className="text-xs text-ledger-400">
              Live sales revenue, order volumes, and category demand across branches
            </p>
          </div>
        </div>

        {/* View Switcher Button */}
        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-ink-950">
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              viewMode === "table"
                ? "bg-white text-ink-900 shadow-xs dark:bg-ledger-800 dark:text-white"
                : "text-slate-500 hover:text-ink-900 dark:text-slate-400"
            }`}
          >
            <TableIcon className="h-3.5 w-3.5" />
            <span>Metrics Table</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode("chart")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              viewMode === "chart"
                ? "bg-white text-ink-900 shadow-xs dark:bg-ledger-800 dark:text-white"
                : "text-slate-500 hover:text-ink-900 dark:text-slate-400"
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            <span>Bar Chart</span>
          </button>
        </div>
      </CardHeader>

       <CardContent className="space-y-4">
        {/* Branch-to-Branch Filter */}
        <div className="flex flex-wrap items-center gap-3 border-b border-ledger-100 pb-4 dark:border-ledger-700">
          <button
            type="button"
            onClick={() => setCompareBranches(!compareBranches)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              compareBranches
                ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                : "bg-slate-100 text-slate-500 hover:text-ink-900 dark:bg-ink-950 dark:text-slate-400"
            }`}
          >
            <GitCompare className="h-3.5 w-3.5" />
            <span>Compare Two Branches</span>
          </button>

          {compareBranches && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <select
                value={branchAId}
                onChange={(e) => setBranchAId(e.target.value)}
                className="h-8 rounded-lg border border-ledger-200 bg-white px-2.5 text-xs font-medium text-ink-900 focus:border-blue-500 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
              >
                <option value="">Branch A…</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id} disabled={b.id === branchBId}>
                    {b.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => {
                  setBranchAId(branchBId);
                  setBranchBId(branchAId);
                }}
                title="Swap Branch A and Branch B"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ledger-400 hover:bg-ledger-50 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white"
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
              </button>

              <select
                value={branchBId}
                onChange={(e) => setBranchBId(e.target.value)}
                className="h-8 rounded-lg border border-ledger-200 bg-white px-2.5 text-xs font-medium text-ink-900 focus:border-blue-500 focus:outline-hidden dark:border-ledger-700 dark:bg-ink-950 dark:text-white"
              >
                <option value="">Branch B…</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id} disabled={b.id === branchAId}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Quick Highlights Strip */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 border-b border-ledger-100 pb-4 dark:border-ledger-700">
          <div className="rounded-xl bg-ledger-50/60 p-3 dark:bg-white/[0.02]">
            <p className="text-[11px] font-medium text-ledger-400">Total Multi-Branch Revenue</p>
            <p className="font-display text-lg font-bold text-ink-900 dark:text-white font-mono mt-0.5">
              {formatMoney(totalRevenue, currency)}
            </p>
          </div>

          <div className="rounded-xl bg-ledger-50/60 p-3 dark:bg-white/[0.02]">
            <p className="text-[11px] font-medium text-ledger-400">Total Orders Fulfilled</p>
            <p className="font-display text-lg font-bold text-ink-900 dark:text-white font-mono mt-0.5">
              {totalOrders} <span className="text-xs font-normal text-ledger-400">orders</span>
            </p>
          </div>

          <div className="rounded-xl bg-ledger-50/60 p-3 dark:bg-white/[0.02]">
            <p className="text-[11px] font-medium text-ledger-400">Top Performing Location</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="font-display text-sm font-bold text-emerald-600 dark:text-emerald-400 truncate">
                {topBranch?.name ?? "Main Branch"}
              </p>
              {topBranch && (
                <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                  {topBranch.sharePct.toFixed(0)}% Share
                </span>
              )}
            </div>
          </div>
        </div>

        {/* View Mode Content */}
        {branches.length === 0 ? (
          <div className="flex h-44 flex-col items-center justify-center rounded-xl border border-dashed border-ledger-200 text-center dark:border-ledger-700">
            <p className="text-sm text-ledger-400">No branch performance metrics available.</p>
          </div>
        ) : compareBranches && displayBranches.length === 0 ? (
          <div className="flex h-44 flex-col items-center justify-center rounded-xl border border-dashed border-ledger-200 text-center dark:border-ledger-700">
            <p className="text-sm text-ledger-400">Select two branches above to compare them.</p>
          </div>
        ) : viewMode === "table" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-ledger-100 bg-ledger-50/60 text-[11px] font-semibold text-ledger-500 dark:border-ledger-700 dark:bg-white/[0.02]">
                <tr>
                  <th className="px-3.5 py-2.5">Branch / Warehouse</th>
                  <th className="px-3.5 py-2.5 text-right">Revenue ({currency})</th>
                  <th className="px-3.5 py-2.5 text-center">Orders</th>
                  <th className="px-3.5 py-2.5 text-right">Avg Order Value</th>
                  <th className="px-3.5 py-2.5">Top Category</th>
                  <th className="px-3.5 py-2.5 min-w-[140px]">Revenue Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700/50">
                {displayBranches.map((b, idx) => (
                  <tr
                    key={b.id}
                    className="transition-colors hover:bg-ledger-50/40 dark:hover:bg-white/[0.02]"
                  >
                    {/* Branch Name */}
                    <td className="px-3.5 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{
                            backgroundColor: BRANCH_COLORS[idx % BRANCH_COLORS.length],
                          }}
                        />
                        <span className="font-semibold text-ink-900 dark:text-white">
                          {b.name}
                        </span>
                        {b.isPrimary && (
                          <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                            Primary
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Revenue */}
                    <td className="px-3.5 py-3 text-right font-bold font-mono text-ink-900 dark:text-white">
                      {formatMoney(b.revenue, currency)}
                    </td>

                    {/* Orders */}
                    <td className="px-3.5 py-3 text-center font-mono text-ledger-600 dark:text-ledger-300 font-semibold">
                      {b.orders}
                    </td>

                    {/* Avg Order Value */}
                    <td className="px-3.5 py-3 text-right font-mono text-ledger-600 dark:text-ledger-300">
                      {formatMoney(b.avgOrderValue, currency)}
                    </td>

                    {/* Top Category */}
                    <td className="px-3.5 py-3">
                      <span className="inline-block rounded-lg bg-ledger-100 px-2 py-0.5 text-[11px] font-medium text-ledger-700 dark:bg-ledger-800 dark:text-ledger-200">
                        {b.topCategory || "General"}
                      </span>
                    </td>

                    {/* Revenue Share Bar */}
                    <td className="px-3.5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-ledger-800 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min(100, Math.max(5, b.sharePct))}%`,
                              backgroundColor: BRANCH_COLORS[idx % BRANCH_COLORS.length],
                            }}
                          />
                        </div>
                        <span className="w-10 text-right font-mono font-semibold text-[11px] text-ledger-500">
                          {b.sharePct.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="h-64 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={displayBranches}
                margin={{ top: 10, right: 20, left: 10, bottom: 20 }}
                onMouseMove={(state) => {
                  if (state.activeTooltipIndex !== undefined) {
                    setHoveredIndex(state.activeTooltipIndex);
                  }
                }}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fontWeight: 600, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) =>
                    Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)
                  }
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const item = payload[0].payload as BranchPerformanceMetric;
                    return (
                      <div className="rounded-xl border border-slate-100 bg-white p-3 text-xs shadow-xl dark:border-ledger-700 dark:bg-ink-900">
                        <p className="font-bold text-ink-900 dark:text-white">{item.name}</p>
                        <p className="text-emerald-600 dark:text-emerald-400 font-semibold font-mono mt-1">
                          Revenue: {formatMoney(item.revenue, currency)}
                        </p>
                        <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                          Orders: {item.orders} · Share: {item.sharePct.toFixed(1)}%
                        </p>
                        <p className="text-slate-400 text-[10px] mt-0.5">
                          Top Category: {item.topCategory}
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="revenue" radius={[6, 6, 0, 0]} maxBarSize={48}>
                  {displayBranches.map((_, index) => (
                    <Cell
                      key={`bar-${index}`}
                      fill={BRANCH_COLORS[index % BRANCH_COLORS.length]}
                      opacity={hoveredIndex === null || hoveredIndex === index ? 1 : 0.4}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
