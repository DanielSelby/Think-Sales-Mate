"use client";

import * as React from "react";
import { Package, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PickableProduct } from "@/components/purchases/product-picker";

interface ProductRowCellProps {
  products: PickableProduct[];
  currentName: string;
  onSelect: (product: PickableProduct) => void;
}

// Inline, per-row product combobox for the Purchase Items table. Each
// instance holds its own open/query state, so it never touches — and is
// never touched by — the long "Search by product name..." bar (ProductPicker)
// above the table. Selecting a product here replaces this row only.
export function ProductRowCell({ products, currentName, onSelect }: ProductRowCellProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 8);
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.barcode ?? "").toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [products, query]);

  function pick(product: PickableProduct) {
    onSelect(product);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded border border-ledger-200 bg-white px-2 text-left text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white",
          !currentName && "text-ledger-400"
        )}
      >
        <span className="truncate">{currentName || "Search or select product"}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ledger-400" />
      </button>

      {open && (
        <div className="absolute left-0 top-10 z-40 max-h-72 w-80 overflow-y-auto rounded-md border border-ledger-100 bg-white py-1 shadow-card-hover dark:border-ledger-700 dark:bg-ink-900">
          <div className="sticky top-0 border-b border-ledger-100 bg-white px-2 py-1.5 dark:border-ledger-700 dark:bg-ink-900">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, SKU, or barcode..."
              className="h-8 w-full rounded border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
            />
          </div>
          {results.length === 0 && (
            <p className="px-3 py-3 text-sm text-ledger-400">No products match &ldquo;{query}&rdquo;.</p>
          )}
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => pick(p)}
              className={cn(
                "flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-ledger-50 dark:hover:bg-white/[0.06]",
                p.stockQuantity <= 0 && "opacity-60"
              )}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ledger-100 text-ledger-400 dark:bg-white/[0.06]">
                <Package className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink-900 dark:text-white">{p.name}</span>
                <span className="block text-xs text-ledger-400">
                  {p.sku} · stock {p.stockQuantity}
                </span>
              </span>
              <span className="shrink-0 font-mono text-sm text-ledger-600 dark:text-ledger-300">
                {p.costPrice.toLocaleString()}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}