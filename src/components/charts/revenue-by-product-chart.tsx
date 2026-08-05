"use client";

import { useState } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import type { RevenueSlice } from "@/lib/accounting/metrics";
import { formatMoney } from "@/lib/currency";
import { useAppStore, THEMES } from "@/store/useAppStore";

const COLORS = ["#22c55e","#3b82f6","#a855f7","#f59e0b","#14b8a6","#ef4444","#ec4899","#84cc16"];
const shortFmt = (v: number) => Math.abs(v) >= 1000 ? `${(v/1000).toFixed(0)}K` : String(Math.round(v));

export function RevenueByProductChart({ data, currency = "USD" }: { data: RevenueSlice[]; currency?: string }) {
  const { activeTheme } = useAppStore();
  const theme = THEMES[activeTheme];
  const [chartType, setChartType] = useState<"donut" | "bar">("donut");
  const [hovered, setHovered] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-3">
      <div className="flex p-0.5 bg-slate-100 rounded-xl w-fit gap-0.5">
        {(["donut","bar"] as const).map(t => (
          <button key={t} onClick={() => setChartType(t)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize"
            style={chartType === t
              ? { background: theme.colors.primary, color: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }
              : { color: "#64748b" }}>
            {t}
          </button>
        ))}
      </div>

      {chartType === "donut" ? (
        <div className="flex items-center gap-5">
          <div className="relative shrink-0" style={{ width: 130, height: 130 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" cx="50%" cy="50%"
                  innerRadius="55%" outerRadius="88%" paddingAngle={2} stroke="none"
                  isAnimationActive animationDuration={700}
                  onMouseEnter={(_, i) => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}>
                  {data.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]}
                      opacity={hovered !== null && hovered !== i ? 0.3 : 1}
                      style={{ cursor: "pointer", filter: hovered === i ? "brightness(1.1)" : "none", transition: "opacity 0.2s" }} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0];
                    return (
                      <div className="bg-white border border-slate-100 rounded-xl shadow-xl p-2.5 text-xs">
                        <p className="font-semibold text-slate-700">{d.name}</p>
                        <p style={{ color: COLORS[data.findIndex(x => x.name === d.name) % COLORS.length] }}>
                          {formatMoney(Number(d.value), currency)} · {total > 0 ? ((Number(d.value)/total)*100).toFixed(1) : 0}%
                        </p>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="text-[9px] text-slate-400 font-medium uppercase tracking-wide">
                {hovered !== null ? "Selected" : "Total"}
              </p>
              <p className="text-sm font-bold" style={{ color: theme.colors.primary }}>
                {formatMoney(hovered !== null ? (data[hovered]?.value ?? 0) : total, currency)}
              </p>
            </div>
          </div>
          <div className="flex-1 space-y-2 min-w-0">
            {data.map((d, i) => {
              const pct = total > 0 ? (d.value / total) * 100 : 0;
              return (
                <div key={d.name}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  className="cursor-default"
                  style={{ opacity: hovered !== null && hovered !== i ? 0.4 : 1, transition: "opacity 0.2s" }}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-slate-600 truncate">{d.name}</span>
                    </span>
                    <span className="font-semibold tabular-nums shrink-0 ml-2" style={{ color: COLORS[i % COLORS.length] }}>
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(160, data.length * 30)}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 40, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={shortFmt} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} width={90} axisLine={false} tickLine={false} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const i = data.findIndex(d => d.name === payload[0]?.payload?.name);
                return (
                  <div className="bg-white border border-slate-100 rounded-xl shadow-xl p-2.5 text-xs">
                    <p className="font-semibold">{payload[0]?.payload?.name}</p>
                    <p style={{ color: COLORS[i % COLORS.length] }}>{formatMoney(Number(payload[0]?.value ?? 0), currency)}</p>
                  </div>
                );
              }}
            />
            <Bar dataKey="value" radius={[0,4,4,0]} maxBarSize={18}>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
