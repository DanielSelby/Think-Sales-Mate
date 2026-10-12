"use client";

import { AlertTriangle, X } from "lucide-react";

export interface StockLimitWarning {
  lineKey: string;
  name: string;
  quantity: number;
  availableStock: number;
}

export function StockLimitFeedback({
  warning,
  onClose,
}: {
  warning: StockLimitWarning;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[115] grid place-items-center bg-ink-950/65 p-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="stock-limit-title"
      aria-describedby="stock-limit-description"
    >
      <section className="stock-limit-warning animate-[stock-limit-pop_420ms_cubic-bezier(0.16,1,0.3,1)_both] relative w-full max-w-md rounded-3xl border border-red-200 bg-white p-7 text-center shadow-[0_32px_100px_rgba(127,29,29,0.42)] dark:border-red-800 dark:bg-ink-900">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close stock warning"
          className="absolute right-3 top-3 rounded-full p-2 text-ledger-500 transition hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-[1.75rem] bg-red-50 text-red-600 shadow-[inset_0_2px_8px_rgba(127,29,29,0.12),0_12px_24px_rgba(127,29,29,0.2)] dark:bg-red-950/60 dark:text-red-300">
          <AlertTriangle className="h-10 w-10" strokeWidth={1.8} />
        </div>
        <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.2em] text-red-600 dark:text-red-300">Stock limit exceeded</p>
        <h2 id="stock-limit-title" className="mt-2 text-2xl font-bold text-ink-900 dark:text-white">Check product quantity</h2>
        <p id="stock-limit-description" className="mt-2 text-sm font-semibold text-ledger-600 dark:text-ledger-200">{warning.name}</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-red-100 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-300">Entered</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-red-700 dark:text-red-200">{warning.quantity}</p>
          </div>
          <div className="rounded-xl border border-ledger-100 bg-ledger-50 p-3 dark:border-ledger-700 dark:bg-white/[0.04]">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ledger-500 dark:text-ledger-400">Available at branch</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-ink-900 dark:text-white">{warning.availableStock}</p>
          </div>
        </div>
        <p className="mt-4 text-xs leading-5 text-ledger-500 dark:text-ledger-300">
          Reduce the quantity to match the current stock before completing this sale.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 h-10 w-full rounded-xl px-4 text-sm font-semibold text-white shadow-sm transition hover:brightness-105"
          style={{ backgroundColor: "var(--theme-primary)" }}
        >
          Review quantity
        </button>
      </section>
    </div>
  );
}

export function StockLimitNotice({ warning }: { warning: StockLimitWarning }) {
  return (
    <p className="mt-1 text-xs font-semibold text-red-700 dark:text-red-300" role="alert">
      {warning.availableStock} unit(s) available at this branch; {warning.quantity} entered.
    </p>
  );
}
