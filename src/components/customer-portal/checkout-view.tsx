"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Minus, Plus, Trash2, Loader2, Package, MapPin, Search, Store, Info } from "lucide-react";
import { formatCurrency } from "@/lib/sales/format";
import { useCart } from "@/components/customer-portal/cart-context";
import { placeOrder, type StorefrontLocation } from "@/app/order/[orgSlug]/actions";
import { cn } from "@/lib/utils";

interface CheckoutViewProps {
  orgSlug: string;
  orgId: string;
  orgName: string;
  currency: string;
  showPrices: boolean;
  allowSelectDelivery: boolean;
  allowNotes: boolean;
  allowLocationSelection: boolean;
  locations: StorefrontLocation[];
}

const DELIVERY_OPTIONS = [
  { label: "Standard Delivery", fee: 5 },
  { label: "Express Delivery", fee: 15 },
  { label: "Pickup / In-Store Collection", fee: 0 },
];

export function CheckoutView({
  orgSlug,
  orgId,
  orgName,
  currency,
  showPrices,
  allowSelectDelivery,
  allowNotes,
  allowLocationSelection,
  locations,
}: CheckoutViewProps) {
  const router = useRouter();
  const cart = useCart();
  const [fullName, setFullName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [deliveryOption, setDeliveryOption] = React.useState(DELIVERY_OPTIONS[0].label);
  const [notes, setNotes] = React.useState("");
  const [selectedLocationId, setSelectedLocationId] = React.useState<string>(locations[0]?.id ?? "");
  const [branchSearch, setBranchSearch] = React.useState("");
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const deliveryFee = DELIVERY_OPTIONS.find((d) => d.label === deliveryOption)?.fee ?? 0;
  const total = cart.subtotal + (allowSelectDelivery ? deliveryFee : 0);

  const filteredLocations = React.useMemo(() => {
    if (!branchSearch.trim()) return locations;
    const q = branchSearch.toLowerCase();
    return locations.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        (l.city && l.city.toLowerCase().includes(q)) ||
        (l.region && l.region.toLowerCase().includes(q)) ||
        (l.address && l.address.toLowerCase().includes(q))
    );
  }, [locations, branchSearch]);

  function submit() {
    setError(null);
    if (!fullName.trim()) return setError("Please enter your full name.");
    if (!phone.trim()) return setError("Please enter your phone number.");
    if (!address.trim()) return setError("Please enter your delivery or contact address.");
    if (cart.items.length === 0) return setError("Your cart is empty.");
    if (allowLocationSelection && locations.length > 0 && !selectedLocationId) {
      return setError("Please select a branch location.");
    }

    startTransition(async () => {
      const result = await placeOrder({
        orgId,
        guestName: fullName,
        guestPhone: phone,
        guestEmail: email ? email.trim() : null,
        deliveryAddress: address,
        deliveryOption: allowSelectDelivery ? deliveryOption : null,
        deliveryFee: allowSelectDelivery ? deliveryFee : 0,
        notes: allowNotes && notes.trim() ? notes.trim() : null,
        locationId: allowLocationSelection ? selectedLocationId || null : null,
        items: cart.items.map((i) => ({
          productId: i.productId,
          productName: i.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
      });

      if (!result.ok) {
        setError(result.error ?? "Failed to place order. Please try again.");
        return;
      }

      cart.clear();
      router.push(`/order/${orgSlug}/track/${result.accessToken}`);
    });
  }

  return (
    <div className="mx-auto max-w-4xl px-4 pb-24 pt-6">
      <Link
        href={`/order/${orgSlug}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ledger-600 hover:text-ink-900 dark:text-ledger-300 dark:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Storefront
      </Link>

      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2 border-b border-ledger-100 pb-4 dark:border-ledger-800">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900 dark:text-white">
            Checkout &amp; Order Review
          </h1>
          <p className="mt-0.5 text-xs text-ledger-500">{orgName} Storefront</p>
        </div>
        <span className="rounded-full bg-signal-soft px-3 py-1 text-xs font-semibold text-signal dark:bg-signal/10">
          {cart.items.length} {cart.items.length === 1 ? "Item" : "Items"} in Cart
        </span>
      </div>

      {cart.items.length === 0 ? (
        <div className="rounded-xl border border-ledger-200 bg-white p-12 text-center shadow-sm dark:border-ledger-700 dark:bg-ink-900">
          <Package className="mx-auto h-12 w-12 text-ledger-300 dark:text-ledger-600" />
          <p className="mt-3 text-base font-semibold text-ink-900 dark:text-white">Your cart is currently empty</p>
          <p className="mt-1 text-xs text-ledger-400">Add products from our catalog to proceed with checkout.</p>
          <Link
            href={`/order/${orgSlug}`}
            className="mt-5 inline-flex items-center justify-center rounded-lg bg-signal px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-signal/90"
          >
            Browse Products
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left / Main form column */}
          <div className="space-y-6 lg:col-span-7">
            {/* 1. Branch / Location Selection (Shown only when enabled) */}
            {allowLocationSelection && (
              <div className="rounded-xl border border-ledger-200 bg-white p-5 shadow-sm dark:border-ledger-700 dark:bg-ink-900">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-signal" />
                    <div>
                      <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Select Branch / Pickup Location</h2>
                      <p className="text-xs text-ledger-400">Choose the branch that will prepare and fulfill your order.</p>
                    </div>
                  </div>
                </div>

                {locations.length === 0 ? (
                  <div className="rounded-lg bg-amber-soft p-3 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
                    No physical branches registered yet. Your order will be assigned by our central administration.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Search Branch */}
                    {locations.length > 3 && (
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ledger-400" />
                        <input
                          type="text"
                          value={branchSearch}
                          onChange={(e) => setBranchSearch(e.target.value)}
                          placeholder="Search available branches by city, region..."
                          className="h-8 w-full rounded-md border border-ledger-200 bg-ledger-50/50 pl-8 pr-3 text-xs text-ink-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-signal dark:border-ledger-700 dark:bg-ink-800 dark:text-white"
                        />
                      </div>
                    )}

                    {/* Available Locations Grid/List */}
                    <div className="grid max-h-48 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                      {filteredLocations.map((loc) => {
                        const isSelected = selectedLocationId === loc.id;
                        return (
                          <button
                            key={loc.id}
                            type="button"
                            onClick={() => setSelectedLocationId(loc.id)}
                            className={cn(
                              "flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition-all",
                              isSelected
                                ? "border-signal bg-signal-soft/40 ring-1 ring-signal dark:bg-signal/15"
                                : "border-ledger-200 bg-white hover:border-ledger-300 hover:bg-ledger-50/50 dark:border-ledger-700 dark:bg-ink-850 dark:hover:bg-ink-800"
                            )}
                          >
                            <Store className={cn("mt-0.5 h-4 w-4 shrink-0", isSelected ? "text-signal" : "text-ledger-400")} />
                            <div className="min-w-0 flex-1">
                              <p className={cn("truncate text-xs font-semibold", isSelected ? "text-signal dark:text-white" : "text-ink-900 dark:text-white")}>
                                {loc.name}
                              </p>
                              {(loc.city || loc.region) && (
                                <p className="truncate text-[11px] text-ledger-500 dark:text-ledger-400">
                                  {[loc.city, loc.region].filter(Boolean).join(", ")}
                                </p>
                              )}
                              {loc.address && <p className="truncate text-[10px] text-ledger-400">{loc.address}</p>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 2. Customer Information */}
            <div className="space-y-4 rounded-xl border border-ledger-200 bg-white p-5 shadow-sm dark:border-ledger-700 dark:bg-ink-900">
              <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Customer &amp; Contact Details</h2>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Customer Full Name" required>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Kwame Asare"
                    className="h-9 w-full rounded-md border border-ledger-200 bg-white px-3 text-xs text-ink-900 focus:outline-none focus:ring-1 focus:ring-signal dark:border-ledger-700 dark:bg-ink-800 dark:text-white"
                  />
                </Field>

                <Field label="Phone Number" required>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. +233 24 123 4567"
                    className="h-9 w-full rounded-md border border-ledger-200 bg-white px-3 text-xs text-ink-900 focus:outline-none focus:ring-1 focus:ring-signal dark:border-ledger-700 dark:bg-ink-800 dark:text-white"
                  />
                </Field>
              </div>

              <Field label="Email Address (Optional)">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. kwame@example.com"
                  className="h-9 w-full rounded-md border border-ledger-200 bg-white px-3 text-xs text-ink-900 focus:outline-none focus:ring-1 focus:ring-signal dark:border-ledger-700 dark:bg-ink-800 dark:text-white"
                />
              </Field>

              <Field label="Delivery / Contact Address" required>
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={2}
                  placeholder="Street name, landmark, digital address or building number"
                  className="w-full rounded-md border border-ledger-200 bg-white px-3 py-2 text-xs text-ink-900 focus:outline-none focus:ring-1 focus:ring-signal dark:border-ledger-700 dark:bg-ink-800 dark:text-white"
                />
              </Field>

              {allowSelectDelivery && (
                <Field label="Preferred Delivery Method">
                  <select
                    value={deliveryOption}
                    onChange={(e) => setDeliveryOption(e.target.value)}
                    className="h-9 w-full rounded-md border border-ledger-200 bg-white px-3 text-xs text-ink-900 focus:outline-none focus:ring-1 focus:ring-signal dark:border-ledger-700 dark:bg-ink-800 dark:text-white"
                  >
                    {DELIVERY_OPTIONS.map((d) => (
                      <option key={d.label} value={d.label}>
                        {d.label} {showPrices ? `(${formatCurrency(d.fee, currency)})` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              {allowNotes && (
                <Field label="Order Notes / Delivery Instructions (Optional)">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="e.g. Call upon arrival, leave at the front desk, special packaging requests..."
                    className="w-full rounded-md border border-ledger-200 bg-white px-3 py-2 text-xs text-ink-900 focus:outline-none focus:ring-1 focus:ring-signal dark:border-ledger-700 dark:bg-ink-800 dark:text-white"
                  />
                </Field>
              )}
            </div>
          </div>

          {/* Right / Cart summary column */}
          <div className="space-y-5 lg:col-span-5">
            {/* Cart Items list */}
            <div className="rounded-xl border border-ledger-200 bg-white p-5 shadow-sm dark:border-ledger-700 dark:bg-ink-900">
              <h2 className="mb-3 text-sm font-semibold text-ink-900 dark:text-white">Order Items ({cart.items.length})</h2>

              <div className="divide-y divide-ledger-100 dark:divide-ledger-800">
                {cart.items.map((item) => (
                  <div key={item.productId} className="flex items-center gap-3 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ledger-100 text-ledger-500 dark:bg-ink-800 dark:text-ledger-400">
                      <Package className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-ink-900 dark:text-white">{item.name}</p>
                      {showPrices && <p className="text-[11px] text-ledger-400">{formatCurrency(item.unitPrice, currency)} each</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => cart.updateQty(item.productId, item.quantity - 1)}
                        className="flex h-6 w-6 items-center justify-center rounded border border-ledger-200 text-ledger-600 hover:bg-ledger-100 dark:border-ledger-700 dark:text-ledger-300"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-5 text-center text-xs font-medium text-ink-900 dark:text-white">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => cart.updateQty(item.productId, item.quantity + 1)}
                        className="flex h-6 w-6 items-center justify-center rounded border border-ledger-200 text-ledger-600 hover:bg-ledger-100 dark:border-ledger-700 dark:text-ledger-300"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    {showPrices && (
                      <span className="w-16 text-right font-mono text-xs font-semibold text-ink-900 dark:text-white">
                        {formatCurrency(item.quantity * item.unitPrice, currency)}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => cart.removeItem(item.productId)}
                      className="text-ledger-400 hover:text-alert"
                      title="Remove item"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Total calculation and submit CTA */}
            <div className="space-y-4 rounded-xl border border-ledger-200 bg-white p-5 shadow-sm dark:border-ledger-700 dark:bg-ink-900">
              <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Order Summary</h2>

              {showPrices ? (
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between text-ledger-600 dark:text-ledger-300">
                    <span>Subtotal</span>
                    <span className="font-mono font-medium text-ink-900 dark:text-white">{formatCurrency(cart.subtotal, currency)}</span>
                  </div>
                  {allowSelectDelivery && (
                    <div className="flex items-center justify-between text-ledger-600 dark:text-ledger-300">
                      <span>Delivery Fee ({deliveryOption})</span>
                      <span className="font-mono font-medium text-ink-900 dark:text-white">{formatCurrency(deliveryFee, currency)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between border-t border-ledger-100 pt-2.5 text-sm font-bold dark:border-ledger-800">
                    <span className="text-ink-900 dark:text-white">Estimated Total</span>
                    <span className="font-mono text-signal">{formatCurrency(total, currency)}</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-lg bg-amber-soft p-3 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>Product prices will be reviewed and finalized by our sales staff upon order confirmation.</p>
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-alert/30 bg-alert-soft p-3 text-xs font-medium text-alert">{error}</div>
              )}

              <button
                type="button"
                onClick={submit}
                disabled={isPending}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-signal py-3 text-sm font-semibold text-white shadow-sm hover:bg-signal/90 disabled:opacity-60"
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Submit Customer Order
              </button>

              <p className="text-center text-[11px] text-ledger-400">
                Your order will be instantly submitted for review, stock reservation, and branch dispatch.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ledger-700 dark:text-ledger-300">
        {label} {required && <span className="text-alert">*</span>}
      </span>
      {children}
    </label>
  );
}