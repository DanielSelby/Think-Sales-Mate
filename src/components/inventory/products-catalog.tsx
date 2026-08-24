"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Boxes,
  PackageX,
  Wallet,
  Sparkles,
  Package,
  Upload,
  Download,
  Printer,
  Plus,
  ChevronLeft,
  ChevronRight,
  Search,
  MoreVertical,
  Pencil,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  LayoutGrid,
  List,
  X,
  TrendingUp,
  AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore, THEMES } from "@/store/useAppStore";
import { KpiFlipCard } from "@/components/charts/kpi-flip-card";
import { formatMoney } from "@/lib/currency";
import { deleteProduct, toggleProductActive, duplicateProduct, bulkImportProducts } from "@/app/(dashboard)/inventory/actions";

export interface CatalogProduct {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  brand: string | null;
  supplier: string | null;
  barcode: string | null;
  locationId: string | null;
  locationName: string | null;
  unitPrice: number;
  costPrice: number | null;
  stockQuantity: number;
  lowStockThreshold: number;
  isActive: boolean;
  imageUrl?: string | null;
}

export interface CatalogLocation {
  id: string;
  name: string;
}

export interface BestSellerRow {
  productId: string;
  name: string;
  unitsSold: number;
}

type StockStatus = "in" | "low" | "out";
type SortKey = "name-asc" | "name-desc" | "stock-desc" | "stock-asc" | "price-desc" | "price-asc";

const PAGE_SIZE = 8;
const CATEGORY_COLORS = ["#2563eb", "#16a34a", "#7c3aed", "#d97706", "#0d9488", "#94a3b8"];


function getStatus(p: CatalogProduct): StockStatus {
  if (p.stockQuantity <= 0) return "out";
  if (p.stockQuantity <= p.lowStockThreshold) return "low";
  return "in";
}

function csvEscape(value: string) {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

export function ProductsCatalog({
  products,
  locations,
  bestSellers,
  canManage,
  currency = "GHS"
}: {
  products: CatalogProduct[];
  locations: CatalogLocation[];
  bestSellers: BestSellerRow[];
  canManage: boolean;
  currency?: string;
}) {
  const { activeTheme } = useAppStore();
  const theme = THEMES[activeTheme];
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [brand, setBrand] = useState("all");
  const [supplier, setSupplier] = useState("all");
  const [warehouse, setWarehouse] = useState("all");
  const [stockStatus, setStockStatus] = useState<"all" | StockStatus>("all");
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

  const [view, setView] = useState<"table" | "grid">("table");
  const [sortKey, setSortKey] = useState<SortKey>("name-asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category).filter(Boolean) as string[])].sort(),
    [products]
  );
  const brands = useMemo(() => [...new Set(products.map((p) => p.brand).filter(Boolean) as string[])].sort(), [products]);
  const suppliers = useMemo(
    () => [...new Set(products.map((p) => p.supplier).filter(Boolean) as string[])].sort(),
    [products]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q) && !(p.barcode ?? "").includes(q)) {
        return false;
      }
      if (category !== "all" && p.category !== category) return false;
      if (brand !== "all" && p.brand !== brand) return false;
      if (supplier !== "all" && p.supplier !== supplier) return false;
      if (warehouse !== "all" && p.locationId !== warehouse) return false;
      if (stockStatus !== "all" && getStatus(p) !== stockStatus) return false;
      if (minPrice && p.unitPrice < Number(minPrice)) return false;
      if (maxPrice && p.unitPrice > Number(maxPrice)) return false;
      return true;
    });
  }, [products, search, category, brand, supplier, warehouse, stockStatus, minPrice, maxPrice]);

  // Now computed from `filtered` — search/category/brand/etc. actually change these.
  const totalProducts = filtered.length;
  const activeProducts = filtered.filter((p) => p.isActive).length;
  const activePct = totalProducts > 0 ? Math.round((activeProducts / totalProducts) * 100) : 0;
  const lowStockCount = filtered.filter((p) => p.isActive && getStatus(p) === "low").length;
  const outOfStockCount = filtered.filter((p) => p.isActive && getStatus(p) === "out").length;
  const inventoryValue = filtered.filter((p) => p.isActive).reduce((sum, p) => sum + p.unitPrice * p.stockQuantity, 0);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    switch (sortKey) {
      case "name-desc":
        return arr.sort((a, b) => b.name.localeCompare(a.name));
      case "stock-desc":
        return arr.sort((a, b) => b.stockQuantity - a.stockQuantity);
      case "stock-asc":
        return arr.sort((a, b) => a.stockQuantity - b.stockQuantity);
      case "price-desc":
        return arr.sort((a, b) => b.unitPrice - a.unitPrice);
      case "price-asc":
        return arr.sort((a, b) => a.unitPrice - b.unitPrice);
      default:
        return arr.sort((a, b) => a.name.localeCompare(b.name));
    }
  }, [filtered, sortKey]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const categoryValues = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) {
      if (!p.isActive) continue;
      const key = p.category ?? "Uncategorized";
      map.set(key, (map.get(key) ?? 0) + p.unitPrice * p.stockQuantity);
    }
    const total = [...map.values()].reduce((s, v) => s + v, 0);
    return [...map.entries()]
      .map(([name, value]) => ({ name, value, pct: total > 0 ? Math.round((value / total) * 100) : 0 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [products]);

  const lowStockAlerts = useMemo(
    () =>
      products
        .filter((p) => p.isActive && getStatus(p) !== "in")
        .sort((a, b) => a.stockQuantity - b.stockQuantity)
        .slice(0, 3),
    [products]
  );

  // Heuristic recommendation — best sellers that are also running low, so
  // the "why" is legible rather than a black-box AI call.
  const recommendations = useMemo(() => {
    const productById = new Map(products.map((p) => [p.id, p]));
    const runningLow = bestSellers.filter((b) => {
      const p = productById.get(b.productId);
      return p && getStatus(p) !== "in";
    });
    const picks = (runningLow.length > 0 ? runningLow : bestSellers).slice(0, 2);
    return picks.map((b) => ({ ...b, product: productById.get(b.productId) }));
  }, [bestSellers, products]);

  function resetFilters() {
    setSearch("");
    setCategory("all");
    setBrand("all");
    setSupplier("all");
    setWarehouse("all");
    setStockStatus("all");
    setMinPrice("");
    setMaxPrice("");
    setPage(1);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllOnPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = pageItems.every((p) => next.has(p.id));
      pageItems.forEach((p) => (allSelected ? next.delete(p.id) : next.add(p.id)));
      return next;
    });
  }

  function handleDelete(product: CatalogProduct) {
    if (!confirm(`Remove "${product.name}" from inventory? This can't be undone.`)) return;
    setOpenMenuId(null);
    startTransition(async () => {
      const result = await deleteProduct(product.id);
      if (result?.error) setError(result.error);
    });
  }

  function handleToggleActive(product: CatalogProduct) {
    setOpenMenuId(null);
    startTransition(async () => {
      const result = await toggleProductActive(product.id, !product.isActive);
      if (result?.error) setError(result.error);
    });
  }

  function handleDuplicate(product: CatalogProduct) {
    setOpenMenuId(null);
    startTransition(async () => {
      const result = await duplicateProduct(product.id);
      if (result?.error) setError(result.error);
    });
  }

  function handleExport() {
    const headers = [
      "SKU",
      "Name",
      "Category",
      "Brand",
      "Supplier",
      "Barcode",
      "Buying Price",
      "Selling Price",
      "Stock",
      "Warehouse",
      "Status"
    ];
    const rows = sorted.map((p) =>
      [
        p.sku,
        p.name,
        p.category ?? "",
        p.brand ?? "",
        p.supplier ?? "",
        p.barcode ?? "",
        p.costPrice != null ? p.costPrice.toFixed(2) : "",
        p.unitPrice.toFixed(2),
        String(p.stockQuantity),
        p.locationName ?? "",
        p.isActive ? "Active" : "Inactive"
      ]
        .map(csvEscape)
        .join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "products-export.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  function handleImportFile(file: File) {
    setImportMessage(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const rows = parseCsv(text);
      if (rows.length === 0) {
        setError("Couldn't find any data rows in that CSV. Expected a header row plus at least one product.");
        return;
      }
      const payload = rows.map((r) => ({
        name: r.name ?? "",
        sku: r.sku ?? "",
        unitPrice: Number(r.unit_price ?? r["selling price"] ?? r.price ?? NaN),
        costPrice: r.cost_price || r["buying price"] ? Number(r.cost_price ?? r["buying price"]) : undefined,
        stockQuantity: r.stock_quantity || r.stock ? Number(r.stock_quantity ?? r.stock) : undefined,
        category: r.category || undefined,
        brand: r.brand || undefined,
        supplier: r.supplier || undefined,
        barcode: r.barcode || undefined
      }));
      startTransition(async () => {
        const result = await bulkImportProducts(payload);
        setImportMessage(
          `Imported ${result.imported} of ${payload.length} products.` +
            (result.skipped.length > 0 ? ` ${result.skipped.length} row(s) skipped — see console for details.` : "")
        );
        if (result.skipped.length > 0) console.warn("Import skipped rows:", result.skipped);
      });
    };
    reader.readAsText(file);
  }

  function handlePrintLabels() {
    const targets = products.filter((p) => selectedIds.has(p.id));
    if (targets.length === 0) {
      setError("Select at least one product to print labels for.");
      return;
    }
    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) return;
    const labelsHtml = targets
      .map(
        (p) => `
        <div class="label">
          <div class="name">${p.name}</div>
          <div class="sku">${p.sku}</div>
          <div class="barcode">${p.barcode ?? ""}</div>
          <div class="price">${formatMoney(p.unitPrice, currency)}</div>
        </div>`
      )
      .join("");
    win.document.write(`
      <html>
        <head>
          <title>Print labels</title>
          <style>
            body { font-family: sans-serif; margin: 0; padding: 16px; }
            .sheet { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
            .label { border: 1px solid #ccc; border-radius: 6px; padding: 10px; text-align: center; }
            .name { font-weight: 600; font-size: 13px; }
            .sku { font-family: monospace; font-size: 11px; color: #666; margin-top: 2px; }
            .barcode { font-family: monospace; font-size: 12px; letter-spacing: 2px; margin-top: 6px; }
            .price { font-weight: 700; font-size: 14px; margin-top: 4px; }
          </style>
        </head>
        <body>
          <div class="sheet">${labelsHtml}</div>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImportFile(file);
          e.target.value = "";
        }}
      />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">Products</h1>
          <p className="text-sm text-ledger-500 dark:text-ledger-400">
            Manage your product catalog and track inventory in real time.
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Link href="/inventory/import">
            <Button variant="outline">
             <Upload className="h-3.5 w-3.5" />
               Import Products
            </Button>
           </Link>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
            <Button variant="outline" onClick={handlePrintLabels}>
              <Printer className="h-3.5 w-3.5" />
              Print labels
            </Button>
            <Link href="/inventory/new">
              <Button
                className="text-white transition-colors"
                style={{ background: theme.colors.primary }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = theme.colors.primaryMid; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = theme.colors.primary; }}
              >
                <Plus className="h-3.5 w-3.5" />
                Add product
              </Button>
            </Link>
          </div>
        )}
      </div>

      {error && (
        <p className="flex items-center justify-between rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">
          {error}
          <button onClick={() => setError(null)} aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </button>
        </p>
      )}
      {importMessage && (
        <p className="flex items-center justify-between rounded-md bg-signal-soft px-3 py-2 text-sm text-signal">
          {importMessage}
          <button onClick={() => setImportMessage(null)} aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </button>
        </p>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <KpiFlipCard color="blue" label="Total products" value={totalProducts.toLocaleString()} icon={<Boxes className="h-full w-full" />} detail="Number of products matching the current search/filters." />
        <KpiFlipCard color="amber" label="Low stock" value={lowStockCount.toLocaleString()} icon={<AlertTriangle className="h-full w-full" />} detail="Active, filtered products at or below their low-stock threshold." />
        <KpiFlipCard color="red" label="Out of stock" value={outOfStockCount.toLocaleString()} icon={<PackageX className="h-full w-full" />} detail="Active, filtered products with zero units on hand." />
        <KpiFlipCard color="green" label="Inventory value" value={formatMoney(inventoryValue, currency)} icon={<Wallet className="h-full w-full" />} detail="Selling price × stock, summed across active filtered products." featured />
        <KpiFlipCard color="purple" label="Active products" value={activeProducts.toLocaleString()} icon={<Sparkles className="h-full w-full" />} detail={`${activePct}% of the filtered set is currently active.`} />
      </div>

      {/* Toolbar */}
      <div className="space-y-3 rounded-card border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ledger-400" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by product name, SKU, or barcode…"
            className="h-10 w-full rounded-md border border-ledger-200 bg-white pl-9 pr-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
            className="h-9 rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={brand}
            onChange={(e) => {
              setBrand(e.target.value);
              setPage(1);
            }}
            className="h-9 rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
          >
            <option value="all">All brands</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <select
            value={supplier}
            onChange={(e) => {
              setSupplier(e.target.value);
              setPage(1);
            }}
            className="h-9 rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
          >
            <option value="all">All suppliers</option>
            {suppliers.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={warehouse}
            onChange={(e) => {
              setWarehouse(e.target.value);
              setPage(1);
            }}
            className="h-9 rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
          >
            <option value="all">All warehouses</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <select
            value={stockStatus}
            onChange={(e) => {
              setStockStatus(e.target.value as "all" | StockStatus);
              setPage(1);
            }}
            className="h-9 rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
          >
            <option value="all">All statuses</option>
            <option value="in">In stock</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </select>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowMoreFilters((s) => !s)}
              className="flex h-9 flex-1 items-center justify-center gap-1 rounded-md border border-ledger-200 text-sm text-ledger-600 hover:bg-ledger-50 dark:border-ledger-700 dark:text-ledger-300 dark:hover:bg-white/[0.06]"
            >
              More filters
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="flex h-9 items-center justify-center rounded-md border border-ledger-200 px-3 text-sm text-ledger-600 hover:bg-ledger-50 dark:border-ledger-700 dark:text-ledger-300 dark:hover:bg-white/[0.06]"
            >
              Clear
            </button>
          </div>
        </div>

        {showMoreFilters && (
          <div className="flex flex-wrap items-center gap-2 border-t border-ledger-100 pt-3 dark:border-ledger-700">
            <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Price range</label>
            <input
              type="number"
              min={0}
              value={minPrice}
              onChange={(e) => {
                setMinPrice(e.target.value);
                setPage(1);
              }}
              placeholder="Min"
              className="h-8 w-24 rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
            />
            <span className="text-ledger-400">–</span>
            <input
              type="number"
              min={0}
              value={maxPrice}
              onChange={(e) => {
                setMaxPrice(e.target.value);
                setPage(1);
              }}
              placeholder="Max"
              className="h-8 w-24 rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
            />
          </div>
        )}
      </div>

      {/* View toggle + sort + count */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex overflow-hidden rounded-md border border-ledger-200 dark:border-ledger-700">
          <button
            onClick={() => setView("table")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm ${view === "table" ? "bg-signal text-white" : "text-ledger-500 hover:bg-ledger-50 dark:text-ledger-400 dark:hover:bg-white/[0.06]"}`}
          >
            <List className="h-3.5 w-3.5" /> Table view
          </button>
          <button
            onClick={() => setView("grid")}
            className={`flex items-center gap-1.5 border-l border-ledger-200 px-3 py-1.5 text-sm dark:border-ledger-700 ${view === "grid" ? "bg-signal text-white" : "text-ledger-500 hover:bg-ledger-50 dark:text-ledger-400 dark:hover:bg-white/[0.06]"}`}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Grid view
          </button>
        </div>

        <div className="flex items-center gap-3 text-sm text-ledger-500 dark:text-ledger-400">
          <span>
            {sorted.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, sorted.length)} of{" "}
            {sorted.length}
          </span>
          <label className="flex items-center gap-1.5">
            Show
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="h-8 rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
            >
              {[25, 50, 100, 200, 500, 1000].map((n) => <option key={n} value={n}>{n}</option>)}
              <option value={sorted.length || 1}>All</option>
            </select>
            entries
          </label>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="h-8 rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
          >
            <option value="name-asc">Sort: Name (A–Z)</option>
            <option value="name-desc">Sort: Name (Z–A)</option>
            <option value="stock-desc">Sort: Stock (high–low)</option>
            <option value="stock-asc">Sort: Stock (low–high)</option>
            <option value="price-desc">Sort: Price (high–low)</option>
            <option value="price-asc">Sort: Price (low–high)</option>
          </select>
        </div>
      </div>

      {/* Table / Grid */}
      {pageItems.length === 0 ? (
        <div className="rounded-card border border-dashed border-ledger-200 bg-white p-10 text-center dark:border-ledger-700 dark:bg-ink-900">
          <p className="text-sm text-ledger-500 dark:text-ledger-400">No products match these filters.</p>
        </div>
      ) : view === "table" ? (
        <div className="overflow-x-auto rounded-card border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <table className="w-full text-sm">
            <thead className="border-b border-ledger-100 text-left text-xs font-semibold uppercase tracking-wide text-ink-900 dark:border-ledger-700 dark:text-white">
              <tr>
                <th className="w-8 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={pageItems.every((p) => selectedIds.has(p.id))}
                    onChange={toggleSelectAllOnPage}
                  />
                </th>
                <th className="px-2 py-3">Product</th>
                <th className="px-2 py-3">SKU</th>
                <th className="px-2 py-3">Barcode</th>
                <th className="px-2 py-3">Category</th>
                <th className="px-2 py-3 text-right">Buying price</th>
                <th className="px-2 py-3 text-right">Selling price</th>
                <th className="px-2 py-3 text-right">Stock</th>
                <th className="px-2 py-3">Warehouse</th>
                <th className="px-2 py-3">Supplier</th>
                <th className="px-2 py-3">Status</th>
                {canManage && <th className="w-16 px-2 py-3" />}
              </tr>
            </thead>
            <tbody>
              {pageItems.map((p) => {
                const status = getStatus(p);
                const stockPct = p.lowStockThreshold > 0 ? Math.min(100, (p.stockQuantity / (p.lowStockThreshold * 3)) * 100) : 100;
                return (
                  <tr key={p.id} className="border-b border-ledger-50 last:border-0 dark:border-ledger-700/50">
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} />
                    </td>
                    <td className="px-2 py-3">
                      <Link href={`/inventory/${p.id}`} className="group flex items-center gap-2">
                        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-ledger-100 bg-white text-ledger-400 transition-transform group-hover:scale-105 dark:border-ledger-700 dark:bg-ink-900">
                          {p.imageUrl ? (
                            <Image src={p.imageUrl} alt={p.name} fill className="object-cover" unoptimized />
                          ) : (
                            <Package className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink-900 group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">{p.name}</p>
                          {p.description && <p className="truncate text-xs text-ledger-400">{p.description}</p>}
                        </div>
                      </Link>
                    </td>
                    <td className="px-2 py-3 font-mono text-xs text-ledger-500 dark:text-ledger-400">{p.sku}</td>
                    <td className="px-2 py-3 font-mono text-xs text-ledger-400">{p.barcode ?? "—"}</td>
                    <td className="px-2 py-3">
                      {p.category ? (
                        <span className="rounded-full bg-ledger-100 px-2 py-0.5 text-xs text-ledger-600 dark:bg-white/[0.06] dark:text-ledger-300">
                          {p.category}
                        </span>
                      ) : (
                        <span className="text-xs text-ledger-300">—</span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-right text-ledger-500 dark:text-ledger-400">
                      {p.costPrice != null ? formatMoney(p.costPrice, currency) : "—"}
                    </td>
                    <td className="px-2 py-3 text-right text-ink-900 dark:text-white">{formatMoney(p.unitPrice, currency)}</td>
                    <td className="px-2 py-3">
                      <div className="text-right">
                        <span
                          className={`font-semibold ${status === "out" ? "text-alert" : status === "low" ? "text-amber" : "text-signal"}`}
                        >
                          {p.stockQuantity}
                        </span>
                        <div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-ledger-100 dark:bg-white/[0.06]">
                          <div
                            className={`h-full ${status === "out" ? "bg-alert" : status === "low" ? "bg-amber" : "bg-signal"}`}
                            style={{ width: `${stockPct}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-3 text-ledger-500 dark:text-ledger-400">{p.locationName ?? "—"}</td>
                    <td className="px-2 py-3 text-ledger-500 dark:text-ledger-400">{p.supplier ?? "—"}</td>
                    <td className="px-2 py-3">
                      {!p.isActive ? (
                        <span className="rounded-full bg-ledger-100 px-2 py-0.5 text-xs font-semibold text-ledger-500 dark:bg-white/[0.06]">
                          Inactive
                        </span>
                      ) : status === "out" ? (
                        <span className="rounded-full bg-alert-soft px-2 py-0.5 text-xs font-semibold text-alert">Out of stock</span>
                      ) : status === "low" ? (
                        <span className="rounded-full bg-amber-soft px-2 py-0.5 text-xs font-semibold text-amber">Low stock</span>
                      ) : (
                        <span className="rounded-full bg-signal-soft px-2 py-0.5 text-xs font-semibold text-signal">In stock</span>
                      )}
                    </td>
                    {canManage && (
                      <td className="px-2 py-3">
                        <div className="relative flex items-center justify-end gap-2">
                          <Link href={`/inventory/${p.id}/edit`} className="text-ledger-400 hover:text-ink-900 dark:hover:text-white" aria-label={`Edit ${p.name}`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Link>
                          <button
                            onClick={() => setOpenMenuId(openMenuId === p.id ? null : p.id)}
                            className="text-ledger-400 hover:text-ink-900 dark:hover:text-white"
                            aria-label="More actions"
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </button>
                          {openMenuId === p.id && (
                            <div className="absolute right-0 top-6 z-10 w-48 rounded-md border border-ledger-100 bg-white py-1 text-left shadow-card-hover dark:border-ledger-700 dark:bg-ink-900">
                              <Link
                                href={`/inventory/${p.id}`}
                                className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-white/[0.06]"
                              >
                                <Eye className="h-3.5 w-3.5" /> View Details & Ledger
                              </Link>
                              <Link
                                href={`/inventory/${p.id}/edit`}
                                className="flex items-center gap-2 px-3 py-1.5 text-xs text-ledger-600 hover:bg-ledger-50 dark:text-ledger-300 dark:hover:bg-white/[0.06]"
                              >
                                <Pencil className="h-3.5 w-3.5" /> Edit details
                              </Link>
                              <button
                                onClick={() => handleDuplicate(p)}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ledger-600 hover:bg-ledger-50 dark:text-ledger-300 dark:hover:bg-white/[0.06]"
                              >
                                <Copy className="h-3.5 w-3.5" /> Duplicate
                              </button>
                              <button
                                onClick={() => handleToggleActive(p)}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ledger-600 hover:bg-ledger-50 dark:text-ledger-300 dark:hover:bg-white/[0.06]"
                              >
                                {p.isActive ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                {p.isActive ? "Deactivate" : "Activate"}
                              </button>
                              <button
                                onClick={() => handleDelete(p)}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-alert hover:bg-alert-soft"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {pageItems.map((p) => {
            const status = getStatus(p);
            return (
              <div key={p.id} className="group rounded-card border border-ledger-100 bg-white p-4 shadow-card transition-all hover:shadow-card-hover dark:border-ledger-700 dark:bg-ink-900">
                <div className="flex items-start justify-between">
                  <Link href={`/inventory/${p.id}`} className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border border-ledger-100 bg-white text-ledger-400 transition-transform group-hover:scale-105 dark:border-ledger-700 dark:bg-ink-900">
                    {p.imageUrl ? (
                      <Image src={p.imageUrl} alt={p.name} fill className="object-cover" unoptimized />
                    ) : (
                      <Package className="h-5 w-5" />
                    )}
                  </Link>
                  {canManage && (
                    <Link href={`/inventory/${p.id}/edit`} className="text-ledger-400 hover:text-ink-900 dark:hover:text-white">
                      <Pencil className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
                <Link href={`/inventory/${p.id}`} className="block">
                  <p className="mt-2 truncate font-medium text-ink-900 group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">{p.name}</p>
                  <p className="font-mono text-xs text-ledger-400">{p.sku}</p>
                </Link>
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-semibold text-ink-900 dark:text-white">{formatMoney(p.unitPrice, currency)}</span>
                  <span
                    className={`text-xs font-semibold ${status === "out" ? "text-alert" : status === "low" ? "text-amber" : "text-signal"}`}
                  >
                    {p.stockQuantity} in stock
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-ledger-200 text-ledger-500 disabled:opacity-30 dark:border-ledger-700"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm text-ledger-500 dark:text-ledger-400">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-ledger-200 text-ledger-500 disabled:opacity-30 dark:border-ledger-700"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Bottom insight panels */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="rounded-card border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <h3 className="text-sm font-semibold text-ink-900 dark:text-white">Top categories by value</h3>
          <ul className="mt-3 space-y-2">
            {categoryValues.map((c, i) => (
              <li key={c.name} className="flex items-center gap-2 text-xs">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                <span className="flex-1 truncate text-ledger-600 dark:text-ledger-300">{c.name}</span>
                <span className="text-ledger-400">{c.pct}%</span>
              </li>
            ))}
            {categoryValues.length === 0 && <p className="text-xs text-ledger-400">No inventory value yet.</p>}
          </ul>
        </div>

        <div className="rounded-card border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <h3 className="text-sm font-semibold text-ink-900 dark:text-white">Best selling products</h3>
          <p className="text-xs text-ledger-400">Last 30 days</p>
          <ul className="mt-3 space-y-2">
            {bestSellers.map((b, i) => (
              <li key={b.productId} className="flex items-center gap-2 text-xs">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ledger-100 font-semibold text-ledger-500 dark:bg-white/[0.06]">
                  {i + 1}
                </span>
                <span className="flex-1 truncate text-ledger-700 dark:text-ledger-200">{b.name}</span>
                <span className="text-ledger-400">{b.unitsSold} units</span>
              </li>
            ))}
            {bestSellers.length === 0 && <p className="text-xs text-ledger-400">No sales recorded yet.</p>}
          </ul>
        </div>

        <div className="rounded-card border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <h3 className="text-sm font-semibold text-ink-900 dark:text-white">Low stock alerts</h3>
          <p className="text-xs text-ledger-400">Needs attention</p>
          <ul className="mt-3 space-y-2">
            {lowStockAlerts.map((p) => (
              <li key={p.id} className="flex items-center justify-between text-xs">
                <span className="truncate text-ledger-700 dark:text-ledger-200">{p.name}</span>
                <span className={`font-semibold ${p.stockQuantity === 0 ? "text-alert" : "text-amber"}`}>
                  {p.stockQuantity} left
                </span>
              </li>
            ))}
            {lowStockAlerts.length === 0 && <p className="text-xs text-ledger-400">Everything is well stocked.</p>}
          </ul>
        </div>

        <div className="rounded-card border border-ledger-100 bg-signal-soft/40 p-4 shadow-card dark:border-ledger-700">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink-900 dark:text-white">
            <Sparkles className="h-3.5 w-3.5 text-signal" /> Product recommendation
          </h3>
          <p className="text-xs text-ledger-400">Based on recent sales trend</p>
          <ul className="mt-3 space-y-2">
            {recommendations.map((r) => (
              <li key={r.productId} className="flex items-center gap-2 text-xs">
                <TrendingUp className="h-3.5 w-3.5 shrink-0 text-signal" />
                <span className="flex-1 truncate text-ledger-700 dark:text-ledger-200">{r.name}</span>
                {r.product && (
                  <Link href={`/inventory/${r.product.id}/edit`} className="font-medium text-signal hover:underline">
                    View
                  </Link>
                )}
              </li>
            ))}
            {recommendations.length === 0 && <p className="text-xs text-ledger-400">Not enough sales data yet.</p>}
          </ul>
        </div>
      </div>
    </div>
  );
}