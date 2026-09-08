"use client";

import { Printer } from "lucide-react";

export function PrintTransferButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-lg border border-ledger-200 bg-white px-3 py-2 text-sm font-semibold text-ledger-700 shadow-sm hover:bg-ledger-50 print:hidden dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-200 dark:hover:bg-white/[0.05]"
    >
      <Printer className="h-4 w-4" />
      Print transfer slip
    </button>
  );
}
