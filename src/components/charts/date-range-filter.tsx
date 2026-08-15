"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const PRESETS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 }
];

export function DateRangeFilter({ currentDays }: { currentDays: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setDays(days: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("days", String(days));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-0.5 rounded-xl bg-ledger-100 p-0.5 dark:bg-ink-950">
      {PRESETS.map((preset) => (
        <button
          key={preset.days}
          onClick={() => setDays(preset.days)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
            currentDays === preset.days
              ? "bg-white text-ink-900 shadow-card dark:bg-ink-900 dark:text-white"
              : "text-ledger-500 hover:text-ink-900 dark:text-ledger-400 dark:hover:text-white"
          )}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}