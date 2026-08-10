"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Search, Filter, LayoutGrid, List, Plus, Minus, X, Trash2, Package, Loader2,
  UserPlus, Pause, FileText, Banknote, CreditCard, Smartphone, Landmark, MoreHorizontal, Inbox,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/sales/format";
import {
  completeSale, parkSale, listHeldSales, resumeHeldSale, deleteHeldSale, searchCustomers, quickAddCustomer,
  type CartItemInput, type CustomerOption, type HeldSaleSummary,
} from "@/app/(dashboard)/pos/actions";
import type { HeldSaleKind } from "@/types/database";

export interface PosProduct {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  category: string | null;
  unitPrice: number;
  stockQuantity: number;
}

export interface LocationOption { id: string; name: string; }

interface PosViewProps {
  products: PosProduct[];
  categories: string[];
  locations: LocationOption[];
  currency: string;
  taxRatePercent: number;
}

interface CartLine extends CartItemInput {
  key: string;
  maxStock: number;
}

const PAYMENT_METHODS = [
  { key: "Cash", label: "Cash", icon: Banknote },
  { key: "Card", label: "Card", icon: CreditCard },
  { key: "Mobile Money", label: "Mobile Money", icon: Smartphone },
  { key: "Bank Transfer", label: "Bank Transfer", icon: Landmark },
];

export function PosView({ products, categories, locations, currency, taxRatePercent }: PosViewProps) {
  const router = useRouter();
  const [tab, setTab] = React.useState<"all" | "frequent" | "categories">("all");
  const [query, setQuery] = React.useState("");
  const [activeCategory, setActiveCategory] = React.useState("all");
  const [view, setView] = React.useState<"grid" | "list">("grid");
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [locationId, setLocationId] = React.useState(locations[0]?.id ?? "");

  const [customer, setCustomer] = React.useState<CustomerOption | null>(null);
  const [customerQuery, setCustomerQuery] = React.useState("");
  const [customerResults, setCustomerResults] = React.useState<CustomerOption[]>([]);
  const [customerOpen, setCustomerOpen] = React.useState(false);
  const [orderNote, setOrderNote] = React.useState("");
  const [discountAmount, setDiscountAmount] = React.useState(0);
  const [paymentMethod, setPaymentMethod] = React.useState("Cash");

  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const [heldOpen, setHeldOpen] = React.useState(false);
  const [heldKind, setHeldKind] = React.useState<HeldSaleKind>("hold");
  const [heldList, setHeldList] = React.useState<HeldSaleSummary[]>([]);
  const [heldLoading, setHeldLoading] = React.useState(false);

  function showNotice(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  }

  const filteredProducts = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (activeCategory !== "all" && p.category !== activeCategory) return false;
      if (q && !p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q) && !(p.barcode ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, query, activeCategory]);

  function addToCart(product: PosProduct) {
    if (product.stockQuantity <= 0) {
      setError(`${product.name} is out of stock.`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        if (existing.quantity >= product.stockQuantity) {
          setError(`Only ${product.stockQuantity} unit(s) of ${product.name} available.`);
          return prev;
        }
        return prev.map((l) => (l.productId === product.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        { key: crypto.randomUUID(), productId: product.id, name: product.name, sku: product.sku, unitPrice: product.unitPrice, quantity: 1, discountPercent: 0, taxPercent: taxRatePercent, maxStock: product.stockQuantity },
      ];
    });
  }

  function onBarcodeEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const q = query.trim().toLowerCase();
    if (!q) return;
    const exact = products.find((p) => p.sku.toLowerCase() === q || (p.barcode ?? "").toLowerCase() === q);
    if (exact) {
      e.preventDefault();
      addToCart(exact);
      setQuery("");
    }
  }

  function updateQty(key: string, delta: number) {
    setCart((prev) => prev.map((l) => {
      if (l.key !== key) return l;
      const next = Math.max(1, Math.min(l.maxStock, l.quantity + delta));
      return { ...l, quantity: next };
    }));
  }
  function removeLine(key: string) {
    setCart((prev) => prev.filter((l) => l.key !== key));
  }
  function clearCart() {
    setCart([]);
    setCustomer(null);
    setOrderNote("");
    setDiscountAmount(0);
  }

  const subtotal = cart.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const itemsDiscount = cart.reduce((sum, l) => sum + (l.quantity * l.unitPrice * l.discountPercent) / 100, 0);
  const taxTotal = cart.reduce((sum, l) => {
    const gross = l.quantity * l.unitPrice;
    const disc = gross * (l.discountPercent / 100);
    return sum + (gross - disc) * (l.taxPercent / 100);
  }, 0);
  const total = Math.max(0, subtotal - itemsDiscount - discountAmount + taxTotal);

  React.useEffect(() => {
    if (!customerOpen) return;
    const t = setTimeout(() => { searchCustomers(customerQuery).then(setCustomerResults); }, 200);
    return () => clearTimeout(t);
  }, [customerQuery, customerOpen]);

  async function handleQuickAddCustomer() {
    if (!customerQuery.trim()) return;
    const result = await quickAddCustomer(customerQuery.trim(), null, null);
    if (result.ok && result.customer) {
      setCustomer(result.customer);
      setCustomerOpen(false);
      setCustomerQuery("");
    }
  }

  function buildCartInput(): CartItemInput[] {
    return cart.map((l) => ({ productId: l.productId, name: l.name, sku: l.sku, unitPrice: l.unitPrice, quantity: l.quantity, discountPercent: l.discountPercent, taxPercent: l.taxPercent }));
  }

  function handleCompleteSale() {
    setError(null);
    if (cart.length === 0) return setError("Cart is empty.");
    startTransition(async () => {
      const result = await completeSale({
        locationId, customerId: customer?.id ?? null, customerName: customer?.name ?? null,
        orderNote: orderNote || null, items: buildCartInput(), discountAmount, paymentMethod,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      showNotice("Sale completed");
      clearCart();
      router.refresh();
    });
  }

  function handlePark(kind: HeldSaleKind) {
    setError(null);
    if (cart.length === 0) return setError("Cart is empty.");
    startTransition(async () => {
      const result = await parkSale({
        locationId, customerId: customer?.id ?? null, customerName: customer?.name ?? null, customerPhone: customer?.phone ?? null,
        orderNote: orderNote || null, items: buildCartInput(), subtotal, discountAmount: itemsDiscount + discountAmount, taxAmount: taxTotal, total, kind,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      showNotice(kind === "hold" ? "Sale held" : "Saved as draft");
      clearCart();
      router.refresh();
    });
  }

  function openHeldList(kind: HeldSaleKind) {
    setHeldKind(kind);
    setHeldOpen(true);
    setHeldLoading(true);
    listHeldSales(kind).then((list) => { setHeldList(list); setHeldLoading(false); });
  }

  function handleResume(id: string) {
    startTransition(async () => {
      const resumed = await resumeHeldSale(id);
      if (!resumed) return;
      setCart(
        resumed.items.map((i) => ({
          key: crypto.randomUUID(), ...i,
          maxStock: products.find((p) => p.id === i.productId)?.stockQuantity ?? i.quantity,
        }))
      );
      setCustomer(resumed.customerId ? { id: resumed.customerId, name: resumed.customerName ?? "", phone: resumed.customerPhone, email: null } : null);
      setOrderNote(resumed.orderNote ?? "");
      if (resumed.locationId) setLocationId(resumed.locationId);
      setHeldOpen(false);
      router.refresh();
    });
  }

  async function handleDeleteHeld(id: string) {
    await deleteHeldSale(id);
    setHeldList((prev) => prev.filter((h) => h.id !== id));
  }

  return (
    <div className="grid h-full grid-cols-1 gap-5 xl:grid-cols-[1fr_400px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">POS</h1>
            <p className="mt-0.5 text-sm text-ledger-500 dark:text-ledger-400">Select products and add to cart</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => openHeldList("hold")}><Pause className="h-3.5 w-3.5" /> Held Sales</Button>
            <Button variant="outline" size="sm" onClick={() => openHeldList("draft")}><FileText className="h-3.5 w-3.5" /> Drafts</Button>
          </div>
        </div>

        <div className="flex items-center gap-4 border-b border-ledger-100 dark:border-ledger-700">
          {[{ key: "all", label: "All Products" }, { key: "frequent", label: "Frequently Sold" }, { key: "categories", label: "Categories" }].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as typeof tab)}
              className={cn("pb-2 text-sm font-medium", tab === t.key ? "border-b-2 border-signal text-ink-900 dark:text-white" : "text-ledger-400")}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "categories" && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setActiveCategory("all")} className={cn("rounded-full px-3 py-1.5 text-sm", activeCategory === "all" ? "bg-ink-900 text-white dark:bg-white dark:text-ink-900" : "border border-ledger-200 text-ledger-600 dark:border-ledger-700")}>All</button>
            {categories.map((c) => (
              <button key={c} onClick={() => setActiveCategory(c)} className={cn("rounded-full px-3 py-1.5 text-sm", activeCategory === c ? "bg-ink-900 text-white dark:bg-white dark:text-ink-900" : "border border-ledger-200 text-ledger-600 dark:border-ledger-700")}>{c}</button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ledger-400" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onBarcodeEnter} placeholder="Search products by name, SKU or scan barcode..." className="pl-9" />
          </div>
          <Button variant="outline" size="md"><Filter className="h-4 w-4" /> Filters</Button>
          <div className="flex overflow-hidden rounded-md border border-ledger-200 dark:border-ledger-700">
            <button onClick={() => setView("grid")} className={cn("p-2", view === "grid" ? "bg-ink-900 text-white dark:bg-white dark:text-ink-900" : "text-ledger-400")}><LayoutGrid className="h-4 w-4" /></button>
            <button onClick={() => setView("list")} className={cn("p-2", view === "list" ? "bg-ink-900 text-white dark:bg-white dark:text-ink-900" : "text-ledger-400")}><List className="h-4 w-4" /></button>
          </div>
        </div>

        <div className={cn(view === "grid" ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" : "space-y-2")}>
          {filteredProducts.length === 0 && <p className="col-span-full py-10 text-center text-sm text-ledger-400">No products match your search.</p>}
          {filteredProducts.map((p) =>
            view === "grid" ? (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                disabled={p.stockQuantity <= 0}
                className="flex flex-col items-start rounded-md border border-ledger-100 bg-white p-3 text-left transition-all hover:border-signal hover:shadow-card-hover disabled:opacity-40 dark:border-ledger-700 dark:bg-ink-900"
              >
                <div className="mb-2 flex h-16 w-full items-center justify-center rounded-md bg-ledger-100 dark:bg-white/[0.06]">
                  <Package className="h-6 w-6 text-ledger-400" />
                </div>
                <p className="line-clamp-2 text-sm font-medium text-ink-900 dark:text-white">{p.name}</p>
                <p className="mt-1 font-mono text-sm text-ink-900 dark:text-white">{formatCurrency(p.unitPrice, currency)}</p>
                <p className={cn("text-xs", p.stockQuantity > 0 ? "text-signal" : "text-alert")}>In Stock ({p.stockQuantity})</p>
              </button>
            ) : (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                disabled={p.stockQuantity <= 0}
                className="flex w-full items-center gap-3 rounded-md border border-ledger-100 bg-white p-2.5 text-left hover:border-signal disabled:opacity-40 dark:border-ledger-700 dark:bg-ink-900"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-ledger-100 dark:bg-white/[0.06]"><Package className="h-4 w-4 text-ledger-400" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink-900 dark:text-white">{p.name}</span>
                  <span className="block text-xs text-ledger-400">{p.sku}</span>
                </span>
                <span className="font-mono text-sm text-ink-900 dark:text-white">{formatCurrency(p.unitPrice, currency)}</span>
                <span className={cn("text-xs", p.stockQuantity > 0 ? "text-signal" : "text-alert")}>({p.stockQuantity})</span>
              </button>
            )
          )}
        </div>
      </div>

      <Card accent="signal" className="flex h-fit flex-col">
        <CardContent className="space-y-4 pt-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-ink-900 dark:text-white">Current Sale ({cart.length})</h2>
            {cart.length > 0 && (
              <button onClick={clearCart} className="flex items-center gap-1 text-xs text-alert hover:underline">
                <Trash2 className="h-3.5 w-3.5" /> Clear Cart
              </button>
            )}
          </div>

          {notice && <div className="rounded-md border border-signal/30 bg-signal-soft px-3 py-2 text-xs text-ink-900 dark:bg-signal/10 dark:text-white">{notice}</div>}
          {error && <div className="rounded-md border border-alert/30 bg-alert-soft px-3 py-2 text-xs text-alert">{error}</div>}

          <div className="max-h-72 space-y-2 overflow-y-auto">
            {cart.length === 0 && <p className="py-8 text-center text-sm text-ledger-400">Cart is empty — click a product to add it.</p>}
            {cart.map((l) => (
              <div key={l.key} className="flex items-center gap-2 rounded-md border border-ledger-100 p-2 dark:border-ledger-700">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ledger-100 dark:bg-white/[0.06]"><Package className="h-4 w-4 text-ledger-400" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900 dark:text-white">{l.name}</p>
                  <p className="text-xs text-ledger-400">{formatCurrency(l.unitPrice, currency)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => updateQty(l.key, -1)} className="rounded border border-ledger-200 p-1 text-ledger-500 hover:bg-ledger-50 dark:border-ledger-700"><Minus className="h-3 w-3" /></button>
                  <span className="w-6 text-center text-sm">{l.quantity}</span>
                  <button onClick={() => updateQty(l.key, 1)} className="rounded border border-ledger-200 p-1 text-ledger-500 hover:bg-ledger-50 dark:border-ledger-700"><Plus className="h-3 w-3" /></button>
                </div>
                <span className="w-20 shrink-0 text-right font-mono text-sm text-ink-900 dark:text-white">{formatCurrency(l.quantity * l.unitPrice, currency)}</span>
                <button onClick={() => removeLine(l.key)} className="shrink-0 text-alert/70 hover:text-alert"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>

          <div className="relative">
            {customer ? (
              <div className="flex h-10 items-center justify-between rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white">
                <span className="truncate">{customer.name}{customer.phone ? ` · ${customer.phone}` : ""}</span>
                <button onClick={() => setCustomer(null)}><X className="h-3.5 w-3.5 text-ledger-400" /></button>
              </div>
            ) : (
              <div className="flex gap-1.5">
                <Input value={customerQuery} onFocus={() => setCustomerOpen(true)} onChange={(e) => { setCustomerQuery(e.target.value); setCustomerOpen(true); }} placeholder="Add customer (name, phone or email)" />
                <Button variant="outline" size="md" onClick={handleQuickAddCustomer} title="Quick add"><UserPlus className="h-4 w-4" /></Button>
              </div>
            )}
            {customerOpen && !customer && customerResults.length > 0 && (
              <div className="absolute left-0 right-0 top-11 z-30 max-h-40 overflow-y-auto rounded-md border border-ledger-100 bg-white py-1 shadow-card-hover dark:border-ledger-700 dark:bg-ink-900">
                {customerResults.map((c) => (
                  <button key={c.id} onClick={() => { setCustomer(c); setCustomerOpen(false); setCustomerQuery(""); }} className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-ledger-50 dark:hover:bg-white/[0.06]">
                    {c.name}{c.phone ? ` · ${c.phone}` : ""}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Input value={orderNote} onChange={(e) => setOrderNote(e.target.value)} placeholder="Add order note (optional)" />

          <div className="space-y-1.5 border-t border-ledger-100 pt-3 text-sm dark:border-ledger-700">
            <div className="flex items-center justify-between"><span className="text-ledger-500">Subtotal</span><span className="font-medium text-ink-900 dark:text-white">{formatCurrency(subtotal, currency)}</span></div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-ledger-500">Discount</span>
              <div className="flex items-center gap-1.5">
                <input type="number" min={0} step="0.01" value={discountAmount} onChange={(e) => setDiscountAmount(Number(e.target.value))} className="h-8 w-24 rounded border border-ledger-200 bg-white px-2 text-right text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white" />
                <span className="text-xs text-ledger-400">{currency}</span>
              </div>
            </div>
            <div className="flex items-center justify-between"><span className="text-ledger-500">Tax (VAT {taxRatePercent}%)</span><span className="font-medium text-ink-900 dark:text-white">{formatCurrency(taxTotal, currency)}</span></div>
            <div className="flex items-center justify-between border-t border-ledger-100 pt-2 dark:border-ledger-700">
              <span className="font-display text-base font-semibold text-ink-900 dark:text-white">Total</span>
              <span className="font-display text-xl font-semibold text-signal">{formatCurrency(total, currency)}</span>
            </div>
          </div>

          <Button variant="primary" size="lg" className="w-full bg-signal hover:bg-signal/90" onClick={handleCompleteSale} disabled={isPending || cart.length === 0}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />} Pay &amp; Complete Sale
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="md" onClick={() => handlePark("hold")} disabled={isPending || cart.length === 0}><Pause className="h-4 w-4" /> Hold Sale</Button>
            <Button variant="outline" size="md" onClick={() => handlePark("draft")} disabled={isPending || cart.length === 0}><FileText className="h-4 w-4" /> Save as Draft</Button>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-ledger-500">Payment Methods</p>
            <div className="grid grid-cols-5 gap-1.5">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setPaymentMethod(m.key)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-md border p-2 text-[10px]",
                    paymentMethod === m.key ? "border-signal bg-signal-soft text-signal dark:bg-signal/10" : "border-ledger-200 text-ledger-500 dark:border-ledger-700"
                  )}
                >
                  <m.icon className="h-4 w-4" />
                  {m.label}
                </button>
              ))}
              <button className="flex flex-col items-center gap-1 rounded-md border border-ledger-200 p-2 text-[10px] text-ledger-500 dark:border-ledger-700">
                <MoreHorizontal className="h-4 w-4" /> More
              </button>
            </div>
          </div>

          {locations.length > 1 && (
            <div className="pt-2">
              <label className="mb-1 block text-xs font-medium text-ledger-500">Branch</label>
              <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="h-9 w-full rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white">
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={heldOpen} onClose={() => setHeldOpen(false)} title={heldKind === "hold" ? "Held Sales" : "Draft Sales"}>
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {heldLoading && <p className="py-6 text-center text-sm text-ledger-400">Loading...</p>}
          {!heldLoading && heldList.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-ledger-400">
              <Inbox className="h-6 w-6" /> Nothing here yet.
            </div>
          )}
          {heldList.map((h) => (
            <div key={h.id} className="flex items-center justify-between rounded-md border border-ledger-100 p-3 text-sm dark:border-ledger-700">
              <div>
                <p className="text-ink-900 dark:text-white">{h.customerName ?? "Walk-in Customer"}</p>
                <p className="text-xs text-ledger-400">{h.itemCount} item(s) · {formatCurrency(h.total, currency)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => handleResume(h.id)}>Resume</Button>
                <button onClick={() => handleDeleteHeld(h.id)} className="text-alert/70 hover:text-alert"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      </Dialog>
    </div>
  );
}