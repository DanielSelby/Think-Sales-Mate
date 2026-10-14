"use client";

import {
  ArrowDownRight, ArrowUpRight, CalendarDays, CircleDollarSign,
  ClipboardList, XCircle,
} from "lucide-react";

const KPI_ICONS = {
  transactions: ClipboardList,
  today: CalendarDays,
  sales: CircleDollarSign,
  completed: ArrowUpRight,
  pending: ArrowDownRight,
  returned: XCircle,
};

export function PosSalesKpi({
  label, value, detail, icon: Icon, tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: keyof typeof KPI_ICONS;
  tone: string;
}) {
  const IconComponent = KPI_ICONS[Icon];

  return (
    <div className="h-full rounded-2xl border border-ledger-100 bg-white p-3 shadow-card dark:border-ledger-700 dark:bg-ink-900 sm:p-4">
      <div className="flex h-full items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium leading-tight text-ledger-500 dark:text-ledger-300 sm:text-xs">{label}</p>
          <p className="mt-2 truncate font-display text-lg font-bold text-ink-900 dark:text-white sm:text-xl">{value}</p>
          <p className="mt-1 text-[10px] leading-snug text-ledger-400 dark:text-ledger-400">{detail}</p>
        </div>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 ${tone}`}>
          <IconComponent className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}
