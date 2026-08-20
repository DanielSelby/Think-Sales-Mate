"use client";

import { useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import type { RevenueSlice } from "@/lib/accounting/metrics";
import { formatMoney } from "@/lib/currency";
import { useAppStore, THEMES } from "@/store/useAppStore";

const COLORS = [
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#f59e0b",
  "#14b8a6",
  "#ef4444",
  "#ec4899",
  "#84cc16",
];

const shortFmt = (v: number) =>
  Math.abs(v) >= 1000
    ? `${(v / 1000).toFixed(0)}K`
    : String(Math.round(v));

export function RevenueByProductChart({
  data,
  currency = "USD",
}: {
  data: RevenueSlice[];
  currency?: string;
}) {
  const { activeTheme } = useAppStore();
  const theme = THEMES[activeTheme];

  const [chartType, setChartType] = useState<"donut" | "bar">("donut");

  // Hover is only used for temporary visual highlighting.
  const [hovered, setHovered] = useState<number | null>(null);

  // Clicked slice stays selected.
  const [selected, setSelected] = useState<number | null>(null);

  const total = data.reduce((s, d) => s + d.value, 0);

  /*
   * Click a donut section:
   * - First click selects/zooms the section.
   * - Clicking the same section again resets it.
   */
  function handleSliceClick(_: unknown, index: number) {
    setSelected((current) => (current === index ? null : index));
  }

  const activeIndex = selected ?? hovered;

  return (
    <div className="space-y-3">
      {/* Chart type switcher */}
      <div className="flex w-fit gap-0.5 rounded-xl bg-slate-100 p-0.5">
        {(["donut", "bar"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setChartType(t);
              setSelected(null);
              setHovered(null);
            }}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-all"
            style={
              chartType === t
                ? {
                    background: theme.colors.primary,
                    color: "#fff",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                  }
                : {
                    color: "#64748b",
                  }
            }
          >
            {t}
          </button>
        ))}
      </div>

      {chartType === "donut" ? (
        <div className="flex items-center gap-5">
          <div
            className="relative shrink-0"
            style={{ width: 190, height: 190 }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="55%"
                  outerRadius="88%"
                  paddingAngle={2}
                  stroke="none"
                  isAnimationActive
                  animationDuration={700}
                  onMouseEnter={(_, index) => setHovered(index)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={handleSliceClick}
                >
                  {data.map((_, i) => {
                    const isSelected = selected === i;
                    const isHighlighted = activeIndex === i;

                    return (
                      <Cell
                        key={i}
                        fill={COLORS[i % COLORS.length]}
                        opacity={
                          activeIndex !== null && !isHighlighted ? 0.3 : 1
                        }
                        style={{
                          cursor: "pointer",
                          filter: isHighlighted
                            ? "brightness(1.1)"
                            : "none",
                          transition:
                            "opacity 0.2s, filter 0.2s, transform 0.2s",
                          transformOrigin: "center",
                          transform: isSelected
                            ? "scale(1.08)"
                            : "scale(1)",
                        }}
                      />
                    );
                  })}
                </Pie>

                <Tooltip
                  content={({ active, payload }) => {
                    /*
                     * Tooltip is now shown when:
                     * - hovering over a slice, OR
                     * - a slice has been clicked/selected.
                     */
                    if (
                      !payload?.length ||
                      (selected === null && !active)
                    ) {
                      return null;
                    }

                    const index =
                      selected !== null
                        ? selected
                        : data.findIndex(
                            (x) => x.name === payload[0]?.name
                          );

                    if (index < 0 || !data[index]) return null;

                    const item = data[index];

                    return (
                      <div className="rounded-xl border border-slate-100 bg-white p-2.5 text-xs shadow-xl">
                        <p className="font-semibold text-slate-700">
                          {item.name}
                        </p>

                        <p
                          style={{
                            color: COLORS[index % COLORS.length],
                          }}
                        >
                          {formatMoney(item.value, currency)} ·{" "}
                          {total > 0
                            ? ((item.value / total) * 100).toFixed(1)
                            : 0}
                          %
                        </p>

                        {selected === index && (
                          <p className="mt-1 text-[10px] font-medium text-slate-400">
                            Click again to reset
                          </p>
                        )}
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Center of donut */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                {selected !== null
                  ? "Selected"
                  : hovered !== null
                    ? "Selected"
                    : "Total"}
              </p>

              <p
                className="text-base font-bold"
                style={{ color: theme.colors.primary }}
              >
                {formatMoney(
                  selected !== null
                    ? data[selected]?.value ?? 0
                    : hovered !== null
                      ? data[hovered]?.value ?? 0
                      : total,
                  currency
                )}
              </p>

              {selected !== null && (
                <p className="mt-0.5 text-[9px] text-slate-400">
                  Click to reset
                </p>
              )}
            </div>
          </div>

          {/* Product breakdown */}
          <div className="min-w-0 flex-1 space-y-2">
            {data.map((d, i) => {
              const pct = total > 0 ? (d.value / total) * 100 : 0;

              const isSelected = selected === i;
              const isHighlighted = activeIndex === i;

              return (
                <div
                  key={d.name}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() =>
                    setSelected((current) =>
                      current === i ? null : i
                    )
                  }
                  className="cursor-pointer rounded-md px-1.5 py-1 transition-all"
                  style={{
                    opacity:
                      activeIndex !== null && !isHighlighted ? 0.4 : 1,
                    background: isSelected
                      ? "rgba(15, 23, 42, 0.04)"
                      : "transparent",
                  }}
                >
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{
                          background: COLORS[i % COLORS.length],
                        }}
                      />

                      <span className="truncate text-slate-600">
                        {d.name}
                      </span>
                    </span>

                    <span
                      className="ml-2 shrink-0 font-semibold tabular-nums"
                      style={{
                        color: COLORS[i % COLORS.length],
                      }}
                    >
                      {pct.toFixed(1)}%
                    </span>
                  </div>

                  <div className="h-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        background: COLORS[i % COLORS.length],
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <ResponsiveContainer
          width="100%"
          height={Math.max(160, data.length * 30)}
        >
          <BarChart
            data={data}
            layout="vertical"
            margin={{
              top: 0,
              right: 40,
              left: 8,
              bottom: 0,
            }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#f1f5f9"
              horizontal={false}
            />

            <XAxis
              type="number"
              tick={{
                fontSize: 10,
                fill: "#94a3b8",
              }}
              tickFormatter={shortFmt}
              axisLine={false}
              tickLine={false}
            />

            <YAxis
              type="category"
              dataKey="name"
              tick={{
                fontSize: 10,
                fill: "#64748b",
              }}
              width={90}
              axisLine={false}
              tickLine={false}
            />

            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;

                const i = data.findIndex(
                  (d) => d.name === payload[0]?.payload?.name
                );

                return (
                  <div className="rounded-xl border border-slate-100 bg-white p-2.5 text-xs shadow-xl">
                    <p className="font-semibold">
                      {payload[0]?.payload?.name}
                    </p>

                    <p
                      style={{
                        color: COLORS[i % COLORS.length],
                      }}
                    >
                      {formatMoney(
                        Number(payload[0]?.value ?? 0),
                        currency
                      )}
                    </p>
                  </div>
                );
              }}
            />

            <Bar
              dataKey="value"
              radius={[0, 4, 4, 0]}
              maxBarSize={18}
            >
              {data.map((_, i) => (
                <Cell
                  key={i}
                  fill={COLORS[i % COLORS.length]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}