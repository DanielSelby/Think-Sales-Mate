"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Search, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export type SmartProduct = { id: string; name: string; sku?: string | null; barcode?: string | null };
export type SmartProductRow = { key: string; productId: string; quantity: number };
export type SmartFilter = "all" | "duplicates" | "recent" | "high-quantity";

export function useSmartProductLocator<T extends SmartProductRow>(rows: T[]) {
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLElement | null>>({});

  function locate(key: string) {
    setHighlightedKey(key);
    rowRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => setHighlightedKey((current) => current === key ? null : current), 3000);
  }

  useEffect(() => () => {
    Object.values(rowRefs.current).forEach((element) => element?.removeAttribute("data-smart-row"));
  }, []);

  return {
    highlightedKey,
    rowRefs,
    locate,
    rowClassName: (key: string) => cn(
      "transition-all duration-300",
      highlightedKey === key && "smart-product-row-highlight"
    ),
  };
}

export function SmartProductSummary<T extends SmartProductRow>({
  products,
  rows,
  onLocate,
  className,
}: {
  products: SmartProduct[];
  rows: T[];
  onLocate: (key: string) => void;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SmartFilter>("all");
  const [isExpanded, setIsExpanded] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);
  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const occurrences = useMemo(() => {
    const map = new Map<string, T[]>();
    rows.forEach((row) => map.set(row.productId, [...(map.get(row.productId) ?? []), row]));
    return map;
  }, [rows]);
  const duplicateCount = [...occurrences.values()].filter((items) => items.length > 1).length;
  const visible = rows.filter((row, index) => {
    const product = productMap.get(row.productId);
    const matchesQuery = !query.trim() || `${product?.name ?? ""} ${product?.sku ?? ""} ${product?.barcode ?? ""}`.toLowerCase().includes(query.trim().toLowerCase());
    if (!matchesQuery) return false;
    if (filter === "duplicates") return (occurrences.get(row.productId)?.length ?? 0) > 1;
    if (filter === "recent") return index >= Math.max(0, rows.length - 10);
    if (filter === "high-quantity") return row.quantity >= 10;
    return true;
  });

  return (
    <aside className={cn("rounded-2xl border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900", className)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink-900 dark:text-white">Document Product Summary</h3>
          {isExpanded && <p className="mt-1 text-[11px] text-ledger-400">Search and jump to any entered product.</p>}
        </div>
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-ledger-400" />
          <button
            type="button"
            onClick={() => setIsExpanded((expanded) => !expanded)}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? "Hide document product summary" : "Show document product summary"}
            title={isExpanded ? "Hide summary" : "Show summary"}
            className="rounded-lg p-1 text-ledger-400 transition-colors hover:bg-ledger-50 hover:text-ink-900 dark:hover:bg-white/5 dark:hover:text-white"
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {isExpanded && <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-ledger-50 p-2 dark:bg-white/5"><p className="text-lg font-bold">{new Set(rows.map((row) => row.productId)).size}</p><p className="text-[10px] text-ledger-400">Unique</p></div>
        <div className="rounded-xl bg-ledger-50 p-2 dark:bg-white/5"><p className="text-lg font-bold">{rows.length}</p><p className="text-[10px] text-ledger-400">Rows</p></div>
        <div className="rounded-xl bg-ledger-50 p-2 dark:bg-white/5"><p className="text-lg font-bold">{duplicateCount}</p><p className="text-[10px] text-ledger-400">Duplicates</p></div>
      </div>
      }
      {isExpanded && <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ledger-400" />
        <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search product in document" className="h-9 w-full rounded-lg border border-ledger-200 pl-8 pr-2 text-xs outline-none focus:border-blue-400 dark:border-ledger-700 dark:bg-ink-950" />
      </div>
      }
      {isExpanded && <select value={filter} onChange={(event) => setFilter(event.target.value as SmartFilter)} className="mt-2 h-8 w-full rounded-lg border border-ledger-200 px-2 text-[11px] dark:border-ledger-700 dark:bg-ink-950">
        <option value="all">Show All</option><option value="duplicates">Show Duplicate Products</option><option value="recent">Show Recently Added</option><option value="high-quantity">Show High Quantity Items</option>
      </select>
      }
      {isExpanded && <div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
        {visible.map((row) => {
          const product = productMap.get(row.productId);
          const matches = occurrences.get(row.productId) ?? [];
          return <button key={row.key} type="button" onClick={() => onLocate(row.key)} className="w-full rounded-lg border border-transparent p-2 text-left hover:border-blue-200 hover:bg-blue-50 dark:hover:bg-blue-950/20">
            <p className="truncate text-xs font-semibold">{product?.name ?? "Unassigned product"}</p>
            <p className="text-[10px] text-ledger-400">Row {rows.indexOf(row) + 1} · Qty: {row.quantity}{matches.length > 1 ? ` · ${matches.length} rows` : ""}</p>
          </button>;
        })}
        {!visible.length && <p className="py-5 text-center text-xs text-ledger-400">No products found.</p>}
      </div>
      }
    </aside>
  );
}
