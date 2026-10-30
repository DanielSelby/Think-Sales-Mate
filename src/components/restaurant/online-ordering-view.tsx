"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { submitRestaurantOnlineOrder } from "@/app/restaurant-order/[orgSlug]/branch/[branchSlug]/actions";
import { formatMoney } from "@/lib/currency";

type OnlineCategory = { id: string; name: string };
type OnlineMenuItem = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price: number;
  category_id: string | null;
  item_type: "prepared" | "packaged";
};
type OnlineModifierGroup = {
  id: string;
  menu_item_id: string;
  name: string;
  min_selections: number;
  max_selections: number;
};
type OnlineModifierOption = { id: string; group_id: string; name: string; price_delta: number };
type Selection = { menuItemId: string; quantity: number; modifierOptionIds: string[]; notes: string };

function money(amount: number, currency: string) {
  return formatMoney(amount, currency);
}

export default function OnlineOrderingView({
  orgSlug,
  branchSlug,
  organizationName,
  branchName,
  currency,
  categories,
  menuItems,
  packagedStock,
  modifierGroups,
  modifierOptions,
  acceptsPickup,
  acceptsDelivery,
  deliveryFee,
  paystackEnabled,
}: {
  orgSlug: string;
  branchSlug: string;
  organizationName: string;
  branchName: string;
  currency: string;
  categories: OnlineCategory[];
  menuItems: OnlineMenuItem[];
  packagedStock: Record<string, number>;
  modifierGroups: OnlineModifierGroup[];
  modifierOptions: OnlineModifierOption[];
  acceptsPickup: boolean;
  acceptsDelivery: boolean;
  deliveryFee: number;
  paystackEnabled: boolean;
}) {
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">(acceptsPickup ? "pickup" : "delivery");
  const [activeCategoryId, setActiveCategoryId] = useState("all");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [modifierSelections, setModifierSelections] = useState<Record<string, string[]>>({});
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentOption, setPaymentOption] = useState<"pay_at_fulfillment" | "paystack">("pay_at_fulfillment");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [placedOrder, setPlacedOrder] = useState<{ orderNumber: number; total: number; trackingToken: string } | null>(null);
  const [orderEmailSent, setOrderEmailSent] = useState<boolean | null>(null);

  const selections: Selection[] = useMemo(() => menuItems.flatMap((item) => {
    const quantity = Number(quantities[item.id] ?? 0);
    if (!Number.isInteger(quantity) || quantity <= 0) return [];
    return [{
      menuItemId: item.id,
      quantity,
      modifierOptionIds: modifierGroups
        .filter((group) => group.menu_item_id === item.id)
        .flatMap((group) => modifierSelections[group.id] ?? []),
      notes: "",
    }];
  }), [menuItems, modifierGroups, modifierSelections, quantities]);

  const subtotal = selections.reduce((sum, selection) => {
    const item = menuItems.find((entry) => entry.id === selection.menuItemId);
    const extra = selection.modifierOptionIds.reduce((total, optionId) =>
      total + Number(modifierOptions.find((option) => option.id === optionId)?.price_delta ?? 0), 0);
    return sum + (Number(item?.price ?? 0) + extra) * selection.quantity;
  }, 0);
  const total = subtotal + (fulfillment === "delivery" ? deliveryFee : 0);
  const menuIsEmpty = menuItems.length === 0;
  const menuSections = categories.length
    ? [...categories, ...(menuItems.some((item) => item.category_id === null || !categories.some((category) => category.id === item.category_id))
      ? [{ id: "uncategorized", name: "Other items" }]
      : [])]
    : [{ id: "uncategorized", name: "Menu" }];
  const menuSectionsWithItems = menuSections.flatMap((category) => {
    const items = menuItems.filter((item) => category.id === "uncategorized"
      ? item.category_id === null || !categories.some((entry) => entry.id === item.category_id)
      : item.category_id === category.id);
    return items.length ? [{ ...category, items }] : [];
  });
  const visibleMenuSections = activeCategoryId === "all"
    ? menuSectionsWithItems
    : menuSectionsWithItems.filter((category) => category.id === activeCategoryId);

  function changeQuantity(itemId: string, delta: number) {
    setQuantities((current) => {
      const quantity = Number(current[itemId] ?? 0);
      const item = menuItems.find((entry) => entry.id === itemId);
      const maximum = item?.item_type === "packaged" ? Math.min(999, packagedStock[itemId] ?? 0) : 999;
      const next = Math.max(0, Math.min(maximum, quantity + delta));
      return { ...current, [itemId]: next ? String(next) : "" };
    });
  }

  function toggleModifier(group: OnlineModifierGroup, optionId: string) {
    setModifierSelections((current) => {
      const selected = current[group.id] ?? [];
      const next = selected.includes(optionId)
        ? selected.filter((id) => id !== optionId)
        : selected.length < group.max_selections ? [...selected, optionId] : selected;
      return { ...current, [group.id]: next };
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const invalidGroup = selections.flatMap((selection) => {
      const item = menuItems.find((entry) => entry.id === selection.menuItemId);
      return modifierGroups.filter((group) => group.menu_item_id === selection.menuItemId)
        .filter((group) => {
          const count = modifierSelections[group.id]?.length ?? 0;
          return count < group.min_selections || count > group.max_selections;
        })
        .map((group) => `${item?.name ?? "Item"}: choose ${group.min_selections}–${group.max_selections} option(s) for ${group.name}.`);
    })[0];
    if (invalidGroup) {
      setError(invalidGroup);
      return;
    }
    if (selections.length === 0) {
      setError("Choose at least one menu item.");
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await submitRestaurantOnlineOrder(orgSlug, branchSlug, {
        fulfillment,
        customerName,
        customerPhone,
        customerEmail,
        deliveryAddress,
        notes,
        paymentOption: total > 0 ? paymentOption : "pay_at_fulfillment",
        items: selections,
        companyWebsite,
      });
      if (result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      }
      setPlacedOrder({
        orderNumber: result.orderNumber,
        total: result.total,
        trackingToken: result.trackingToken,
      });
      setOrderEmailSent(result.emailNotification?.sent ?? null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not place your order. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (placedOrder) {
    return <main className="mx-auto max-w-xl px-4 py-16">
      <section className="rounded-2xl border bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-bold uppercase tracking-wide text-emerald-700">Order received</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">{organizationName}</h1>
        <p className="mt-4 text-slate-700">Your order <strong>#{placedOrder.orderNumber}</strong> has been sent to {branchName}.</p>
        <p className="mt-2 text-sm text-slate-600">Total: {money(placedOrder.total, currency)} · Pay when your order is collected or delivered.</p>
        <Link href={`/restaurant-order/track/${encodeURIComponent(placedOrder.trackingToken)}`} className="mt-5 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Track your order</Link>
        {orderEmailSent === true && <p className="mt-3 text-sm text-emerald-700">A confirmation email has been sent.</p>}
        {orderEmailSent === false && <p className="mt-3 text-sm text-amber-700">Your order is confirmed, but we could not send the confirmation email.</p>}
      </section>
    </main>;
  }

  return <main className="w-full max-w-none space-y-6 px-3 py-5 sm:px-5 sm:py-6 lg:px-8">
    <header className="rounded-2xl bg-slate-950 p-6 text-white">
      <p className="text-sm font-semibold text-orange-300">{branchName}</p>
      <h1 className="mt-1 text-3xl font-bold">{organizationName}</h1>
      <p className="mt-2 text-sm text-slate-300">Restaurant menu · Order for pickup or delivery</p>
    </header>
    <form onSubmit={submit} className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="space-y-4">
        {menuIsEmpty ? <p className="rounded-xl border bg-white p-6 text-sm text-slate-600">No menu items are available right now.</p>
          : <div className="grid min-w-0 gap-4 xl:grid-cols-[10rem_minmax(0,1fr)]">
            <nav aria-label="Product categories" className="flex gap-2 overflow-x-auto xl:sticky xl:top-4 xl:h-fit xl:flex-col xl:overflow-visible xl:rounded-xl xl:border xl:bg-white xl:p-3">
              <button type="button" onClick={() => setActiveCategoryId("all")} aria-pressed={activeCategoryId === "all"} className={`shrink-0 rounded-lg px-3 py-2 text-left text-sm font-semibold ${activeCategoryId === "all" ? "bg-orange-600 text-white" : "border text-slate-700 hover:bg-slate-50 xl:border-transparent"}`}>
                All items <span className="ml-1 text-xs opacity-75">({menuItems.length})</span>
              </button>
              {menuSectionsWithItems.map((category) => <button key={category.id} type="button" onClick={() => setActiveCategoryId(category.id)} aria-pressed={activeCategoryId === category.id} className={`shrink-0 rounded-lg px-3 py-2 text-left text-sm font-semibold ${activeCategoryId === category.id ? "bg-orange-600 text-white" : "border text-slate-700 hover:bg-slate-50 xl:border-transparent"}`}>
                <span className="break-words">{category.name}</span> <span className="text-xs opacity-75">({category.items.length})</span>
              </button>)}
            </nav>
            <div className="min-w-0 space-y-5">
              {visibleMenuSections.map((category) => <section key={category.id} className="min-w-0 space-y-3">
                {activeCategoryId === "all" && <h2 className="text-xl font-bold text-slate-950">{category.name}</h2>}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-4 min-[1800px]:grid-cols-5">
              {category.items.map((item) => {
                const itemGroups = modifierGroups.filter((group) => group.menu_item_id === item.id);
                const quantity = Number(quantities[item.id] ?? 0);
                const outOfStock = item.item_type === "packaged" && (packagedStock[item.id] ?? 0) <= 0;
                return <article key={item.id} className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-white">
                  {item.image_url && <div className="relative h-44 w-full bg-slate-100">
                    <Image src={item.image_url} alt={item.name} fill unoptimized sizes="(max-width: 1024px) 100vw, 60vw" className="bg-slate-100 object-contain" />
                  </div>}
                  <div className="flex flex-1 flex-col gap-3 p-3 sm:p-4">
                    <div className="min-w-0">
                      <h3 className="break-words text-sm font-semibold leading-snug text-slate-950 sm:text-base">{item.name}</h3>
                      {item.description && <p className="mt-1 break-words whitespace-normal text-xs leading-relaxed text-slate-600 sm:text-sm">{item.description}</p>}
                      <p className="mt-2 text-sm font-bold text-orange-700">{money(Number(item.price), currency)}</p>
                      {item.item_type === "packaged" && <p className={`mt-1 text-xs font-medium ${outOfStock ? "text-red-700" : "text-slate-500"}`}>{outOfStock ? "Out of stock" : `${packagedStock[item.id] ?? 0} available`}</p>}
                    </div>
                    <div className="mt-auto">
                      {quantity === 0
                        ? <button type="button" disabled={outOfStock} onClick={() => changeQuantity(item.id, 1)} className="w-full rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400">{outOfStock ? "Unavailable" : "Add to order"}</button>
                        : <div className="flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 p-1">
                          <button type="button" aria-label={`Remove one ${item.name}`} onClick={() => changeQuantity(item.id, -1)} className="h-9 w-10 rounded-md border bg-white text-lg text-slate-800">−</button>
                          <span className="text-sm font-bold text-slate-900">{quantity}</span>
                          <button type="button" aria-label={`Add one ${item.name}`} disabled={item.item_type === "packaged" && quantity >= (packagedStock[item.id] ?? 0)} onClick={() => changeQuantity(item.id, 1)} className="h-9 w-10 rounded-md border bg-white text-lg text-slate-800 disabled:opacity-40">+</button>
                        </div>}
                    </div>
                    {quantity > 0 && itemGroups.map((group) => <fieldset key={group.id} className="border-t pt-3">
                      <legend className="text-sm font-semibold text-slate-800">{group.name} <span className="text-xs font-normal text-slate-500">(choose {group.min_selections}–{group.max_selections})</span></legend>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">{modifierOptions.filter((option) => option.group_id === group.id).map((option) => <label key={option.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-2 text-sm">
                        <span className="flex items-center gap-2"><input type="checkbox" checked={(modifierSelections[group.id] ?? []).includes(option.id)} onChange={() => toggleModifier(group, option.id)} />{option.name}</span>
                        <span className="text-xs text-slate-500">{Number(option.price_delta) ? `+${money(Number(option.price_delta), currency)}` : "Included"}</span>
                      </label>)}</div>
                    </fieldset>)}
                  </div>
                </article>;
              })}
                </div>
              </section>)}
            </div>
          </div>}
      </section>
      <aside className="h-fit space-y-4 rounded-xl border bg-white p-4 xl:sticky xl:top-4">
        <h2 className="text-lg font-bold text-slate-950">Checkout</h2>
        <div className="grid grid-cols-2 gap-2">
          {acceptsPickup && <button type="button" onClick={() => setFulfillment("pickup")} className={`rounded-lg border p-2 text-sm font-semibold ${fulfillment === "pickup" ? "border-orange-600 bg-orange-50 text-orange-800" : "text-slate-600"}`}>Pickup</button>}
          {acceptsDelivery && <button type="button" onClick={() => setFulfillment("delivery")} className={`rounded-lg border p-2 text-sm font-semibold ${fulfillment === "delivery" ? "border-orange-600 bg-orange-50 text-orange-800" : "text-slate-600"}`}>Delivery</button>}
        </div>
        <label className="block text-xs font-semibold text-slate-600">Name<input required maxLength={120} value={customerName} onChange={(event) => setCustomerName(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
        <label className="block text-xs font-semibold text-slate-600">Phone<input required type="tel" maxLength={40} value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
        <label className="block text-xs font-semibold text-slate-600">Email<input required type="email" maxLength={254} value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
        {fulfillment === "delivery" && <label className="block text-xs font-semibold text-slate-600">Delivery address<input required maxLength={300} value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>}
        <label className="block text-xs font-semibold text-slate-600">Order notes (optional)<textarea maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" rows={2} /></label>
        <fieldset className="space-y-2 border-t pt-3">
          <legend className="text-xs font-semibold text-slate-700">Payment</legend>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="radio" name="payment" value="pay_at_fulfillment" checked={paymentOption === "pay_at_fulfillment"} onChange={() => setPaymentOption("pay_at_fulfillment")} />Pay at pickup/delivery</label>
          {paystackEnabled && total > 0 ? <label className="flex items-center gap-2 text-sm text-slate-700"><input type="radio" name="payment" value="paystack" checked={paymentOption === "paystack"} onChange={() => setPaymentOption("paystack")} />Pay securely with Paystack</label>
            : <p className="text-xs text-slate-500">Paystack is not available for this order amount, currency, or server configuration.</p>}
        </fieldset>
        <div className="space-y-1 border-t pt-3 text-sm">
          <p className="flex justify-between"><span>Subtotal</span><span>{money(subtotal, currency)}</span></p>
          {fulfillment === "delivery" && <p className="flex justify-between"><span>Delivery</span><span>{money(deliveryFee, currency)}</span></p>}
          <p className="flex justify-between font-bold text-slate-950"><span>Total</span><span>{money(total, currency)}</span></p>
        </div>
        <label className="sr-only" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={companyWebsite} onChange={(event) => setCompanyWebsite(event.target.value)} /></label>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs text-red-800">{error}</p>}
        <button type="submit" disabled={isSubmitting || menuIsEmpty || selections.length === 0} className="w-full rounded-lg bg-orange-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
          {isSubmitting ? "Submitting..." : paymentOption === "paystack" && total > 0 ? "Continue to secure payment" : "Place order"}
        </button>
      </aside>
    </form>
  </main>;
}
