"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Calendar } from "lucide-react";

type Preset = "today" | "yesterday" | "this-week" | "last-week" | "this-month" | "last-month" | "this-quarter" | "last-quarter" | "this-year" | "last-year";

const PRESETS: { value: Preset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this-week", label: "This Week" },
  { value: "last-week", label: "Last Week" },
  { value: "this-month", label: "This Month" },
  { value: "last-month", label: "Last Month" },
  { value: "this-quarter", label: "This Quarter" },
  { value: "last-quarter", label: "Last Quarter" },
  { value: "this-year", label: "This Year" },
  { value: "last-year", label: "Last Year" },
];

function isoDate(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPresetRange(preset: Preset, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(today);
  const end = new Date(today);

  switch (preset) {
    case "today":
      break;
    case "yesterday":
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
      break;
    case "this-week":
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      break;
    case "last-week":
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 7);
      end.setTime(start.getTime());
      end.setDate(end.getDate() + 6);
      break;
    case "this-month":
      start.setDate(1);
      break;
    case "last-month":
      start.setDate(1);
      start.setMonth(start.getMonth() - 1);
      end.setDate(0);
      break;
    case "this-quarter":
      start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1);
      break;
    case "last-quarter":
      start.setMonth(Math.floor(start.getMonth() / 3) * 3 - 3, 1);
      end.setTime(start.getTime());
      end.setMonth(end.getMonth() + 3, 0);
      break;
    case "this-year":
      start.setMonth(0, 1);
      break;
    case "last-year":
      start.setFullYear(start.getFullYear() - 1, 0, 1);
      end.setFullYear(end.getFullYear() - 1, 11, 31);
      break;
  }

  return { from: isoDate(start), to: isoDate(end) };
}

export function DateRangeFilter({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  function applyRange(nextFrom: string, nextTo: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("from", nextFrom);
    params.set("to", nextTo);
    router.push(`${pathname}?${params.toString()}`);
  }

  const selectedPreset = PRESETS.find((preset) => {
    const range = getPresetRange(preset.value);
    return range.from === from && range.to === to;
  })?.value ?? "custom";

  function handlePresetChange(value: string) {
    if (value === "custom") return;
    const range = getPresetRange(value as Preset);
    applyRange(range.from, range.to);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Date range preset"
        value={selectedPreset}
        onChange={(event) => handlePresetChange(event.target.value)}
        className="h-9 rounded-xl border border-ledger-100 bg-white px-3 text-xs font-semibold text-ink-900 outline-none focus:border-ledger-300 dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
      >
        {PRESETS.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
        <option value="custom">Custom range</option>
      </select>
      <div className="flex items-center gap-1 rounded-xl border border-ledger-100 bg-white px-2 py-1 dark:border-ledger-700 dark:bg-ink-900">
        <Calendar className="h-3.5 w-3.5 shrink-0 text-ledger-400" />
        <input
          type="date"
          aria-label="Start date"
          value={from}
          max={to || undefined}
          onChange={(e) => { if (e.target.value && to) applyRange(e.target.value, to); }}
          className="bg-transparent px-1 py-1 text-xs font-medium text-ink-900 outline-none dark:text-white [color-scheme:light] dark:[color-scheme:dark]"
        />
        <span className="text-xs text-ledger-300">–</span>
        <input
          type="date"
          aria-label="End date"
          value={to}
          min={from || undefined}
          max={isoDate(new Date())}
          onChange={(e) => { if (from && e.target.value) applyRange(from, e.target.value); }}
          className="bg-transparent px-1 py-1 text-xs font-medium text-ink-900 outline-none dark:text-white [color-scheme:light] dark:[color-scheme:dark]"
        />
      </div>
    </div>
  );
}