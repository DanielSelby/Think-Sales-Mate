"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import {
  Search,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Equal,
  RotateCcw,
  ArrowRight,
  Package2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createStockAdjustment } from "@/app/(dashboard)/inventory/adjustments/actions";

export interface AdjustLocation {
  id: string;
  name: string;
}

export interface AdjustableProduct {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  stockQuantity: number;
  costPrice: number | null;
}

export interface RecentAdjustment {
  id: string;
  label: string;
  date: string;
  impact: number;
}

export interface ReasonStat {
  reason: string;
  pct: number;
}

interface LineItem {
  productId: string;
  countedStock: number;
}

const REASONS = ["Physical Count Adjustment", "Damaged Goods", "Correction of Error", "Other"];
const CATEGORY_COLORS = ["#dc2626", "#16a34a", "#2563eb", "#94a3b8", "#d97706", "#7c3aed"];
const DRAFT_KEY = "salesmate:stock-adjustment-draft";

function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(value));
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function suggestedReference() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `ADJ-${y}-${m}${day}`;
}

function StepBadge({ index, label, active }: { index: number; label: string; active: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={
          active
            ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-signal text-xs font-semibold text-white"
            : "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ledger-100 text-xs font-semibold text-ledger-400 dark:bg-white/[0.06]"
        }
      >
        {index}
      </span>
      <span className={active ? "text-sm font-medium text-ink-900 dark:text-white" : "text-sm font-medium text-ledger-400"}>
        {label}
      </span>
    </div>
  );
}

export function StockAdjustmentForm({
  locations,
  products,
  recentAdjustments,
  reasonStats
}: {
  locations: AdjustLocation[];
  products: AdjustableProduct[];
  recentAdjustments: RecentAdjustment[];
  reasonStats: ReasonStat[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [adjustmentDate, setAdjustmentDate] = useState(todayIso());
  const [referenceNo, setReferenceNo] = useState(suggestedReference());
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");

  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<LineItem[]>([]);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // Restore a locally-saved draft on first load, if one exists.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.lines?.length) setLines(draft.lines);
      if (draft.referenceNo) setReferenceNo(draft.referenceNo);
      if (draft.locationId) setLocationId(draft.locationId);
      if (draft.reason) setReason(draft.reason);
      if (draft.note) setNote(draft.note);
    } catch {
      // ignore malformed/missing draft
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
  }, [products, search]);

  const computedLines = lines.map((line) => {
    const product = productById.get(line.productId);
    const systemStock = product?.stockQuantity ?? 0;
    const unitCost = product?.costPrice ?? 0;
    const variance = line.countedStock - systemStock;
    const impact = variance * unitCost;
    return { line, product, systemStock, unitCost, variance, impact };
  });

  const totalItems = computedLines.length;
  const increases = computedLines.filter((c) => c.variance > 0);
  const decreases = computedLines.filter((c) => c.variance < 0);
  const noChange = computedLines.filter((c) => c.variance === 0);
  const totalIncreaseUnits = increases.reduce((s, c) => s + c.variance, 0);
  const totalDecreaseUnits = decreases.reduce((s, c) => s + c.variance, 0);
  const totalImpact = computedLines.reduce((s, c) => s + c.impact, 0);

  const categoryImpact = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of computedLines) {
      if (!c.product || c.impact === 0) continue;
      const key = c.product.category ?? "Uncategorized";
      map.set(key, (map.get(key) ?? 0) + c.impact);
    }
    return [...map.entries()].map(([name, value]) => ({ name, value }));
  }, [computedLines]);

  function updateLine(productId: string, countedStock: number) {
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, countedStock } : l)));
  }

  function addProduct(productId: string) {
    if (lines.some((l) => l.productId === productId)) return;
    const product = productById.get(productId);
    setLines((prev) => [...prev, { productId, countedStock: product?.stockQuantity ?? 0 }]);
  }

  function removeLine(productId: string) {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }

  function clearAll() {
    setAdjustmentDate(todayIso());
    setReferenceNo(suggestedReference());
    setReason(REASONS[0]);
    setNote("");
    setSearch("");
    setLines([]);
    setError(null);
    window.localStorage.removeItem(DRAFT_KEY);
  }

  function saveDraft() {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ lines, referenceNo, locationId, reason, note }));
    setError(null);
  }

  function validate(): string | null {
    if (lines.length === 0) return "Add at least one product to adjust.";
    if (computedLines.every((c) => c.variance === 0)) return "Change at least one product's counted stock.";
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
      const result = await createStockAdjustment({
        referenceNo,
        adjustmentDate,
        locationId,
        reason,
        note,
        items: computedLines.map((c) => ({
          productId: c.line.productId,
          systemStock: c.systemStock,
          countedStock: c.line.countedStock,
          unitCost: c.unitCost
        }))
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      window.localStorage.removeItem(DRAFT_KEY);
      router.push(`/inventory/adjustments/${result.adjustmentId}`);
    });
  }

  if (locations.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-card border border-dashed border-ledger-200 bg-white p-10 text-center dark:border-ledger-700 dark:bg-ink-900">
          <p className="text-sm text-ledger-500 dark:text-ledger-400">
            Add a business location before recording stock adjustments.{" "}
            <a href="/settings/locations" className="font-medium text-signal hover:underline">
              Add a branch
            </a>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl pb-32">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs text-ledger-400">Inventory &gt; Stock Adjustment</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-white">Stock adjustment</h1>
        </div>
        <Button variant="outline" type="button" onClick={clearAll}>
          <RotateCcw className="h-3.5 w-3.5" />
          Clear
        </Button>
      </div>

      {/* Step indicator */}
      <div className="mt-5 flex items-center gap-4 rounded-card border border-ledger-100 bg-white px-5 py-3 shadow-card dark:border-ledger-700 dark:bg-ink-900">
        <StepBadge index={1} label="Adjustment Details" active />
        <div className="h-px flex-1 bg-ledger-100 dark:bg-ledger-700" />
        <StepBadge index={2} label="Adjust Products" active={lines.length > 0} />
        <div className="h-px flex-1 bg-ledger-100 dark:bg-ledger-700" />
        <StepBadge index={3} label="Review & Confirm" active={false} />
      </div>

      {error && <p className="mt-4 rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p>}

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-5 lg:col-span-2">
          {/* Adjustment information */}
          <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Adjustment information</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Adjustment date</label>
                <Input type="date" value={adjustmentDate} onChange={(e) => setAdjustmentDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Reference no.</label>
                <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Warehouse</label>
                <select
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Adjustment reason</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                >
                  {REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
                <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">
                  Adjustment note <span className="font-normal text-ledger-400">(optional)</span>
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  maxLength={250}
                  placeholder="Reason details for this stock count…"
                  className="w-full rounded-md border border-ledger-200 bg-white px-3 py-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                />
                <p className="text-right text-[11px] text-ledger-400">{note.length}/250</p>
              </div>
            </div>
          </div>

          {/* Products to adjust */}
          <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Products to adjust</h2>
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

            {products.length === 0 ? (
              <p className="mt-6 text-center text-sm text-ledger-400">Add a product to Inventory before adjusting stock.</p>
            ) : (
              <>
                <div className="mt-4 max-h-40 space-y-1 overflow-y-auto rounded-md border border-ledger-100 p-1.5 dark:border-ledger-700">
                  {filteredProducts.map((p) => {
                    const alreadyAdded = lines.some((l) => l.productId === p.id);
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
                          {alreadyAdded ? "Added" : `${p.stockQuantity} on hand`}
                        </span>
                      </button>
                    );
                  })}
                  {filteredProducts.length === 0 && (
                    <p className="px-2 py-3 text-center text-xs text-ledger-400">No matching products.</p>
                  )}
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-ledger-100 text-left text-xs font-medium uppercase tracking-wide text-ledger-400 dark:border-ledger-700">
                      <tr>
                        <th className="py-2 pr-2">Product</th>
                        <th className="px-2 py-2 text-right">System stock</th>
                        <th className="px-2 py-2 text-right">Counted stock</th>
                        <th className="px-2 py-2 text-right">Adjustment</th>
                        <th className="px-2 py-2 text-right">Unit cost</th>
                        <th className="px-2 py-2 text-right">Total impact</th>
                        <th className="w-8 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {computedLines.map(({ line, product, systemStock, unitCost, variance, impact }) => {
                        if (!product) return null;
                        return (
                          <tr key={line.productId} className="border-b border-ledger-50 last:border-0 dark:border-ledger-700/50">
                            <td className="py-2 pr-2">
                              <span className="font-medium text-ink-900 dark:text-white">{product.name}</span>
                              <span className="ml-2 font-mono text-xs text-ledger-400">{product.sku}</span>
                            </td>
                            <td className="px-2 py-2 text-right figure text-ledger-500 dark:text-ledger-400">{systemStock}</td>
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                min={0}
                                value={line.countedStock}
                                onChange={(e) => updateLine(line.productId, Math.max(0, Number(e.target.value)))}
                                className="h-8 w-20 rounded-md border border-ledger-200 bg-white px-2 text-right text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                              />
                            </td>
                            <td className="px-2 py-2 text-right">
                              <span
                                className={`inline-flex items-center gap-1 figure font-medium ${variance > 0 ? "text-signal" : variance < 0 ? "text-alert" : "text-ledger-400"}`}
                              >
                                {variance > 0 ? <ArrowUp className="h-3 w-3" /> : variance < 0 ? <ArrowDown className="h-3 w-3" /> : <Equal className="h-3 w-3" />}
                                {variance > 0 ? `+${variance}` : variance}
                              </span>
                            </td>
                            <td className="px-2 py-2 text-right figure text-ledger-500 dark:text-ledger-400">
                              ${formatMoney(unitCost)}
                            </td>
                            <td
                              className={`px-2 py-2 text-right figure font-medium ${impact > 0 ? "text-signal" : impact < 0 ? "text-alert" : "text-ledger-400"}`}
                            >
                              {impact === 0 ? "$0.00" : `${impact > 0 ? "+" : "-"}$${formatMoney(impact)}`}
                            </td>
                            <td className="px-2 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => removeLine(line.productId)}
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
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-ledger-100 pt-3 text-sm dark:border-ledger-700">
                  <span className="text-ledger-500 dark:text-ledger-400">Total items: {totalItems}</span>
                  <span className={`figure font-semibold ${totalImpact > 0 ? "text-signal" : totalImpact < 0 ? "text-alert" : "text-ledger-400"}`}>
                    Total adjustment impact: {totalImpact === 0 ? "$0.00" : `${totalImpact > 0 ? "+" : "-"}$${formatMoney(totalImpact)}`}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <h3 className="text-sm font-semibold text-ink-900 dark:text-white">Adjustment summary</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-ledger-500 dark:text-ledger-400">Total items</dt>
                <dd className="figure font-medium text-ink-900 dark:text-white">{totalItems}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-ledger-500 dark:text-ledger-400">Total increases</dt>
                <dd className="figure font-medium text-signal">
                  {increases.length} (+{totalIncreaseUnits} units)
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-ledger-500 dark:text-ledger-400">Total decreases</dt>
                <dd className="figure font-medium text-alert">
                  {decreases.length} ({totalDecreaseUnits} units)
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-ledger-500 dark:text-ledger-400">No change</dt>
                <dd className="figure font-medium text-ledger-400">{noChange.length} (0 units)</dd>
              </div>
              <div className="flex items-center justify-between border-t border-ledger-100 pt-2 dark:border-ledger-700">
                <dt className="font-medium text-ledger-600 dark:text-ledger-300">Total adjustment impact</dt>
                <dd className={`figure text-lg font-semibold ${totalImpact > 0 ? "text-signal" : totalImpact < 0 ? "text-alert" : "text-ledger-400"}`}>
                  {totalImpact === 0 ? "$0.00" : `${totalImpact > 0 ? "+" : "-"}$${formatMoney(totalImpact)}`}
                </dd>
              </div>
            </dl>
          </div>

          {categoryImpact.length > 0 && (
            <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
              <h3 className="text-sm font-semibold text-ink-900 dark:text-white">Stock impact by category</h3>
              <div className="mt-3 flex items-center gap-4">
                <div className="h-28 w-28 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={categoryImpact} dataKey="value" nameKey="name" innerRadius={30} outerRadius={50} paddingAngle={2}>
                        {categoryImpact.map((_, i) => (
                          <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => `${v > 0 ? "+" : "-"}$${formatMoney(v)}`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="flex-1 space-y-1.5">
                  {categoryImpact.map((c, i) => (
                    <li key={c.name} className="flex items-center gap-2 text-xs">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                      <span className="flex-1 truncate text-ledger-600 dark:text-ledger-300">{c.name}</span>
                      <span className={`figure ${c.value >= 0 ? "text-signal" : "text-alert"}`}>
                        {c.value >= 0 ? "+" : "-"}${formatMoney(c.value)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {recentAdjustments.length > 0 && (
            <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink-900 dark:text-white">Recent adjustments</h3>
                <a href="/inventory" className="text-xs font-medium text-signal hover:underline">
                  View all
                </a>
              </div>
              <ul className="mt-3 space-y-2">
                {recentAdjustments.map((a) => (
                  <li key={a.id}>
                    <a href={`/inventory/adjustments/${a.id}`} className="block rounded-md p-2 hover:bg-ledger-50 dark:hover:bg-white/[0.04]">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-signal">{a.label}</span>
                        <span className="text-ledger-400">{new Date(a.date).toLocaleDateString()}</span>
                      </div>
                      <p className={`mt-0.5 figure text-xs font-semibold ${a.impact >= 0 ? "text-signal" : "text-alert"}`}>
                        {a.impact >= 0 ? "+" : "-"}${formatMoney(a.impact)}
                      </p>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {reasonStats.length > 0 && (
            <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
              <h3 className="text-sm font-semibold text-ink-900 dark:text-white">Adjustment reasons</h3>
              <ul className="mt-3 space-y-2">
                {reasonStats.map((r) => (
                  <li key={r.reason}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ledger-600 dark:text-ledger-300">{r.reason}</span>
                      <span className="text-ledger-400">{r.pct}%</span>
                    </div>
                    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-ledger-100 dark:bg-white/[0.06]">
                      <div className="h-full bg-signal" style={{ width: `${r.pct}%` }} />
                    </div>
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
          <p className="text-xs text-ledger-500 dark:text-ledger-400">
            Please verify all adjustments before confirming. Once confirmed, the adjustment will be applied and updated in
            inventory.
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={isPending} onClick={saveDraft}>
              Save as draft
            </Button>
            <Button type="button" disabled={isPending} onClick={handleConfirm}>
              {isPending ? "Confirming…" : "Review & confirm"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}