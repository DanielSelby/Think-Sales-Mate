"use client";

import React, { useState, useEffect } from "react";
import { Search, X, ArrowRight, FileText, Wallet, Receipt, Package, ShoppingBag } from "lucide-react";
import { useAccountingStore } from "@/lib/accounting/accounting-store";

interface AccountingSearchModalProps {
  open: boolean;
  onClose: () => void;
}

export function AccountingSearchModal({ open, onClose }: AccountingSearchModalProps) {
  const { searchAll, setActiveTab } = useAccountingStore();
  const [query, setQuery] = useState("");

  const results = searchAll(query);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) {
      window.addEventListener("keydown", handleKey);
      return () => window.removeEventListener("keydown", handleKey);
    }
  }, [open, onClose]);

  if (!open) return null;

  const handleSelectResult = (tab: string) => {
    setActiveTab(tab);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-20 backdrop-blur-xs">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            autoFocus
            type="text"
            placeholder="Search accounts, journals, invoices, bills, assets..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400 text-slate-900 dark:text-white"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="rounded border border-slate-200 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 dark:border-slate-700">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2 divide-y divide-slate-100 dark:divide-slate-800/60">
          {query.trim() === "" ? (
            <div className="p-8 text-center text-xs text-slate-400">
              Type keywords to search across the entire Accounting module.
            </div>
          ) : results.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No matching records found for &ldquo;{query}&rdquo;.
            </div>
          ) : (
            results.map((item, idx) => {
              let Icon = FileText;
              if (item.type === "Account") Icon = Wallet;
              if (item.type === "Invoice") Icon = Receipt;
              if (item.type === "Bill") Icon = ShoppingBag;
              if (item.type === "Fixed Asset") Icon = Package;

              return (
                <div
                  key={idx}
                  onClick={() => handleSelectResult(item.tab)}
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {item.title}
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.2 font-mono text-[9px] uppercase font-bold text-slate-500 dark:bg-slate-800">
                          {item.type}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {item.subtitle}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-300 shrink-0 ml-2" />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
