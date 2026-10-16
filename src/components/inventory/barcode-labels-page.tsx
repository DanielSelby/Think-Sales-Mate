"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Barcode,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  Loader2,
  Printer,
  RotateCcw,
  Search,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BarcodeGraphic } from "@/components/inventory/barcode-graphic";
import { assignBarcodeToProduct } from "@/app/(dashboard)/inventory/actions";
import { formatMoney } from "@/lib/currency";

export interface BarcodeLabelProduct {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  category: string | null;
  brand: string | null;
  locationId: string | null;
  locationName: string | null;
  sellingPrice: number;
  stockQuantity: number;
  lowStockThreshold: number;
  stockLevels: { locationId: string; quantity: number }[];
  isActive: boolean;
  imageUrl: string | null;
}

export interface BarcodeLabelLocation {
  id: string;
  name: string;
}

type LabelSettings = {
  labelSize: "40x30" | "50x30" | "60x40";
  pageSize: "A4" | "A5" | "Letter";
  columns: number;
  rows: number;
  horizontalSpacing: number;
  verticalSpacing: number;
  margins: number;
  barcodeSize: "small" | "medium" | "large";
  fontSize: "small" | "medium" | "large";
  showName: boolean;
  showSku: boolean;
  showPrice: boolean;
  showBarcodeValue: boolean;
};

const PAGE_SIZE = 10;

function stockStatus(quantity: number, lowStockThreshold = 5): "In Stock" | "Low Stock" | "Out of Stock" {
  if (quantity <= 0) return "Out of Stock";
  if (quantity <= lowStockThreshold) return "Low Stock";
  return "In Stock";
}

function getStockQuantity(product: BarcodeLabelProduct, locationId: string) {
  if (locationId !== "all") {
    const branchStock = product.stockLevels.find((stock) => stock.locationId === locationId);
    if (branchStock) return branchStock.quantity;
    return product.locationId === locationId && product.stockLevels.length === 0 ? product.stockQuantity : 0;
  }
  return product.stockQuantity;
}

function statusClass(status: ReturnType<typeof stockStatus>) {
  if (status === "Out of Stock") return "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300";
  if (status === "Low Stock") return "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300";
  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300";
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-xs text-slate-700 dark:text-ledger-200">
      {label}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${checked ? "left-[18px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}

export function BarcodeLabelsPage({
  products,
  locations,
  currency,
  canGenerateBarcodes,
}: {
  products: BarcodeLabelProduct[];
  locations: BarcodeLabelLocation[];
  currency: string;
  canGenerateBarcodes: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [brand, setBrand] = useState("all");
  const [location, setLocation] = useState("all");
  const [stockStatusFilter, setStockStatusFilter] = useState("all");
  const [barcodeStatus, setBarcodeStatus] = useState("all");
  const [productStatus, setProductStatus] = useState("all");
  const [appliedFilters, setAppliedFilters] = useState({
    search: "",
    category: "all",
    brand: "all",
    location: "all",
    stockStatus: "all",
    barcodeStatus: "all",
    productStatus: "all",
  });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [printTargetIds, setPrintTargetIds] = useState<string[] | null>(null);
  const [copiesByProduct, setCopiesByProduct] = useState<Record<string, number>>({});
  const [generatingProductId, setGeneratingProductId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: "error" | "success"; message: string } | null>(null);
  const [settings, setSettings] = useState<LabelSettings>({
    labelSize: "40x30",
    pageSize: "A4",
    columns: 3,
    rows: 10,
    horizontalSpacing: 2,
    verticalSpacing: 2,
    margins: 5,
    barcodeSize: "medium",
    fontSize: "medium",
    showName: true,
    showSku: true,
    showPrice: true,
    showBarcodeValue: true,
  });

  const categories = useMemo(() => [...new Set(products.map((product) => product.category).filter((value): value is string => Boolean(value)))].sort(), [products]);
  const brands = useMemo(() => [...new Set(products.map((product) => product.brand).filter((value): value is string => Boolean(value)))].sort(), [products]);
  const filtered = useMemo(() => {
    const q = appliedFilters.search.trim().toLowerCase();
    return products.filter((product) => {
      if (q && !`${product.name} ${product.sku} ${product.barcode ?? ""}`.toLowerCase().includes(q)) return false;
      if (appliedFilters.category !== "all" && product.category !== appliedFilters.category) return false;
      if (appliedFilters.brand !== "all" && product.brand !== appliedFilters.brand) return false;
      if (appliedFilters.location !== "all" && product.locationId !== appliedFilters.location && !product.stockLevels.some((stock) => stock.locationId === appliedFilters.location)) return false;
      if (appliedFilters.stockStatus !== "all" && stockStatus(getStockQuantity(product, appliedFilters.location), product.lowStockThreshold) !== appliedFilters.stockStatus) return false;
      if (appliedFilters.barcodeStatus === "has" && !product.barcode?.trim()) return false;
      if (appliedFilters.barcodeStatus === "missing" && product.barcode?.trim()) return false;
      if (appliedFilters.productStatus === "active" && !product.isActive) return false;
      if (appliedFilters.productStatus === "inactive" && product.isActive) return false;
      return true;
    });
  }, [products, appliedFilters]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleProducts = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const previewProduct = products.find((product) => product.id === previewId)
    ?? products.find((product) => selected.has(product.id))
    ?? filtered[0]
    ?? null;
  const selectedProducts = products.filter((product) => selected.has(product.id));
  const labelsToPrint = selected.size ? selectedProducts : filtered;
  const printableProducts = labelsToPrint.filter((product) => product.barcode?.trim());
  const printQueue = (printTargetIds === null ? labelsToPrint : products.filter((product) => printTargetIds.includes(product.id)))
    .filter((product) => product.barcode?.trim())
    .flatMap((product) => Array.from(
      { length: copiesByProduct[product.id] ?? 1 },
      (_, copyIndex) => ({ product, copyIndex }),
    ));
  const missingBarcodeCount = labelsToPrint.length - printableProducts.length;

  function toggleProduct(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllFiltered() {
    const allSelected = filtered.length > 0 && filtered.every((product) => selected.has(product.id));
    setSelected((previous) => {
      const next = new Set(previous);
      for (const product of filtered) {
        if (allSelected) next.delete(product.id);
        else next.add(product.id);
      }
      return next;
    });
  }

  async function generateBarcode(product: BarcodeLabelProduct) {
    setGeneratingProductId(product.id);
    setActionMessage(null);
    try {
      const result = await assignBarcodeToProduct(product.id);
      if (!result.ok) {
        setActionMessage({ type: "error", message: result.error });
        return;
      }
      setActionMessage({ type: "success", message: `Barcode ${result.barcode} saved for ${product.name}.` });
      router.refresh();
    } catch (error) {
      setActionMessage({
        type: "error",
        message: error instanceof Error ? error.message : "Could not assign a barcode.",
      });
    } finally {
      setGeneratingProductId(null);
    }
  }

  function resetFilters() {
    setSearch("");
    setCategory("all");
    setBrand("all");
    setLocation("all");
    setStockStatusFilter("all");
    setBarcodeStatus("all");
    setProductStatus("all");
    setAppliedFilters({
      search: "",
      category: "all",
      brand: "all",
      location: "all",
      stockStatus: "all",
      barcodeStatus: "all",
      productStatus: "all",
    });
    setPage(1);
  }

  function printLabels(targetProducts = labelsToPrint) {
    const printThese = targetProducts.filter((product) => product.barcode?.trim());
    if (!printThese.length) {
      setActionMessage({ type: "error", message: "None of the selected products have a saved barcode to print." });
      return;
    }
    setActionMessage(null);
    const cleanup = () => {
      document.body.classList.remove("barcode-label-page-printing");
      setPrintTargetIds(null);
    };
    window.addEventListener("afterprint", cleanup, { once: true });
    setPrintTargetIds(printThese.map((product) => product.id));
    document.body.classList.add("barcode-label-page-printing");
    window.setTimeout(() => {
      try {
        window.print();
      } catch (error) {
        window.removeEventListener("afterprint", cleanup);
        cleanup();
        throw error;
      }
    }, 100);
  }

  function printSelectedLabels() {
    if (!selected.size) {
      setActionMessage({ type: "error", message: "Select at least one product before printing selected labels." });
      return;
    }
    printLabels(selectedProducts);
  }

  function updateSetting<Key extends keyof LabelSettings>(key: Key, value: LabelSettings[Key]) {
    setSettings((previous) => ({ ...previous, [key]: value }));
  }

  const inputClass = "h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-ledger-700 dark:bg-ink-900 dark:text-white dark:focus:ring-blue-950";
  const optionClass = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none dark:border-ledger-700 dark:bg-ink-900 dark:text-white";
  const labelSize = settings.labelSize.split("x").map(Number);
  const gridStyle = {
    gridTemplateColumns: `repeat(${Math.max(1, settings.columns)}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${Math.max(1, settings.rows)}, var(--label-height))`,
    columnGap: `${settings.horizontalSpacing}mm`,
    rowGap: `${settings.verticalSpacing}mm`,
    padding: `${settings.margins}mm`,
    ["--label-width" as string]: `${labelSize[0]}mm`,
    ["--label-height" as string]: `${labelSize[1]}mm`,
    ["--barcode-height" as string]: settings.barcodeSize === "small" ? "24px" : settings.barcodeSize === "large" ? "48px" : "36px",
    ["--label-font-size" as string]: settings.fontSize === "small" ? "7pt" : settings.fontSize === "large" ? "10pt" : "8pt",
  } as React.CSSProperties;

  return (
    <div className="min-h-full space-y-4 text-slate-700 dark:text-ledger-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-400"><Link href="/inventory" className="hover:text-blue-600">Products</Link><span className="mx-2">›</span>Print Barcode Labels</p>
          <div className="mt-2 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/20"><Barcode className="h-6 w-6" /></span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#12345a] dark:text-white">Print Barcode Labels</h1>
              <p className="mt-0.5 text-xs text-slate-500">Select products and print barcode labels. Filter, preview, and print multiple labels at once.</p>
            </div>
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-ledger-700 dark:bg-ink-900">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(180px,1.6fr)_repeat(5,minmax(110px,1fr))_auto_auto]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search by product name, SKU or barcode..." className={`${inputClass} w-full pl-9`} />
          </label>
          <select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }} className={optionClass}><option value="all">All Categories</option>{categories.map((value) => <option key={value}>{value}</option>)}</select>
          <select value={brand} onChange={(event) => { setBrand(event.target.value); setPage(1); }} className={optionClass}><option value="all">All Brands</option>{brands.map((value) => <option key={value}>{value}</option>)}</select>
          <select value={location} onChange={(event) => { setLocation(event.target.value); setPage(1); }} className={optionClass}><option value="all">All Branches</option>{locations.map((value) => <option key={value.id} value={value.id}>{value.name}</option>)}</select>
          <select value={stockStatusFilter} onChange={(event) => { setStockStatusFilter(event.target.value); setPage(1); }} className={optionClass}><option value="all">All Stock Status</option><option>In Stock</option><option>Low Stock</option><option>Out of Stock</option></select>
          <select value={barcodeStatus} onChange={(event) => { setBarcodeStatus(event.target.value); setPage(1); }} className={optionClass}><option value="all">All Barcodes</option><option value="has">Barcode Saved</option><option value="missing">Missing Barcode</option></select>
          <select value={productStatus} onChange={(event) => { setProductStatus(event.target.value); setPage(1); }} className={optionClass}><option value="all">All Product Status</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
          <Button type="button" variant="outline" size="sm" onClick={resetFilters} className="h-9 gap-1.5"><RotateCcw className="h-3.5 w-3.5" />Reset</Button>
          <Button type="button" size="sm" onClick={() => { setAppliedFilters({ search, category, brand, location, stockStatus: stockStatusFilter, barcodeStatus, productStatus }); setPage(1); }} className="h-9 gap-1.5 bg-blue-600 text-white hover:bg-blue-700"><Filter className="h-3.5 w-3.5" />Apply Filters</Button>
        </div>
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-ledger-700 dark:bg-ink-900">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-3 dark:border-ledger-700">
            <div className="flex items-center gap-3 text-xs">
              <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={filtered.length > 0 && filtered.every((product) => selected.has(product.id))} onChange={toggleAllFiltered} className="h-4 w-4 rounded accent-blue-600" />Select All ({selected.size} selected)</label>
              <button type="button" onClick={() => setSelected(new Set())} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">Deselect All</button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" onClick={printSelectedLabels} className="h-8 gap-1.5 bg-blue-600 text-white hover:bg-blue-700"><Printer className="h-3.5 w-3.5" />Print Selected Labels</Button>
              <Button type="button" variant="outline" size="sm" disabled={!filtered.length || !filtered.some((product) => product.barcode?.trim())} onClick={() => printLabels(filtered)} className="h-8 gap-1.5"><Printer className="h-3.5 w-3.5" />Print All Filtered Labels</Button>
              <Button type="button" variant="outline" size="sm" disabled={!printableProducts.length} onClick={() => printLabels(labelsToPrint)} className="h-8 gap-1.5"><Printer className="h-3.5 w-3.5" />Download PDF</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById("label-settings")?.scrollIntoView({ behavior: "smooth", block: "center" })} className="h-8 gap-1.5"><Settings2 className="h-3.5 w-3.5" />Label Settings</Button>
            </div>
          </div>

          {actionMessage && <p role="status" className={`border-b px-3 py-2 text-xs ${actionMessage.type === "error" ? "border-rose-100 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200" : "border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"}`}>{actionMessage.message}</p>}
          {missingBarcodeCount > 0 && <p className="border-b border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{missingBarcodeCount} selected product(s) have no saved barcode and will be skipped when printing.</p>}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-white/[0.04] dark:text-ledger-400">
                <tr>
                  <th className="w-9 px-3 py-3"><span className="sr-only">Select</span></th>
                  <th className="px-2 py-3">Image</th><th className="px-2 py-3">Product Name</th><th className="px-2 py-3">SKU</th><th className="px-2 py-3">Barcode</th><th className="px-2 py-3">Category</th><th className="px-2 py-3 text-right">Selling Price</th><th className="px-2 py-3 text-right">Stock Qty</th><th className="px-2 py-3">Status</th><th className="px-2 py-3">Label Preview</th><th className="px-3 py-3 text-right">Copies / Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-ledger-700">
                {visibleProducts.map((product) => {
                  const rowStockQuantity = getStockQuantity(product, appliedFilters.location);
                  const status = stockStatus(rowStockQuantity, product.lowStockThreshold);
                  return (
                    <tr key={product.id} onClick={() => setPreviewId(product.id)} className={`cursor-pointer transition hover:bg-blue-50/50 dark:hover:bg-white/[0.03] ${previewId === product.id ? "bg-blue-50/60 dark:bg-blue-950/20" : ""}`}>
                      <td className="px-3 py-2.5" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selected.has(product.id)} onChange={() => toggleProduct(product.id)} aria-label={`Select ${product.name}`} className="h-4 w-4 rounded accent-blue-600" /></td>
                      <td className="px-2 py-2.5">{product.imageUrl ? <Image src={product.imageUrl} alt="" width={40} height={40} unoptimized className="h-10 w-10 rounded-lg border border-slate-100 object-cover dark:border-ledger-700" /> : <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-slate-400 dark:bg-white/[0.04]"><Barcode className="h-5 w-5" /></span>}</td>
                      <td className="max-w-40 px-2 py-2.5 font-medium text-slate-800 dark:text-white">{product.name}</td>
                      <td className="px-2 py-2.5 font-mono text-slate-500">{product.sku || "—"}</td>
                      <td className="px-2 py-2.5 font-mono text-slate-500">{product.barcode || <span className="text-amber-600">Missing</span>}</td>
                      <td className="px-2 py-2.5 text-slate-500">{product.category || "—"}</td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right font-medium">{formatMoney(product.sellingPrice, currency)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{rowStockQuantity}</td>
                      <td className="px-2 py-2.5"><span className={`whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-semibold ${!product.isActive ? "bg-slate-100 text-slate-500 dark:bg-white/[0.06]" : statusClass(status)}`}>{product.isActive ? status : "Inactive"}</span></td>
                      <td className="px-2 py-2.5"><div className="w-28 rounded-md border border-slate-100 bg-white px-2 py-1 text-center dark:border-ledger-700"><span className="block truncate text-[8px] font-semibold text-slate-700">{settings.showName ? product.name : ""}</span>{product.barcode ? <BarcodeGraphic value={product.barcode} className="my-0 h-5 w-full" /> : <span className="text-[8px] text-amber-700">No barcode</span>}<span className="block truncate font-mono text-[7px] text-slate-500">{settings.showSku ? product.sku : ""}{settings.showBarcodeValue ? ` · ${product.barcode ?? ""}` : ""}{settings.showPrice ? ` · ${formatMoney(product.sellingPrice, currency)}` : ""}</span></div></td>
                      <td className="px-3 py-2.5 text-right" onClick={(event) => event.stopPropagation()}>
                        <div className="flex flex-col items-end gap-1.5">
                          <label className="flex items-center gap-1 text-[10px] text-slate-500">Copies<input type="number" min={1} max={500} value={copiesByProduct[product.id] ?? 1} onChange={(event) => setCopiesByProduct((current) => ({ ...current, [product.id]: Math.max(1, Math.min(500, Number(event.target.value) || 1)) }))} className="h-7 w-14 rounded border border-slate-200 px-1 text-center text-xs dark:border-ledger-700 dark:bg-ink-900" aria-label={`Copies for ${product.name}`} /></label>
                          <div className="inline-flex items-center gap-1">
                            <Button type="button" variant="outline" size="sm" onClick={() => setPreviewId(product.id)} className="h-7 gap-1 px-2 text-[10px]"><Eye className="h-3 w-3" />Preview</Button>
                            {product.barcode ? <Button type="button" variant="outline" size="sm" onClick={() => { setSelected(new Set([product.id])); setPreviewId(product.id); printLabels([product]); }} className="h-7 gap-1 px-2 text-[10px]"><Printer className="h-3 w-3" />Print</Button>
                              : canGenerateBarcodes && <Button type="button" variant="outline" size="sm" disabled={generatingProductId === product.id} onClick={() => void generateBarcode(product)} className="h-7 gap-1 px-2 text-[10px]">{generatingProductId === product.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Barcode className="h-3 w-3" />}Generate</Button>}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {visibleProducts.length === 0 && <tr><td colSpan={11} className="px-4 py-12 text-center text-sm text-slate-400">No products match these filters.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-3 text-xs text-slate-500 dark:border-ledger-700">
            <span>Showing {filtered.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} products</span>
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Previous page" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 disabled:opacity-40 dark:border-ledger-700"><ChevronLeft className="h-4 w-4" /></button>
              <span className="rounded bg-blue-600 px-2.5 py-1.5 font-semibold text-white">{currentPage}</span>
              <span className="px-1">of {pageCount}</span>
              <button type="button" aria-label="Next page" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 disabled:opacity-40 dark:border-ledger-700"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        </section>

        <aside className="space-y-3 xl:sticky xl:top-4">
          <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-ledger-700 dark:bg-ink-900">
            <h2 className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-white"><Eye className="h-4 w-4 text-blue-600" />Label Preview</h2>
            {previewProduct ? (
              <div className={`mt-3 rounded-lg border border-slate-200 bg-white p-4 text-center dark:border-ledger-700 ${settings.fontSize === "small" ? "text-[10px]" : settings.fontSize === "large" ? "text-sm" : "text-xs"}`}>
                {settings.showName && <p className="truncate font-bold text-slate-800">{previewProduct.name}</p>}
                {settings.showSku && <p className="mt-0.5 text-[0.7em] text-slate-500">{previewProduct.sku}</p>}
                {previewProduct.barcode ? <BarcodeGraphic value={previewProduct.barcode} className={settings.barcodeSize === "small" ? "h-7" : settings.barcodeSize === "large" ? "h-14" : "h-10"} /> : <p className="my-3 rounded bg-amber-50 p-2 text-[10px] text-amber-800">This product has no barcode saved.</p>}
                {settings.showBarcodeValue && <p className="font-mono text-[9px] text-slate-500">{previewProduct.barcode}</p>}
                {settings.showPrice && <p className="mt-1 text-sm font-bold text-blue-700">{formatMoney(previewProduct.sellingPrice, currency)}</p>}
              </div>
            ) : <p className="mt-3 rounded-lg bg-slate-50 p-4 text-center text-xs text-slate-400 dark:bg-white/[0.04]">Select a product to preview its label.</p>}
          </section>

          <section id="label-settings" className="scroll-mt-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-ledger-700 dark:bg-ink-900">
            <h2 className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-white"><Settings2 className="h-4 w-4 text-blue-600" />Label Settings</h2>
            <div className="mt-3 space-y-3 text-[10px]">
              <label className="block space-y-1 text-slate-500">Label Size<select value={settings.labelSize} onChange={(event) => updateSetting("labelSize", event.target.value as LabelSettings["labelSize"])} className={`${optionClass} w-full`}><option value="40x30">40mm × 30mm (Standard)</option><option value="50x30">50mm × 30mm</option><option value="60x40">60mm × 40mm</option></select></label>
              <label className="block space-y-1 text-slate-500">Page Size<select value={settings.pageSize} onChange={(event) => updateSetting("pageSize", event.target.value as LabelSettings["pageSize"])} className={`${optionClass} w-full`}><option>A4</option><option>A5</option><option>Letter</option></select></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 text-slate-500">Columns<input type="number" min={1} max={6} value={settings.columns} onChange={(event) => updateSetting("columns", Math.max(1, Math.min(6, Number(event.target.value) || 1)))} className={`${inputClass} w-full`} /></label>
                <label className="space-y-1 text-slate-500">Rows<input type="number" min={1} max={30} value={settings.rows} onChange={(event) => updateSetting("rows", Math.max(1, Math.min(30, Number(event.target.value) || 1)))} className={`${inputClass} w-full`} /></label>
                <label className="space-y-1 text-slate-500">Horizontal Spacing (mm)<input type="number" min={0} max={20} value={settings.horizontalSpacing} onChange={(event) => updateSetting("horizontalSpacing", Math.max(0, Number(event.target.value) || 0))} className={`${inputClass} w-full`} /></label>
                <label className="space-y-1 text-slate-500">Vertical Spacing (mm)<input type="number" min={0} max={20} value={settings.verticalSpacing} onChange={(event) => updateSetting("verticalSpacing", Math.max(0, Number(event.target.value) || 0))} className={`${inputClass} w-full`} /></label>
                <label className="space-y-1 text-slate-500">Margins (mm)<input type="number" min={0} max={30} value={settings.margins} onChange={(event) => updateSetting("margins", Math.max(0, Number(event.target.value) || 0))} className={`${inputClass} w-full`} /></label>
                <label className="space-y-1 text-slate-500">Barcode Size<select value={settings.barcodeSize} onChange={(event) => updateSetting("barcodeSize", event.target.value as LabelSettings["barcodeSize"])} className={`${optionClass} w-full`}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></label>
                <label className="space-y-1 text-slate-500">Font Size<select value={settings.fontSize} onChange={(event) => updateSetting("fontSize", event.target.value as LabelSettings["fontSize"])} className={`${optionClass} w-full`}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></label>
              </div>
              <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-ledger-700">
                <Toggle label="Show Product Name" checked={settings.showName} onChange={(value) => updateSetting("showName", value)} />
                <Toggle label="Show SKU" checked={settings.showSku} onChange={(value) => updateSetting("showSku", value)} />
                <Toggle label="Show Price" checked={settings.showPrice} onChange={(value) => updateSetting("showPrice", value)} />
                <Toggle label="Show Barcode Value" checked={settings.showBarcodeValue} onChange={(value) => updateSetting("showBarcodeValue", value)} />
              </div>
            </div>
          </section>

          <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-[10px] leading-relaxed text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /><p>Preview your label before printing. Make sure your printer settings match the selected page size.</p>
          </div>
        </aside>
      </div>

      <div className="barcode-label-print-area barcode-label-page-print-area" aria-hidden="true" style={gridStyle}>
        <style media="print">{`@page { size: ${settings.pageSize}; margin: 0; }`}</style>
        {printQueue.map(({ product, copyIndex }) => (
          <div key={`${product.id}-${copyIndex}`} className="barcode-label barcode-label-page-item">
            {settings.showName && <p className="barcode-label-name">{product.name}</p>}
            {settings.showSku && <p className="barcode-label-sku">SKU: {product.sku}</p>}
            <BarcodeGraphic value={product.barcode ?? ""} />
            {settings.showBarcodeValue && <p className="barcode-label-value">{product.barcode}</p>}
            {settings.showPrice && <p className="barcode-label-price">{formatMoney(product.sellingPrice, currency)}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
