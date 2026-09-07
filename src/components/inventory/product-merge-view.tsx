"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  GitMerge,
  Search,
  Package,
  CheckCircle2,
  AlertTriangle,
  Info,
  X,
  ArrowRight,
  ShieldCheck,
  Building2,
  TrendingUp,
  Boxes,
  Receipt,
  RotateCcw,
  Loader2,
  ChevronRight,
  Sparkles,
  Layers,
  Trash2,
  Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/currency";
import {
  searchProductsForMerge,
  previewProductMerge,
  executeProductMerge,
  type MergeProductOption,
  type MergePreviewData,
  type MergeExecutionResult
} from "@/app/(dashboard)/inventory/merge/actions";

interface ProductMergeViewProps {
  initialProducts: MergeProductOption[];
  currency?: string;
}

export function ProductMergeView({
  initialProducts,
  currency = "GHS"
}: ProductMergeViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Step 1 State: Product Selection
  const [selectedProducts, setSelectedProducts] = useState<MergeProductOption[]>(initialProducts);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MergeProductOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  // Step 2 State: Merge Preference & Options
  const [mergePreference, setMergePreference] = useState<"first" | "latest" | "manual">("first");
  const [manualMasterId, setManualMasterId] = useState<string>(initialProducts[0]?.id || "");
  const [pricingStrategy, setPricingStrategy] = useState<"keep_master" | "keep_latest" | "highest" | "lowest" | "average">("keep_master");
  const [mergeImages, setMergeImages] = useState(true);

  // Step 3 State: Preview & Execution
  const [previewData, setPreviewData] = useState<MergePreviewData | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [executionResult, setExecutionResult] = useState<MergeExecutionResult | null>(null);

  // Determine effective master product ID based on preference
  const effectiveMasterId = (() => {
    if (selectedProducts.length === 0) return "";
    if (mergePreference === "manual" && manualMasterId) {
      if (selectedProducts.some((p) => p.id === manualMasterId)) return manualMasterId;
    }
    if (mergePreference === "latest") {
      const sortedByDate = [...selectedProducts].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      return sortedByDate[0]?.id || selectedProducts[0].id;
    }
    // "first" default
    return selectedProducts[0].id;
  })();

  // Debounced live search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchProductsForMerge(searchQuery);
        // Exclude already selected products
        const selectedIds = new Set(selectedProducts.map((p) => p.id));
        setSearchResults(results.filter((p) => !selectedIds.has(p.id)));
      } catch (err) {
        console.error("Search error:", err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, selectedProducts]);

  // Update preview whenever products or master changes
  useEffect(() => {
    if (selectedProducts.length < 2) {
      setPreviewData(null);
      return;
    }

    let isMounted = true;
    setIsLoadingPreview(true);
    setError(null);

    previewProductMerge(
      selectedProducts.map((p) => p.id),
      effectiveMasterId
    )
      .then((res) => {
        if (!isMounted) return;
        if (res.ok && res.preview) {
          setPreviewData(res.preview);
        } else {
          setError(res.error || "Could not calculate merge preview.");
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.message || "Preview calculation failed.");
      })
      .finally(() => {
        if (isMounted) setIsLoadingPreview(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedProducts, effectiveMasterId]);

  function handleAddProduct(product: MergeProductOption) {
    setSelectedProducts((prev) => {
      if (prev.some((p) => p.id === product.id)) return prev;
      return [...prev, product];
    });
    setSearchQuery("");
    setShowSearchDropdown(false);
  }

  function handleRemoveProduct(productId: string) {
    setSelectedProducts((prev) => prev.filter((p) => p.id !== productId));
  }

  function handleExecuteMerge() {
    if (!previewData || selectedProducts.length < 2) return;
    setShowConfirmModal(false);

    const masterId = previewData.masterProductId;
    const secondaryIds = selectedProducts.filter((p) => p.id !== masterId).map((p) => p.id);

    startTransition(async () => {
      const res = await executeProductMerge({
        masterProductId: masterId,
        secondaryProductIds: secondaryIds,
        pricingStrategy,
        detailsOptions: {
          mergeImages,
        },
      });

      if (res.ok) {
        setExecutionResult(res);
      } else {
        setError(res.error || "Product merge failed.");
      }
    });
  }

  function handleReset() {
    setSelectedProducts([]);
    setPreviewData(null);
    setExecutionResult(null);
    setError(null);
    setSearchQuery("");
  }

  // ── Render Completion Screen ──────────────────────────────────────
  if (executionResult) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 py-4 animate-in fade-in duration-300">
        <div className="rounded-3xl border border-emerald-100 bg-white p-8 text-center shadow-card dark:border-emerald-900/60 dark:bg-ink-900">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
            <CheckCircle2 className="h-10 w-10" />
          </div>

          <h2 className="mt-4 font-display text-2xl font-bold text-ink-900 dark:text-white">
            Products Merged Successfully
          </h2>
          <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">
            Historical records, inventory balances, and transactions have been consolidated into{" "}
            <span className="font-semibold text-ink-900 dark:text-white">
              {executionResult.masterProductName}
            </span>
            .
          </p>

          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-5">
            <div className="rounded-2xl border border-ledger-100 bg-ledger-50/50 p-4 dark:border-ledger-700/60 dark:bg-white/[0.02]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ledger-400">Merged</span>
              <p className="mt-1 text-xl font-bold text-ink-900 dark:text-white">
                {executionResult.mergedCount} <span className="text-xs font-normal text-ledger-500">products</span>
              </p>
            </div>

            <div className="rounded-2xl border border-ledger-100 bg-ledger-50/50 p-4 dark:border-ledger-700/60 dark:bg-white/[0.02]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ledger-400">Master Retained</span>
              <p className="mt-1 text-xl font-bold text-blue-600 dark:text-blue-400">1</p>
            </div>

            <div className="rounded-2xl border border-ledger-100 bg-ledger-50/50 p-4 dark:border-ledger-700/60 dark:bg-white/[0.02]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ledger-400">Stock Pooled</span>
              <p className="mt-1 text-xl font-bold text-emerald-600 dark:text-emerald-400">
                {executionResult.consolidatedStock?.toLocaleString()} <span className="text-xs font-normal text-ledger-500">units</span>
              </p>
            </div>

            <div className="rounded-2xl border border-ledger-100 bg-ledger-50/50 p-4 dark:border-ledger-700/60 dark:bg-white/[0.02]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ledger-400">Transferred</span>
              <p className="mt-1 text-xl font-bold text-ink-900 dark:text-white">
                {executionResult.recordsTransferred?.toLocaleString()} <span className="text-xs font-normal text-ledger-500">records</span>
              </p>
            </div>

            <div className="rounded-2xl border border-ledger-100 bg-ledger-50/50 p-4 dark:border-ledger-700/60 dark:bg-white/[0.02]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ledger-400">Data Loss</span>
              <p className="mt-1 text-xl font-bold text-emerald-600 dark:text-emerald-400">0</p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href={`/inventory/${executionResult.masterProductId}`}>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                View Master Product & Ledger
              </Button>
            </Link>
            <Button variant="outline" onClick={handleReset}>
              Merge More Products
            </Button>
            <Link href="/inventory">
              <Button variant="ghost">Return to All Products</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const masterProd = selectedProducts.find((p) => p.id === effectiveMasterId);
  const secondaryProds = selectedProducts.filter((p) => p.id !== effectiveMasterId);

  return (
    <div className="space-y-6 text-xs max-w-6xl mx-auto pb-12">
      {/* ── Page Header ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-ledger-400 mb-1">
            <Link href="/inventory" className="hover:text-ink-900 dark:hover:text-white">Inventory</Link>
            <ChevronRight className="h-3 w-3" />
            <Link href="/inventory" className="hover:text-ink-900 dark:hover:text-white">Products</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-ink-900 dark:text-white font-semibold">Merge Products</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-ink-900 dark:text-white">Merge Products</h1>
          <p className="text-sm text-ledger-500 dark:text-ledger-400">
            Combine duplicate products or merge products based on your company preferences.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/inventory">
            <Button variant="outline">Back to Products</Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Info Notice Callout ─────────────────────────────────── */}
      <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-xs text-blue-900 shadow-sm dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
        <Info className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
        <p className="leading-relaxed">
          Merging products will keep the main product and combine the stock, price, and details from the selected products.
          All historical sales, purchases, transfers, adjustments, and accounting records will be permanently transferred to the master product.
        </p>
      </div>

      {/* ── STEP 1: Select Products to Merge ──────────────────────── */}
      <div className="rounded-2xl border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white font-bold text-xs">
            1
          </div>
          <h2 className="font-display text-sm font-bold text-ink-900 dark:text-white">
            Select Products to Merge
          </h2>
        </div>

        {/* Search Bar with Autocomplete Dropdown */}
        <div className="relative">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ledger-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSearchDropdown(true);
              }}
              onFocus={() => setShowSearchDropdown(true)}
              placeholder="Search by product name, SKU, or barcode…"
              className="h-11 w-full rounded-xl border border-ledger-200 bg-white pl-10 pr-10 text-xs font-medium text-ink-900 placeholder:text-ledger-400 focus:border-blue-500 focus:outline-none dark:border-ledger-700 dark:bg-ink-800 dark:text-white"
            />
            {isSearching && (
              <Loader2 className="absolute right-3.5 h-4 w-4 animate-spin text-ledger-400" />
            )}
          </div>

          {/* Search Dropdown Results */}
          {showSearchDropdown && searchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-12 z-20 max-h-64 overflow-y-auto rounded-xl border border-ledger-100 bg-white p-1.5 shadow-xl dark:border-ledger-700 dark:bg-ink-800">
              {searchResults.map((prod) => (
                <button
                  key={prod.id}
                  type="button"
                  onClick={() => handleAddProduct(prod)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg p-2.5 text-left transition hover:bg-blue-50 dark:hover:bg-white/[0.04]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-ledger-100 bg-ledger-50 text-ledger-400 dark:border-ledger-700 dark:bg-ink-900">
                      {prod.imageUrl ? (
                        <Image src={prod.imageUrl} alt={prod.name} fill className="object-cover" unoptimized />
                      ) : (
                        <Package className="h-4 w-4" />
                      )}
                    </div>
                    <div className="truncate">
                      <p className="truncate font-semibold text-ink-900 dark:text-white">{prod.name}</p>
                      <p className="font-mono text-[11px] text-ledger-400">{prod.sku}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-right">
                    <span className="font-medium text-ledger-500">{prod.stockQuantity} in stock</span>
                    <span className="font-bold text-ink-900 dark:text-white">{formatMoney(prod.unitPrice, currency)}</span>
                    <Plus className="h-4 w-4 text-blue-600" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected Products Chips */}
        {selectedProducts.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-ink-900 dark:text-white text-xs">
                Selected ({selectedProducts.length}):
              </span>
              {selectedProducts.map((p) => (
                <span
                  key={p.id}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold shadow-sm transition ${
                    p.id === effectiveMasterId
                      ? "bg-blue-600 text-white"
                      : "bg-ledger-100 text-ink-900 dark:bg-ledger-800 dark:text-white"
                  }`}
                >
                  <span>{p.name}</span>
                  <span className="font-mono opacity-70">({p.sku})</span>
                  {p.id === effectiveMasterId && (
                    <span className="rounded bg-white/20 px-1 py-0.2 text-[9px] uppercase font-bold">Master</span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveProduct(p.id)}
                    className="hover:opacity-75"
                    aria-label={`Remove ${p.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>

            {/* Selected Products Comparison Table */}
            <div className="overflow-x-auto rounded-xl border border-ledger-100 bg-white dark:border-ledger-700 dark:bg-ink-900">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-ledger-100 bg-ledger-50/70 text-[11px] font-semibold text-ledger-500 dark:border-ledger-700 dark:bg-white/[0.02]">
                  <tr>
                    <th className="px-3 py-2.5">Product Name</th>
                    <th className="px-3 py-2.5">SKU</th>
                    <th className="px-3 py-2.5">Category</th>
                    <th className="px-3 py-2.5">Brand</th>
                    <th className="px-3 py-2.5 text-right">Price</th>
                    <th className="px-3 py-2.5 text-right">Stock</th>
                    <th className="px-3 py-2.5">Locations</th>
                    <th className="px-3 py-2.5 text-center">Master</th>
                    <th className="w-10 px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-ledger-100 dark:divide-ledger-800">
                  {selectedProducts.map((p) => {
                    const isMaster = p.id === effectiveMasterId;
                    return (
                      <tr
                        key={p.id}
                        className={`transition ${isMaster ? "bg-blue-50/40 dark:bg-blue-950/20" : ""}`}
                      >
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-ledger-100 bg-white text-ledger-400 dark:border-ledger-700 dark:bg-ink-900">
                              {p.imageUrl ? (
                                <Image src={p.imageUrl} alt={p.name} fill className="object-cover" unoptimized />
                              ) : (
                                <Package className="h-4 w-4" />
                              )}
                            </div>
                            <span className="font-semibold text-ink-900 dark:text-white">{p.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-ledger-500 dark:text-ledger-400">{p.sku}</td>
                        <td className="px-3 py-2.5 text-ledger-600 dark:text-ledger-300">{p.category || "—"}</td>
                        <td className="px-3 py-2.5 text-ledger-600 dark:text-ledger-300">{p.brand || "—"}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-ink-900 dark:text-white">
                          {formatMoney(p.unitPrice, currency)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-ink-900 dark:text-white">{p.stockQuantity}</td>
                        <td className="px-3 py-2.5 text-ledger-600 dark:text-ledger-300">
                          {p.locations.length > 0 ? p.locations.map((l) => l.name).join(", ") : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <input
                            type="radio"
                            name="masterSelector"
                            checked={isMaster}
                            onChange={() => {
                              setMergePreference("manual");
                              setManualMasterId(p.id);
                            }}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveProduct(p.id)}
                            className="text-ledger-400 hover:text-rose-600 dark:hover:text-rose-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {selectedProducts.length < 2 && (
          <p className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
            Please search and select at least 2 products to compare and merge.
          </p>
        )}
      </div>

      {/* ── STEP 2: Choose Merge Preference ──────────────────────── */}
      {selectedProducts.length >= 2 && (
        <div className="rounded-2xl border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900 space-y-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white font-bold text-xs">
              2
            </div>
            <h2 className="font-display text-sm font-bold text-ink-900 dark:text-white">
              Choose Merge Preference
            </h2>
          </div>

          {/* Merge Preference Radio Options */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label
              className={`flex cursor-pointer flex-col justify-between rounded-xl border p-4 transition ${
                mergePreference === "first"
                  ? "border-blue-600 bg-blue-50/40 dark:border-blue-500 dark:bg-blue-950/20"
                  : "border-ledger-200 hover:border-ledger-300 dark:border-ledger-700"
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="mergePref"
                  checked={mergePreference === "first"}
                  onChange={() => setMergePreference("first")}
                  className="mt-0.5 h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="flex items-center gap-1.5 font-bold text-ink-900 dark:text-white">
                    <span>Keep First Product</span>
                    <span className="rounded bg-blue-100 px-1.5 py-0.2 text-[10px] text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                      Recommended
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">
                    The first selected product will be kept as the main product. Others will be merged into it.
                  </p>
                </div>
              </div>
            </label>

            <label
              className={`flex cursor-pointer flex-col justify-between rounded-xl border p-4 transition ${
                mergePreference === "latest"
                  ? "border-blue-600 bg-blue-50/40 dark:border-blue-500 dark:bg-blue-950/20"
                  : "border-ledger-200 hover:border-ledger-300 dark:border-ledger-700"
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="mergePref"
                  checked={mergePreference === "latest"}
                  onChange={() => setMergePreference("latest")}
                  className="mt-0.5 h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="font-bold text-ink-900 dark:text-white">Keep Latest Product</span>
                  <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">
                    The most recently added product will be kept as the main product.
                  </p>
                </div>
              </div>
            </label>

            <label
              className={`flex cursor-pointer flex-col justify-between rounded-xl border p-4 transition ${
                mergePreference === "manual"
                  ? "border-blue-600 bg-blue-50/40 dark:border-blue-500 dark:bg-blue-950/20"
                  : "border-ledger-200 hover:border-ledger-300 dark:border-ledger-700"
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="mergePref"
                  checked={mergePreference === "manual"}
                  onChange={() => setMergePreference("manual")}
                  className="mt-0.5 h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="font-bold text-ink-900 dark:text-white">Choose Main Product Manually</span>
                  <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">
                    Select which product to keep as the main product from the list above.
                  </p>
                </div>
              </div>
            </label>
          </div>

          {/* Pricing Strategy & Product Details */}
          <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2 border-t border-ledger-100 dark:border-ledger-800">
            <div>
              <label className="block text-xs font-semibold text-ink-900 dark:text-white mb-1.5">
                Pricing Strategy
              </label>
              <select
                value={pricingStrategy}
                onChange={(e: any) => setPricingStrategy(e.target.value)}
                className="h-10 w-full rounded-xl border border-ledger-200 bg-white px-3 text-xs font-medium text-ink-900 focus:border-blue-500 focus:outline-none dark:border-ledger-700 dark:bg-ink-800 dark:text-white"
              >
                <option value="keep_master">Keep Master Product Price</option>
                <option value="keep_latest">Keep Latest Price</option>
                <option value="highest">Highest Price</option>
                <option value="lowest">Lowest Price</option>
                <option value="average">Average Price</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-ink-900 dark:text-white mb-1.5">
                Product Details
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-ink-900 dark:text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={mergeImages}
                  onChange={(e) => setMergeImages(e.target.checked)}
                  className="h-4 w-4 rounded border-ledger-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Consolidate and retain product images from all selected products</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 3: Review and Merge ─────────────────────────────── */}
      {selectedProducts.length >= 2 && previewData && (
        <div className="rounded-2xl border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white font-bold text-xs">
                3
              </div>
              <h2 className="font-display text-sm font-bold text-ink-900 dark:text-white">
                Review and Merge
              </h2>
            </div>
            {isLoadingPreview && (
              <div className="flex items-center gap-1.5 text-xs text-ledger-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                Calculating preview...
              </div>
            )}
          </div>

          {/* Master vs Merged Side-by-Side */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Main Product Card */}
            <div className="rounded-2xl border-2 border-blue-500 bg-blue-50/20 p-4 dark:border-blue-600 dark:bg-blue-950/20 space-y-3">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  Main Product (Will be kept)
                </span>
                <span className="font-mono text-xs font-semibold text-blue-700 dark:text-blue-300">
                  {masterProd?.sku}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-blue-200 bg-white dark:border-blue-900 dark:bg-ink-900">
                  {masterProd?.imageUrl ? (
                    <Image src={masterProd.imageUrl} alt={masterProd.name} fill className="object-cover" unoptimized />
                  ) : (
                    <Package className="h-6 w-6 text-blue-600" />
                  )}
                </div>
                <div>
                  <h4 className="font-display text-sm font-bold text-ink-900 dark:text-white">{masterProd?.name}</h4>
                  <p className="text-xs text-ledger-500 dark:text-ledger-400">
                    {masterProd?.category || "Uncategorized"} · {masterProd?.brand || "Generic"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-blue-100 dark:border-blue-900/50">
                <div>
                  <span className="text-[11px] text-ledger-500">Resulting Selling Price:</span>
                  <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    {formatMoney(previewData.priceOutcomes[pricingStrategy]?.price ?? masterProd?.unitPrice ?? 0, currency)}
                  </p>
                </div>
                <div>
                  <span className="text-[11px] text-ledger-500">Total Stock After Merge:</span>
                  <p className="text-sm font-bold text-ink-900 dark:text-white">
                    {previewData.totalStockAfterMerge} units
                  </p>
                </div>
              </div>
            </div>

            {/* Products to Merge Card */}
            <div className="rounded-2xl border border-ledger-200 bg-ledger-50/50 p-4 dark:border-ledger-700 dark:bg-white/[0.02] space-y-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-ledger-200 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ledger-700 dark:bg-ledger-800 dark:text-ledger-300">
                Products to Merge ({secondaryProds.length})
              </span>

              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {secondaryProds.map((sec) => (
                  <div
                    key={sec.id}
                    className="flex items-center justify-between rounded-xl border border-ledger-100 bg-white p-2.5 dark:border-ledger-700/60 dark:bg-ink-900"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-ledger-100 bg-ledger-50 text-ledger-400 dark:border-ledger-700 dark:bg-ink-800">
                        {sec.imageUrl ? (
                          <Image src={sec.imageUrl} alt={sec.name} fill className="object-cover" unoptimized />
                        ) : (
                          <Package className="h-4 w-4" />
                        )}
                      </div>
                      <div className="truncate">
                        <p className="truncate font-semibold text-ink-900 dark:text-white">{sec.name}</p>
                        <p className="font-mono text-[11px] text-ledger-400">{sec.sku}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-ink-900 dark:text-white">{sec.stockQuantity} units</p>
                      <p className="text-[11px] text-ledger-400">{formatMoney(sec.unitPrice, currency)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Merge Impact Metrics */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-ledger-100 bg-ledger-50/50 p-3 dark:border-ledger-700 dark:bg-white/[0.02]">
              <span className="text-[11px] text-ledger-500">Consolidated Stock</span>
              <p className="mt-1 text-base font-bold text-emerald-600 dark:text-emerald-400">
                {previewData.totalStockAfterMerge} units
              </p>
            </div>

            <div className="rounded-xl border border-ledger-100 bg-ledger-50/50 p-3 dark:border-ledger-700 dark:bg-white/[0.02]">
              <span className="text-[11px] text-ledger-500">Transactions to Transfer</span>
              <p className="mt-1 text-base font-bold text-blue-600 dark:text-blue-400">
                {previewData.transactionsToTransfer.total} records
              </p>
            </div>

            <div className="rounded-xl border border-ledger-100 bg-ledger-50/50 p-3 dark:border-ledger-700 dark:bg-white/[0.02]">
              <span className="text-[11px] text-ledger-500">Locations Affected</span>
              <p className="mt-1 text-base font-bold text-ink-900 dark:text-white">
                {previewData.locationsAffected.length} branches
              </p>
            </div>

            <div className="rounded-xl border border-ledger-100 bg-ledger-50/50 p-3 dark:border-ledger-700 dark:bg-white/[0.02]">
              <span className="text-[11px] text-ledger-500">Price Outcome</span>
              <p className="mt-1 text-base font-bold text-ink-900 dark:text-white">
                {formatMoney(previewData.priceOutcomes[pricingStrategy]?.price ?? 0, currency)}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 border-t border-ledger-100 pt-4 dark:border-ledger-700">
            <Link href="/inventory">
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Link>
            <Button
              type="button"
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => setShowConfirmModal(true)}
              disabled={isPending || isLoadingPreview}
            >
              <GitMerge className="mr-2 h-4 w-4" />
              Merge Products
            </Button>
          </div>
        </div>
      )}

      {/* ── Confirmation Modal ────────────────────────────────────── */}
      {showConfirmModal && previewData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl border border-ledger-100 bg-white p-6 shadow-2xl dark:border-ledger-700 dark:bg-ink-900">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400 mx-auto">
              <GitMerge className="h-6 w-6" />
            </div>

            <h3 className="mt-4 text-center font-display text-lg font-bold text-ink-900 dark:text-white">
              Confirm Product Merge
            </h3>

            <p className="mt-2 text-center text-xs leading-relaxed text-ledger-500 dark:text-ledger-400">
              Are you sure you want to merge <span className="font-semibold text-ink-900 dark:text-white">{secondaryProds.length} products</span> into{" "}
              <span className="font-semibold text-blue-600 dark:text-blue-400">{masterProd?.name}</span>?
            </p>

            <div className="mt-4 rounded-xl border border-ledger-100 bg-ledger-50/60 p-3 text-xs space-y-1.5 dark:border-ledger-800 dark:bg-white/[0.02]">
              <div className="flex justify-between">
                <span className="text-ledger-500">Consolidated stock:</span>
                <span className="font-bold text-ink-900 dark:text-white">{previewData.totalStockAfterMerge} units</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ledger-500">Transferred records:</span>
                <span className="font-bold text-blue-600 dark:text-blue-400">{previewData.transactionsToTransfer.total}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ledger-500">Status update:</span>
                <span className="font-semibold text-amber-600">Secondary products marked 'merged'</span>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowConfirmModal(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleExecuteMerge}
                disabled={isPending}
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Merging...
                  </>
                ) : (
                  "Confirm & Merge"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
