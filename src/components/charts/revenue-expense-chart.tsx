"use client";

import { useState, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, BarChart, Bar, ComposedChart, Line, ReferenceLine,
} from "recharts";
import type { DailyPoint } from "@/lib/accounting/metrics";
import { formatMoney } from "@/lib/currency";
import { useAppStore, THEMES } from "@/store/useAppStore";

const shortFmt = (v: number) =>
  Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M`
  : Math.abs(v) >= 1_000   ? `${(v / 1_000).toFixed(0)}K`
  : String(Math.round(v));

export function RevenueExpenseChart({ data, currency = "USD" }: { data: DailyPoint[]; currency?: string }) {
  const { activeTheme } = useAppStore();
  const theme = THEMES[activeTheme];
  const [chartType, setChartType] = useState<"area" | "bar" | "compare">("area");
  const [series, setSeries] = useState<"both" | "revenue" | "expenses">("both");

  // Compute net for compare mode
  const enriched = useMemo(() => data.map(d => ({ ...d, net: d.revenue - d.expenses })), [data]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-slate-100 rounded-xl shadow-xl p-3 text-xs min-w-[160px]" style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}>
        <p className="font-semibold text-slate-700 mb-2">{label}</p>
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-4 mb-1">
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
              <span className="capitalize">{p.dataKey}</span>
            </span>
            <span className="font-bold tabular-nums" style={{ color: p.color }}>{formatMoney(Number(p.value ?? 0), currency)}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex p-0.5 bg-slate-100 rounded-xl gap-0.5">
          {(["area", "bar", "compare"] as const).map(t => (
            <button key={t} onClick={() => setChartType(t)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize"
              style={chartType === t
                ? { background: theme.colors.primary, color: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }
                : { color: "#64748b" }}>
              {t}
            </button>
          ))}
        </div>
        {chartType !== "compare" && (
          <div className="flex p-0.5 bg-slate-100 rounded-xl gap-0.5">
            {(["both", "revenue", "expenses"] as const).map(s => (
              <button key={s} onClick={() => setSeries(s)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize"
                style={series === s
                  ? { background: theme.colors.primary, color: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }
                  : { color: "#64748b" }}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <ResponsiveContainer width="100%" height={240}>
        {chartType === "area" ? (
          <AreaChart data={enriched} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="expG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} interval={4} />
            <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} width={44} tickFormatter={shortFmt} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            {series !== "expenses" && <Area type="monotone" dataKey="revenue" stroke="#22c55e" strokeWidth={2} fill="url(#revG)" dot={false} />}
            {series !== "revenue" && <Area type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} fill="url(#expG)" dot={false} />}
          </AreaChart>
        ) : chartType === "bar" ? (
          <BarChart data={enriched} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} interval={4} />
            <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} width={44} tickFormatter={shortFmt} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            {series !== "expenses" && <Bar dataKey="revenue" fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={20} />}
            {series !== "revenue" && <Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={20} />}
          </BarChart>
        ) : (
          <ComposedChart data={enriched} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="netG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={theme.colors.primary} stopOpacity={0.25} />
                <stop offset="100%" stopColor={theme.colors.primary} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} interval={4} />
            <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} width={44} tickFormatter={shortFmt} axisLine={false} tickLine={false} />
            <ReferenceLine y={0} stroke="#e2e8f0" strokeWidth={1.5} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="revenue" fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={16} opacity={0.7} />
            <Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={16} opacity={0.7} />
            <Line type="monotone" dataKey="net" stroke={theme.colors.primary} strokeWidth={2.5}
              dot={{ r: 3, fill: theme.colors.primary, stroke: "#fff", strokeWidth: 2 }}
              activeDot={{ r: 5 }} />
          </ComposedChart>
        )}
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[11px] text-slate-400 flex-wrap">
        {series !== "expenses" && chartType !== "compare" && (
          <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded-full bg-green-500 inline-block" />Revenue</span>
        )}
        {series !== "revenue" && chartType !== "compare" && (
          <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded-full bg-red-500 inline-block" />Expenses</span>
        )}
        {chartType === "compare" && <>
          <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-green-500 inline-block opacity-70" />Revenue</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-red-500 inline-block opacity-70" />Expenses</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded-full inline-block" style={{ background: theme.colors.primary }} />Net</span>
        </>}
      </div>
    </div>
  );
}
