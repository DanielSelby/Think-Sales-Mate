"use client";

import { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

const QUICK_RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 }
];

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function DateRangeFilter({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);

  function applyRange(nextFrom: string, nextTo: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("from", nextFrom);
    params.set("to", nextTo);
    router.push(`${pathname}?${params.toString()}`);
  }

  function setQuickRange(days: number) {
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - (days - 1));
    const nextFrom = isoDate(start);
    const nextTo = isoDate(today);
    setDraftFrom(nextFrom);
    setDraftTo(nextTo);
    applyRange(nextFrom, nextTo);
  }

  function handleFromChange(value: string) {
    setDraftFrom(value);
    if (value && draftTo) applyRange(value, draftTo);
  }

  function handleToChange(value: string) {
    setDraftTo(value);
    if (draftFrom && value) applyRange(draftFrom, value);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-xl border border-ledger-100 bg-white px-2 py-1 dark:border-ledger-700 dark:bg-ink-900">
        <Calendar className="h-3.5 w-3.5 shrink-0 text-ledger-400" />
        <input
          type="date"
          aria-label="Start date"
          value={draftFrom}
          max={draftTo || undefined}
          onChange={(e) => handleFromChange(e.target.value)}
          className="bg-transparent px-1 py-1 text-xs font-medium text-ink-900 outline-none dark:text-white [color-scheme:light] dark:[color-scheme:dark]"
        />
        <span className="text-xs text-ledger-300">–</span>
        <input
          type="date"
          aria-label="End date"
          value={draftTo}
          min={draftFrom || undefined}
          max={isoDate(new Date())}
          onChange={(e) => handleToChange(e.target.value)}
          className="bg-transparent px-1 py-1 text-xs font-medium text-ink-900 outline-none dark:text-white [color-scheme:light] dark:[color-scheme:dark]"
        />
      </div>

      <div className="flex items-center gap-0.5 rounded-xl bg-ledger-100 p-0.5 dark:bg-ink-950">
        {QUICK_RANGES.map((preset) => (
          <button
            key={preset.days}
            onClick={() => setQuickRange(preset.days)}
            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all text-ledger-500 hover:text-ink-900 dark:text-ledger-400 dark:hover:text-white"
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}