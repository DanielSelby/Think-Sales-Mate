"use client";

import { ArrowDownCircle, ArrowUpCircle, Wallet } from "lucide-react";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import { formatMoney } from "@/lib/currency";
import type { DailyPoint } from "@/lib/accounting/metrics";

function CustomTooltip({ active, payload, label, currency }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-ledger-100 bg-white px-3 py-2 text-xs shadow-card-hover dark:border-ledger-700 dark:bg-ink-900">
      <p className="mb-1 font-semibold text-ink-900 dark:text-white">{label}</p>
      <p className="text-signal">In: {formatMoney(payload.find((p: any) => p.dataKey === "revenue")?.value ?? 0, currency)}</p>
      <p className="text-alert">Out: {formatMoney(payload.find((p: any) => p.dataKey === "expenses")?.value ?? 0, currency)}</p>
    </div>
  );
}

export function CashFlowSection({
  data,
  currency,
  cashIn,
  cashOut,
  netCashFlow
}: {
  data: DailyPoint[];
  currency: string;
  cashIn: number;
  cashOut: number;
  netCashFlow: number;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-signal-soft p-3">
          <div className="flex items-center gap-1.5 text-signal">
            <ArrowUpCircle className="h-3.5 w-3.5" />
            <span className="text-xs font-semibold tracking-wide">Cash In</span>
          </div>
          <p className={`figure mt-1 text-sm font-semibold tracking-tight tabular-nums ${netCashFlow >= 0 ? "text-signal" : "text-alert"}`}>{formatMoney(cashIn, currency)}</p>
        </div>
        <div className="rounded-xl bg-alert-soft p-3">
          <div className="flex items-center gap-1.5 text-alert">
            <ArrowDownCircle className="h-3.5 w-3.5" />
            <span className="text-xs font-semibold tracking-wide">Cash Out</span>
          </div>
          <p className={`figure mt-1 text-sm font-semibold tracking-tight tabular-nums ${netCashFlow >= 0 ? "text-signal" : "text-alert"}`}>{formatMoney(cashOut, currency)}</p>
        </div>
        <div className="rounded-xl bg-ledger-50 p-3 dark:bg-ink-950">
          <div className="flex items-center gap-1.5 text-ledger-500 dark:text-ledger-400">
            <Wallet className="h-3.5 w-3.5" />
            <span className="text-xs font-semibold tracking-wide">Net</span>
          </div>
          <p className={`figure mt-1 figure text-sm font-semibold ${netCashFlow >= 0 ? "text-signal" : "text-alert"}`}>
            {formatMoney(netCashFlow, currency)}
          </p>
        </div>
      </div>

      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 11, fontWeight: 600, fill: "#64748b", fontFamily: "inherit" }} tickLine={false} axisLine={false} interval={Math.ceil(data.length / 6)} />
            <Tooltip content={<CustomTooltip currency={currency} />} />
            <Bar dataKey="revenue" fill="#1d8f5e" radius={[3, 3, 0, 0]} maxBarSize={14} />
            <Bar dataKey="expenses" fill="#b8402f" radius={[3, 3, 0, 0]} maxBarSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}