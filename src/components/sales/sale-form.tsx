"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ScanLine,
  StickyNote,
  Paperclip,
  RotateCcw,
  ArrowRight,
  Star,
  Building2,
  Package2,
  User,
  Mail,
  Phone
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { recordSale } from "@/app/(dashboard)/sales/actions";

export interface SellableProduct {
  id: string;
  sku: string;
  name: string;
  unitPrice: number;
  stockQuantity: number;
}

export interface SaleCustomer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  outstanding: number;
  isReturning: boolean;
}

export interface SaleLocation {
  id: string;
  name: string;
}

export interface SalesRep {
  id: string;
  email: string;
}

export interface RecentItem {
  id: string;
  name: string;
  unitPrice: number;
}

interface LineItem {
  productId: string;
  quantity: number;
  discountPercent: number;
  taxPercent: number;
}

const TAX_RATES = [0, 5, 12.5, 15];
const PAYMENT_METHODS = ["Cash", "Mobile Money", "Card", "Bank Transfer", "Store Credit"];
const DRAFT_KEY = "salesmate:new-sale-draft";

function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
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

export function SaleForm({
  products,
  customers,
  locations,
  reps,
  recentItems,
  currentUserId,
  currentUserEmail
}: {
  products: SellableProduct[];
  customers: SaleCustomer[];
  locations: SaleLocation[];
  reps: SalesRep[];
  recentItems: RecentItem[];
  currentUserId: string;
  currentUserEmail: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Customer
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [walkInName, setWalkInName] = useState("");
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);

  // Sale details
  const [saleDate, setSaleDate] = useState(todayIso());
  const [salesRepId, setSalesRepId] = useState(currentUserId);
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [reference, setReference] = useState("");

  // Products
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<LineItem[]>([]);

  // Quick actions
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");
  const [showShipping, setShowShipping] = useState(false);
  const [shippingAmount, setShippingAmount] = useState(0);
  const [attachedFileName, setAttachedFileName] = useState<string | null>(null);

  // Payment
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
  const [amountPaid, setAmountPaid] = useState(0);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId) ?? null;

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers
      .filter((c) => c.name.toLowerCase().includes(q) || c.phone?.includes(q) || c.email?.toLowerCase().includes(q))
      .slice(0, 8);
  }, [customers, customerQuery]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
  }, [products, search]);

  const computedLines = lines.map((line) => {
    const product = productById.get(line.productId);
    const unitPrice = product?.unitPrice ?? 0;
    const lineSubtotal = unitPrice * line.quantity;
    const lineDiscount = lineSubtotal * (line.discountPercent / 100);
    const taxable = lineSubtotal - lineDiscount;
    const lineTax = taxable * (line.taxPercent / 100);
    return { line, product, lineSubtotal, lineDiscount, taxable, lineTax, rowTotal: taxable };
  });

  const totalQuantity = lines.reduce((sum, l) => sum + l.quantity, 0);
  const subtotal = computedLines.reduce((sum, c) => sum + c.lineSubtotal, 0);
  const discountTotal = computedLines.reduce((sum, c) => sum + c.lineDiscount, 0);
  const taxTotal = computedLines.reduce((sum, c) => sum + c.lineTax, 0);
  const total = subtotal - discountTotal + taxTotal + shippingAmount;
  const changeOrDue = amountPaid - total;

  // Restore a locally-saved draft on first load, if one exists.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.lines?.length) setLines(draft.lines);
      if (draft.walkInName) setWalkInName(draft.walkInName);
      if (draft.selectedCustomerId) setSelectedCustomerId(draft.selectedCustomerId);
      if (draft.reference) setReference(draft.reference);
      if (draft.note) {
        setNote(draft.note);
        setShowNote(true);
      }
      if (draft.paymentMethod) setPaymentMethod(draft.paymentMethod);
    } catch {
      // ignore malformed/missing draft
    }
  }, []);

  function updateLine(productId: string, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, ...patch } : l)));
  }

  function addProduct(productId: string) {
    if (lines.some((l) => l.productId === productId)) return;
    setLines((prev) => [...prev, { productId, quantity: 1, discountPercent: 0, taxPercent: 0 }]);
  }

  function removeLine(productId: string) {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }

  function selectCustomer(customer: SaleCustomer) {
    setSelectedCustomerId(customer.id);
    setWalkInName("");
    setShowCustomerPicker(false);
    setCustomerQuery("");
  }

  function clearSale() {
    setSelectedCustomerId(null);
    setWalkInName("");
    setCustomerQuery("");
    setSaleDate(todayIso());
    setReference("");
    setLines([]);
    setSearch("");
    setShowNote(false);
    setNote("");
    setShowShipping(false);
    setShippingAmount(0);
    setAttachedFileName(null);
    setPaymentMethod(PAYMENT_METHODS[0]);
    setAmountPaid(0);
    setError(null);
    window.localStorage.removeItem(DRAFT_KEY);
  }

  function saveDraft() {
    window.localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ lines, walkInName, selectedCustomerId, reference, note, paymentMethod })
    );
    setError(null);
  }

  function validate(): string | null {
    const validLines = lines.filter((l) => l.quantity > 0);
    if (validLines.length === 0) return "Add at least one product to the sale.";
    if (!selectedCustomerId && !walkInName.trim()) return "Select a customer or enter a walk-in customer name.";
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
      const result = await recordSale({
        customerId: selectedCustomerId,
        customerName: selectedCustomer?.name ?? walkInName,
        locationId: locationId || null,
        reference,
        saleDate,
        paymentMethod,
        amountPaid,
        shippingAmount,
        notes: note,
        items: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          discountPercent: l.discountPercent,
          taxPercent: l.taxPercent
        }))
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      window.localStorage.removeItem(DRAFT_KEY);
      router.push(`/sales/${result.saleId}`);
    });
  }

  return (
    <div className="mx-auto max-w-7xl pb-32">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">New sale</h1>
          <p className="text-sm text-ledger-500 dark:text-ledger-400">Create a new sales transaction.</p>
        </div>
        <Button variant="outline" type="button" onClick={clearSale}>
          <RotateCcw className="h-3.5 w-3.5" />
          Clear sale
        </Button>
      </div>

      {/* Step indicator */}
      <div className="mt-5 flex items-center gap-3 overflow-x-auto rounded-card border border-ledger-100 bg-white px-5 py-3 shadow-card dark:border-ledger-700 dark:bg-ink-900">
        <StepBadge index={1} label="Customer" active={!!selectedCustomerId || !!walkInName} />
        <div className="h-px w-6 shrink-0 bg-ledger-100 dark:bg-ledger-700" />
        <StepBadge index={2} label="Products" active={lines.length > 0} />
        <div className="h-px w-6 shrink-0 bg-ledger-100 dark:bg-ledger-700" />
        <StepBadge index={3} label="Payment" active={amountPaid > 0} />
        <div className="h-px w-6 shrink-0 bg-ledger-100 dark:bg-ledger-700" />
        <StepBadge index={4} label="Review & Confirm" active={false} />
      </div>

      {error && <p className="mt-4 rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p>}

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-5 lg:col-span-2">
          {/* Customer information */}
          <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Customer information</h2>
              <button
                type="button"
                onClick={() => setShowCustomerPicker((s) => !s)}
                className="text-xs font-medium text-signal hover:underline"
              >
                Select customer
              </button>
            </div>

            {showCustomerPicker && (
              <div className="mt-3 rounded-md border border-ledger-100 p-2 dark:border-ledger-700">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ledger-400" />
                  <input
                    autoFocus
                    value={customerQuery}
                    onChange={(e) => setCustomerQuery(e.target.value)}
                    placeholder="Search customers by name, phone, or email…"
                    className="h-9 w-full rounded-md border border-ledger-200 bg-white pl-8 pr-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                  />
                </div>
                <div className="mt-2 max-h-40 space-y-0.5 overflow-y-auto">
                  {filteredCustomers.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => selectCustomer(c)}
                      className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-ledger-50 dark:hover:bg-white/[0.04]"
                    >
                      <span className="text-ink-900 dark:text-white">{c.name}</span>
                      <span className="text-xs text-ledger-400">{c.phone ?? c.email ?? ""}</span>
                    </button>
                  ))}
                  {filteredCustomers.length === 0 && (
                    <p className="px-2 py-2 text-center text-xs text-ledger-400">No matching customers.</p>
                  )}
                </div>
                <div className="mt-2 border-t border-ledger-100 pt-2 dark:border-ledger-700">
                  <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">
                    Or enter a walk-in customer name
                  </label>
                  <Input
                    value={walkInName}
                    onChange={(e) => {
                      setWalkInName(e.target.value);
                      setSelectedCustomerId(null);
                    }}
                    placeholder="Walk-in customer"
                    className="mt-1"
                  />
                </div>
              </div>
            )}

            <div className="mt-3 flex items-start gap-3 rounded-md bg-ledger-50 p-3 dark:bg-white/[0.04]">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-ledger-400 dark:bg-ink-900">
                <User className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                {selectedCustomer ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink-900 dark:text-white">{selectedCustomer.name}</span>
                      {selectedCustomer.isReturning && (
                        <span className="rounded-full bg-signal-soft px-2 py-0.5 text-[11px] font-semibold text-signal">
                          Returning customer
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-ledger-500 dark:text-ledger-400">
                      {selectedCustomer.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {selectedCustomer.email}
                        </span>
                      )}
                      {selectedCustomer.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {selectedCustomer.phone}
                        </span>
                      )}
                    </div>
                    {selectedCustomer.outstanding > 0 && (
                      <p className="mt-1 text-xs font-medium text-alert">
                        Outstanding: ${formatMoney(selectedCustomer.outstanding)}
                      </p>
                    )}
                  </>
                ) : walkInName ? (
                  <span className="font-medium text-ink-900 dark:text-white">{walkInName} (walk-in)</span>
                ) : (
                  <span className="text-sm text-ledger-400">No customer selected yet — choose one above.</span>
                )}
              </div>
            </div>
          </div>

          {/* Sale details */}
          <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Sale details</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Sale date</label>
                <Input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Sales rep</label>
                <select
                  value={salesRepId}
                  onChange={(e) => setSalesRepId(e.target.value)}
                  className="h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                >
                  {reps.length === 0 ? (
                    <option value={currentUserId}>{currentUserEmail}</option>
                  ) : (
                    reps.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.email}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Branch</label>
                <select
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                >
                  {locations.length === 0 ? (
                    <option value="">No branches yet</option>
                  ) : (
                    locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Price list</label>
                <select
                  disabled
                  className="h-10 w-full rounded-md border border-ledger-200 bg-ledger-50 px-3 text-sm text-ledger-500 dark:border-ledger-700 dark:bg-white/[0.03] dark:text-ledger-400"
                >
                  <option>Default price list</option>
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
                <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">
                  Reference <span className="font-normal text-ledger-400">(optional)</span>
                </label>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Enter reference" />
              </div>
            </div>
          </div>

          {/* Products */}
          <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Products ({lines.length} items)</h2>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ledger-400" />
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search product by name, SKU, or scan barcode…"
                    className="h-9 w-64 rounded-md border border-ledger-200 bg-white pl-8 pr-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                  />
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => searchRef.current?.focus()}>
                  <ScanLine className="h-3.5 w-3.5" />
                  Scan barcode
                </Button>
              </div>
            </div>

            {products.length === 0 ? (
              <p className="mt-6 text-center text-sm text-ledger-400">Add a product to Inventory to start selling.</p>
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
                          {alreadyAdded ? "Added" : `$${formatMoney(p.unitPrice)}`}
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
                        <th className="px-2 py-2 text-right">Unit price</th>
                        <th className="px-2 py-2 text-center">Qty</th>
                        <th className="px-2 py-2 text-right">Discount</th>
                        <th className="px-2 py-2 text-right">Tax</th>
                        <th className="px-2 py-2 text-right">Total</th>
                        <th className="w-8 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {computedLines.map(({ line, product, rowTotal }) => {
                        if (!product) return null;
                        return (
                          <tr key={line.productId} className="border-b border-ledger-50 last:border-0 dark:border-ledger-700/50">
                            <td className="py-2 pr-2">
                              <span className="font-medium text-ink-900 dark:text-white">{product.name}</span>
                              <span className="ml-2 font-mono text-xs text-ledger-400">{product.sku}</span>
                            </td>
                            <td className="px-2 py-2 text-right figure text-ledger-500 dark:text-ledger-400">
                              ${formatMoney(product.unitPrice)}
                            </td>
                            <td className="px-2 py-2">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => updateLine(line.productId, { quantity: Math.max(1, line.quantity - 1) })}
                                  className="flex h-6 w-6 items-center justify-center rounded border border-ledger-200 text-ledger-500 hover:bg-ledger-50 dark:border-ledger-700 dark:hover:bg-white/[0.06]"
                                >
                                  <Minus className="h-3 w-3" />
                                </button>
                                <input
                                  type="number"
                                  min={1}
                                  max={product.stockQuantity}
                                  value={line.quantity}
                                  onChange={(e) =>
                                    updateLine(line.productId, { quantity: Math.max(1, Number(e.target.value)) })
                                  }
                                  className="h-6 w-10 rounded border border-ledger-200 bg-white text-center text-xs dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateLine(line.productId, {
                                      quantity: Math.min(product.stockQuantity, line.quantity + 1)
                                    })
                                  }
                                  className="flex h-6 w-6 items-center justify-center rounded border border-ledger-200 text-ledger-500 hover:bg-ledger-50 dark:border-ledger-700 dark:hover:bg-white/[0.06]"
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                              </div>
                            </td>
                            <td className="px-2 py-2 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={line.discountPercent}
                                  onChange={(e) => updateLine(line.productId, { discountPercent: Number(e.target.value) })}
                                  className="h-8 w-14 rounded-md border border-ledger-200 bg-white px-1 text-right text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                                />
                                <span className="text-xs text-ledger-400">%</span>
                              </div>
                            </td>
                            <td className="px-2 py-2 text-right">
                              <select
                                value={line.taxPercent}
                                onChange={(e) => updateLine(line.productId, { taxPercent: Number(e.target.value) })}
                                className="h-8 rounded-md border border-ledger-200 bg-white px-1 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                              >
                                {TAX_RATES.map((rate) => (
                                  <option key={rate} value={rate}>
                                    {rate}%
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-2 py-2 text-right figure font-medium text-ink-900 dark:text-white">
                              ${formatMoney(rowTotal)}
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

                {/* Quick actions */}
                <div className="mt-3 flex flex-wrap gap-4 border-t border-ledger-100 pt-3 dark:border-ledger-700">
                  <button
                    type="button"
                    onClick={() => setShowNote((s) => !s)}
                    className="flex items-center gap-1 text-xs font-medium text-signal hover:underline"
                  >
                    <StickyNote className="h-3.5 w-3.5" />
                    {showNote ? "Hide note" : "Add note"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowShipping((s) => !s)}
                    className="flex items-center gap-1 text-xs font-medium text-signal hover:underline"
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    {showShipping ? "Hide shipping" : "Add shipping"}
                  </button>
                  <label className="flex cursor-pointer items-center gap-1 text-xs font-medium text-signal hover:underline">
                    <Paperclip className="h-3.5 w-3.5" />
                    {attachedFileName ?? "Attach document"}
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => setAttachedFileName(e.target.files?.[0]?.name ?? null)}
                    />
                  </label>
                </div>

                {showNote && (
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder="Note for this sale…"
                    className="mt-2 w-full rounded-md border border-ledger-200 bg-white px-3 py-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                  />
                )}
                {showShipping && (
                  <div className="mt-2 flex items-center gap-2">
                    <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Shipping fee</label>
                    <input
                      type="number"
                      min={0}
                      value={shippingAmount}
                      onChange={(e) => setShippingAmount(Math.max(0, Number(e.target.value)))}
                      className="h-8 w-28 rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                    />
                  </div>
                )}
                {attachedFileName && (
                  <p className="mt-1 text-[11px] text-ledger-400">
                    &ldquo;{attachedFileName}&rdquo; is attached to this form only &mdash; file storage isn&rsquo;t wired
                    up yet, so it won&rsquo;t be saved with the sale.
                  </p>
                )}

                {/* Footer stat strip */}
                <div className="mt-4 grid grid-cols-2 gap-3 rounded-md bg-ledger-50 p-3 text-center text-xs sm:grid-cols-4 dark:bg-white/[0.04]">
                  <div>
                    <p className="figure text-sm font-semibold text-ink-900 dark:text-white">{lines.length}</p>
                    <p className="text-ledger-400">Items</p>
                  </div>
                  <div>
                    <p className="figure text-sm font-semibold text-ink-900 dark:text-white">{totalQuantity}</p>
                    <p className="text-ledger-400">Total qty</p>
                  </div>
                  <div>
                    <p className="figure text-sm font-semibold text-ink-900 dark:text-white">${formatMoney(subtotal)}</p>
                    <p className="text-ledger-400">Sub total</p>
                  </div>
                  <div>
                    <p className="figure text-sm font-semibold text-alert">-${formatMoney(discountTotal)}</p>
                    <p className="text-ledger-400">Discount</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <h3 className="text-sm font-semibold text-ink-900 dark:text-white">Order summary</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-ledger-500 dark:text-ledger-400">Sub total</dt>
                <dd className="figure text-ink-900 dark:text-white">${formatMoney(subtotal)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-ledger-500 dark:text-ledger-400">Discount</dt>
                <dd className="figure text-alert">-${formatMoney(discountTotal)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-ledger-500 dark:text-ledger-400">Tax</dt>
                <dd className="figure text-ink-900 dark:text-white">+${formatMoney(taxTotal)}</dd>
              </div>
              {shippingAmount > 0 && (
                <div className="flex items-center justify-between">
                  <dt className="text-ledger-500 dark:text-ledger-400">Shipping</dt>
                  <dd className="figure text-ink-900 dark:text-white">+${formatMoney(shippingAmount)}</dd>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-ledger-100 pt-2 dark:border-ledger-700">
                <dt className="font-medium text-ledger-600 dark:text-ledger-300">Total ({lines.length} items)</dt>
                <dd className="figure text-lg font-semibold text-signal">${formatMoney(total)}</dd>
              </div>
              {discountTotal > 0 && (
                <div className="flex items-center justify-between rounded-md bg-signal-soft px-2 py-1.5">
                  <dt className="flex items-center gap-1 text-xs font-medium text-signal">
                    <Star className="h-3 w-3" /> You save
                  </dt>
                  <dd className="figure text-xs font-semibold text-signal">${formatMoney(discountTotal)}</dd>
                </div>
              )}
            </dl>

            <div className="mt-4 space-y-1.5 border-t border-ledger-100 pt-4 dark:border-ledger-700">
              <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Payment method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3 space-y-1.5">
              <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Amount paid</label>
              <div className="flex items-center rounded-md border border-ledger-200 dark:border-ledger-700">
                <span className="px-3 text-sm text-ledger-400">$</span>
                <input
                  type="number"
                  min={0}
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(Math.max(0, Number(e.target.value)))}
                  className="h-10 w-full rounded-r-md border-l border-ledger-200 bg-white pr-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[25, 50, 75, 100].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setAmountPaid(Number((total * (pct / 100)).toFixed(2)))}
                    className={
                      Math.round(amountPaid * 100) === Math.round(total * (pct / 100) * 100)
                        ? "rounded-md bg-signal py-1 text-xs font-semibold text-white"
                        : "rounded-md border border-ledger-200 py-1 text-xs font-medium text-ledger-500 hover:bg-ledger-50 dark:border-ledger-700 dark:text-ledger-400 dark:hover:bg-white/[0.06]"
                    }
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between rounded-md bg-ledger-50 px-3 py-2 text-sm dark:bg-white/[0.04]">
              <span className="text-ledger-500 dark:text-ledger-400">{changeOrDue >= 0 ? "Change" : "Balance due"}</span>
              <span className={changeOrDue >= 0 ? "figure font-semibold text-signal" : "figure font-semibold text-alert"}>
                ${formatMoney(Math.abs(changeOrDue))}
              </span>
            </div>
          </div>

          {recentItems.length > 0 && (
            <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink-900 dark:text-white">Recent items</h3>
                <a href="/inventory" className="text-xs font-medium text-signal hover:underline">
                  View all
                </a>
              </div>
              <ul className="mt-3 space-y-2">
                {recentItems.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => addProduct(item.id)}
                      disabled={!productById.has(item.id) || lines.some((l) => l.productId === item.id)}
                      className="flex w-full items-center justify-between rounded-md p-2 text-left text-sm hover:bg-ledger-50 disabled:cursor-default disabled:opacity-40 dark:hover:bg-white/[0.04]"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <Package2 className="h-3.5 w-3.5 shrink-0 text-ledger-400" />
                        <span className="truncate text-ink-900 dark:text-white">{item.name}</span>
                      </span>
                      <span className="shrink-0 figure text-xs text-ledger-400">${formatMoney(item.unitPrice)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Sticky footer action bar */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-ledger-100 bg-white/95 backdrop-blur dark:border-ledger-700 dark:bg-ink-900/95">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-end gap-2 px-4 py-3 lg:pl-[calc(15rem+1rem)]">
          <Button type="button" variant="outline" onClick={saveDraft}>
            Save as draft
          </Button>
          <Button type="button" disabled={isPending} onClick={handleConfirm}>
            {isPending ? "Recording sale…" : "Review & confirm"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}