"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search, Package, Loader2, UserPlus, Pause, FileText, Banknote, CreditCard, Smartphone,
  X, Trash2, Inbox, ChevronsLeft, XCircle, Briefcase, Calculator as CalculatorIcon,
  RotateCcw, Keyboard, PlusCircle, Delete, History, Layers, Tag,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/sales/format";
import {
  completeSale, parkSale, listHeldSales, resumeHeldSale, deleteHeldSale, searchCustomers, quickAddCustomer,
  getRecentPosSales,
  type CartItemInput, type CustomerOption, type HeldSaleSummary, type RecentSale,
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
export interface StockLevel { productId: string; locationId: string; quantity: number; }

interface PosViewProps {
  products: PosProduct[];
  categories: string[];
  locations: LocationOption[];
  stockLevels: StockLevel[];
  currency: string;
  taxRatePercent: number;
  cashierName: string;
}

interface CartLine extends CartItemInput {
  key: string;
  maxStock: number;
}

export function PosView({ products, categories, locations, stockLevels, currency, taxRatePercent, cashierName }: PosViewProps) {
  const router = useRouter();
  const [browseTab, setBrowseTab] = React.useState<"category" | "brands">("category");
  const [query, setQuery] = React.useState("");
  const [activeCategory, setActiveCategory] = React.useState("all");
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [locationId, setLocationId] = React.useState(locations[0]?.id ?? "");
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const [customer, setCustomer] = React.useState<CustomerOption | null>(null);
  const [customerQuery, setCustomerQuery] = React.useState("");
  const [customerResults, setCustomerResults] = React.useState<CustomerOption[]>([]);
  const [customerOpen, setCustomerOpen] = React.useState(false);
  const [discountAmount, setDiscountAmount] = React.useState(0);
  const [shippingAmount, setShippingAmount] = React.useState(0);
  const [paymentMethod, setPaymentMethod] = React.useState("Cash");

  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const [heldOpen, setHeldOpen] = React.useState(false);
  const [heldKind, setHeldKind] = React.useState<HeldSaleKind>("hold");
  const [heldList, setHeldList] = React.useState<HeldSaleSummary[]>([]);
  const [heldLoading, setHeldLoading] = React.useState(false);

  const [recentOpen, setRecentOpen] = React.useState(false);
  const [recentList, setRecentList] = React.useState<RecentSale[]>([]);
  const [recentLoading, setRecentLoading] = React.useState(false);

  const [calcOpen, setCalcOpen] = React.useState(false);
  const [multiPayOpen, setMultiPayOpen] = React.useState(false);
  const [multiPay, setMultiPay] = React.useState({ cash: 0, card: 0, momo: 0 });

  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  function showNotice(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  }

  // product_id -> location_id -> quantity, for branch-scoped availability.
  const stockByProduct = React.useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const s of stockLevels) {
      if (!map.has(s.productId)) map.set(s.productId, new Map());
      map.get(s.productId)!.set(s.locationId, s.quantity);
    }
    return map;
  }, [stockLevels]);

  // Products scoped to the selected branch: a product that has NEVER been
  // assigned to any specific location (no rows at all in product_stock_levels)
  // is shown everywhere using its org-wide total. A product that IS tracked
  // per-location only shows — with that branch's real quantity — at
  // branches it's actually stocked at.
  const locationProducts = React.useMemo(() => {
    if (!locationId) return products;
    return products
      .map((p) => {
        const rows = stockByProduct.get(p.id);
        if (!rows) return p;
        return { ...p, stockQuantity: rows.get(locationId) ?? 0 };
      })
      .filter((p) => {
        const rows = stockByProduct.get(p.id);
        return !rows || rows.has(locationId);
      });
  }, [products, stockByProduct, locationId]);

  const filteredProducts = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return locationProducts.filter((p) => {
      if (activeCategory !== "all" && p.category !== activeCategory) return false;
      if (q && !p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q) && !(p.barcode ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [locationProducts, query, activeCategory]);

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
    const exact = locationProducts.find((p) => p.sku.toLowerCase() === q || (p.barcode ?? "").toLowerCase() === q);
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
  function setQtyDirect(key: string, value: number) {
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, quantity: Math.max(1, Math.min(l.maxStock, value || 1)) } : l)));
  }
  function removeLine(key: string) {
    setCart((prev) => prev.filter((l) => l.key !== key));
  }
  function clearCart() {
    setCart([]);
    setCustomer(null);
    setDiscountAmount(0);
    setShippingAmount(0);
  }
  function handleVoid() {
    if (cart.length === 0) return;
    if (window.confirm("Clear the current sale? This can't be undone.")) clearCart();
  }

  const subtotal = cart.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const itemsDiscount = cart.reduce((sum, l) => sum + (l.quantity * l.unitPrice * l.discountPercent) / 100, 0);
  const taxTotal = cart.reduce((sum, l) => {
    const gross = l.quantity * l.unitPrice;
    const disc = gross * (l.discountPercent / 100);
    return sum + (gross - disc) * (l.taxPercent / 100);
  }, 0);
  const total = Math.max(0, subtotal - itemsDiscount - discountAmount + taxTotal + shippingAmount);
  const itemCount = cart.reduce((sum, l) => sum + l.quantity, 0);

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

  // Accepts an explicit method so quick-pay buttons (Cash/Card/MOMO/Credit)
  // don't race React's async state batching — setPaymentMethod(x) followed
  // immediately by handleCompleteSale() would still read the OLD value.
  function handleCompleteSale(methodOverride?: string) {
    setError(null);
    if (cart.length === 0) return setError("Cart is empty.");
    if (!locationId) return setError("Select a branch/location.");
    const method = methodOverride ?? paymentMethod;
    setPaymentMethod(method);
    startTransition(async () => {
      const result = await completeSale({
        locationId, customerId: customer?.id ?? null, customerName: customer?.name ?? null,
        orderNote: null, items: buildCartInput(), discountAmount, shippingAmount, paymentMethod: method,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      showNotice(`Sale completed — ${method}`);
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
        orderNote: null, items: buildCartInput(), subtotal, discountAmount: itemsDiscount + discountAmount, taxAmount: taxTotal, total, kind,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      showNotice(kind === "hold" ? "Sale suspended" : "Saved as draft");
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
      const targetLocationId = resumed.locationId ?? locationId;
      setCart(
        resumed.items.map((i) => {
          const rows = stockByProduct.get(i.productId);
          const stockHere = rows ? (rows.get(targetLocationId) ?? 0) : products.find((p) => p.id === i.productId)?.stockQuantity;
          return { key: crypto.randomUUID(), ...i, maxStock: stockHere ?? i.quantity };
        })
      );
      setCustomer(resumed.customerId ? { id: resumed.customerId, name: resumed.customerName ?? "", phone: resumed.customerPhone, email: null } : null);
      if (resumed.locationId) setLocationId(resumed.locationId);
      setHeldOpen(false);
      router.refresh();
    });
  }

  async function handleDeleteHeld(id: string) {
    await deleteHeldSale(id);
    setHeldList((prev) => prev.filter((h) => h.id !== id));
  }

  function openRecentTransactions() {
    setRecentOpen(true);
    setRecentLoading(true);
    getRecentPosSales(locationId).then((list) => { setRecentList(list); setRecentLoading(false); });
  }

  const multiPayTotal = multiPay.cash + multiPay.card + multiPay.momo;
  function handleMultiPayConfirm() {
    const parts: string[] = [];
    if (multiPay.cash > 0) parts.push(`Cash ${formatCurrency(multiPay.cash, currency)}`);
    if (multiPay.card > 0) parts.push(`Card ${formatCurrency(multiPay.card, currency)}`);
    if (multiPay.momo > 0) parts.push(`Mobile Money ${formatCurrency(multiPay.momo, currency)}`);
    setMultiPayOpen(false);
    handleCompleteSale(`Split (${parts.join(", ")})`);
    setMultiPay({ cash: 0, card: 0, momo: 0 });
  }

  const dateLabel = now.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" }) + " " + now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });

  return (
    <div className="flex h-full flex-col gap-3">
      {notice && <div className="rounded-md border border-signal/30 bg-signal-soft px-3 py-2 text-sm text-ink-900 dark:bg-signal/10 dark:text-white">{notice}</div>}
      {error && <div className="rounded-md border border-alert/30 bg-alert-soft px-3 py-2 text-sm text-alert">{error}</div>}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ledger-100 bg-white p-2 dark:border-ledger-700 dark:bg-ink-900">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-ledger-500">Location:</span>
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="h-9 rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white">
            {locations.length === 0 && <option value="">No branch</option>}
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <span className="flex h-9 items-center gap-1.5 rounded-md bg-ink-900 px-3 text-xs font-semibold text-white dark:bg-white dark:text-ink-900">{dateLabel}</span>

        <div className="flex items-center gap-1.5">
          <button title="Back" onClick={() => router.back()} className="flex h-9 w-9 items-center justify-center rounded-md border border-ledger-200 text-ledger-500 hover:bg-ledger-50 dark:border-ledger-700"><ChevronsLeft className="h-4 w-4" /></button>
          <button title="Void sale" onClick={handleVoid} disabled={cart.length === 0} className="flex h-9 w-9 items-center justify-center rounded-md border border-alert/30 text-alert hover:bg-alert-soft disabled:opacity-40"><XCircle className="h-4 w-4" /></button>
          <Link href="/sales" title="Register / all sales" className="flex h-9 w-9 items-center justify-center rounded-md border border-signal/30 text-signal hover:bg-signal-soft"><Briefcase className="h-4 w-4" /></Link>
          <button title="Calculator" onClick={() => setCalcOpen(true)} className="flex h-9 w-9 items-center justify-center rounded-md border border-signal/30 text-signal hover:bg-signal-soft"><CalculatorIcon className="h-4 w-4" /></button>
          <button title="Refresh stock" onClick={() => router.refresh()} className="flex h-9 w-9 items-center justify-center rounded-md border border-ledger-200 text-ledger-500 hover:bg-ledger-50 dark:border-ledger-700"><RotateCcw className="h-4 w-4" /></button>
          <button title="Focus search / scan" onClick={() => searchInputRef.current?.focus()} className="flex h-9 w-9 items-center justify-center rounded-md border border-blue-200 text-blue-600 hover:bg-blue-50"><Keyboard className="h-4 w-4" /></button>
          <button title="Suspended sales" onClick={() => openHeldList("hold")} className="flex h-9 w-9 items-center justify-center rounded-md border border-ledger-200 text-ledger-500 hover:bg-ledger-50 dark:border-ledger-700"><Pause className="h-4 w-4" /></button>
        </div>

        <div className="ml-auto">
          <Link href="/accounting/expenses/new">
            <Button variant="outline" size="sm"><PlusCircle className="h-3.5 w-3.5" /> Add Expense</Button>
          </Link>
        </div>
      </div>

      {/* Main: product grid (left) + cart panel (right) */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[1fr_420px]">
        {/* LEFT: images/grid */}
        <div className="flex min-h-0 flex-col gap-3">
          <div className="flex gap-2">
            <button
              onClick={() => setBrowseTab("category")}
              className={cn("flex flex-1 items-center justify-center gap-2 rounded-md py-3 text-sm font-semibold text-white", browseTab === "category" ? "bg-signal" : "bg-ledger-300 dark:bg-ledger-700")}
            >
              <Layers className="h-4 w-4" /> Category
            </button>
            <button
              onClick={() => setBrowseTab("brands")}
              className={cn("flex flex-1 items-center justify-center gap-2 rounded-md py-3 text-sm font-semibold text-white", browseTab === "brands" ? "bg-signal" : "bg-ledger-300 dark:bg-ledger-700")}
            >
              <Tag className="h-4 w-4" /> Brands
            </button>
          </div>

          {browseTab === "category" && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setActiveCategory("all")} className={cn("rounded-full px-3 py-1.5 text-xs font-medium", activeCategory === "all" ? "bg-ink-900 text-white dark:bg-white dark:text-ink-900" : "border border-ledger-200 text-ledger-600 dark:border-ledger-700")}>All</button>
              {categories.map((c) => (
                <button key={c} onClick={() => setActiveCategory(c)} className={cn("rounded-full px-3 py-1.5 text-xs font-medium", activeCategory === c ? "bg-ink-900 text-white dark:bg-white dark:text-ink-900" : "border border-ledger-200 text-ledger-600 dark:border-ledger-700")}>{c}</button>
              ))}
            </div>
          )}
          {browseTab === "brands" && (
            <p className="text-xs text-ledger-400">This catalog doesn't track a separate brand field yet — showing all products.</p>
          )}

          <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto pb-2 sm:grid-cols-3 lg:grid-cols-4">
            {filteredProducts.length === 0 && <p className="col-span-full py-10 text-center text-sm text-ledger-400">No products match your search.</p>}
            {filteredProducts.map((p) => (
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
            ))}
          </div>
        </div>

        {/* RIGHT: customer + search + cart table + totals */}
        <Card accent="signal" className="flex min-h-0 flex-col">
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-5">
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                {customer ? (
                  <div className="flex h-10 items-center justify-between rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white">
                    <span className="truncate">{customer.name}</span>
                    <button onClick={() => setCustomer(null)}><X className="h-3.5 w-3.5 text-ledger-400" /></button>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <Input value={customerQuery} onFocus={() => setCustomerOpen(true)} onChange={(e) => { setCustomerQuery(e.target.value); setCustomerOpen(true); }} placeholder="Walk-In Customer" />
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

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ledger-400" />
                <Input ref={searchInputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onBarcodeEnter} placeholder="Product name / SKU / scan barcode" className="pl-9" />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-ledger-100 dark:border-ledger-700">
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b border-ledger-100 bg-ledger-50 text-xs text-ledger-500 dark:border-ledger-700 dark:bg-white/[0.04]">
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold">Product</th>
                    <th className="px-2 py-2 text-center font-semibold">Quantity</th>
                    <th className="px-2 py-2 text-right font-semibold">Subtotal</th>
                    <th className="w-7 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {cart.length === 0 && (
                    <tr><td colSpan={4} className="py-10 text-center text-sm text-ledger-400">Cart is empty — click a product to add it.</td></tr>
                  )}
                  {cart.map((l) => (
                    <tr key={l.key} className="border-b border-ledger-50 last:border-0 dark:border-white/5">
                      <td className="px-2 py-2">
                        <p className="truncate font-medium text-ink-900 dark:text-white">{l.name}</p>
                        <p className="text-xs text-ledger-400">{formatCurrency(l.unitPrice, currency)}</p>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => updateQty(l.key, -1)} className="rounded border border-ledger-200 px-1.5 text-ledger-500 hover:bg-ledger-50 dark:border-ledger-700">−</button>
                          <input
                            type="number"
                            value={l.quantity}
                            onChange={(e) => setQtyDirect(l.key, Number(e.target.value))}
                            className="h-7 w-12 rounded border border-ledger-200 bg-white text-center text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                          />
                          <button onClick={() => updateQty(l.key, 1)} className="rounded border border-ledger-200 px-1.5 text-ledger-500 hover:bg-ledger-50 dark:border-ledger-700">+</button>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-ink-900 dark:text-white">{formatCurrency(l.quantity * l.unitPrice, currency)}</td>
                      <td className="px-2 py-2 text-center">
                        <button onClick={() => removeLine(l.key)} className="text-alert/70 hover:text-alert"><X className="h-3.5 w-3.5" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between text-xs text-ledger-400">
              <span>Cashier: <span className="text-ledger-600 dark:text-ledger-300">{cashierName}</span></span>
            </div>

            <div className="space-y-1.5 border-t border-ledger-100 pt-3 text-sm dark:border-ledger-700">
              <div className="flex items-center justify-between"><span className="font-semibold text-ledger-500">Items:</span><span className="font-medium text-ink-900 dark:text-white">{itemCount.toFixed(2)}</span></div>
              <div className="flex items-center justify-between"><span className="font-semibold text-ledger-500">Total:</span><span className="font-semibold text-ink-900 dark:text-white">{formatCurrency(subtotal - itemsDiscount + taxTotal, currency)}</span></div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-ledger-500">Discount (-):</span>
                <input type="number" min={0} step="0.01" value={discountAmount} onChange={(e) => setDiscountAmount(Number(e.target.value))} className="h-7 w-24 rounded border border-ledger-200 bg-white px-2 text-right text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white" />
              </div>
              <div className="flex items-center justify-between"><span className="font-semibold text-ledger-500">Order Tax(+):</span><span className="font-medium text-ink-900 dark:text-white">{formatCurrency(taxTotal, currency)}</span></div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-ledger-500">Shipping(+):</span>
                <input type="number" min={0} step="0.01" value={shippingAmount} onChange={(e) => setShippingAmount(Number(e.target.value))} className="h-7 w-24 rounded border border-ledger-200 bg-white px-2 text-right text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom action bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ledger-100 bg-white p-2 dark:border-ledger-700 dark:bg-ink-900">
        <button onClick={() => handlePark("draft")} disabled={isPending || cart.length === 0} className="flex flex-col items-center gap-0.5 px-2 py-1 text-xs font-medium text-ledger-500 hover:text-signal disabled:opacity-40">
          <FileText className="h-4 w-4" /> Draft
        </button>
        <button onClick={() => handlePark("hold")} disabled={isPending || cart.length === 0} className="flex flex-col items-center gap-0.5 px-2 py-1 text-xs font-medium text-ledger-500 hover:text-signal disabled:opacity-40">
          <Pause className="h-4 w-4" /> Suspend
        </button>
        <button onClick={() => handleCompleteSale("Credit")} disabled={isPending || cart.length === 0} className="flex flex-col items-center gap-0.5 px-2 py-1 text-xs font-medium text-ledger-500 hover:text-signal disabled:opacity-40">
          <FileText className="h-4 w-4" /> Credit Sale
        </button>
        <button onClick={() => handleCompleteSale("Card")} disabled={isPending || cart.length === 0} className="flex flex-col items-center gap-0.5 px-2 py-1 text-xs font-medium text-ledger-500 hover:text-signal disabled:opacity-40">
          <CreditCard className="h-4 w-4" /> Card
        </button>

        <Button variant="primary" className="bg-ink-900 hover:bg-ink-900/90" onClick={() => setMultiPayOpen(true)} disabled={isPending || cart.length === 0}>
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />} Multiple Pay
        </Button>
        <Button variant="primary" className="bg-signal hover:bg-signal/90" onClick={() => handleCompleteSale("Cash")} disabled={isPending || cart.length === 0}>
          <Banknote className="h-4 w-4" /> Cash
        </Button>
        <Button variant="primary" className="bg-amber hover:bg-amber/90" onClick={() => handleCompleteSale("Mobile Money")} disabled={isPending || cart.length === 0}>
          <Smartphone className="h-4 w-4" /> MOMO
        </Button>
        <Button variant="primary" className="bg-alert hover:bg-alert/90" onClick={handleVoid} disabled={cart.length === 0}>
          <X className="h-4 w-4" /> Cancel
        </Button>

        <div className="ml-2">
          <p className="text-xs font-semibold text-ledger-500">Total Payable:</p>
          <p className="font-display text-xl font-bold text-signal">{formatCurrency(total, currency)}</p>
        </div>

        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={openRecentTransactions}><History className="h-3.5 w-3.5" /> Recent Transactions</Button>
        </div>
      </div>

      {/* Held / draft sales */}
      <Dialog open={heldOpen} onClose={() => setHeldOpen(false)} title={heldKind === "hold" ? "Suspended Sales" : "Draft Sales"}>
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

      {/* Recent transactions */}
      <Dialog open={recentOpen} onClose={() => setRecentOpen(false)} title="Recent Transactions">
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {recentLoading && <p className="py-6 text-center text-sm text-ledger-400">Loading...</p>}
          {!recentLoading && recentList.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-ledger-400">
              <Inbox className="h-6 w-6" /> No sales yet at this branch.
            </div>
          )}
          {recentList.map((s) => (
            <Link key={s.id} href={`/sales/${s.id}`} className="flex items-center justify-between rounded-md border border-ledger-100 p-3 text-sm hover:border-signal dark:border-ledger-700">
              <div>
                <p className="text-ink-900 dark:text-white">{s.saleNumber} · {s.customerName ?? "Walk-in"}</p>
                <p className="text-xs text-ledger-400">{s.paymentMethod} · {new Date(s.createdAt).toLocaleString()}</p>
              </div>
              <span className="font-mono font-semibold text-ink-900 dark:text-white">{formatCurrency(s.total, currency)}</span>
            </Link>
          ))}
        </div>
      </Dialog>

      {/* Calculator */}
      <Dialog open={calcOpen} onClose={() => setCalcOpen(false)} title="Calculator">
        <PosCalculator />
      </Dialog>

      {/* Multiple Pay */}
      <Dialog open={multiPayOpen} onClose={() => setMultiPayOpen(false)} title="Split Payment">
        <div className="space-y-3">
          <p className="text-sm text-ledger-500">Total due: <span className="font-semibold text-ink-900 dark:text-white">{formatCurrency(total, currency)}</span></p>
          {([["cash", "Cash", Banknote], ["card", "Card", CreditCard], ["momo", "Mobile Money", Smartphone]] as const).map(([key, label, Icon]) => (
            <div key={key} className="flex items-center gap-2">
              <Icon className="h-4 w-4 shrink-0 text-ledger-400" />
              <span className="w-28 shrink-0 text-sm text-ledger-600 dark:text-ledger-300">{label}</span>
              <input
                type="number" min={0} step="0.01"
                value={multiPay[key]}
                onChange={(e) => setMultiPay((p) => ({ ...p, [key]: Number(e.target.value) }))}
                className="h-9 flex-1 rounded-md border border-ledger-200 bg-white px-2 text-right text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
              />
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-ledger-100 pt-2 text-sm dark:border-ledger-700">
            <span className="text-ledger-500">Remaining</span>
            <span className={cn("font-semibold", Math.abs(multiPayTotal - total) < 0.01 ? "text-signal" : "text-alert")}>{formatCurrency(total - multiPayTotal, currency)}</span>
          </div>
          <Button variant="primary" className="w-full" disabled={Math.abs(multiPayTotal - total) >= 0.01 || isPending} onClick={handleMultiPayConfirm}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />} Confirm Split Payment
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function PosCalculator() {
  const [display, setDisplay] = React.useState("0");
  const [pending, setPending] = React.useState<{ value: number; op: string } | null>(null);
  const [justEvaluated, setJustEvaluated] = React.useState(false);

  function inputDigit(d: string) {
    setDisplay((prev) => {
      if (justEvaluated) { setJustEvaluated(false); return d === "." ? "0." : d; }
      if (d === "." && prev.includes(".")) return prev;
      if (prev === "0" && d !== ".") return d;
      return prev + d;
    });
  }
  function applyOp(op: string) {
    const current = parseFloat(display);
    if (pending) {
      const result = compute(pending.value, current, pending.op);
      setDisplay(String(result));
      setPending({ value: result, op });
    } else {
      setPending({ value: current, op });
    }
    setJustEvaluated(true);
  }
  function compute(a: number, b: number, op: string) {
    switch (op) {
      case "+": return a + b;
      case "-": return a - b;
      case "×": return a * b;
      case "÷": return b === 0 ? 0 : a / b;
      default: return b;
    }
  }
  function equals() {
    if (!pending) return;
    const current = parseFloat(display);
    setDisplay(String(compute(pending.value, current, pending.op)));
    setPending(null);
    setJustEvaluated(true);
  }
  function clearAll() {
    setDisplay("0");
    setPending(null);
    setJustEvaluated(false);
  }
  function backspace() {
    setDisplay((prev) => (prev.length > 1 ? prev.slice(0, -1) : "0"));
  }

  const keys: (string | { label: string; type: "op" | "eq" | "clear" | "back" })[] = [
    "7", "8", "9", { label: "÷", type: "op" },
    "4", "5", "6", { label: "×", type: "op" },
    "1", "2", "3", { label: "-", type: "op" },
    "0", ".", { label: "C", type: "clear" }, { label: "+", type: "op" },
  ];

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-ledger-200 bg-ledger-50 px-3 py-4 text-right font-mono text-2xl text-ink-900 dark:border-ledger-700 dark:bg-white/[0.04] dark:text-white">{display}</div>
      <div className="grid grid-cols-4 gap-2">
        {keys.map((k, i) => {
          if (typeof k === "string") {
            return <button key={i} onClick={() => inputDigit(k)} className="rounded-md border border-ledger-200 py-3 text-sm font-medium text-ink-900 hover:bg-ledger-50 dark:border-ledger-700 dark:text-white dark:hover:bg-white/[0.06]">{k}</button>;
          }
          if (k.type === "clear") return <button key={i} onClick={clearAll} className="rounded-md border border-alert/30 py-3 text-sm font-semibold text-alert hover:bg-alert-soft">{k.label}</button>;
          return <button key={i} onClick={() => applyOp(k.label)} className="rounded-md border border-signal/30 py-3 text-sm font-semibold text-signal hover:bg-signal-soft">{k.label}</button>;
        })}
        <button onClick={backspace} className="col-span-2 flex items-center justify-center gap-1 rounded-md border border-ledger-200 py-3 text-sm text-ledger-600 hover:bg-ledger-50 dark:border-ledger-700 dark:text-ledger-300"><Delete className="h-4 w-4" /> Back</button>
        <button onClick={equals} className="col-span-2 rounded-md bg-signal py-3 text-sm font-semibold text-white hover:bg-signal/90">=</button>
      </div>
    </div>
  );
}