"use client";

import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Trend } from "@/lib/accounting/metrics";

const STYLES = {
  blue: { iconBg: "bg-blue-500", ring: "ring-blue-100" },
  green: { iconBg: "bg-signal", ring: "ring-signal/20" },
  purple: { iconBg: "bg-accentPurple", ring: "ring-accentPurple/20" },
  amber: { iconBg: "bg-amber", ring: "ring-amber/20" },
  red: { iconBg: "bg-alert", ring: "ring-alert/20" },
  teal: { iconBg: "bg-accentTeal", ring: "ring-accentTeal/20" }
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
}

export function KpiFlipCard({ color, label, value, icon, trend, trendSuffix, detail }: KpiFlipCardProps) {
  const style = STYLES[color] ?? STYLES.blue;

  return (
    <div className="flip-scene h-[132px]">
      <div className="flip-card h-full">
        <div className="flip-face absolute inset-0 flex flex-col rounded-2xl border border-ledger-100 bg-white p-4 shadow-card transition-shadow hover:shadow-card-hover dark:border-ledger-700 dark:bg-ink-900">
          <div className="flex items-start justify-between">
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl text-white", style.iconBg)}>
              <div className="h-4 w-4">{icon}</div>
            </div>
          </div>
          <p className="mt-2 text-xs font-medium text-ledger-500 dark:text-ledger-400">{label}</p>
          <p className="figure mt-0.5 text-xl font-semibold text-ink-900 dark:text-white">{value}</p>
          {trend && (
            <div className="mt-auto flex items-center gap-1 text-xs">
              {trend.direction === "up" && <ArrowUpRight className="h-3.5 w-3.5 text-signal" />}
              {trend.direction === "down" && <ArrowDownRight className="h-3.5 w-3.5 text-alert" />}
              {trend.direction === "flat" && <Minus className="h-3.5 w-3.5 text-ledger-300" />}
              <span
                className={cn(
                  "font-semibold",
                  trend.direction === "up" && "text-signal",
                  trend.direction === "down" && "text-alert",
                  trend.direction === "flat" && "text-ledger-400"
                )}
              >
                {trend.pct === null ? "New" : `${Math.abs(trend.pct).toFixed(1)}%`}
              </span>
              {trendSuffix && <span className="truncate text-ledger-400">{trendSuffix}</span>}
            </div>
          )}
        </div>

        <div className="flip-face flip-face-back flex flex-col rounded-2xl border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-ledger-400">{label}</p>
          <p className="mt-2 flex-1 text-xs leading-relaxed text-ledger-600 dark:text-ledger-300">{detail}</p>
        </div>
      </div>
    </div>
  );
}