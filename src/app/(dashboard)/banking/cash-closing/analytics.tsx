"use client";

import { AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, CircleDollarSign } from "lucide-react";
import { formatCurrencyAmount, type CurrencyConfig } from "@/lib/currency";

type Closing = {
  id: string;
  closing_date: string;
  location_id?: string | null;
  variance?: number | null;
  classification?: string | null;
  variance_reason?: string | null;
};

type Location = { id: string; name: string };

export function CashClosingAnalytics({ closings, locations, currency }: { closings: Closing[]; locations: Location[]; currency: CurrencyConfig }) {
  const number = (value: unknown) => Number(value ?? 0) || 0;
  const shortage = closings.filter((row) => number(row.variance) < 0).reduce((sum, row) => sum + Math.abs(number(row.variance)), 0);
  const excess = closings.filter((row) => number(row.variance) > 0).reduce((sum, row) => sum + number(row.variance), 0);
  const balanced = closings.filter((row) => number(row.variance) === 0).length;
  const reasons = Object.entries(closings.reduce<Record<string, number>>((result, row) => {
    const reason = row.variance_reason?.trim() || "No reason recorded";
    result[reason] = (result[reason] ?? 0) + 1;
    return result;
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const trend = Object.entries(closings.reduce<Record<string, number>>((result, row) => {
    result[row.closing_date] = (result[row.closing_date] ?? 0) + number(row.variance);
    return result;
  }, {})).sort(([a], [b]) => a.localeCompare(b)).slice(-14);
  const maxTrend = Math.max(...trend.map(([, value]) => Math.abs(value)), 1);
  const branches = Object.entries(closings.reduce<Record<string, { count: number; variance: number }>>((result, row) => {
    const key = row.location_id ?? "all";
    result[key] ??= { count: 0, variance: 0 };
    result[key].count += 1;
    result[key].variance += number(row.variance);
    return result;
  }, {})).sort(([, a], [, b]) => Math.abs(b.variance) - Math.abs(a.variance)).slice(0, 6);
  const branchName = (id: string) => id === "all" ? "All branches" : locations.find((location) => location.id === id)?.name ?? "Branch";

  return (
    <section className="space-y-4" aria-labelledby="cash-closing-analytics">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-[#1675d1]" />
        <div><h2 id="cash-closing-analytics" className="text-lg font-bold text-[#12345a] dark:text-white">Cash Closing Analytics</h2><p className="text-xs text-ledger-500">Operational trends from the closings in your accessible scope.</p></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {([
          { label: "Total closings", value: String(closings.length), Icon: CircleDollarSign, tone: "text-[#1675d1]" },
          { label: "Shortage", value: formatCurrencyAmount(shortage, currency), Icon: ArrowDownRight, tone: "text-red-500" },
          { label: "Excess", value: formatCurrencyAmount(excess, currency), Icon: ArrowUpRight, tone: "text-amber-600" },
          { label: "Balanced", value: String(balanced), Icon: CircleDollarSign, tone: "text-emerald-600" },
        ]).map(({ label, value, Icon, tone }) => <div key={label} className="rounded-xl border border-[#dce8f2] bg-white p-4 shadow-sm dark:border-ledger-700 dark:bg-ink-900"><div className="flex items-center justify-between"><p className="text-xs text-ledger-500">{label}</p><Icon className={`h-4 w-4 ${tone}`} /></div><p className="mt-2 text-xl font-bold text-[#17385d] dark:text-white">{value}</p></div>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-xl border border-[#dce8f2] bg-white p-4 shadow-sm dark:border-ledger-700 dark:bg-ink-900">
          <div className="mb-4 flex items-center justify-between"><div><h3 className="font-bold text-[#17385d] dark:text-white">Variance trend</h3><p className="text-[11px] text-ledger-500">Net variance by closing date</p></div><span className="text-[11px] text-ledger-500">Last {trend.length} days</span></div>
          {trend.length ? <div className="flex h-36 items-end gap-1 border-b border-ledger-200 pb-1">{trend.map(([date, value]) => <div key={date} className="group flex h-full flex-1 flex-col justify-end"><div className={`relative mx-auto w-full max-w-8 rounded-t ${value < 0 ? "bg-red-400" : value > 0 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ height: `${Math.max(value === 0 ? 4 : (Math.abs(value) / maxTrend) * 100, 4)}%` }} title={`${date}: ${formatCurrencyAmount(value, currency)}`} /><span className="mt-1 truncate text-center text-[9px] text-ledger-500">{date.slice(5)}</span></div>)}</div> : <p className="flex h-36 items-center justify-center text-xs text-ledger-500">No closing data yet.</p>}
        </div>
        <div className="rounded-xl border border-[#dce8f2] bg-white p-4 shadow-sm dark:border-ledger-700 dark:bg-ink-900"><h3 className="mb-1 font-bold text-[#17385d] dark:text-white">Shortage / excess summary</h3><p className="mb-4 text-[11px] text-ledger-500">Total impact across the selected scope</p><div className="space-y-4 text-xs"><div><div className="mb-1 flex justify-between"><span>Shortage</span><strong className="text-red-500">{formatCurrencyAmount(shortage, currency)}</strong></div><div className="h-2 rounded-full bg-red-100"><div className="h-2 rounded-full bg-red-400" style={{ width: `${(shortage / Math.max(shortage, excess, 1)) * 100}%` }} /></div></div><div><div className="mb-1 flex justify-between"><span>Excess</span><strong className="text-amber-600">{formatCurrencyAmount(excess, currency)}</strong></div><div className="h-2 rounded-full bg-amber-100"><div className="h-2 rounded-full bg-amber-400" style={{ width: `${(excess / Math.max(shortage, excess, 1)) * 100}%` }} /></div></div></div></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[#dce8f2] bg-white p-4 shadow-sm dark:border-ledger-700 dark:bg-ink-900"><h3 className="mb-4 font-bold text-[#17385d] dark:text-white">Branch comparison</h3>{branches.length ? <div className="space-y-3">{branches.map(([id, value]) => <div key={id} className="text-xs"><div className="mb-1 flex justify-between"><span>{branchName(id)}</span><strong className={value.variance < 0 ? "text-red-500" : "text-amber-600"}>{formatCurrencyAmount(value.variance, currency)} · {value.count} closing{value.count === 1 ? "" : "s"}</strong></div><div className="h-2 rounded-full bg-[#edf3f8]"><div className={`h-2 rounded-full ${value.variance < 0 ? "bg-red-400" : "bg-amber-400"}`} style={{ width: `${Math.max(Math.min(Math.abs(value.variance) / Math.max(...branches.map(([, item]) => Math.abs(item.variance)), 1) * 100, 100), value.variance ? 4 : 0)}%` }} /></div></div>)}</div> : <p className="text-xs text-ledger-500">No branch closing data yet.</p>}</div>
        <div className="rounded-xl border border-[#dce8f2] bg-white p-4 shadow-sm dark:border-ledger-700 dark:bg-ink-900"><div className="mb-4 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /><h3 className="font-bold text-[#17385d] dark:text-white">Variance reasons</h3></div>{reasons.length ? <div className="space-y-2">{reasons.map(([reason, count]) => <div key={reason} className="flex items-center justify-between rounded-lg bg-[#f6f9fc] px-3 py-2 text-xs dark:bg-ink-950"><span className="truncate pr-3">{reason}</span><strong className="shrink-0 text-[#1675d1]">{count}</strong></div>)}</div> : <p className="text-xs text-ledger-500">No variance reasons recorded.</p>}</div>
      </div>
    </section>
  );
}
