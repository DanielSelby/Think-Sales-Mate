"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function KpiSummaryCard({
  icon,
  iconClass,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  iconClass: string;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="kpi-summary-card rounded-2xl border border-white bg-white p-4 shadow-card dark:border-white/10 dark:bg-ink-900">
      <div className="flex items-center gap-3.5">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", iconClass)}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-ledger-400">{label}</p>
          <span className="mt-0.5 block truncate font-display text-xl font-bold text-ink-900 dark:text-white">{value}</span>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-ledger-400">{detail}</p>
    </div>
  );
}
