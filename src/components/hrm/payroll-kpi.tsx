import type { ReactNode } from "react";

const toneStyles = {
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300",
  green: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300",
  teal: "bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-300",
  orange: "bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300",
  purple: "bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-300",
} as const;

export function PayrollKpi({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: keyof typeof toneStyles;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-[#dce8f2] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-ledger-700 dark:bg-ink-900">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${toneStyles[tone]}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-slate-500 dark:text-ledger-400">{label}</p>
        <p className="mt-1 truncate text-lg font-bold text-[#12345a] dark:text-white">{value}</p>
      </div>
    </div>
  );
}
