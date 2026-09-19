"use client";

import { ArrowUpRight, ArrowDownRight, Minus, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { Trend } from "@/lib/accounting/metrics";
import { useAppStore, THEMES } from "@/store/useAppStore";

const STYLES = {
  blue: {
    badge: "bg-blue-50 text-blue-600",
    top: "bg-blue-500",
    featured: "bg-blue-600",
  },
  green: {
    badge: "bg-signal-soft text-signal",
    top: "bg-signal",
    featured: "bg-signal",
  },
  purple: {
    badge: "bg-accentPurple-soft text-accentPurple",
    top: "bg-accentPurple",
    featured: "bg-accentPurple",
  },
  amber: {
    badge: "bg-amber-soft text-amber",
    top: "bg-amber",
    featured: "bg-amber",
  },
  red: {
    badge: "bg-alert-soft text-alert",
    top: "bg-alert",
    featured: "bg-alert",
  },
  teal: {
    badge: "bg-accentTeal-soft text-accentTeal",
    top: "bg-accentTeal",
    featured: "bg-accentTeal",
  },
} as const;

export type KpiFlipColor = keyof typeof STYLES;

interface KpiFlipCardProps {
  color: KpiFlipColor;
  label: string;
  value: string;
  icon: React.ReactNode;
  trend?: Trend;
  trendSuffix?: string;
  detail: string;
  featured?: boolean;
  animationIndex?: number;
}

export function KpiFlipCard({
  color,
  label,
  value,
  icon,
  trend,
  trendSuffix,
  detail,
  featured = false,
  animationIndex = 0,
}: KpiFlipCardProps) {
  const { activeTheme } = useAppStore();
  const theme = THEMES[activeTheme];

  const style = STYLES[color] ?? STYLES.blue;

  return (
    <div className="flip-scene dashboard-kpi h-[132px]" style={{ "--motion-index": animationIndex } as React.CSSProperties}>
      <div className="flip-card h-full">
        {/* FRONT */}
        <div
          className={cn(
            "flip-face absolute inset-0 flex flex-col overflow-hidden rounded-2xl p-4 shadow-card transition-shadow hover:shadow-card-hover",
            !featured &&
              "border border-ledger-100 bg-white dark:border-ledger-700 dark:bg-ink-900"
          )}
          style={
            featured
              ? {
                  backgroundColor: theme.colors.primary,
                  color: "#fff",
                }
              : undefined
          }
        >
          {!featured && (
            <div
              className={cn(
                "absolute inset-x-0 top-0 h-1",
                style.top
              )}
            />
          )}

          <div className="flex items-start justify-between">
            <p
              className={cn(
                "text-[11px] font-semibold uppercase tracking-wide",
                featured
                  ? "text-white/85"
                  : "text-ledger-500 dark:text-ledger-400"
              )}
            >
              {label}
            </p>

            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                featured
                  ? "bg-white/15 text-white"
                  : style.badge
              )}
            >
              <div className="h-4 w-4">{icon}</div>
            </div>
          </div>

          {/* Keep the existing text size, but use the dashboard font
              instead of the special figure font. */}
          <p
            className={cn(
              "mt-2 text-xl font-semibold leading-none tracking-tight tabular-nums",
              featured
                ? "text-white"
                : "text-ink-900 dark:text-white"
            )}
          >
            <AnimatedKpiValue value={value} />
          </p>

          {trend && (
            <div className="mt-auto flex items-center gap-1.5 text-xs">
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold",
                  featured
                    ? "bg-white/20 text-white"
                    : trend.direction === "up"
                      ? "bg-signal-soft text-signal"
                      : trend.direction === "down"
                        ? "bg-alert-soft text-alert"
                        : "bg-ledger-100 text-ledger-400 dark:bg-ledger-800"
                )}
              >
                {trend.direction === "up" && (
                  <ArrowUpRight className="h-3 w-3" />
                )}

                {trend.direction === "down" && (
                  <ArrowDownRight className="h-3 w-3" />
                )}

                {trend.direction === "flat" && (
                  <Minus className="h-3 w-3" />
                )}

                {trend.pct === null
                  ? "New"
                  : `${Math.abs(trend.pct).toFixed(1)}%`}
              </span>

              {trendSuffix && (
                <span
                  className={cn(
                    "truncate",
                    featured
                      ? "text-white/70"
                      : "text-ledger-400"
                  )}
                >
                  {trendSuffix}
                </span>
              )}
            </div>
          )}

          <div
            className={cn(
              "mt-1.5 flex items-center gap-1 text-[10px]",
              featured
                ? "text-white/60"
                : "text-ledger-300 dark:text-ledger-600"
            )}
          >
            <RotateCw className="h-2.5 w-2.5" />
            Hover to flip
          </div>
        </div>

        {/* BACK */}
        <div className="flip-face flip-face-back flex flex-col rounded-2xl border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-ledger-400">
            {label}
          </p>

          <p className="mt-2 flex-1 text-xs leading-relaxed text-ledger-600 dark:text-ledger-300">
            {detail}
          </p>
        </div>
      </div>
    </div>
  );
}

function AnimatedKpiValue({ value }: { value: string }) {
  const numericMatch = value.match(/^(.*?)(-?\d[\d,]*(?:\.\d+)?)(.*)$/);
  const target = numericMatch ? Number(numericMatch[2].replace(/,/g, "")) : null;
  const [current, setCurrent] = useState(target ?? 0);

  useEffect(() => {
    if (target === null) return;
    let frame = 0;
    const started = performance.now();
    const duration = 650;
    const tick = (now: number) => {
      const progress = Math.min((now - started) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(target * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  if (target === null || !numericMatch) return <>{value}</>;
  const decimals = numericMatch[2].includes(".") ? numericMatch[2].split(".")[1].length : 0;
  return <>{numericMatch[1]}{current.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{numericMatch[3]}</>;
}

/**
 * Keeps the currency symbol in the same font as the amount,
 * but introduces a small visual gap.
 *
 * Example:
 * Currency symbol and amount
 * becomes
 * are rendered as one consistent unit.
 */
function formatKpiCurrencySpacing(value: string) {
  const match = value.match(/^([^\d-]+)(.*)$/);

  if (!match) return value;

  const symbol = match[1].trim();
  const amount = match[2].trim();

  return (
    <>
      <span>{symbol}</span>
      <span className="ml-1">{amount}</span>
    </>
  );
}