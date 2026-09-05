"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Search, Package, Loader2, UserPlus, Pause, FileText, Banknote, CreditCard, Smartphone,
  X, Trash2, Inbox, ChevronsLeft, XCircle, Briefcase, Calculator as CalculatorIcon,
 RotateCcw, Keyboard, PlusCircle, Plus, Delete, History, Layers, Tag, CheckCircle2, Printer, Pencil, Calendar, ChevronsRight,
  Lock, Download, Users, User,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/sales/format";
import { buildBrandedInvoiceHtml } from "@/lib/sales/invoice-template";
import { useAppStore, THEMES } from "@/store/useAppStore";
import {
  completeSale, parkSale, listHeldSales, resumeHeldSale, deleteHeldSale, searchCustomers, addCustomer,
  getRecentPosSales, getSaleForEdit, updateSale, getInvoiceData,
  getCashiersToday, getRegisterSummary, closeRegister, listRegisterClosures,
  type CartItemInput, type CustomerOption, type HeldSaleSummary, type RecentSale, type NewContactInput,
  type CashierOption, type RegisterSummary, type RegisterClosureRecord,
} from "@/app/(dashboard)/pos/actions";
import type { HeldSaleKind } from "@/types/database";
import { CrossBranchStockButton } from "@/components/inventory/cross-branch-stock-button";

export interface PosProduct {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  category: string | null;
  brand: string | null;
  unitPrice: number;
  stockQuantity: number;
  imageUrl?: string | null;
}

export interface LocationOption { id: string; name: string; }
export interface StockLevel { productId: string; locationId: string; quantity: number; }

interface PosViewProps {
  products: PosProduct[];
  categories: string[];
  brands: string[];
  locations: LocationOption[];
  stockLevels: StockLevel[];
  currency: string;
  taxRatePercent: number;
  cashierName: string;
  canCheckCrossBranchStock: boolean;
}

interface CartLine extends CartItemInput {
  key: string;
  maxStock: number;
}

const CART_WIDTH_OPTIONS = [20, 30, 40, 50, 60];

function isoToLocalDate(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function PosView({ products, categories, brands, locations, stockLevels, currency, taxRatePercent, cashierName, canCheckCrossBranchStock }: PosViewProps) {
  const router = useRouter();
  const { activeTheme, setSidebarCollapsed } = useAppStore();
  const theme = THEMES[activeTheme];

  // The POS screen needs the full width — collapse the nav sidebar on
  // entry and restore whatever it was set to when leaving.
  React.useEffect(() => {
    const wasCollapsed = useAppStore.getState().sidebarCollapsed;
    setSidebarCollapsed(true);
    return () => setSidebarCollapsed(wasCollapsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [browseTab, setBrowseTab] = React.useState<"category" | "brands">("category");
  const [cartWidthPercent, setCartWidthPercent] = React.useState(30);
         const [expandMenuOpen, setExpandMenuOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [searchDropdownOpen, setSearchDropdownOpen] = React.useState(false);
  const [activeCategory, setActiveCategory] = React.useState("all");
  const [activeBrand, setActiveBrand] = React.useState("all");
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [priceEditLine, setPriceEditLine] = React.useState<CartLine | null>(null);
  const [cartAddSignal, setCartAddSignal] = React.useState(0);
  const cartListRef = React.useRef<HTMLDivElement>(null);
  const [locationId, setLocationId] = React.useState(locations[0]?.id ?? "");
  const [selectResetKey, setSelectResetKey] = React.useState(0);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const [customer, setCustomer] = React.useState<CustomerOption | null>(null);
  const [customerQuery, setCustomerQuery] = React.useState("");
  const [customerResults, setCustomerResults] = React.useState<CustomerOption[]>([]);
  const [customerOpen, setCustomerOpen] = React.useState(false);
  const [addContactOpen, setAddContactOpen] = React.useState(false);
  const [saleDate, setSaleDate] = React.useState(() => isoToLocalDate(new Date().toISOString()));
  const [discountAmount, setDiscountAmount] = React.useState(0);
  const [shippingAmount, setShippingAmount] = React.useState(0);
  const [paymentMethod, setPaymentMethod] = React.useState("Cash");
  const [editingSaleId, setEditingSaleId] = React.useState<string | null>(null);

  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const [heldOpen, setHeldOpen] = React.useState(false);
  const [heldKind, setHeldKind] = React.useState<HeldSaleKind>("hold");
  const [heldList, setHeldList] = React.useState<HeldSaleSummary[]>([]);
  const [heldLoading, setHeldLoading] = React.useState(false);

  const [recentOpen, setRecentOpen] = React.useState(false);
  const [recentTab, setRecentTab] = React.useState<HeldSaleKind | "final">("final");
  const [recentFinal, setRecentFinal] = React.useState<RecentSale[]>([]);
  const [recentDrafts, setRecentDrafts] = React.useState<HeldSaleSummary[]>([]);
  const [recentLoading, setRecentLoading] = React.useState(false);

  const [calcOpen, setCalcOpen] = React.useState(false);
  const [multiPayOpen, setMultiPayOpen] = React.useState(false);
  const [multiPay, setMultiPay] = React.useState({ cash: 0, card: 0, momo: 0 });

  const [registerOpen, setRegisterOpen] = React.useState(false);
  const [registerTab, setRegisterTab] = React.useState<"close" | "history">("close");
  const [registerScope, setRegisterScope] = React.useState<"all" | "individual">("all");
  const [registerCashierId, setRegisterCashierId] = React.useState<string | null>(null);
  const [cashiersToday, setCashiersToday] = React.useState<CashierOption[]>([]);
  const [registerSummary, setRegisterSummary] = React.useState<RegisterSummary | null>(null);
  const [registerLoading, setRegisterLoading] = React.useState(false);
  const [registerClosing, setRegisterClosing] = React.useState(false);
  const [historyList, setHistoryList] = React.useState<RegisterClosureRecord[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);

  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Auto-scroll the cart list to the newest entry every time an item is
  // added — new lines are appended at the bottom, so without this the
  // latest scan/click is invisible until the user scrolls down manually.
  React.useLayoutEffect(() => {
    if (cartAddSignal === 0) return;
    const el = cartListRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [cartAddSignal]);

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
        return Boolean(rows && (rows.get(locationId) ?? 0) > 0);
      });
  }, [products, stockByProduct, locationId]);

  const filteredProducts = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return locationProducts.filter((p) => {
      if (activeCategory !== "all" && p.category !== activeCategory) return false;
      if (activeBrand !== "all" && p.brand !== activeBrand) return false;
      if (q && !p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q) && !(p.barcode ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [locationProducts, query, activeCategory, activeBrand]);

  // Adding a product opens the price/description popup on that line — a
  // new line at qty 1, or the existing line with its quantity bumped.
  function addToCart(product: PosProduct) {
    if (product.stockQuantity <= 0) {
      setError(`${product.name} is out of stock.`);
      return;
    }
    const existing = cart.find((l) => l.productId === product.id);
    if (existing && existing.quantity >= product.stockQuantity) {
      setError(`Only ${product.stockQuantity} unit(s) of ${product.name} available.`);
      return;
    }
    const line: CartLine = existing
      ? { ...existing, quantity: existing.quantity + 1, maxStock: product.stockQuantity }
      : { key: crypto.randomUUID(), productId: product.id, name: product.name, sku: product.sku, unitPrice: product.unitPrice, quantity: 1, discountPercent: 0, taxPercent: taxRatePercent, maxStock: product.stockQuantity, description: "" };
    setCart((prev) => (existing ? prev.map((l) => (l.productId === product.id ? line : l)) : [...prev, line]));
    setPriceEditLine(line);
    setCartAddSignal((n) => n + 1);
  }

  // Navigates to the real product-creation page. If there's anything in
  // the cart, it's parked as a suspended sale first so it isn't lost —
  // leaving POS unmounts this component and its state with it. Resume it
  // from Suspended Sales after the new product is created.
  async function handleGoAddProduct() {
    if (cart.length > 0) {
      const result = await parkSale({
        locationId, customerId: customer?.id ?? null, customerName: customer?.name ?? null, customerPhone: customer?.phone ?? null,
        orderNote: null, items: buildCartInput(), subtotal, discountAmount: itemsDiscount + discountAmount, taxAmount: taxTotal, total, kind: "hold",
      });
      if (result.ok) clearCart();
    }
    router.push("/inventory/new");
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
  function updateLinePrice(key: string, unitPrice: number) {
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, unitPrice } : l)));
    setPriceEditLine((prev) => (prev && prev.key === key ? { ...prev, unitPrice } : prev));
  }
  function updateLineDescription(key: string, description: string) {
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, description } : l)));
    setPriceEditLine((prev) => (prev && prev.key === key ? { ...prev, description } : prev));
  }
  function removeLine(key: string) {
    setCart((prev) => prev.filter((l) => l.key !== key));
  }
  function clearCart() {
    setCart([]);
    setCustomer(null);
    setDiscountAmount(0);
    setShippingAmount(0);
    setSaleDate(isoToLocalDate(new Date().toISOString()));
    setEditingSaleId(null);
  }
  function handleVoid() {
    if (cart.length === 0) return;
    if (window.confirm("Clear the current sale? This can't be undone.")) clearCart();
  }
  function handleLocationChange(newLocationId: string) {
    if (newLocationId === locationId) return;
    if (cart.length > 0 && !window.confirm("Changing Location/Branch will clear All entries made")) {
      setSelectResetKey((k) => k + 1);
      return;
    }
    setLocationId(newLocationId);
    clearCart();
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

  function buildCartInput(): CartItemInput[] {
   return cart.map((l) => ({ productId: l.productId, name: l.name, sku: l.sku, unitPrice: l.unitPrice, quantity: l.quantity, discountPercent: l.discountPercent, taxPercent: l.taxPercent, description: l.description }));  }

  // Accepts an explicit method so quick-pay buttons (Cash/Card/MOMO/Credit)
  // don't race React's async state batching — setPaymentMethod(x) followed
  // immediately by handleCompleteSale() would still read the OLD value.
  async function printInvoice(saleId: string) {
    const data = await getInvoiceData(saleId);
    if (!data) {
      setError("Couldn't load the invoice for that sale.");
      return;
    }
    const html = buildBrandedInvoiceHtml(data);
    const win = window.open("", "_blank", "width=850,height=950");
    if (!win) {
      setError("Your browser blocked the receipt window — allow pop-ups for this site to print receipts.");
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }

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
        saleDate,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      showNotice(`Sale completed — ${method}`);
      if (result.saleId) printInvoice(result.saleId);
      clearCart();
      router.refresh();
    });
  }

  function handleUpdateSale() {
    setError(null);
    if (!editingSaleId) return;
    if (cart.length === 0) return setError("Cart is empty.");
    if (!locationId) return setError("Select a branch/location.");
    startTransition(async () => {
      const result = await updateSale(editingSaleId, {
        locationId, customerId: customer?.id ?? null, customerName: customer?.name ?? null,
        orderNote: null, items: buildCartInput(), discountAmount, shippingAmount, paymentMethod,
        saleDate,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      showNotice("Sale updated");
      clearCart();
      setRecentOpen(false);
      router.refresh();
    });
  }

  function handleCancelEdit() {
    clearCart();
  }

  function handleEditSale(id: string) {
    startTransition(async () => {
      const sale = await getSaleForEdit(id);
      if (!sale) {
        setError("Couldn't load that sale for editing.");
        return;
      }
      const targetLocationId = sale.locationId ?? locationId;
      setCart(
        sale.items.map((i) => {
          const rows = stockByProduct.get(i.productId);
          // The item's own quantity in this sale is "available again" for
          // this edit, since updateSale reclaims it before re-validating.
          const rawStock = rows ? (rows.get(targetLocationId) ?? 0) : products.find((p) => p.id === i.productId)?.stockQuantity ?? i.quantity;
          return { key: crypto.randomUUID(), ...i, maxStock: rawStock + i.quantity };
        })
      );
      setCustomer(sale.customerId ? { id: sale.customerId, name: sale.customerName ?? "", phone: null, email: null } : null);
      if (sale.locationId) setLocationId(sale.locationId);
      setPaymentMethod(sale.paymentMethod);
      setDiscountAmount(sale.discountAmount);
      setShippingAmount(sale.shippingAmount);
      setSaleDate(sale.saleDate);
      setEditingSaleId(id);
      setRecentOpen(false);
      showNotice("Editing sale — update the cart, then press Update Sale.");
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
      setEditingSaleId(null);
      setHeldOpen(false);
      setRecentOpen(false);
      router.refresh();
    });
  }

  async function handleDeleteHeld(id: string) {
    await deleteHeldSale(id);
    setHeldList((prev) => prev.filter((h) => h.id !== id));
  }

  function openRecentTransactions() {
    setRecentOpen(true);
    setRecentTab("final");
    loadRecentTab("final");
  }
  function loadRecentTab(tab: HeldSaleKind | "final") {
    setRecentTab(tab);
    setRecentLoading(true);
    if (tab === "final") {
      getRecentPosSales(locationId).then((list) => { setRecentFinal(list); setRecentLoading(false); });
    } else {
      listHeldSales(tab).then((list) => { setRecentDrafts(list); setRecentLoading(false); });
    }
  }

  function openRegisterDialog() {
    setRegisterOpen(true);
    setRegisterTab("close");
    setRegisterScope("all");
    setRegisterCashierId(null);
    setRegisterSummary(null);
    reloadRegisterSummary("all", null);
    getCashiersToday(locationId).then(setCashiersToday);
  }

  function reloadRegisterSummary(scope: "all" | "individual", cashierId: string | null) {
    setRegisterLoading(true);
    getRegisterSummary(locationId, scope === "individual" ? cashierId : null).then((s) => {
      setRegisterSummary(s);
      setRegisterLoading(false);
    });
  }

  function handleRegisterScopeChange(scope: "all" | "individual") {
    setRegisterScope(scope);
    if (scope === "all") {
      setRegisterCashierId(null);
      reloadRegisterSummary("all", null);
    } else if (registerCashierId) {
      reloadRegisterSummary("individual", registerCashierId);
    } else {
      setRegisterSummary(null);
    }
  }

  function handleRegisterCashierChange(cashierId: string) {
    setRegisterCashierId(cashierId);
    reloadRegisterSummary("individual", cashierId);
  }

  function handleCloseRegister() {
    if (registerScope === "individual" && !registerCashierId) {
      setError("Select which cashier to close.");
      return;
    }
    setRegisterClosing(true);
    const cashierName = cashiersToday.find((c) => c.id === registerCashierId)?.name ?? null;
    startTransition(async () => {
      const result = await closeRegister({ locationId, scope: registerScope, cashierId: registerCashierId, cashierName });
      setRegisterClosing(false);
      if (!result.ok) {
        setError(result.error ?? "Couldn't close the register.");
        return;
      }
      showNotice("Register closed — recorded in history.");
      loadRegisterHistory();
      setRegisterTab("history");
    });
  }

  function loadRegisterHistory() {
    setHistoryLoading(true);
    listRegisterClosures(locationId).then((list) => { setHistoryList(list); setHistoryLoading(false); });
  }

  function switchRegisterTab(tab: "close" | "history") {
    setRegisterTab(tab);
    if (tab === "history" && historyList.length === 0) loadRegisterHistory();
  }

  function summaryCsv(s: RegisterSummary, label: string) {
    const rows = [
      ["Register Close Report", label],
      ["Period", `${new Date(s.periodStart).toLocaleString()} - ${new Date(s.periodEnd).toLocaleString()}`],
      [],
      ["Metric", "Amount"],
      ["Sales count", String(s.salesCount)],
      ["Sales total", s.salesTotal.toFixed(2)],
      ["Cash", s.cashTotal.toFixed(2)],
      ["Card", s.cardTotal.toFixed(2)],
      ["Mobile Money", s.momoTotal.toFixed(2)],
      ["Other (credit/split)", s.otherTotal.toFixed(2)],
      ["Expenses", s.expensesTotal.toFixed(2)],
      ["Net", s.netTotal.toFixed(2)],
    ];
    return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  }

  function exportSummaryCsv(s: RegisterSummary, label: string) {
    const csv = summaryCsv(s, label);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `register-close-${new Date(s.periodStart).toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printSummary(s: RegisterSummary, label: string) {
    const win = window.open("", "_blank", "width=500,height=700");
    if (!win) {
      setError("Your browser blocked the report window — allow pop-ups for this site.");
      return;
    }
    const rowHtml = (k: string, v: string, bold = false) =>
      `<div style="display:flex;justify-content:space-between;padding:6px 0;font-weight:${bold ? 700 : 400};${bold ? "border-top:1px solid #ddd;margin-top:6px;padding-top:10px;" : ""}"><span>${k}</span><span>${v}</span></div>`;
    win.document.write(`
      <!DOCTYPE html><html><head><meta charset="utf-8" /><title>Register Close Report</title>
      <style>body{font-family:-apple-system,sans-serif;padding:24px;max-width:420px;margin:0 auto;color:#14210f;}
      h1{font-size:18px;margin-bottom:2px;}p{color:#667;font-size:12px;margin-top:0;}</style></head><body>
      <h1>Register Close Report</h1>
      <p>${label} · ${new Date(s.periodStart).toLocaleDateString()}</p>
      ${rowHtml("Sales count", String(s.salesCount))}
      ${rowHtml("Sales total", formatCurrency(s.salesTotal, currency))}
      ${rowHtml("Cash", formatCurrency(s.cashTotal, currency))}
      ${rowHtml("Card", formatCurrency(s.cardTotal, currency))}
      ${rowHtml("Mobile Money", formatCurrency(s.momoTotal, currency))}
      ${rowHtml("Other (credit/split)", formatCurrency(s.otherTotal, currency))}
      ${rowHtml("Expenses", formatCurrency(s.expensesTotal, currency))}
      ${rowHtml("Net", formatCurrency(s.netTotal, currency), true)}
      </body></html>`);
    win.document.close();
    win.focus();
    win.print();
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
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-ledger-100 bg-white p-2.5 dark:border-ledger-700 dark:bg-ink-900">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-ledger-500">Location:</span>
          <select key={selectResetKey} value={locationId} onChange={(e) => handleLocationChange(e.target.value)} className="h-10 rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white">            {locations.length === 0 && <option value="">No branch</option>}
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <span className="flex h-10 items-center gap-1.5 rounded-md px-3 text-xs font-semibold text-white" style={{ background: theme.colors.primary }}>{dateLabel}</span>

        <div className="ml-auto flex min-w-0 flex-1 items-center justify-around gap-4 px-3">
          <button title="Back" onClick={() => router.back()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-ledger-200 text-ledger-500 hover:bg-ledger-50 dark:border-ledger-700"><ChevronsLeft className="h-4 w-4" /></button>
          <button title="Void sale" onClick={handleVoid} disabled={cart.length === 0} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-alert/30 text-alert hover:bg-alert-soft disabled:opacity-40"><XCircle className="h-4 w-4" /></button>
          <Link href="/sales" title="Register / all sales" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-signal/30 text-signal hover:bg-signal-soft"><Briefcase className="h-4 w-4" /></Link>
          <button title="Calculator" onClick={() => setCalcOpen(true)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-signal/30 text-signal hover:bg-signal-soft"><CalculatorIcon className="h-4 w-4" /></button>
          <button title="Refresh stock" onClick={() => router.refresh()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-ledger-200 text-ledger-500 hover:bg-ledger-50 dark:border-ledger-700"><RotateCcw className="h-4 w-4" /></button>
          <button title="Focus search / scan" onClick={() => searchInputRef.current?.focus()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-blue-200 text-blue-600 hover:bg-blue-50"><Keyboard className="h-4 w-4" /></button>
          <button title="Suspended sales" onClick={() => openHeldList("hold")} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-ledger-200 text-ledger-500 hover:bg-ledger-50 dark:border-ledger-700"><Pause className="h-4 w-4" /></button>
          <button title="Close Register" onClick={openRegisterDialog} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-amber/40 text-amber hover:bg-amber-soft"><Lock className="h-4 w-4" /></button>
        </div>

        <div className="ml-2 flex items-center gap-2 border-l border-ledger-200 pl-4 dark:border-ledger-700">
          <CrossBranchStockButton query={query} enabled={canCheckCrossBranchStock && Boolean(query.trim()) && filteredProducts.length === 0} />
          <Link href="/accounting/expenses/new">
            <Button
              size="sm"
              className="text-white transition-colors"
              style={{ background: theme.colors.primary }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = theme.colors.primaryMid; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = theme.colors.primary; }}
            >
              <PlusCircle className="h-3.5 w-3.5" /> Add Expense
            </Button>
          </Link>
        </div>
      </div>

      {/* Main: product grid (left) + cart panel (right). Right column width
          is dynamic (toggled by the expand button on the cart panel) since
          Tailwind can't interpolate an arbitrary grid-template from state. */}
      <div
        className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[var(--pos-left)_var(--pos-right)]"
        style={{ "--pos-left": `${100 - cartWidthPercent}%`, "--pos-right": `${cartWidthPercent}%` } as React.CSSProperties}      >
        {/* LEFT: images/grid */}
        <div className="flex min-h-0 flex-col gap-3">
          <div className="flex gap-2">
            <button
              onClick={() => setBrowseTab("category")}
              className={cn("flex flex-1 items-center justify-center gap-2 rounded-md py-3 text-sm font-semibold text-white", browseTab !== "category" && "bg-ledger-300 dark:bg-ledger-700")}
              style={browseTab === "category" ? { background: theme.colors.primary } : undefined}
            >
              <Layers className="h-4 w-4" /> Category
            </button>
            <button
              onClick={() => setBrowseTab("brands")}
              className={cn("flex flex-1 items-center justify-center gap-2 rounded-md py-3 text-sm font-semibold text-white", browseTab !== "brands" && "bg-ledger-300 dark:bg-ledger-700")}
              style={browseTab === "brands" ? { background: theme.colors.primary } : undefined}
            >
              <Tag className="h-4 w-4" /> Brands
            </button>
          </div>

          {browseTab === "category" && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setActiveCategory("all")}
                className={cn("rounded-full px-3 py-1.5 text-xs font-medium", activeCategory !== "all" && "border border-ledger-200 text-ledger-600 dark:border-ledger-700")}
                style={activeCategory === "all" ? { background: theme.colors.primary, color: "#fff" } : undefined}
              >
                All
              </button>
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setActiveCategory(c)}
                  className={cn("rounded-full px-3 py-1.5 text-xs font-medium", activeCategory !== c && "border border-ledger-200 text-ledger-600 dark:border-ledger-700")}
                  style={activeCategory === c ? { background: theme.colors.primary, color: "#fff" } : undefined}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          {browseTab === "brands" && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setActiveBrand("all")}
                className={cn("rounded-full px-3 py-1.5 text-xs font-medium", activeBrand !== "all" && "border border-ledger-200 text-ledger-600 dark:border-ledger-700")}
                style={activeBrand === "all" ? { background: theme.colors.primary, color: "#fff" } : undefined}
              >
                All
              </button>
              {brands.map((brand) => (
                <button
                  key={brand}
                  onClick={() => setActiveBrand(brand)}
                  className={cn("rounded-full px-3 py-1.5 text-xs font-medium", activeBrand !== brand && "border border-ledger-200 text-ledger-600 dark:border-ledger-700")}
                  style={activeBrand === brand ? { background: theme.colors.primary, color: "#fff" } : undefined}
                >
                  {brand}
                </button>
              ))}
              {brands.length === 0 && <p className="text-xs text-ledger-400">No brands have been assigned to products yet.</p>}
            </div>
          )}

          <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto pb-2 sm:grid-cols-3 lg:grid-cols-4">
            {filteredProducts.length === 0 && <p className="col-span-full py-10 text-center text-sm text-ledger-400">No products match your search.</p>}
            {filteredProducts.map((p) => (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                disabled={p.stockQuantity <= 0}
                className="flex flex-col items-center rounded-md border border-ledger-100 bg-white p-2.5 text-center transition-all hover:border-signal hover:shadow-card-hover disabled:opacity-40 dark:border-ledger-700 dark:bg-ink-900"
              >
                <div className="relative mb-2 flex h-20 w-full items-center justify-center overflow-hidden rounded-md border border-ledger-100 bg-white p-1.5 dark:border-ledger-700 dark:bg-ink-900">
                  {p.imageUrl ? (
                    <Image src={p.imageUrl} alt={p.name} fill className="object-contain" unoptimized />
                  ) : (
                    <Package className="h-6 w-6 text-ledger-400" />
                  )}
                </div>
                <p className="line-clamp-2 text-[11px] font-medium leading-tight text-ink-900 dark:text-white">{p.name}</p>
                <div className="mt-1 flex w-full items-center justify-between gap-1">
                  <span className="font-mono text-xs text-ink-900 dark:text-white">{formatCurrency(p.unitPrice, currency)}</span>
                  <span className={cn("text-[10px] font-medium", p.stockQuantity > 0 ? "text-signal" : "text-alert")}>({p.stockQuantity})</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* RIGHT: customer + search + cart table + totals */}
        <Card accent="signal" className="relative flex min-h-0 flex-col" style={{ borderLeftColor: theme.colors.primary }}>
          <div className="absolute -left-3 top-1/2 z-20 -translate-y-1/2">
            <button
              title="Resize the cart panel"
              onClick={() => setExpandMenuOpen((v) => !v)}
              className="flex h-8 w-6 items-center justify-center rounded-md border border-ledger-200 bg-white text-ledger-500 shadow-card hover:bg-ledger-50 dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-300"
            >
              {cartWidthPercent >= 50 ? <ChevronsRight className="h-3.5 w-3.5" /> : <ChevronsLeft className="h-3.5 w-3.5" />}
            </button>
            {expandMenuOpen && (
              <div className="absolute left-1/2 top-full z-30 mt-1 w-24 -translate-x-1/2 rounded-md border border-ledger-200 bg-white py-1 shadow-card-hover dark:border-ledger-700 dark:bg-ink-900">
                {CART_WIDTH_OPTIONS.map((pct) => (
                  <button
                    key={pct}
                    onClick={() => { setCartWidthPercent(pct); setExpandMenuOpen(false); }}
                    className={cn(
                      "block w-full px-3 py-1.5 text-center text-xs font-medium hover:bg-ledger-50 dark:hover:bg-white/[0.06]",
                      cartWidthPercent === pct ? "font-bold text-signal" : "text-ledger-600 dark:text-ledger-300"
                    )}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            )}
          </div>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-5">
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                {customer ? (
                  <div className="flex h-10 items-center justify-between rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white">
                    <span className="truncate">{customer.name}</span>
                    <button onClick={() => setCustomer(null)} className="flex h-6 w-6 items-center justify-center rounded-full text-alert hover:bg-alert-soft">
                      <X className="h-4 w-4" strokeWidth={3} />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <Input value={customerQuery} onFocus={() => setCustomerOpen(true)} onChange={(e) => { setCustomerQuery(e.target.value); setCustomerOpen(true); }} placeholder="Walk-In Customer" className="h-10" />
                    <Button variant="outline" size="md" onClick={() => setAddContactOpen(true)} title="Add a new contact"><UserPlus className="h-4 w-4" /></Button>
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

               <div className="flex gap-1">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ledger-400" />
                  <Input
                    ref={searchInputRef}
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setSearchDropdownOpen(true); }}
                    onFocus={() => setSearchDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setSearchDropdownOpen(false), 150)}
                    onKeyDown={onBarcodeEnter}
                    placeholder="Product name / SKU / scan barcode"
                    className="h-10 pl-9"
                  />
                  {searchDropdownOpen && query.trim() && filteredProducts.length > 0 && (
                    <div className="absolute left-0 right-0 top-11 z-30 max-h-72 overflow-y-auto rounded-md border border-ledger-100 bg-white py-1 shadow-card-hover dark:border-ledger-700 dark:bg-ink-900">
                      {filteredProducts.slice(0, 10).map((p) => (
                        <button
                          key={p.id}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { addToCart(p); setQuery(""); setSearchDropdownOpen(false); }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = theme.colors.primary + "20"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                          disabled={p.stockQuantity <= 0}
                          className="block w-full px-3 py-2 text-left disabled:opacity-50"
                        >
                          <p className="truncate text-sm font-medium text-ink-900 dark:text-white">{p.name}</p>
                          <p className="text-xs text-ledger-400">
                            Price: {formatCurrency(p.unitPrice, currency)} · {p.stockQuantity > 0 ? `${p.stockQuantity}Pc(s)` : "Out of stock"}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
               <button
                  type="button"
                  onClick={handleGoAddProduct}
                  title="Add new product"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition-transform hover:scale-105 active:scale-95"
                  style={{ background: theme.colors.primary }}
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
              {/* Select date — under the Walk-In Customer field. sale_date is a
                  DATE column (no time component), so this is date-only. */}
              <div className="relative col-span-1">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ledger-400" />
                <input
                  type="date"
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                  className="h-10 w-full rounded-md border border-ledger-200 bg-white pl-9 pr-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                />
              </div>
            </div>

           <div ref={cartListRef} className="min-h-0 flex-1 overflow-y-auto rounded-md border border-ledger-100 dark:border-ledger-700">
             <table className="w-full text-[15px]">                <thead className="sticky top-0 border-b border-ledger-100 bg-ledger-50 text-sm font-bold text-ink-900 dark:border-ledger-700 dark:bg-white/[0.04] dark:text-white">
                  <tr>
                    <th className="px-2 py-2 text-left font-bold">Product</th>
                    <th className="px-2 py-2 text-center font-bold">Quantity</th>
                    <th className="px-2 py-2 text-right font-bold">Subtotal</th>
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
                         <button onClick={() => updateQty(l.key, -1)} className="rounded border border-alert/30 px-1.5 text-alert hover:bg-alert-soft">−</button>
                          <input
                            type="number"
                            value={l.quantity}
                            onChange={(e) => setQtyDirect(l.key, Number(e.target.value))}
                            className="h-7 w-12 rounded border border-ledger-200 bg-white text-center text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                          />
                          <button onClick={() => updateQty(l.key, 1)} className="rounded border border-signal/30 px-1.5 text-signal hover:bg-signal-soft">+</button>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-ink-900 dark:text-white">{formatCurrency(l.quantity * l.unitPrice, currency)}</td>
                       <td className="px-2 py-2 text-center">
                        <button onClick={() => removeLine(l.key)} className="text-alert hover:text-alert/70">
                          <X className="h-5 w-5" strokeWidth={3} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-ledger-500">Cashier</span>
              <span className="rounded-full px-3 py-1 text-xs font-bold text-white" style={{ background: theme.colors.primary }}>{cashierName}</span>
            </div>

            <div className="space-y-2 border-t border-ledger-100 pt-3 text-[15px] font-semibold dark:border-ledger-700">
              <div className="grid grid-cols-2 gap-x-4">
                <div className="flex items-baseline justify-between"><span className="text-ledger-500">Items:</span><span className="font-bold text-ink-900 dark:text-white">{itemCount.toFixed(2)}</span></div>
                <div className="flex items-baseline justify-between"><span className="text-ledger-500">Total:</span><span className="font-bold text-ink-900 dark:text-white">{formatCurrency(subtotal - itemsDiscount + taxTotal, currency)}</span></div>
              </div>
              <div className="grid grid-cols-3 gap-x-2 text-xs">
                <div>
                  <span className="text-ledger-500">Discount (-):</span>
                  <input type="number" min={0} step="0.01" value={discountAmount} onChange={(e) => setDiscountAmount(Number(e.target.value))} className="mt-1 h-7 w-full rounded border border-ledger-200 bg-white px-2 text-right text-sm font-bold dark:border-ledger-700 dark:bg-ink-900 dark:text-white" />
                </div>
                <div>
                  <span className="text-ledger-500">Order Tax(+):</span>
                  <div className="mt-1 flex h-7 items-center justify-end rounded border border-transparent px-2 font-bold text-ink-900 dark:text-white">{formatCurrency(taxTotal, currency)}</div>
                </div>
                <div>
                  <span className="text-ledger-500">Shipping(+):</span>
                  <input type="number" min={0} step="0.01" value={shippingAmount} onChange={(e) => setShippingAmount(Number(e.target.value))} className="mt-1 h-7 w-full rounded border border-ledger-200 bg-white px-2 text-right text-sm font-bold dark:border-ledger-700 dark:bg-ink-900 dark:text-white" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom action bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ledger-100 bg-white p-2 dark:border-ledger-700 dark:bg-ink-900">
        {editingSaleId ? (
          <>
            <div className="flex items-center gap-1.5 rounded-md bg-signal-soft px-2.5 py-1.5 text-xs font-semibold text-signal">
              <Pencil className="h-3.5 w-3.5" /> Editing a saved sale
            </div>
            <Button variant="primary" className="bg-signal hover:bg-signal/90" onClick={handleUpdateSale} disabled={isPending || cart.length === 0}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />} Update Sale
            </Button>
            <Button variant="outline" onClick={handleCancelEdit} disabled={isPending}>Cancel Edit</Button>
          </>
        ) : (
          <>
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
          </>
        )}

        <div className="ml-2">
          <p className="text-xs font-semibold text-ledger-500">Total Payable:</p>
          <p className="font-display text-xl font-bold" style={{ color: theme.colors.primary }}>{formatCurrency(total, currency)}</p>
        </div>

        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={openRecentTransactions}><History className="h-3.5 w-3.5" /> Recent Transactions</Button>
        </div>
      </div>

     {/* Edit price / description for the just-added cart line */}
      <Dialog open={!!priceEditLine} onClose={() => setPriceEditLine(null)} title={priceEditLine?.name ?? ""}>
        {priceEditLine && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-semibold text-ink-900 dark:text-white">Unit Price</label>
              <input
                type="number"
                min={0}
                step="0.01"
                autoFocus
                value={priceEditLine.unitPrice}
                onFocus={(e) => e.target.select()}
                onChange={(e) => updateLinePrice(priceEditLine.key, Number(e.target.value) || 0)}
                className="h-11 w-full rounded-md border border-ledger-200 bg-white px-3 text-base font-semibold text-ink-900 dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-ink-900 dark:text-white">Description</label>
              <textarea
                rows={3}
                value={priceEditLine.description ?? ""}
                onChange={(e) => updateLineDescription(priceEditLine.key, e.target.value)}
                placeholder="Add product IMEI, Serial number or other informations here."
                className="w-full rounded-md border border-ledger-200 bg-white px-3 py-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
              />
            </div>
            <div className="flex justify-end border-t border-ledger-100 pt-3 dark:border-ledger-700">
              <Button variant="primary" className="bg-ink-900 hover:bg-ink-900/90" onClick={() => setPriceEditLine(null)}>Close</Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Held / draft sales (Pause icon shortcut) */}
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

      {/* Recent transactions: Final / Draft tabs, numbered rows, Edit + Print */}
      <Dialog open={recentOpen} onClose={() => setRecentOpen(false)} title="Recent Transactions" className="max-w-3xl">
        <div className="space-y-3">
          <div className="flex gap-4 border-b border-ledger-100 dark:border-ledger-700">
            <button
              onClick={() => loadRecentTab("final")}
              className={cn("flex items-center gap-1.5 border-b-2 pb-2 text-sm font-medium", recentTab === "final" ? "border-signal text-signal" : "border-transparent text-ledger-400 hover:text-ledger-600")}
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Final
            </button>
            <button
              onClick={() => loadRecentTab("draft")}
              className={cn("flex items-center gap-1.5 border-b-2 pb-2 text-sm font-medium", recentTab === "draft" ? "border-signal text-signal" : "border-transparent text-ledger-400 hover:text-ledger-600")}
            >
              <FileText className="h-3.5 w-3.5" /> Draft
            </button>
          </div>

          <div className="max-h-80 space-y-1 overflow-y-auto">
            {recentLoading && <p className="py-6 text-center text-sm text-ledger-400">Loading...</p>}

            {!recentLoading && recentTab === "final" && recentFinal.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-ledger-400"><Inbox className="h-6 w-6" /> No sales yet at this branch.</div>
            )}
            {!recentLoading && recentTab === "final" && recentFinal.map((s, i) => (
              <div key={s.id} className="flex items-center justify-between gap-2 border-b border-ledger-50 py-2.5 text-sm dark:border-white/5">
                <span className="w-6 shrink-0 text-ledger-400">{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-ink-900 dark:text-white">{s.saleNumber} <span className="text-ledger-400">({s.customerName ?? "Walk-In Customer"})</span></p>
                  <p className="truncate text-xs text-ledger-400">{s.itemsSummary}</p>
                </div>
                <span className="w-20 shrink-0 text-right font-mono text-ink-900 dark:text-white">{formatCurrency(s.total, currency)}</span>
                <span className="ml-3 flex shrink-0 gap-1.5">
                  <button onClick={() => handleEditSale(s.id)} className="flex items-center gap-1 rounded-md border border-signal/40 px-2 py-1 text-xs font-medium text-signal hover:bg-signal-soft"><Pencil className="h-3 w-3" /> Edit</button>
                  <button onClick={() => printInvoice(s.id)} className="flex items-center gap-1 rounded-md border border-ledger-300 px-2 py-1 text-xs font-medium text-ledger-600 hover:bg-ledger-50 dark:border-ledger-600 dark:text-ledger-300"><Printer className="h-3 w-3" /> Print</button>
                </span>
              </div>
            ))}

            {!recentLoading && recentTab === "draft" && recentDrafts.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-ledger-400"><Inbox className="h-6 w-6" /> No drafts saved.</div>
            )}
            {!recentLoading && recentTab === "draft" && recentDrafts.map((h, i) => (
              <div key={h.id} className="flex items-center justify-between border-b border-ledger-50 py-2.5 text-sm dark:border-white/5">
                <span className="w-6 shrink-0 text-ledger-400">{i + 1}.</span>
                <span className="flex-1 truncate text-ink-900 dark:text-white">{h.customerName ?? "Walk-In Customer"} <span className="text-ledger-400">· {h.itemCount} item(s)</span></span>
                <span className="w-20 shrink-0 text-right font-mono text-ink-900 dark:text-white">{formatCurrency(h.total, currency)}</span>
                <span className="ml-3 flex shrink-0 gap-1.5">
                  <button onClick={() => handleResume(h.id)} className="flex items-center gap-1 rounded-md border border-signal/40 px-2 py-1 text-xs font-medium text-signal hover:bg-signal-soft"><Pencil className="h-3 w-3" /> Resume</button>
                  <button onClick={() => handleDeleteHeld(h.id)} className="flex items-center gap-1 rounded-md border border-alert/30 px-2 py-1 text-xs font-medium text-alert hover:bg-alert-soft"><Trash2 className="h-3 w-3" /> Delete</button>
                </span>
              </div>
            ))}
          </div>
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

      {/* Close Register — Close tab + History tab (the persistent register-details button) */}
      <Dialog open={registerOpen} onClose={() => setRegisterOpen(false)} title="Register" className="max-w-lg">
        <div className="space-y-4">
          <div className="flex gap-4 border-b border-ledger-100 dark:border-ledger-700">
            <button
              onClick={() => switchRegisterTab("close")}
              className={cn("flex items-center gap-1.5 border-b-2 pb-2 text-sm font-medium", registerTab === "close" ? "border-amber text-amber" : "border-transparent text-ledger-400 hover:text-ledger-600")}
            >
              <Lock className="h-3.5 w-3.5" /> Close Register
            </button>
            <button
              onClick={() => switchRegisterTab("history")}
              className={cn("flex items-center gap-1.5 border-b-2 pb-2 text-sm font-medium", registerTab === "history" ? "border-amber text-amber" : "border-transparent text-ledger-400 hover:text-ledger-600")}
            >
              <History className="h-3.5 w-3.5" /> History
            </button>
          </div>

          {registerTab === "close" && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={() => handleRegisterScopeChange("all")}
                  className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-sm font-semibold", registerScope === "all" ? "bg-ink-900 text-white dark:bg-white dark:text-ink-900" : "border border-ledger-200 text-ledger-600 dark:border-ledger-700")}
                >
                  <Users className="h-3.5 w-3.5" /> All cashiers
                </button>
                <button
                  onClick={() => handleRegisterScopeChange("individual")}
                  className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-sm font-semibold", registerScope === "individual" ? "bg-ink-900 text-white dark:bg-white dark:text-ink-900" : "border border-ledger-200 text-ledger-600 dark:border-ledger-700")}
                >
                  <User className="h-3.5 w-3.5" /> Individual
                </button>
              </div>

              {registerScope === "individual" && (
                cashiersToday.length === 0 ? (
                  <p className="rounded-md border border-dashed border-ledger-200 py-4 text-center text-xs text-ledger-400 dark:border-ledger-700">No one has sold anything at this branch today yet.</p>
                ) : (
                  <select
                    value={registerCashierId ?? ""}
                    onChange={(e) => handleRegisterCashierChange(e.target.value)}
                    className="h-10 w-full rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                  >
                    <option value="" disabled>Select a cashier...</option>
                    {cashiersToday.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )
              )}

              {registerLoading && <p className="py-6 text-center text-sm text-ledger-400">Loading summary...</p>}

              {!registerLoading && registerSummary && (registerScope === "all" || registerCashierId) && (
                <>
                  <div className="rounded-md border border-ledger-100 dark:border-ledger-700">
                    <div className="flex items-center justify-between border-b border-ledger-100 px-3 py-2 text-sm dark:border-ledger-700">
                      <span className="text-ledger-500">Sales ({registerSummary.salesCount})</span>
                      <span className="font-bold text-ink-900 dark:text-white">{formatCurrency(registerSummary.salesTotal, currency)}</span>
                    </div>
                    <div className="flex items-center justify-between px-3 py-2 text-xs text-ledger-500"><span>Cash</span><span>{formatCurrency(registerSummary.cashTotal, currency)}</span></div>
                    <div className="flex items-center justify-between px-3 py-2 text-xs text-ledger-500"><span>Card</span><span>{formatCurrency(registerSummary.cardTotal, currency)}</span></div>
                    <div className="flex items-center justify-between px-3 py-2 text-xs text-ledger-500"><span>Mobile Money</span><span>{formatCurrency(registerSummary.momoTotal, currency)}</span></div>
                    <div className="flex items-center justify-between px-3 py-2 text-xs text-ledger-500"><span>Other (credit/split)</span><span>{formatCurrency(registerSummary.otherTotal, currency)}</span></div>
                    <div className="flex items-center justify-between border-t border-ledger-100 px-3 py-2 text-xs text-alert dark:border-ledger-700"><span>Expenses</span><span>−{formatCurrency(registerSummary.expensesTotal, currency)}</span></div>
                    <div className="flex items-center justify-between border-t border-ledger-100 bg-signal-soft px-3 py-2 text-sm font-bold text-signal dark:border-ledger-700"><span>Net</span><span>{formatCurrency(registerSummary.netTotal, currency)}</span></div>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => exportSummaryCsv(registerSummary, registerScope === "all" ? "All cashiers" : (cashiersToday.find((c) => c.id === registerCashierId)?.name ?? ""))}>
                      <Download className="h-3.5 w-3.5" /> Export CSV
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => printSummary(registerSummary, registerScope === "all" ? "All cashiers" : (cashiersToday.find((c) => c.id === registerCashierId)?.name ?? ""))}>
                      <Printer className="h-3.5 w-3.5" /> Print / Save as PDF
                    </Button>
                  </div>

                  <Button variant="primary" className="w-full bg-amber hover:bg-amber/90" onClick={handleCloseRegister} disabled={registerClosing}>
                    {registerClosing && <Loader2 className="h-4 w-4 animate-spin" />} Close Register
                  </Button>
                  <p className="text-center text-[11px] text-ledger-400">This records today's totals as a close-out — it doesn't stop new sales from being made.</p>
                </>
              )}
            </div>
          )}

          {registerTab === "history" && (
            <div className="max-h-96 space-y-2 overflow-y-auto">
              {historyLoading && <p className="py-6 text-center text-sm text-ledger-400">Loading...</p>}
              {!historyLoading && historyList.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-ledger-400"><Inbox className="h-6 w-6" /> No register closures recorded yet.</div>
              )}
              {historyList.map((h) => (
                <div key={h.id} className="rounded-md border border-ledger-100 p-3 text-sm dark:border-ledger-700">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-ink-900 dark:text-white">
                      {h.scope === "all" ? "All cashiers" : (h.cashierName ?? "Individual")} · {h.locationName ?? "—"}
                    </p>
                    <span className="font-bold text-signal">{formatCurrency(h.netTotal, currency)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-ledger-400">
                    {new Date(h.closedAt).toLocaleString()} · {h.salesCount} sale(s) · {formatCurrency(h.salesTotal, currency)} sales, {formatCurrency(h.expensesTotal, currency)} expenses
                  </p>
                  <div className="mt-2 flex gap-1.5">
                    <button onClick={() => exportSummaryCsv(h, h.scope === "all" ? "All cashiers" : (h.cashierName ?? ""))} className="flex items-center gap-1 rounded-md border border-ledger-300 px-2 py-1 text-xs font-medium text-ledger-600 hover:bg-ledger-50 dark:border-ledger-600 dark:text-ledger-300"><Download className="h-3 w-3" /> CSV</button>
                    <button onClick={() => printSummary(h, h.scope === "all" ? "All cashiers" : (h.cashierName ?? ""))} className="flex items-center gap-1 rounded-md border border-ledger-300 px-2 py-1 text-xs font-medium text-ledger-600 hover:bg-ledger-50 dark:border-ledger-600 dark:text-ledger-300"><Printer className="h-3 w-3" /> Print</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Dialog>

      {/* Add a new contact */}
     <AddContactDialog
        open={addContactOpen}
        onClose={() => setAddContactOpen(false)}
        onSaved={(c) => { setCustomer(c); setAddContactOpen(false); }}
      />

        </div>
  );
}

function AddContactDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (c: CustomerOption) => void }) {
  const [contactType, setContactType] = React.useState<"individual" | "business">("individual");
  const [name, setName] = React.useState("");
  const [contactId, setContactId] = React.useState("");
  const [mobile, setMobile] = React.useState("");
  const [alternatePhone, setAlternatePhone] = React.useState("");
  const [landline, setLandline] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [more, setMore] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  function reset() {
    setContactType("individual"); setName(""); setContactId(""); setMobile("");
    setAlternatePhone(""); setLandline(""); setEmail(""); setMore(false); setErr(null);
  }

  async function handleSave() {
    setErr(null);
    if (!name.trim()) return setErr("Name is required.");
    setSaving(true);
    const input: NewContactInput = {
      name, contactType, contactId: contactId || null, phone: mobile,
      alternatePhone: alternatePhone || null, landline: landline || null, email: email || null,
    };
    const result = await addCustomer(input);
    setSaving(false);
    if (!result.ok || !result.customer) { setErr(result.error ?? "Couldn't save contact."); return; }
    onSaved(result.customer);
    reset();
  }

  return (
    <Dialog open={open} onClose={() => { onClose(); reset(); }} title="Add a new contact" className="max-w-2xl">
      <div className="space-y-4">
        {err && <div className="rounded-md border border-alert/30 bg-alert-soft px-3 py-2 text-sm text-alert">{err}</div>}

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-sm text-ledger-600 dark:text-ledger-300">
            <input type="radio" checked={contactType === "individual"} onChange={() => setContactType("individual")} /> Individual
          </label>
          <label className="flex items-center gap-1.5 text-sm text-ledger-600 dark:text-ledger-300">
            <input type="radio" checked={contactType === "business"} onChange={() => setContactType("business")} /> Business
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ledger-500">{contactType === "business" ? "Business name*" : "Name*"}</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={contactType === "business" ? "Business name" : "Full name"} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ledger-500">Contact ID</label>
            <Input value={contactId} onChange={(e) => setContactId(e.target.value)} placeholder="Contact ID (optional)" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ledger-500">Mobile*</label>
            <Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="Mobile" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ledger-500">Alternate contact number</label>
            <Input value={alternatePhone} onChange={(e) => setAlternatePhone(e.target.value)} placeholder="Alternate contact number" />
          </div>
        </div>

        {more && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ledger-500">Landline</label>
              <Input value={landline} onChange={(e) => setLandline(e.target.value)} placeholder="Landline" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ledger-500">Email</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
            </div>
          </div>
        )}

        <button onClick={() => setMore((v) => !v)} className="text-sm font-medium text-signal hover:underline">
          {more ? "Fewer information" : "More Information"} {more ? "▲" : "▼"}
        </button>
        <p className="text-xs text-ledger-400">
          Customer Group and Assigned-To aren't available yet — those need their own setup (a customer-group list, a staff picker) that this catalog doesn't have.
        </p>

        <div className="flex justify-end gap-2 border-t border-ledger-100 pt-3 dark:border-ledger-700">
          <Button variant="primary" onClick={handleSave} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save</Button>
          <Button variant="outline" onClick={() => { onClose(); reset(); }}>Close</Button>
        </div>
      </div>
    </Dialog>
  );
}

function AddCustomProductDialog({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (name: string, price: number, quantity: number) => void }) {
  const [name, setName] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [quantity, setQuantity] = React.useState("1");
  const [err, setErr] = React.useState<string | null>(null);

  function reset() {
    setName(""); setPrice(""); setQuantity("1"); setErr(null);
  }

  function handleAdd() {
    setErr(null);
    if (!name.trim()) return setErr("Product name is required.");
    const p = Number(price);
    if (!(p > 0)) return setErr("Enter a price greater than 0.");
    const q = Math.max(1, Number(quantity) || 1);
    onAdd(name.trim(), p, q);
    reset();
  }

  return (
    <Dialog open={open} onClose={() => { onClose(); reset(); }} title="Add Custom Product">
      <div className="space-y-4">
        {err && <div className="rounded-md border border-alert/30 bg-alert-soft px-3 py-2 text-sm text-alert">{err}</div>}
        <div>
          <label className="mb-1 block text-xs font-semibold text-ledger-500">Product Name*</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Screen Protector, Repair Fee" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ledger-500">Unit Price*</label>
            <Input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ledger-500">Quantity</label>
            <Input type="number" min={1} step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-ledger-100 pt-3 dark:border-ledger-700">
          <Button variant="primary" onClick={handleAdd}>Add to Cart</Button>
          <Button variant="outline" onClick={() => { onClose(); reset(); }}>Cancel</Button>
        </div>
      </div>
    </Dialog>
  );
}

function PosCalculator() {  const [display, setDisplay] = React.useState("0");
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