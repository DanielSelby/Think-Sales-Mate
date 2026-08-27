"use client";

import * as React from "react";
import Link from "next/link";
import { Search, ShoppingCart, Package, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/sales/format";
import { useCart } from "@/components/customer-portal/cart-context";
import type { CatalogProduct } from "@/app/order/[orgSlug]/actions";

interface BrowseViewProps {
  orgSlug: string;
  orgName: string;
  currency: string;
  showPrices: boolean;
  products: CatalogProduct[];
}

export function BrowseView({ orgSlug, orgName, currency, showPrices, products }: BrowseViewProps) {
  const cart = useCart();
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState("all");

  const categories = React.useMemo(() => Array.from(new Set(products.map((p) => p.category).filter(Boolean))) as string[], [products]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, query, category]);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-6">
      {/* Header */}
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="font-display text-lg font-semibold text-ink-900 dark:text-white">{orgName}</p>
          <p className="text-xs text-ledger-500">Customer Ordering Portal</p>
        </div>
        <Link href={`/order/${orgSlug}/cart`} className="relative flex h-10 w-10 items-center justify-center rounded-full bg-ink-900 text-white dark:bg-white dark:text-ink-900">
          <ShoppingCart className="h-4 w-4" />
          {cart.itemCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-alert text-[10px] font-semibold text-white">{cart.itemCount}</span>
          )}
        </Link>
      </header>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-[180px_1fr]">
        {/* Categories */}
        <aside className="space-y-1">
          <button onClick={() => setCategory("all")} className={cn("block w-full rounded-md px-3 py-2 text-left text-sm", category === "all" ? "bg-ink-900 text-white dark:bg-white dark:text-ink-900" : "text-ledger-600 hover:bg-ledger-100 dark:text-ledger-300 dark:hover:bg-white/[0.06]")}>
            All Categories
          </button>
          {categories.map((c) => (
            <button key={c} onClick={() => setCategory(c)} className={cn("block w-full rounded-md px-3 py-2 text-left text-sm", category === c ? "bg-ink-900 text-white dark:bg-white dark:text-ink-900" : "text-ledger-600 hover:bg-ledger-100 dark:text-ledger-300 dark:hover:bg-white/[0.06]")}>
              {c}
            </button>
          ))}
        </aside>

        {/* Products */}
        <div>
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ledger-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products..."
              className="h-10 w-full rounded-md border border-ledger-200 bg-white pl-9 pr-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.length === 0 && <p className="col-span-full py-10 text-center text-sm text-ledger-400">No products found.</p>}
            {filtered.map((p) => (
              <div key={p.id} className="rounded-md border border-ledger-100 bg-white p-3 dark:border-ledger-700 dark:bg-ink-900">
                <div className="mb-2 flex h-20 w-full items-center justify-center rounded-md bg-ledger-100 dark:bg-white/[0.06]">
                  <Package className="h-6 w-6 text-ledger-400" />
                </div>
                <p className="line-clamp-2 text-sm font-medium text-ink-900 dark:text-white">{p.name}</p>
                {showPrices ? (
                  <p className="mt-1 font-mono text-sm text-ink-900 dark:text-white">{formatCurrency(p.unitPrice, currency)}</p>
                ) : (
                  <p className="mt-1 text-xs text-ledger-400">Price on request</p>
                )}
                <button
                  onClick={() => cart.addItem({ productId: p.id, name: p.name, unitPrice: p.unitPrice, maxStock: p.stockQuantity })}
                  disabled={p.stockQuantity <= 0}
                  className="mt-2 flex w-full items-center justify-center gap-1 rounded-md bg-signal py-1.5 text-xs font-medium text-white hover:bg-signal/90 disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" /> {p.stockQuantity <= 0 ? "Out of Stock" : "Add to Cart"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}