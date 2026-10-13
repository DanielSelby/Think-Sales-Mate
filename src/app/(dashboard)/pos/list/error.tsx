"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PosSalesListError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-2xl py-16">
      <div className="rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-card dark:border-rose-900 dark:bg-ink-900">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <h1 className="mt-4 font-display text-xl font-semibold text-ink-900 dark:text-white">POS sales could not be loaded</h1>
        <p className="mt-2 text-sm text-ledger-500 dark:text-ledger-400">The transaction list is temporarily unavailable. Try again in a moment.</p>
        <Button type="button" onClick={reset} className="mt-5 gap-2">
          <RefreshCw className="h-4 w-4" /> Try again
        </Button>
      </div>
    </main>
  );
}
