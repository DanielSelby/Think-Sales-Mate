"use client";

import * as React from "react";
import { Package2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SellableProduct } from "@/components/sales/sale-form";

interface SaleProductRowCellProps {
  products: SellableProduct[];
  currentName: string;
  onSelect: (product: SellableProduct) => void;
  onClose: () => void;
}

// Inline, per-row product combobox for the Sale Items table. Each instance
// holds its own state, so it never touches — and is never touched by —
// the long "Search product by name, SKU..." bar above the table (that one
// stays wired to `search`/`filteredProducts` in SaleForm, untouched here).
export function SaleProductRowCell({ products, currentName, onSelect, onClose }: SaleProductRowCellProps) {
  const [query, setQuery] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [onClose]);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 8);
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)).slice(0, 8);
  }, [products, query]);

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex items-center gap-2 rounded-md border border-signal/40 bg-white px-2 py-1 dark:border-signal/60 dark:bg-ink-900">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={currentName || "Search product by name, SKU, or barcode…"}
          className="h-7 w-full min-w-[160px] border-0 bg-transparent p-0 text-sm text-ink-900 outline-none placeholder:text-ledger-400 dark:text-white"
        />
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ledger-400" />
      </div>

      <div className="absolute left-0 top-9 z-40 max-h-64 w-72 overflow-y-auto rounded-md border border-ledger-100 bg-white py-1 shadow-card-hover dark:border-ledger-700 dark:bg-ink-900">
        {results.length === 0 && (
          <p className="px-3 py-3 text-sm text-ledger-400">No products match &ldquo;{query}&rdquo;.</p>
        )}
        {results.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p)}
            disabled={p.stockQuantity <= 0}
            className={cn(
              "flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-ledger-50 dark:hover:bg-white/[0.06]",
              p.stockQuantity <= 0 && "opacity-60"
            )}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ledger-100 text-ledger-400 dark:bg-white/[0.06]">
              <Package2 className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-ink-900 dark:text-white">{p.name}</span>
              <span className="block text-xs text-ledger-400">
                {p.sku} · stock {p.stockQuantity}
              </span>
            </span>
            <span className="shrink-0 font-mono text-sm text-ledger-600 dark:text-ledger-300">
              ${p.unitPrice.toLocaleString()}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}