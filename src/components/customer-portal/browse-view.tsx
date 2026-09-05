"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Search,
  ShoppingCart,
  Package,
  Plus,
  X,
  Trash2,
  ShieldCheck,
  Truck,
  BadgeCheck,
  ChevronDown,
  Grid2X2,
  List,
  Box,
  FileText,
  Headphones,
  Building2,
  Network,
  Zap,
  Link2,
  Cable,
  Printer,
  BriefcaseBusiness,
  Monitor,
  Smartphone,
  ImageOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/sales/format";
import { useCart } from "@/components/customer-portal/cart-context";
import type { CatalogProduct } from "@/app/order/[orgSlug]/actions";

interface BrowseViewProps {
  orgSlug: string;
  orgName: string;
  currency: string;
  showPrices: boolean;
  products: CatalogProduct[];
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  storage: Box,
  stationery: FileText,
  audio: Headphones,
  "office equipment": Building2,
  networking: Network,
  power: Zap,
  accessories: Link2,
  cables: Cable,
  printers: Printer,
  bags: BriefcaseBusiness,
  "computer accessories": Monitor,
  monitors: Monitor,
  "printer supplies": Printer,
  phones: Smartphone,
};

function getCategoryIcon(category: string) {
  return CATEGORY_ICONS[category.toLowerCase()] ?? Package;
}

export function BrowseView({
  orgSlug,
  orgName,
  currency,
  showPrices,
  products,
}: BrowseViewProps) {
  const cart = useCart();

  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState("all");
  const [sort, setSort] = React.useState("default");
  const [view, setView] = React.useState<"grid" | "list">("grid");

  const categories = React.useMemo(
    () =>
      Array.from(
        new Set(
          products
            .map((p) => p.category)
            .filter(Boolean)
        )
      ) as string[],
    [products]
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();

    const result = products.filter((p) => {
      if (category !== "all" && p.category !== category) {
        return false;
      }

      if (
        q &&
        !p.name.toLowerCase().includes(q) &&
        !(p.brand ?? "").toLowerCase().includes(q) &&
        !(p.category ?? "").toLowerCase().includes(q)
      ) {
        return false;
      }

      return true;
    });

    if (sort === "name") {
      return [...result].sort((a, b) =>
        a.name.localeCompare(b.name)
      );
    }

    if (sort === "price-low") {
      return [...result].sort(
        (a, b) => a.unitPrice - b.unitPrice
      );
    }

    if (sort === "price-high") {
      return [...result].sort(
        (a, b) => b.unitPrice - a.unitPrice
      );
    }

    return result;
  }, [products, query, category, sort]);

  const cartItems = cart.items;

  return (
    <div className="min-h-screen bg-white text-ink-900 dark:bg-ink-950 dark:text-white">

      {/* =========================================================
          TOP HEADER
      ========================================================= */}
      <header className="sticky top-0 z-40 border-b border-ledger-200 bg-white/95 backdrop-blur dark:border-ledger-800 dark:bg-ink-950/95">
        <div className="mx-auto flex h-[74px] max-w-[1600px] items-center justify-between px-5 lg:px-7">

          {/* Brand */}
          <Link
            href={`/order/${orgSlug}`}
            className="flex items-center gap-3"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-signal text-white shadow-sm">
              <span className="text-lg font-black tracking-tight">
                OG
              </span>
            </div>

            <div>
              <p className="text-[17px] font-extrabold uppercase tracking-tight text-ink-900 dark:text-white">
                {orgName}
              </p>
              <p className="text-xs text-ledger-500">
                Customer Ordering Portal
              </p>
            </div>
          </Link>

          {/* Cart button */}
          <Link
            href={`/order/${orgSlug}/cart`}
            className="group flex items-center gap-2.5"
          >
            <div className="relative flex h-11 w-11 items-center justify-center rounded-full bg-ink-900 text-white transition-transform group-hover:scale-105 dark:bg-white dark:text-ink-900">
              <ShoppingCart className="h-5 w-5" />

              {cart.itemCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-alert text-[10px] font-bold text-white ring-2 ring-white dark:ring-ink-950">
                  {cart.itemCount > 99 ? "99+" : cart.itemCount}
                </span>
              )}
            </div>

            <span className="hidden text-xs font-semibold text-ink-800 dark:text-white sm:block">
              Cart
            </span>
          </Link>
        </div>
      </header>

      {/* =========================================================
          MAIN LAYOUT
      ========================================================= */}
      <main className="mx-auto max-w-[1600px] px-5 py-4 lg:px-7">

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[245px_minmax(0,1fr)_320px]">

          {/* =====================================================
              LEFT CATEGORY SIDEBAR
          ===================================================== */}
          <aside className="hidden xl:block">
            <div className="sticky top-[90px]">

              <div className="rounded-xl border border-ledger-200 bg-white p-3 dark:border-ledger-800 dark:bg-ink-900">

                <p className="mb-3 px-2 text-[10px] font-bold uppercase tracking-wider text-ledger-400">
                  Categories
                </p>

                <div className="space-y-0.5">

                  {/* All Categories */}
                  <CategoryButton
                    active={category === "all"}
                    onClick={() => setCategory("all")}
                    icon={Grid2X2}
                  >
                    All Categories
                  </CategoryButton>

                  {categories.map((c) => {
                    const Icon = getCategoryIcon(c);

                    return (
                      <CategoryButton
                        key={c}
                        active={category === c}
                        onClick={() => setCategory(c)}
                        icon={Icon}
                      >
                        {c}
                      </CategoryButton>
                    );
                  })}
                </div>
              </div>

              {/* Need Help */}
              <div className="mt-4 rounded-xl border border-ledger-200 bg-white p-4 dark:border-ledger-800 dark:bg-ink-900">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-signal-soft text-signal dark:bg-signal/15">
                    <Headphones className="h-4 w-4" />
                  </div>

                  <div>
                    <p className="text-xs font-bold text-ink-900 dark:text-white">
                      Need help?
                    </p>

                    <p className="mt-0.5 text-[11px] text-ledger-500">
                      Contact our support team
                    </p>

                    <p className="mt-1.5 text-[11px] font-semibold text-signal">
                      +233 24 123 4567
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          {/* =====================================================
              CENTER PRODUCT AREA
          ===================================================== */}
          <section className="min-w-0">

            {/* Mobile categories */}
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1 xl:hidden">
              <button
                onClick={() => setCategory("all")}
                className={cn(
                  "whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold",
                  category === "all"
                    ? "bg-signal text-white"
                    : "bg-ledger-100 text-ledger-700 dark:bg-ink-800 dark:text-ledger-300"
                )}
              >
                All Categories
              </button>

              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={cn(
                    "whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold",
                    category === c
                      ? "bg-signal text-white"
                      : "bg-ledger-100 text-ledger-700 dark:bg-ink-800 dark:text-ledger-300"
                  )}
                >
                  {c}
                </button>
              ))}
            </div>

            {/* =================================================
                HERO + PRODUCT HEADER — pinned below the top nav
            ================================================= */}
            <div
              className="sticky top-[90px] z-20 isolate overflow-hidden bg-signal pb-1 dark:bg-signal"
              style={{ contain: "paint" }}
            >
            <div className="relative mb-4 min-h-[145px] overflow-hidden rounded-xl border border-ledger-200 bg-gradient-to-r from-[#eef7ef] via-[#f7faf7] to-[#eef7ef] dark:border-ledger-800 dark:from-ink-900 dark:via-ink-850 dark:to-ink-900">

              {/* 3D showcase illustration */}
              <div className="absolute inset-0 hidden items-center justify-end pr-12 sm:flex">

                {/* Floating spheres */}
                <div
                  className="absolute right-[220px] top-5 h-6 w-6 rounded-full shadow-md"
                  style={{ background: "radial-gradient(circle at 32% 28%, #ffffff, #cfe9d4 55%, #a9d3b1 100%)" }}
                />
                <div
                  className="absolute right-[64px] top-1 h-4 w-4 rounded-full shadow-sm"
                  style={{ background: "radial-gradient(circle at 32% 28%, #ffffff, #cfe9d4 55%, #a9d3b1 100%)" }}
                />
                <div
                  className="absolute right-[300px] top-16 h-3 w-3 rounded-full shadow-sm"
                  style={{ background: "radial-gradient(circle at 32% 28%, #ffffff, #cfe9d4 55%, #a9d3b1 100%)" }}
                />

                {/* Back riser block */}
                <div
                  className="absolute right-[150px] bottom-6 h-16 w-16 rounded-2xl opacity-70"
                  style={{ background: "linear-gradient(135deg, #eaf4ec, #d7ecdc)" }}
                />

                {/* Podium group */}
                <div className="relative flex items-end">

                  {/* Cart card, tilted */}
                  <div className="relative z-10 -mr-4 mb-2 flex h-16 w-14 -rotate-6 items-center justify-center rounded-2xl bg-white shadow-xl">
                    <ShoppingCart className="h-6 w-6 text-signal" />
                  </div>

                  {/* Bag + pedestal */}
                  <div className="relative z-20 flex flex-col items-center">

                    {/* Shopping bag */}
                    <div
                      className="relative mb-[-6px] h-[92px] w-[74px] rounded-b-xl rounded-t-md shadow-xl"
                      style={{ background: "linear-gradient(135deg, #22a05f, #16733f)" }}
                    >
                      <div
                        className="absolute left-1/2 top-[-16px] h-8 w-10 -translate-x-1/2 rounded-t-full border-[3px] border-b-0"
                        style={{ borderColor: "#16733f" }}
                      />
                      <div className="absolute inset-y-2 left-2 w-2 rounded-full bg-white/15" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xl font-black text-white">OG</span>
                      </div>
                    </div>

                    {/* Cylindrical pedestal top */}
                    <div
                      className="h-8 w-[130px] rounded-[50%] shadow-lg"
                      style={{ background: "linear-gradient(180deg, #34b872, #1f8f52)" }}
                    />

                    {/* Ground shadow */}
                    <div
                      className="-mt-1 h-3 w-[150px] rounded-[50%]"
                      style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0.15), transparent 70%)" }}
                    />
                  </div>
                </div>
              </div>

              <div className="relative z-10 max-w-xl px-7 py-5">

                <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-ink-900 dark:text-white md:text-[29px]">
                  Customer Ordering Portal
                </h1>

                <p className="mt-1 text-sm text-ledger-600 dark:text-ledger-300">
                  Browse our products and add items to your cart
                </p>

                {/* Search */}
                <div className="relative mt-3 max-w-[430px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ledger-400" />

                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search for products, brands and more..."
                    className="h-10 w-full rounded-lg border border-ledger-200 bg-white/95 pl-9 pr-3 text-xs text-ink-900 shadow-sm outline-none transition focus:border-signal focus:ring-2 focus:ring-signal/10 dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                  />
                </div>
              </div>
            </div>

            {/* =================================================
                PRODUCT HEADER
            ================================================= */}
            <div className="mb-3 flex items-center justify-between gap-3">

              <div>
                <h2 className="text-lg font-bold tracking-tight text-ink-900 dark:text-white">
                  {category === "all" ? "All Products" : category}
                </h2>

                <p className="text-[11px] text-ledger-400">
                  {filtered.length}{" "}
                  {filtered.length === 1 ? "product" : "products"}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center overflow-hidden rounded-lg border border-ledger-200 dark:border-ledger-700">
                  <button
                    type="button"
                    onClick={() => setView("grid")}
                    title="Grid view"
                    className={cn(
                      "flex h-8 w-8 items-center justify-center transition",
                      view === "grid"
                        ? "bg-signal text-white"
                        : "text-ledger-400 hover:bg-ledger-100 dark:hover:bg-white/[0.05]"
                    )}
                  >
                    <Grid2X2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("list")}
                    title="List view"
                    className={cn(
                      "flex h-8 w-8 items-center justify-center border-l border-ledger-200 transition dark:border-ledger-700",
                      view === "list"
                        ? "bg-signal text-white"
                        : "text-ledger-400 hover:bg-ledger-100 dark:hover:bg-white/[0.05]"
                    )}
                  >
                    <List className="h-3.5 w-3.5" />
                  </button>
                </div>

                <span className="hidden text-[11px] text-ledger-400 sm:block">
                  Sort by:
                </span>

                <div className="relative">
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                    className="h-8 appearance-none rounded-lg border border-ledger-200 bg-white pl-3 pr-8 text-xs text-ledger-700 outline-none focus:border-signal dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-300"
                  >
                    <option value="default">Default</option>
                    <option value="name">Name</option>
                    {showPrices && (
                      <>
                        <option value="price-low">
                          Price: Low to High
                        </option>
                        <option value="price-high">
                          Price: High to Low
                        </option>
                      </>
                    )}
                  </select>

                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ledger-400" />
                </div>
              </div>
            </div>
            </div>

            {/* =================================================
                PRODUCTS
            ================================================= */}
            <div className="relative z-0">
            {filtered.length === 0 ? (
              <div className="rounded-xl border border-dashed border-ledger-300 bg-white py-16 text-center dark:border-ledger-700 dark:bg-ink-900">
                <Package className="mx-auto h-10 w-10 text-ledger-300" />

                <p className="mt-3 text-sm font-semibold text-ink-900 dark:text-white">
                  No products found
                </p>

                <p className="mt-1 text-xs text-ledger-400">
                  Try another search or category.
                </p>
              </div>
            ) : view === "grid" ? (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-4">

                {filtered.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    currency={currency}
                    showPrices={showPrices}
                    onAdd={() =>
                      cart.addItem({
                        productId: product.id,
                        name: product.name,
                        unitPrice: product.unitPrice,
                        maxStock: product.stockQuantity,
                      })
                    }
                  />
                ))}

              </div>
            ) : (
              <div className="divide-y divide-ledger-100 overflow-hidden rounded-xl border border-ledger-200 bg-white dark:divide-ledger-800 dark:border-ledger-800 dark:bg-ink-900">

                {filtered.map((product) => (
                  <ProductListRow
                    key={product.id}
                    product={product}
                    currency={currency}
                    showPrices={showPrices}
                    onAdd={() =>
                      cart.addItem({
                        productId: product.id,
                        name: product.name,
                        unitPrice: product.unitPrice,
                        maxStock: product.stockQuantity,
                      })
                    }
                  />
                ))}

              </div>
            )}
            </div>
          </section>

          {/* =====================================================
              RIGHT CART SIDEBAR
          ===================================================== */}
          <aside className="hidden xl:block">

            <div className="sticky top-[90px] rounded-xl border border-ledger-200 bg-white shadow-sm dark:border-ledger-800 dark:bg-ink-900">

              {/* Cart header */}
              <div className="flex items-center justify-between border-b border-ledger-100 px-4 py-4 dark:border-ledger-800">

                <div className="flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4 text-signal" />

                  <h2 className="text-xs font-bold uppercase tracking-wide text-ink-900 dark:text-white">
                    Your Cart ({cart.itemCount})
                  </h2>
                </div>

                {cartItems.length > 0 && (
                  <button
                    type="button"
                    onClick={cart.clear}
                    title="Clear cart"
                    className="text-ledger-400 transition hover:text-alert"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Cart items */}
              <div className="max-h-[330px] overflow-y-auto px-4">

                {cartItems.length === 0 ? (
                  <div className="py-10 text-center">
                    <ShoppingCart className="mx-auto h-8 w-8 text-ledger-300" />

                    <p className="mt-2 text-xs font-semibold text-ledger-500">
                      Your cart is empty
                    </p>

                    <p className="mt-1 text-[10px] text-ledger-400">
                      Add products to begin your order.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-ledger-100 dark:divide-ledger-800">

                    {cartItems.map((item) => (
                      <div
                        key={item.productId}
                        className="flex gap-2.5 py-3"
                      >

                        {/* Product thumbnail */}
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ledger-100 dark:bg-ink-800">
                          <Package className="h-5 w-5 text-ledger-400" />
                        </div>

                        <div className="min-w-0 flex-1">

                          <div className="flex items-start justify-between gap-1">
                            <p className="line-clamp-2 text-[11px] font-semibold leading-4 text-ink-900 dark:text-white">
                              {item.name}
                            </p>

                            <button
                              type="button"
                              onClick={() =>
                                cart.removeItem(item.productId)
                              }
                              className="shrink-0 text-ledger-400 hover:text-alert"
                              title="Remove"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>

                          <p className="mt-0.5 text-[10px] text-ledger-400">
                            Qty: {item.quantity}
                          </p>

                          <div className="mt-1.5 flex items-center justify-between">

                            {showPrices ? (
                              <span className="font-mono text-[10px] font-semibold text-ink-900 dark:text-white">
                                {formatCurrency(
                                  item.quantity * item.unitPrice,
                                  currency
                                )}
                              </span>
                            ) : (
                              <span className="text-[10px] text-ledger-400">
                                Price on request
                              </span>
                            )}

                            <div className="flex items-center rounded-md border border-ledger-200 dark:border-ledger-700">

                              <button
                                type="button"
                                onClick={() =>
                                  cart.updateQty(
                                    item.productId,
                                    item.quantity - 1
                                  )
                                }
                                className="flex h-5 w-5 items-center justify-center text-ledger-500 hover:bg-ledger-100 dark:hover:bg-ink-800"
                              >
                                −
                              </button>

                              <span className="w-5 text-center text-[10px] font-semibold">
                                {item.quantity}
                              </span>

                              <button
                                type="button"
                                onClick={() =>
                                  cart.updateQty(
                                    item.productId,
                                    item.quantity + 1
                                  )
                                }
                                className="flex h-5 w-5 items-center justify-center text-ledger-500 hover:bg-ledger-100 dark:hover:bg-ink-800"
                              >
                                +
                              </button>

                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Cart summary */}
              <div className="border-t border-ledger-200 px-4 py-3 dark:border-ledger-800">

                <div className="space-y-2 text-xs">

                  <div className="flex justify-between text-ledger-500">
                    <span>Subtotal</span>
                    {showPrices ? (
                      <span className="font-mono">
                        {formatCurrency(cart.subtotal, currency)}
                      </span>
                    ) : (
                      <span>--</span>
                    )}
                  </div>

                  <div className="flex justify-between text-ledger-500">
                    <span>Tax</span>
                    <span>--</span>
                  </div>

                  <div className="flex justify-between border-t border-ledger-100 pt-2.5 text-sm font-bold dark:border-ledger-800">
                    <span className="text-ink-900 dark:text-white">
                      Total
                    </span>

                    {showPrices ? (
                      <span className="font-mono text-signal">
                        {formatCurrency(cart.subtotal, currency)}
                      </span>
                    ) : (
                      <span className="text-ledger-500">
                        --
                      </span>
                    )}
                  </div>
                </div>

                <Link
                  href={`/order/${orgSlug}/cart`}
                  className={cn(
                    "mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg text-xs font-bold text-white transition",
                    cartItems.length > 0
                      ? "bg-signal hover:bg-signal/90"
                      : "pointer-events-none bg-ledger-300"
                  )}
                >
                  <ShoppingCart className="h-4 w-4" />
                  View Cart
                </Link>
              </div>

              {/* Trust features */}
              <div className="border-t border-ledger-100 px-4 py-2 dark:border-ledger-800">

                <TrustFeature
                  icon={ShieldCheck}
                  title="Secure Ordering"
                  description="Your data is safe with us"
                />

                <TrustFeature
                  icon={Truck}
                  title="Fast Delivery"
                  description="Quick and reliable delivery"
                />

                <TrustFeature
                  icon={BadgeCheck}
                  title="Quality Products"
                  description="100% genuine products"
                />

              </div>
            </div>
          </aside>
        </div>
      </main>

      {/* =========================================================
          MOBILE CART BAR
      ========================================================= */}
      {cart.itemCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-ledger-200 bg-white/95 p-3 shadow-2xl backdrop-blur xl:hidden dark:border-ledger-800 dark:bg-ink-950/95">
          <Link
            href={`/order/${orgSlug}/cart`}
            className="mx-auto flex max-w-xl items-center justify-between rounded-xl bg-signal px-4 py-3 text-white"
          >
            <div className="flex items-center gap-2">
              <div className="relative">
                <ShoppingCart className="h-5 w-5" />

                <span className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-alert text-[9px] font-bold">
                  {cart.itemCount}
                </span>
              </div>

              <span className="text-xs font-semibold">
                View Cart
              </span>
            </div>

            {showPrices && (
              <span className="font-mono text-sm font-bold">
                {formatCurrency(cart.subtotal, currency)}
              </span>
            )}
          </Link>
        </div>
      )}
    </div>
  );
}

/* ===============================================================
   CATEGORY BUTTON
=============================================================== */

function CategoryButton({
  children,
  active,
  icon: Icon,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  icon: React.ElementType;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition",
        active
          ? "bg-signal text-white shadow-sm"
          : "text-ledger-600 hover:bg-ledger-100 dark:text-ledger-300 dark:hover:bg-white/[0.05]"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{children}</span>
    </button>
  );
}

/* ===============================================================
   PRODUCT CARD
=============================================================== */

function ProductCard({
  product,
  currency,
  showPrices,
  onAdd,
}: {
  product: CatalogProduct;
  currency: string;
  showPrices: boolean;
  onAdd: () => void;
}) {
  return (
    <article className="group overflow-hidden rounded-xl border border-ledger-200 bg-white transition-all hover:-translate-y-0.5 hover:border-ledger-300 hover:shadow-md dark:border-ledger-800 dark:bg-ink-900">

      {/* Product image */}
      <div className="relative mx-2 mt-2 flex h-[125px] items-center justify-center overflow-hidden rounded-lg bg-white dark:bg-ink-900">

        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            className="object-contain p-3"
            unoptimized
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white shadow-sm dark:bg-ink-900">
            <Package className="h-8 w-8 text-ledger-300 dark:text-ledger-600" />
          </div>
        )}

      </div>

      {/* Product information */}
      <div className="p-3">

        {product.brand && (
          <p className="mb-0.5 truncate text-[9px] font-semibold uppercase tracking-wide text-ledger-400">
            {product.brand}
          </p>
        )}

        <h3 className="line-clamp-2 min-h-[32px] text-xs font-semibold leading-4 text-ink-900 dark:text-white">
          {product.name}
        </h3>

        {showPrices ? (
          <p className="mt-1.5 text-xs text-ledger-500">
            {formatCurrency(product.unitPrice, currency)}
          </p>
        ) : (
          <p className="mt-1.5 text-[11px] text-ledger-400">
            Price on request
          </p>
        )}

        <button
          type="button"
          onClick={onAdd}
          className="mt-2.5 flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-signal text-[11px] font-semibold text-white transition hover:bg-signal/90"
        >
          <Plus className="h-3.5 w-3.5" />

          Add to Cart
        </button>
      </div>
    </article>
  );
}

/* ===============================================================
   PRODUCT LIST ROW
=============================================================== */

function ProductListRow({
  product,
  currency,
  showPrices,
  onAdd,
}: {
  product: CatalogProduct;
  currency: string;
  showPrices: boolean;
  onAdd: () => void;
}) {
  const isOutOfStock = product.stockQuantity <= 0;

  return (
    <div className="flex items-center gap-3 p-3 transition hover:bg-ledger-50 dark:hover:bg-white/[0.03]">

      {/* Thumbnail */}
      <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ledger-50 dark:bg-ink-800">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            className="object-contain p-1.5"
            unoptimized
          />
        ) : (
          <Package className="h-6 w-6 text-ledger-300 dark:text-ledger-600" />
        )}
      </div>

      {/* Name / brand */}
      <div className="min-w-0 flex-1">
        {product.brand && (
          <p className="truncate text-[9px] font-semibold uppercase tracking-wide text-ledger-400">
            {product.brand}
          </p>
        )}
        <p className="truncate text-xs font-semibold text-ink-900 dark:text-white">
          {product.name}
        </p>
        {isOutOfStock && (
          <span className="mt-0.5 inline-block rounded-md bg-alert px-1.5 py-0.5 text-[9px] font-bold text-white">
            OUT OF STOCK
          </span>
        )}
      </div>

      {/* Price */}
      <div className="w-28 shrink-0 text-right">
        {showPrices ? (
          <span className="text-xs font-semibold text-ink-900 dark:text-white">
            {formatCurrency(product.unitPrice, currency)}
          </span>
        ) : (
          <span className="text-[11px] text-ledger-400">Price on request</span>
        )}
      </div>

      {/* Add to cart */}
      <button
        type="button"
        onClick={onAdd}
        disabled={isOutOfStock}
        className="flex h-8 w-28 shrink-0 items-center justify-center gap-1.5 rounded-md bg-signal text-[11px] font-semibold text-white transition hover:bg-signal/90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" />
        {isOutOfStock ? "Sold Out" : "Add"}
      </button>
    </div>
  );
}

/* ===============================================================
   TRUST FEATURE
=============================================================== */

function TrustFeature({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-2.5 py-2.5">

      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-signal-soft text-signal dark:bg-signal/15">
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-ink-900 dark:text-white">
          {title}
        </p>

        <p className="text-[9px] text-ledger-400">
          {description}
        </p>
      </div>
    </div>
  );
}