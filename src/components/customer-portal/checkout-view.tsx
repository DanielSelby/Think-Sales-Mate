"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Minus, Plus, Trash2, Loader2, Package } from "lucide-react";
import { formatCurrency } from "@/lib/sales/format";
import { useCart } from "@/components/customer-portal/cart-context";
import { placeOrder } from "@/app/order/[orgSlug]/actions";

interface CheckoutViewProps {
  orgSlug: string;
  orgId: string;
  orgName: string;
  currency: string;
  showPrices: boolean;
  allowSelectDelivery: boolean;
  allowNotes: boolean;
}

const DELIVERY_OPTIONS = [
  { label: "Standard Delivery", fee: 5 },
  { label: "Express Delivery", fee: 15 },
  { label: "Pickup", fee: 0 },
];

export function CheckoutView({ orgSlug, orgId, orgName, currency, showPrices, allowSelectDelivery, allowNotes }: CheckoutViewProps) {
  const router = useRouter();
  const cart = useCart();
  const [fullName, setFullName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [deliveryOption, setDeliveryOption] = React.useState(DELIVERY_OPTIONS[0].label);
  const [notes, setNotes] = React.useState("");
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const deliveryFee = DELIVERY_OPTIONS.find((d) => d.label === deliveryOption)?.fee ?? 0;
  const total = cart.subtotal + (allowSelectDelivery ? deliveryFee : 0);

  function submit() {
    setError(null);
    if (!fullName.trim() || !phone.trim()) return setError("Name and phone are required.");
    if (!address.trim()) return setError("Delivery address is required.");
    if (cart.items.length === 0) return setError("Your cart is empty.");

    startTransition(async () => {
      const result = await placeOrder({
        orgId,
        guestName: fullName,
        guestPhone: phone,
        guestEmail: email || null,
        deliveryAddress: address,
        deliveryOption: allowSelectDelivery ? deliveryOption : null,
        deliveryFee: allowSelectDelivery ? deliveryFee : 0,
        notes: allowNotes ? notes || null : null,
        items: cart.items.map((i) => ({ productId: i.productId, productName: i.name, quantity: i.quantity, unitPrice: i.unitPrice })),
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      cart.clear();
      router.push(`/order/${orgSlug}/track/${result.accessToken}`);
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-6">
      <Link href={`/order/${orgSlug}`} className="mb-4 flex items-center gap-1 text-sm text-ledger-500 hover:text-ink-900 dark:hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back to Shop
      </Link>
      <h1 className="mb-1 font-display text-xl font-semibold text-ink-900 dark:text-white">My Cart ({cart.items.length} items)</h1>
      <p className="mb-4 text-xs text-ledger-500">{orgName}</p>

      <div className="space-y-2">
        {cart.items.length === 0 && <p className="rounded-md border border-ledger-100 py-10 text-center text-sm text-ledger-400 dark:border-ledger-700">Your cart is empty.</p>}
        {cart.items.map((item) => (
          <div key={item.productId} className="flex items-center gap-3 rounded-md border border-ledger-100 bg-white p-3 dark:border-ledger-700 dark:bg-ink-900">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-ledger-100 dark:bg-white/[0.06]"><Package className="h-4 w-4 text-ledger-400" /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink-900 dark:text-white">{item.name}</p>
              {showPrices && <p className="text-xs text-ledger-400">{formatCurrency(item.unitPrice, currency)}</p>}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => cart.updateQty(item.productId, item.quantity - 1)} className="rounded border border-ledger-200 p-1 dark:border-ledger-700"><Minus className="h-3 w-3" /></button>
              <span className="w-6 text-center text-sm">{item.quantity}</span>
              <button onClick={() => cart.updateQty(item.productId, item.quantity + 1)} className="rounded border border-ledger-200 p-1 dark:border-ledger-700"><Plus className="h-3 w-3" /></button>
            </div>
            {showPrices && <span className="w-20 text-right font-mono text-sm text-ink-900 dark:text-white">{formatCurrency(item.quantity * item.unitPrice, currency)}</span>}
            <button onClick={() => cart.removeItem(item.productId)} className="text-alert/70 hover:text-alert"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>

      {cart.items.length > 0 && (
        <>
          <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="space-y-3 rounded-md border border-ledger-100 bg-white p-4 dark:border-ledger-700 dark:bg-ink-900">
              <p className="text-sm font-semibold text-ink-900 dark:text-white">Delivery Information</p>
              <Field label="Full Name" required><input value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-9 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white" /></Field>
              <Field label="Phone Number" required><input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-9 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white" /></Field>
              <Field label="Email (Optional)"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white" /></Field>
              <Field label="Delivery Address" required><textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className="w-full rounded-md border border-ledger-200 bg-white px-3 py-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white" /></Field>
              {allowSelectDelivery && (
                <Field label="Delivery Option">
                  <select value={deliveryOption} onChange={(e) => setDeliveryOption(e.target.value)} className="h-9 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white">
                    {DELIVERY_OPTIONS.map((d) => <option key={d.label} value={d.label}>{d.label}{showPrices ? ` (${formatCurrency(d.fee, currency)})` : ""}</option>)}
                  </select>
                </Field>
              )}
              {allowNotes && (
                <Field label="Order Notes (Optional)"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="e.g. Leave at the gate" className="w-full rounded-md border border-ledger-200 bg-white px-3 py-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white" /></Field>
              )}
            </div>

            <div className="space-y-3 rounded-md border border-ledger-100 bg-white p-4 dark:border-ledger-700 dark:bg-ink-900">
              <p className="text-sm font-semibold text-ink-900 dark:text-white">Order Summary</p>
              {showPrices ? (
                <>
                  <div className="flex items-center justify-between text-sm"><span className="text-ledger-500">Subtotal</span><span className="text-ink-900 dark:text-white">{formatCurrency(cart.subtotal, currency)}</span></div>
                  {allowSelectDelivery && <div className="flex items-center justify-between text-sm"><span className="text-ledger-500">Delivery Fee</span><span className="text-ink-900 dark:text-white">{formatCurrency(deliveryFee, currency)}</span></div>}
                  <div className="flex items-center justify-between border-t border-ledger-100 pt-2 text-base font-semibold dark:border-ledger-700"><span className="text-ink-900 dark:text-white">Total</span><span className="text-signal">{formatCurrency(total, currency)}</span></div>
                </>
              ) : (
                <p className="rounded-md bg-amber-soft px-3 py-2 text-xs text-amber dark:bg-amber/10">
                  Prices are hidden. A staff member will confirm pricing when they review your order.
                </p>
              )}

              {error && <p className="text-sm text-alert">{error}</p>}

              <button onClick={submit} disabled={isPending} className="flex w-full items-center justify-center gap-2 rounded-md bg-signal py-2.5 text-sm font-semibold text-white hover:bg-signal/90 disabled:opacity-60">
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />} Place Order
              </button>
              <p className="text-center text-[11px] text-ledger-400">Your order will be reviewed by our team before processing.</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ledger-500">{label} {required && <span className="text-alert">*</span>}</span>
      {children}
    </label>
  );
}