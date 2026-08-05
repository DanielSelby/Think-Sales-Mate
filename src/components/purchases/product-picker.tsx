"use client";

import * as React from "react";
import { Search, Package } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PickableProduct {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  costPrice: number;
  stockQuantity: number;
}

interface ProductPickerProps {
  products: PickableProduct[];
  onSelect: (product: PickableProduct) => void;
}

export function ProductPicker({ products, onSelect }: ProductPickerProps) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
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
    setQuery("");
    setOpen(false);
  }

  // A barcode scanner types the code fast and terminates with Enter — if
  // there's an exact SKU/barcode match on Enter, add it directly instead of
  // requiring a click.
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const q = query.trim().toLowerCase();
    if (!q) return;
    const exact = products.find((p) => p.sku.toLowerCase() === q || (p.barcode ?? "").toLowerCase() === q);
    if (exact) {
      e.preventDefault();
      pick(exact);
    }
  }

  return (
    <div className="relative w-full max-w-sm" ref={containerRef}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ledger-400" />
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Scan barcode or search product by name / SKU"
        className="h-10 w-full rounded-md border border-ledger-200 bg-white pl-9 pr-3 text-sm text-ink-900 placeholder:text-ledger-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 focus-visible:border-signal dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
      />

      {open && (
        <div className="absolute left-0 right-0 top-11 z-30 max-h-72 overflow-y-auto rounded-md border border-ledger-100 bg-white py-1 shadow-card-hover dark:border-ledger-700 dark:bg-ink-900">
          {results.length === 0 && (
            <p className="px-3 py-3 text-sm text-ledger-400">No products match &ldquo;{query}&rdquo;.</p>
          )}
          {results.map((p) => (
            <button
              key={p.id}
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