"use client";

import * as React from "react";
import { Search, FileText } from "lucide-react";
import { formatReturnNumber } from "@/lib/purchase-returns/format";
import { searchEligiblePurchases, type EligiblePurchase } from "@/app/(dashboard)/purchases/returns/actions";

interface OrderPickerProps {
  onSelect: (purchase: EligiblePurchase) => void;
  selectedLabel: string | null;
}

export function OrderPicker({ onSelect, selectedLabel }: OrderPickerProps) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [results, setResults] = React.useState<EligiblePurchase[]>([]);
  const [loading, setLoading] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    const timeout = setTimeout(() => {
      searchEligiblePurchases(query).then((r) => {
        setResults(r);
        setLoading(false);
      });
    }, 200);
    return () => clearTimeout(timeout);
  }, [query, open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen(true)}
        className="flex h-10 w-full items-center gap-2 rounded-md border border-ledger-200 bg-white px-3 text-left text-sm text-ink-900 hover:border-ledger-300 dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
      >
        <FileText className="h-4 w-4 shrink-0 text-ledger-400" />
        <span className="truncate">{selectedLabel ?? "Select original purchase order"}</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-11 z-30 max-h-72 overflow-hidden rounded-md border border-ledger-100 bg-white shadow-card-hover dark:border-ledger-700 dark:bg-ink-900">
          <div className="border-b border-ledger-100 p-2 dark:border-ledger-700">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ledger-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search PO number or supplier..."
                className="h-8 w-full rounded border border-ledger-200 bg-white pl-8 pr-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {loading && <p className="px-3 py-3 text-sm text-ledger-400">Searching...</p>}
            {!loading && results.length === 0 && (
              <p className="px-3 py-3 text-sm text-ledger-400">No received or partially-received purchase orders found.</p>
            )}
            {!loading && results.map((p) => (
              <button
                key={p.id}
                onClick={() => { onSelect(p); setOpen(false); setQuery(""); }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-ledger-50 dark:hover:bg-white/[0.06]"
              >
                <span className="font-mono text-signal">{formatReturnNumber(p.purchaseNumber).replace("PR-", "PO-")}</span>
                <span className="truncate text-ledger-500">{p.supplierName}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}