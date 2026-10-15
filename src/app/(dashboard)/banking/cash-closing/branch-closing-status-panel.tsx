"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export function BranchClosingStatusPanel({
  summary,
  children,
}: {
  summary: string;
  children: ReactNode;
}) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <section className="overflow-hidden rounded-xl border border-[#dce8f2] bg-white shadow-sm dark:border-ledger-700 dark:bg-ink-900">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h2 className="font-bold text-[#17385d] dark:text-white">Branch Closing Status</h2>
          <p className="text-xs text-ledger-500">{summary}</p>
        </div>
        <button
          type="button"
          aria-expanded={isVisible}
          onClick={() => setIsVisible((visible) => !visible)}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-ledger-200 px-3 text-xs font-semibold text-ink-800 hover:bg-ledger-50 dark:border-ledger-700 dark:text-white dark:hover:bg-white/[0.05]"
        >
          {isVisible ? "Hide" : "Show"}
          {isVisible ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>
      {isVisible && (
        <div className="border-t border-[#e5edf5] dark:border-ledger-700">
          {children}
        </div>
      )}
    </section>
  );
}
