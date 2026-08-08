"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  Minus,
  Plus,
  Trash2,
  ArrowRight,
  Building2,
  Warehouse,
  Store,
  Truck,
  Info,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Package2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createStockTransfer } from "@/app/(dashboard)/inventory/transfers/actions";
import { TransferStatusBadge } from "@/components/inventory/transfer-status-badge";
import type { TransferStatus, LocationType } from "@/types/database";

export interface TransferLocation {
  id: string;
  name: string;
  type: LocationType;
}

export interface TransferableProduct {
  id: string;
  sku: string;
  name: string;
  unitCost: number;
}

export interface StockLevel {
  productId: string;
  locationId: string;
  quantity: number;
}

export interface RecentTransferSummary {
  id: string;
  label: string;
  fromName: string;
  toName: string;
  status: TransferStatus;
}

interface LineItem {
  productId: string;
  quantity: number;
}

const REASONS = ["Replenishment", "Restock", "Emergency transfer", "Return to warehouse", "Other"];
const DRAFT_KEY = "salesmate:stock-transfer-draft";

const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  warehouse: "Warehouse",
  branch: "Branch",
  store: "Store",
  distribution_center: "Distribution Center",
  mobile_van: "Mobile Sales Van"
};

const LOCATION_TYPE_ICONS: Record<LocationType, typeof Building2> = {
  warehouse: Warehouse,
  branch: Building2,
  store: Store,
  distribution_center: Building2,
  mobile_van: Truck
};

function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function suggestedReference() {
  const d = new Date();
  const y = d.getFullYear();
  const seq = String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
  return `TRF-${y}-${seq}`;
}

function StepBadge({ index, label, status }: { index: number; label: string; status: "done" | "current" | "upcoming" }) {
  return (
    <div className="flex items-center gap-2">
      {status === "done" ? (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-signal text-white">
          <CheckCircle2 className="h-4 w-4" />
        </span>
      ) : (
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            status === "current" ? "bg-signal text-white" : "bg-ledger-100 text-ledger-400 dark:bg-white/[0.06]"
          )}
        >
          {index}
        </span>
      )}
      <span
        className={cn(
          "text-sm font-medium",
          status === "upcoming" ? "text-ledger-400" : "text-ink-900 dark:text-white"
        )}
      >
        {label}
      </span>
    </div>
  );
}

export function StockTransferForm({
  locations,
  products,
  stockLevels,
  recentTransfers,
  currentUserEmail
}: {
  locations: TransferLocation[];
  products: TransferableProduct[];
  stockLevels: StockLevel[];
  recentTransfers: RecentTransferSummary[];
  currentUserEmail: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [transferDate, setTransferDate] = useState(todayIso());
  const [referenceNo, setReferenceNo] = useState(suggestedReference());
  const [fromLocationId, setFromLocationId] = useState(() => {
    const fromParam = searchParams.get("from");
    return fromParam && locations.some((l) => l.id === fromParam) ? fromParam : locations[0]?.id ?? "";
  });
  const [toLocationId, setToLocationId] = useState(() => {
    const toParam = searchParams.get("to");
    return toParam && locations.some((l) => l.id === toParam) ? toParam : locations[1]?.id ?? "";
  });
  const [reason, setReason] = useState(() => {
    const reasonParam = searchParams.get("reason");
    return reasonParam && REASONS.includes(reasonParam) ? reasonParam : REASONS[0];
  });
  const [notes, setNotes] = useState("");
  const [shippingCharges, setShippingCharges] = useState(0);

  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<LineItem[]>([]);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // Restore a locally-saved draft on first load, if one exists. Drafts are
  // browser-only — creating a real transfer moves real stock the instant
  // it's confirmed (see the migration's trigger), so a "draft" must never
  // touch the database.
  useEffect(() => {
    // Arriving here via "Duplicate" (a `from` param in the URL) means the
    // person explicitly chose this route/reason just now — don't let a
    // stale saved draft silently overwrite that.
    if (searchParams.get("from")) return;
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.lines?.length) setLines(draft.lines);
      if (draft.referenceNo) setReferenceNo(draft.referenceNo);
      if (draft.fromLocationId) setFromLocationId(draft.fromLocationId);
      if (draft.toLocationId) setToLocationId(draft.toLocationId);
      if (draft.reason) setReason(draft.reason);
      if (draft.notes) setNotes(draft.notes);
      if (draft.shippingCharges) setShippingCharges(draft.shippingCharges);
    } catch {
      // ignore malformed/missing draft
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fromLocation = locations.find((l) => l.id === fromLocationId);
  const toLocation = locations.find((l) => l.id === toLocationId);

  const stockMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of stockLevels) map.set(`${s.productId}:${s.locationId}`, s.quantity);
    return map;
  }, [stockLevels]);

  function availableAt(productId: string, locationId: string) {
    return stockMap.get(`${productId}:${locationId}`) ?? 0;
  }

  function locationInventoryValue(locationId: string) {
    let total = 0;
    for (const s of stockLevels) {
      if (s.locationId !== locationId) continue;
      const product = productById.get(s.productId);
      if (product) total += product.unitCost * s.quantity;
    }
    return total;
  }

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const pool = fromLocationId ? products.filter((p) => availableAt(p.id, fromLocationId) > 0) : products;
    if (!q) return pool;
    return pool.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, search, fromLocationId, stockMap]);

  const computedLines = lines.map((line) => {
    const product = productById.get(line.productId);
    const available = fromLocationId ? availableAt(line.productId, fromLocationId) : 0;
    const overLimit = line.quantity > available;
    const totalValue = product ? product.unitCost * line.quantity : 0;
    return { line, product, available, overLimit, totalValue };
  });

  const anyOverLimit = computedLines.some((c) => c.overLimit);
  const totalProducts = lines.length;
  const totalQuantity = lines.reduce((sum, l) => sum + l.quantity, 0);
  const totalValue = computedLines.reduce((sum, c) => sum + c.totalValue, 0);

  const locationsDiffer = !!fromLocationId && !!toLocationId && fromLocationId !== toLocationId;
  const step1Done = locationsDiffer;
  const step2Done = lines.length > 0 && !anyOverLimit;
  const currentStep = !step1Done ? 1 : !step2Done ? 2 : 3;

  function updateLine(index: number, quantity: number) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, quantity: Math.max(1, quantity) } : line)));
  }

  function addProduct(productId: string) {
    if (lines.some((l) => l.productId === productId)) return;
    setLines((prev) => [...prev, { productId, quantity: 1 }]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function clearAll() {
    setTransferDate(todayIso());
    setReferenceNo(suggestedReference());
    setReason(REASONS[0]);
    setNotes("");
    setShippingCharges(0);
    setSearch("");
    setLines([]);
    setError(null);
    window.localStorage.removeItem(DRAFT_KEY);
  }

  function saveDraft() {
    window.localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ lines, referenceNo, fromLocationId, toLocationId, reason, notes, shippingCharges })
    );
    setError(null);
  }

  function validate(): string | null {
    if (!fromLocationId || !toLocationId) return "Choose a source and destination location.";
    if (fromLocationId === toLocationId) return "Source and destination locations must be different.";
    if (lines.length === 0) return "Add at least one product to the transfer.";
    if (anyOverLimit) return "One or more items exceed the available stock at the source location.";
    return null;
  }

  function handleConfirm() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);

    startTransition(async () => {
      const result = await createStockTransfer({
        fromLocationId,
        toLocationId,
        referenceNo,
        reason,
        transferDate,
        notes,
        shippingCharges,
        items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity }))
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      window.localStorage.removeItem(DRAFT_KEY);
      router.push(`/inventory/transfers/${result.transferId}`);
    });
  }

  if (locations.length < 2) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-card border border-dashed border-ledger-200 bg-white p-10 text-center dark:border-ledger-700 dark:bg-ink-900">
          <p className="text-sm text-ledger-500 dark:text-ledger-400">
            You need at least two locations before you can create a transfer.{" "}
            <a href="/settings/locations" className="font-medium text-signal hover:underline">
              Add a location
            </a>
            .
          </p>
        </div>
      </div>
    );
  }

  const FromIcon = fromLocation ? LOCATION_TYPE_ICONS[fromLocation.type] : Building2;
  const ToIcon = toLocation ? LOCATION_TYPE_ICONS[toLocation.type] : Building2;

  return (
    <div className="mx-auto max-w-7xl pb-28">
      <style jsx>{`
        @keyframes transfer-flow {
          0%,
          100% {
            transform: translateX(0);
            opacity: 1;
          }
          50% {
            transform: translateX(5px);
            opacity: 0.55;
          }
        }
        .transfer-arrow {
          animation: transfer-flow 1.4s ease-in-out infinite;
        }
      `}</style>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs text-ledger-400">Inventory &gt; Stock Transfer</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-white">Add stock transfer</h1>
        </div>
        <Button variant="outline" onClick={clearAll} type="button">
          <RotateCcw className="h-3.5 w-3.5" />
          Clear all
        </Button>
      </div>

      {/* Step indicator */}
      <div className="mt-5 flex items-center gap-4 rounded-card border border-ledger-100 bg-white px-5 py-3 shadow-card dark:border-ledger-700 dark:bg-ink-900">
        <StepBadge index={1} label="Transfer Details" status={step1Done ? "done" : currentStep === 1 ? "current" : "upcoming"} />
        <div className="h-px flex-1 bg-ledger-100 dark:bg-ledger-700" />
        <StepBadge index={2} label="Select Products" status={step2Done ? "done" : currentStep === 2 ? "current" : "upcoming"} />
        <div className="h-px flex-1 bg-ledger-100 dark:bg-ledger-700" />
        <StepBadge index={3} label="Review & Confirm" status={currentStep === 3 ? "current" : "upcoming"} />
      </div>

      {error && (
        <p className="mt-4 flex items-start gap-2 rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-5 lg:col-span-2">
          {/* Transfer information */}
          <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Transfer information</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Transfer date</label>
                <Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Transfer number</label>
                <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="e.g. TRF-2026-0804" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Requested by</label>
                <div className="flex h-10 items-center rounded-md border border-ledger-200 bg-ledger-50 px-3 text-sm text-ledger-500 dark:border-ledger-700 dark:bg-white/[0.03] dark:text-ledger-400">
                  {currentUserEmail}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Source location</label>
                <select
                  value={fromLocationId}
                  onChange={(e) => setFromLocationId(e.target.value)}
                  className={cn(
                    "h-10 w-full rounded-md border bg-white px-3 text-sm dark:bg-ink-900 dark:text-white",
                    !locationsDiffer && toLocationId ? "border-alert" : "border-ledger-200 dark:border-ledger-700"
                  )}
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({LOCATION_TYPE_LABELS[loc.type]})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Destination location</label>
                <select
                  value={toLocationId}
                  onChange={(e) => setToLocationId(e.target.value)}
                  className={cn(
                    "h-10 w-full rounded-md border bg-white px-3 text-sm dark:bg-ink-900 dark:text-white",
                    !locationsDiffer && fromLocationId ? "border-alert" : "border-ledger-200 dark:border-ledger-700"
                  )}
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({LOCATION_TYPE_LABELS[loc.type]})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">
                  Shipping charges <span className="font-normal text-ledger-400">(optional)</span>
                </label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={shippingCharges}
                  onChange={(e) => setShippingCharges(Math.max(0, Number(e.target.value)))}
                  placeholder="0.00"
                />
              </div>
              {!locationsDiffer && fromLocationId && toLocationId && (
                <p className="sm:col-span-2 lg:col-span-3 flex items-center gap-1.5 text-xs text-alert">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Source and destination must be different locations.
                </p>
              )}
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">
                  Notes <span className="font-normal text-ledger-400">(optional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  maxLength={250}
                  placeholder="Enter additional notes for this transfer…"
                  className="w-full rounded-md border border-ledger-200 bg-white px-3 py-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                />
                <p className="text-right text-[11px] text-ledger-400">{notes.length}/250</p>
              </div>
            </div>
          </div>

          {/* Select products */}
          <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Select products to transfer</h2>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ledger-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search product by name, SKU, or scan barcode…"
                  className="h-9 w-64 rounded-md border border-ledger-200 bg-white pl-8 pr-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                />
              </div>
            </div>

            {!fromLocationId ? (
              <p className="mt-6 text-center text-sm text-ledger-400">Choose a source location to see what&rsquo;s available there.</p>
            ) : (
              <>
                <div className="mt-4 max-h-40 space-y-1 overflow-y-auto rounded-md border border-ledger-100 p-1.5 dark:border-ledger-700">
                  {filteredProducts.map((p) => {
                    const alreadyAdded = lines.some((l) => l.productId === p.id);
                    const available = availableAt(p.id, fromLocationId);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={alreadyAdded}
                        onClick={() => addProduct(p.id)}
                        className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-ledger-50 disabled:cursor-default disabled:opacity-40 dark:hover:bg-white/[0.04]"
                      >
                        <span className="flex items-center gap-2 truncate">
                          <Package2 className="h-3.5 w-3.5 shrink-0 text-ledger-400" />
                          <span className="truncate text-ink-900 dark:text-white">{p.name}</span>
                          <span className="shrink-0 font-mono text-xs text-ledger-400">{p.sku}</span>
                        </span>
                        <span className="shrink-0 text-xs text-ledger-400">
                          {alreadyAdded ? "Added" : `${available} available`}
                        </span>
                      </button>
                    );
                  })}
                  {filteredProducts.length === 0 && (
                    <p className="px-2 py-3 text-center text-xs text-ledger-400">
                      No products with stock at this location match your search.
                    </p>
                  )}
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-ledger-100 text-left text-xs font-medium uppercase tracking-wide text-ledger-400 dark:border-ledger-700">
                      <tr>
                        <th className="py-2 pr-2">Product</th>
                        <th className="px-2 py-2">SKU</th>
                        <th className="px-2 py-2">Source</th>
                        <th className="px-2 py-2 text-right">Available</th>
                        <th className="px-2 py-2 text-center">Qty to transfer</th>
                        <th className="px-2 py-2">Destination</th>
                        <th className="px-2 py-2 text-right">Unit cost</th>
                        <th className="px-2 py-2 text-right">Total value</th>
                        <th className="w-8 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {computedLines.map(({ line, product, available, overLimit, totalValue }, index) => {
                        if (!product) return null;
                        return (
                          <tr
                            key={line.productId}
                            className={cn(
                              "border-b border-ledger-50 last:border-0 dark:border-ledger-700/50",
                              overLimit && "bg-alert-soft/40"
                            )}
                          >
                            <td className="py-2 pr-2">
                              <div className="flex items-center gap-2">
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-ledger-100 text-ledger-400 dark:bg-white/[0.06]">
                                  <Package2 className="h-3.5 w-3.5" />
                                </div>
                                <span className="font-medium text-ink-900 dark:text-white">{product.name}</span>
                              </div>
                            </td>
                            <td className="px-2 py-2 font-mono text-xs text-ledger-400">{product.sku}</td>
                            <td className="px-2 py-2 text-xs text-ledger-500 dark:text-ledger-400">{fromLocation?.name}</td>
                            <td className={cn("px-2 py-2 text-right figure", overLimit ? "font-semibold text-alert" : "text-ledger-500 dark:text-ledger-400")}>
                              {available}
                            </td>
                            <td className="px-2 py-2">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => updateLine(index, line.quantity - 1)}
                                  className="flex h-6 w-6 items-center justify-center rounded border border-ledger-200 text-ledger-500 hover:bg-ledger-50 dark:border-ledger-700 dark:hover:bg-white/[0.06]"
                                >
                                  <Minus className="h-3 w-3" />
                                </button>
                                <input
                                  type="number"
                                  min={1}
                                  value={line.quantity}
                                  onChange={(e) => updateLine(index, Number(e.target.value))}
                                  className={cn(
                                    "h-6 w-12 rounded border bg-white text-center text-xs dark:bg-ink-900 dark:text-white",
                                    overLimit ? "border-alert text-alert" : "border-ledger-200 dark:border-ledger-700"
                                  )}
                                />
                                <button
                                  type="button"
                                  onClick={() => updateLine(index, line.quantity + 1)}
                                  className="flex h-6 w-6 items-center justify-center rounded border border-ledger-200 text-ledger-500 hover:bg-ledger-50 dark:border-ledger-700 dark:hover:bg-white/[0.06]"
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                              </div>
                            </td>
                            <td className="px-2 py-2 text-xs text-ledger-500 dark:text-ledger-400">{toLocation?.name ?? "—"}</td>
                            <td className="px-2 py-2 text-right figure text-ledger-500 dark:text-ledger-400">
                              ${formatMoney(product.unitCost)}
                            </td>
                            <td className="px-2 py-2 text-right figure font-medium text-ink-900 dark:text-white">
                              ${formatMoney(totalValue)}
                            </td>
                            <td className="px-2 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => removeLine(index)}
                                className="text-ledger-400 hover:text-alert"
                                aria-label="Remove item"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {lines.length === 0 && (
                    <p className="py-6 text-center text-sm text-ledger-400">
                      No products added yet — search above and click a product to add it.
                    </p>
                  )}
                  {anyOverLimit && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-alert">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      One or more items exceed available stock at the source location — reduce the quantity to continue.
                    </p>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-ledger-100 pt-3 text-sm dark:border-ledger-700">
                  <span className="text-ledger-400">
                    Showing {lines.length} of {filteredProducts.length} available products
                  </span>
                  <span className="flex items-center gap-4">
                    <span className="text-ledger-500 dark:text-ledger-400">
                      Total quantity: <span className="figure font-medium text-ink-900 dark:text-white">{totalQuantity}</span>
                    </span>
                    <span className="text-ledger-500 dark:text-ledger-400">
                      Total value:{" "}
                      <span className="figure font-semibold text-ink-900 dark:text-white">${formatMoney(totalValue)}</span>
                    </span>
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <h3 className="text-sm font-semibold text-ink-900 dark:text-white">Transfer summary</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-ledger-500 dark:text-ledger-400">Total products</dt>
                <dd className="figure font-medium text-ink-900 dark:text-white">{totalProducts}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-ledger-500 dark:text-ledger-400">Total quantity</dt>
                <dd className="figure font-medium text-ink-900 dark:text-white">{totalQuantity}</dd>
              </div>
              <div className="flex items-center justify-between border-t border-ledger-100 pt-2 dark:border-ledger-700">
                <dt className="text-ledger-500 dark:text-ledger-400">Total inventory value</dt>
                <dd className="figure font-semibold text-ink-900 dark:text-white">${formatMoney(totalValue)}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-md bg-ledger-50 p-3 dark:bg-white/[0.04]">
                <p className="flex items-center gap-1.5 text-xs font-medium text-ledger-400">
                  <FromIcon className="h-3 w-3" /> Source
                </p>
                <p className="mt-1 font-medium text-ink-900 dark:text-white">{fromLocation?.name ?? "—"}</p>
                {fromLocation && <p className="text-xs text-ledger-400">{LOCATION_TYPE_LABELS[fromLocation.type]}</p>}
                {fromLocation && (
                  <p className="mt-1 figure text-xs font-medium text-ledger-500 dark:text-ledger-400">
                    Available: ${formatMoney(locationInventoryValue(fromLocation.id))}
                  </p>
                )}
              </div>
              <ArrowRight className="transfer-arrow h-4 w-4 shrink-0 text-signal" />
              <div className="flex-1 rounded-md bg-signal-soft p-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-signal">
                  <ToIcon className="h-3 w-3" /> Destination
                </p>
                <p className="mt-1 font-medium text-ink-900 dark:text-white">{toLocation?.name ?? "—"}</p>
                {toLocation && <p className="text-xs text-ledger-500">{LOCATION_TYPE_LABELS[toLocation.type]}</p>}
                {toLocation && (
                  <p className="mt-1 figure text-xs font-medium text-ledger-600 dark:text-ledger-300">
                    Available: ${formatMoney(locationInventoryValue(toLocation.id))}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-3 flex items-start gap-2 rounded-md bg-ledger-50 p-3 text-xs text-ledger-500 dark:bg-white/[0.04] dark:text-ledger-400">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>
                Confirming will move this stock out of <strong className="text-ink-900 dark:text-white">{fromLocation?.name ?? "—"}</strong>{" "}
                right away; it&rsquo;s added to <strong className="text-ink-900 dark:text-white">{toLocation?.name ?? "—"}</strong> once the
                transfer is marked completed.
              </p>
            </div>
          </div>

          {recentTransfers.length > 0 && (
            <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink-900 dark:text-white">Recent transfers</h3>
                <a href="/inventory/transfers" className="text-xs font-medium text-signal hover:underline">
                  View all
                </a>
              </div>
              <ul className="mt-3 space-y-3">
                {recentTransfers.map((t) => (
                  <li key={t.id}>
                    <a href={`/inventory/transfers/${t.id}`} className="block rounded-md p-2 hover:bg-ledger-50 dark:hover:bg-white/[0.04]">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-signal">{t.label}</span>
                        <TransferStatusBadge status={t.status} />
                      </div>
                      <p className="mt-0.5 text-xs text-ledger-500 dark:text-ledger-400">
                        {t.fromName} → {t.toName}
                      </p>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Sticky footer action bar */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-ledger-100 bg-white/95 backdrop-blur dark:border-ledger-700 dark:bg-ink-900/95">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 lg:pl-[calc(15rem+1rem)]">
          <p className="flex items-center gap-2 text-xs text-ledger-500 dark:text-ledger-400">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-signal" />
            Please review all details before confirming. Once confirmed, stock leaves the source location and the transfer is
            marked in transit.
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={isPending} onClick={saveDraft}>
              Save as draft
            </Button>
            <Button type="button" disabled={isPending || anyOverLimit} onClick={handleConfirm}>
              {isPending ? "Confirming…" : "Confirm transfer"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}