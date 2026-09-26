"use client";

import { PackageX, RefreshCw, Search, X } from "lucide-react";

export interface OutOfStockItem {
  name: string;
  category: string | null;
  brand: string | null;
  stockQuantity?: number;
  availableStock?: number;
}

export function OutOfStockFeedback({
  item,
  message,
  onCheckAgain,
  onBrowseSimilar,
  onClose,
}: {
  item: OutOfStockItem;
  message: string;
  onCheckAgain: () => void;
  onBrowseSimilar: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-ink-900/40 p-4 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-labelledby="out-of-stock-title">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-[0_30px_90px_rgba(16,38,31,0.3)] dark:border-ledger-700 dark:bg-ink-900">
        <button type="button" onClick={onClose} aria-label="Close out-of-stock message" className="absolute right-4 top-4 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-ink-800 dark:hover:text-white">
          <X className="h-4 w-4" />
        </button>
        <div className="relative mx-auto flex h-28 w-28 items-center justify-center rounded-[2rem] bg-sky-50 dark:bg-sky-950/40">
          <div className="absolute inset-3 rounded-full border-2 border-sky-100 dark:border-sky-900" />
          <PackageX className="relative h-14 w-14 text-sky-700 dark:text-sky-300" strokeWidth={1.4} />
          <span className="absolute -bottom-1 -right-1 flex h-11 w-11 items-center justify-center rounded-full border-4 border-white bg-rose-600 text-white shadow-md dark:border-ink-900">
            <X className="h-6 w-6" strokeWidth={3} />
          </span>
        </div>
        <h2 id="out-of-stock-title" className="mt-6 text-2xl font-bold text-[#12345a] dark:text-white">
          {item.availableStock && item.availableStock > 0 ? "Stock Limit Reached" : "Out of Stock"}
        </h2>
        <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{item.name}</p>
        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-ledger-300">{message || "Sorry! This item is currently out of stock. Please check back later or explore similar products."}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={onCheckAgain} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white shadow-sm transition hover:brightness-105" style={{ backgroundColor: "var(--theme-primary)" }}>
            <RefreshCw className="h-4 w-4" /> Check Again
          </button>
          <button type="button" onClick={onBrowseSimilar} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-[#12345a] transition hover:bg-slate-100 dark:border-ledger-700 dark:bg-ink-800 dark:text-white dark:hover:bg-ink-700">
            <Search className="h-4 w-4" /> Browse Similar
          </button>
        </div>
      </div>
    </div>
  );
}
