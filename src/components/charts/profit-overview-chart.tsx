"use client";

import { useMemo } from "react";
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import { formatMoney } from "@/lib/currency";
import type { DailyPoint } from "@/lib/accounting/metrics";

function CustomTooltip({ active, payload, label, currency }: any) {
  if (!active || !payload?.length) return null;
  const value = Number(payload[0]?.value ?? 0);
  return (
    <div className="rounded-lg border border-ledger-100 bg-white px-3 py-2 text-xs shadow-card-hover dark:border-ledger-700 dark:bg-ink-900">
      <p className="mb-1 font-semibold text-ink-900 dark:text-white">{label}</p>
      <p className={value >= 0 ? "text-signal" : "text-alert"}>Cumulative: {formatMoney(value, currency)}</p>
    </div>
  );
}

export function ProfitOverviewChart({ data, currency }: { data: DailyPoint[]; currency: string }) {
  const cumulative = useMemo(() => {
    let running = 0;
    return data.map((d) => {
      running += d.revenue - d.expenses;
      return { label: d.label, cumulative: running };
    });
  }, [data]);

  const finalValue = cumulative[cumulative.length - 1]?.cumulative ?? 0;
  const positive = finalValue >= 0;

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={cumulative} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={positive ? "#1d8f5e" : "#b8402f"} stopOpacity={0.3} />
              <stop offset="100%" stopColor={positive ? "#1d8f5e" : "#b8402f"} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" tick={{ fontSize: 11, fontWeight: 600, fill: "#64748b", fontFamily: "var(--font-mono)" }} tickLine={false} axisLine={false} interval={Math.ceil(cumulative.length / 6)} />
          <Tooltip content={<CustomTooltip currency={currency} />} />
          <Area
            type="monotone"
            dataKey="cumulative"
            stroke={positive ? "#1d8f5e" : "#b8402f"}
            strokeWidth={2}
            fill="url(#profitFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}