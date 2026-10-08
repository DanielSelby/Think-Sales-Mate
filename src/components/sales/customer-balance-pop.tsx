"use client";

import { useEffect } from "react";
import { AlertCircle, X } from "lucide-react";
import { formatCurrency } from "@/lib/sales/format";

interface CustomerBalancePopProps {
  customerName: string;
  balance: number;
  currency: string;
  onClose: () => void;
}

export function CustomerBalancePop({ customerName, balance, currency, onClose }: CustomerBalancePopProps) {
  useEffect(() => {
    const timeout = window.setTimeout(onClose, 7000);
    return () => window.clearTimeout(timeout);
  }, [balance, customerName, onClose]);

  if (balance <= 0) return null;

  return (
    <div className="customer-balance-pop fixed right-5 top-5 z-[100] flex w-[min(24rem,calc(100vw-2.5rem))] items-start gap-3 rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-4 text-amber-950 shadow-[0_18px_50px_rgba(15,23,42,0.28)] dark:border-amber-700 dark:from-amber-950 dark:via-ink-900 dark:to-orange-950 dark:text-amber-50" role="alert" aria-live="assertive">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-200/80 text-amber-800 shadow-inner dark:bg-amber-400/15 dark:text-amber-300">
        <AlertCircle className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">Outstanding balance</p>
        <p className="mt-1 truncate text-sm font-semibold">{customerName}</p>
        <p className="mt-0.5 text-xl font-bold tabular-nums">{formatCurrency(balance, currency)}</p>
      </div>
      <button type="button" onClick={onClose} aria-label="Dismiss outstanding balance" className="rounded-md p-1 text-amber-700 transition hover:bg-amber-200/70 dark:text-amber-300 dark:hover:bg-amber-400/10">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
