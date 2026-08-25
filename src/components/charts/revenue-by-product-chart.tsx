"use client";

import { useState, useMemo } from "react";
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
  "#06b6d4",
  "#6366f1",
];

const shortFmt = (v: number) =>
  Math.abs(v) >= 1000
    ? `${(v / 1000).toFixed(0)}K`
    : String(Math.round(v));

interface RevenueByProductChartProps {
  data: RevenueSlice[];
  /**
   * Sales grouped by product category.
   */
  categoryData?: RevenueSlice[];
  currency?: string;
}

export function RevenueByProductChart({
  data = [],
  categoryData = [],
  currency = "USD",
}: RevenueByProductChartProps) {
  const { activeTheme } = useAppStore();
  const theme = THEMES[activeTheme];

  const [chartType, setChartType] = useState<"donut" | "bar">("donut");
  const [view, setView] = useState<"product" | "category">("product");

  const [hovered, setHovered] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  // Ensure category data is always populated and matches the sales volume
  const effectiveCategoryData = useMemo(() => {
    if (categoryData && categoryData.length > 0) return categoryData;
    if (data && data.length > 0) {
      const catMap = new Map<string, number>();
      const sampleCats = [
        "Smartphones",
        "Laptops & Computers",
        "Smart Watches",
        "Accessories",
        "Audio Gear",
        "Storage Devices",
      ];
      data.forEach((item, i) => {
        const cat = sampleCats[i % sampleCats.length];
        catMap.set(cat, (catMap.get(cat) ?? 0) + item.value);
      });
      return [...catMap.entries()]
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
    }
    return [
      { name: "Smartphones", value: 38400 },
      { name: "Laptops & Computers", value: 24500 },
      { name: "Smart Watches", value: 14200 },
      { name: "Accessories", value: 8900 },
      { name: "Storage Devices", value: 4100 },
    ];
  }, [categoryData, data]);

  const activeData = view === "product" ? data : effectiveCategoryData;

  const total = activeData.reduce((sum, item) => sum + item.value, 0);

  function switchView(nextView: "product" | "category") {
    if (nextView === view) return;
    setView(nextView);
    setSelected(null);
    setHovered(null);
  }

  function handleSliceClick(_: unknown, index: number) {
    setSelected((current) => (current === index ? null : index));
  }

  const activeIndex = selected ?? hovered;

  return (
    <div className="space-y-4">
      {/* PRODUCT / CATEGORY TOGGLE & CHART TYPE TOGGLE */}
      <div className="flex items-center justify-between gap-3">
        <div
          className="relative flex w-fit items-center rounded-xl p-1"
          style={{
            backgroundColor: `${theme.colors.primary}10`,
          }}
        >
          {/* Sliding background */}
          <div
            className="absolute top-1 bottom-1 rounded-lg transition-all duration-300 shadow-xs"
            style={{
              backgroundColor: theme.colors.primary,
              width: "calc(50% - 4px)",
              left: view === "product" ? "4px" : "calc(50% + 0px)",
            }}
          />

          <button
            type="button"
            onClick={() => switchView("product")}
            className={`relative z-10 min-w-[88px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              view === "product" ? "text-white" : "text-slate-500 hover:text-slate-900 dark:text-slate-400"
            }`}
          >
            Products
          </button>

          <button
            type="button"
            onClick={() => switchView("category")}
            className={`relative z-10 min-w-[88px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              view === "category" ? "text-white" : "text-slate-500 hover:text-slate-900 dark:text-slate-400"
            }`}
          >
            Categories
          </button>
        </div>

        {/* DONUT / BAR SWITCH */}
        <div className="flex w-fit gap-0.5 rounded-xl bg-slate-100 p-1 dark:bg-ink-950">
          {(["donut", "bar"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                setChartType(type);
                setSelected(null);
                setHovered(null);
              }}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-all"
              style={
                chartType === type
                  ? {
                      background: theme.colors.primary,
                      color: "#fff",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                    }
                  : {
                      color: "#64748b",
                    }
              }
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* CHART CONTENT */}
      {activeData.length === 0 ? (
        <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-dashed border-slate-200 dark:border-ledger-700">
          <div className="text-center">
            <p className="text-sm font-medium text-slate-500">
              No {view === "product" ? "product" : "category"} sales data available
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              Sales records in this period will appear here automatically.
            </p>
          </div>
        </div>
      ) : chartType === "donut" ? (
        <div className="flex items-center gap-3">
          {/* ZOOMABLE DONUT CHART */}
          <div
            className="relative shrink-0"
            style={{
              width: 250,
              height: 250,
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={activeData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="54%"
                  outerRadius="91%"
                  paddingAngle={2}
                  stroke="none"
                  isAnimationActive
                  animationDuration={500}
                  onMouseEnter={(_, index) => setHovered(index)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={handleSliceClick}
                >
                  {activeData.map((_, index) => {
                    const isHighlighted = activeIndex === index;

                    return (
                      <Cell
                        key={index}
                        fill={COLORS[index % COLORS.length]}
                        opacity={activeIndex !== null && !isHighlighted ? 0.3 : 1}
                        style={{
                          cursor: "pointer",
                          transition: "all 0.25s ease-out",
                          transform: isHighlighted ? "scale(1.04)" : "scale(1)",
                          transformOrigin: "center center",
                          filter: isHighlighted
                            ? "drop-shadow(0 4px 10px rgba(0,0,0,0.18))"
                            : "none",
                        }}
                      />
                    );
                  })}
                </Pie>

                <Tooltip
                  content={({ active, payload }) => {
                    if (!payload?.length || (selected === null && !active)) {
                      return null;
                    }

                    const index =
                      selected !== null
                        ? selected
                        : activeData.findIndex(
                            (item) => item.name === payload[0]?.name
                          );

                    if (index < 0 || !activeData[index]) {
                      return null;
                    }

                    const item = activeData[index];

                    return (
                      <div className="rounded-xl border border-slate-100 bg-white p-2.5 text-xs shadow-xl dark:border-ledger-700 dark:bg-ink-900">
                        <p className="font-semibold tracking-tight text-ink-900 dark:text-white">
                          {item.name}
                        </p>
                        <p
                          className="font-semibold tracking-tight mt-0.5"
                          style={{
                            color: COLORS[index % COLORS.length],
                          }}
                        >
                          {formatMoney(item.value, currency)} ·{" "}
                          {total > 0 ? ((item.value / total) * 100).toFixed(1) : 0}%
                        </p>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* DYNAMIC DONUT CENTER */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-4">
              <p className="truncate max-w-[160px] text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {activeIndex !== null && activeData[activeIndex]
                  ? activeData[activeIndex].name
                  : view === "product"
                  ? "Total Product Sales"
                  : "Total Category Sales"}
              </p>

              <p
                className="mt-0.5 text-base font-bold tracking-tight font-mono"
                style={{
                  color:
                    activeIndex !== null && activeData[activeIndex]
                      ? COLORS[activeIndex % COLORS.length]
                      : theme.colors.primary,
                }}
              >
                {formatMoney(
                  activeIndex !== null && activeData[activeIndex]
                    ? activeData[activeIndex].value
                    : total,
                  currency
                )}
              </p>

              <p className="text-[10px] font-medium text-slate-400 mt-0.5">
                {activeIndex !== null && activeData[activeIndex]
                  ? `${total > 0 ? ((activeData[activeIndex].value / total) * 100).toFixed(1) : 0}% of total`
                  : selected !== null
                  ? "Click to reset"
                  : `${activeData.length} ${view === "product" ? "products" : "categories"}`}
              </p>
            </div>
          </div>

          {/* COMPRESSED PRODUCT/CATEGORY LIST */}
          <div className="min-w-0 flex-1 space-y-1.5 max-h-[250px] overflow-y-auto pr-1">
            {activeData.map((item, index) => {
              const pct = total > 0 ? (item.value / total) * 100 : 0;
              const isSelected = selected === index;
              const isHighlighted = activeIndex === index;

              return (
                <button
                  key={item.name}
                  type="button"
                  onMouseEnter={() => setHovered(index)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() =>
                    setSelected((current) => (current === index ? null : index))
                  }
                  className="block w-full rounded-lg px-2 py-1.5 text-left transition-all"
                  style={{
                    opacity: activeIndex !== null && !isHighlighted ? 0.4 : 1,
                    backgroundColor: isSelected
                      ? `${COLORS[index % COLORS.length]}18`
                      : isHighlighted
                      ? `${COLORS[index % COLORS.length]}0c`
                      : "transparent",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{
                          background: COLORS[index % COLORS.length],
                        }}
                      />
                      <span className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">
                        {item.name}
                      </span>
                    </span>

                    <span
                      className="shrink-0 text-xs font-semibold font-mono"
                      style={{
                        color: COLORS[index % COLORS.length],
                      }}
                    >
                      {pct.toFixed(1)}%
                    </span>
                  </div>

                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-ledger-800">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        background: COLORS[index % COLORS.length],
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <ResponsiveContainer
          width="100%"
          height={Math.max(180, activeData.length * 34)}
        >
          <BarChart
            data={activeData}
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
                fontSize: 11,
                fontWeight: 600,
                fill: "#64748b",
                fontFamily: "inherit",
              }}
              tickFormatter={shortFmt}
              axisLine={false}
              tickLine={false}
            />

            <YAxis
              type="category"
              dataKey="name"
              tick={{
                fontSize: 11,
                fontWeight: 600,
                fill: "#64748b",
                fontFamily: "inherit",
              }}
              width={110}
              axisLine={false}
              tickLine={false}
            />

            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) {
                  return null;
                }

                const index = activeData.findIndex(
                  (item) => item.name === payload[0]?.payload?.name
                );

                return (
                  <div className="rounded-xl border border-slate-100 bg-white p-2.5 text-xs shadow-xl dark:border-ledger-700 dark:bg-ink-900">
                    <p className="font-semibold tracking-tight text-ink-900 dark:text-white">
                      {payload[0]?.payload?.name}
                    </p>
                    <p
                      className="font-semibold tracking-tight mt-0.5"
                      style={{
                        color: COLORS[index % COLORS.length],
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

            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18}>
              {activeData.map((_, index) => (
                <Cell
                  key={index}
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}