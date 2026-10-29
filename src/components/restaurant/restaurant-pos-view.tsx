"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { createRestaurantOrder } from "@/app/(dashboard)/restaurant/actions";
import type { Database } from "@/types/database";

type MenuItem = Database["public"]["Tables"]["restaurant_menu_items"]["Row"];
type MenuCategory = Pick<Database["public"]["Tables"]["restaurant_menu_categories"]["Row"], "id" | "name">;
type ModifierGroup = Database["public"]["Tables"]["restaurant_modifier_groups"]["Row"];
type ModifierOption = Database["public"]["Tables"]["restaurant_modifier_options"]["Row"];
type DiningTable = Database["public"]["Tables"]["restaurant_tables"]["Row"];
type Location = { id: string; name: string };
type PackagedStock = Pick<Database["public"]["Tables"]["restaurant_packaged_item_stock"]["Row"], "location_id" | "menu_item_id" | "quantity">;
type OrderType = "dine_in" | "takeaway" | "delivery";

function money(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
}

export default function RestaurantPosView({
  locations,
  categories,
  menuItems,
  packagedStock,
  modifierGroups,
  modifierOptions,
  tables,
  currency,
}: {
  locations: Location[];
  categories: MenuCategory[];
  menuItems: MenuItem[];
  packagedStock: PackagedStock[];
  modifierGroups: ModifierGroup[];
  modifierOptions: ModifierOption[];
  tables: DiningTable[];
  currency: string;
}) {
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [orderType, setOrderType] = useState<OrderType>("takeaway");
  const [tableId, setTableId] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const visibleItems = categoryId === "all" ? menuItems : menuItems.filter((item) => item.category_id === categoryId);
  const cartItems = menuItems.filter((item) => (quantities[item.id] ?? 0) > 0);
  const total = cartItems.reduce((sum, item) => {
    const extras = selectedOptionIds(item.id).reduce((value, optionId) =>
      value + Number(modifierOptions.find((option) => option.id === optionId)?.price_delta ?? 0), 0);
    return sum + (Number(item.price) + extras) * quantities[item.id];
  }, 0);
  const availableTables = tables.filter((table) => table.location_id === locationId);

  function changeQuantity(itemId: string, delta: number) {
    const item = menuItems.find((entry) => entry.id === itemId);
    const currentStock = packagedStock.find((stock) => stock.location_id === locationId && stock.menu_item_id === itemId)?.quantity ?? 0;
    const maximum = item?.item_type === "packaged" ? Math.min(999, currentStock) : 999;
    setQuantities((current) => ({ ...current, [itemId]: Math.max(0, Math.min(maximum, (current[itemId] ?? 0) + delta)) }));
  }

  function toggleOption(group: ModifierGroup, itemId: string, optionId: string) {
    const key = `${itemId}:${group.id}`;
    setSelectedOptions((current) => {
      const selected = current[key] ?? [];
      const next = selected.includes(optionId)
        ? selected.filter((id) => id !== optionId)
        : selected.length < group.max_selections ? [...selected, optionId] : selected;
      return { ...current, [key]: next };
    });
  }

  function selectedOptionIds(itemId: string) {
    return modifierGroups
      .filter((group) => group.menu_item_id === itemId)
      .flatMap((group) => selectedOptions[`${itemId}:${group.id}`] ?? []);
  }

  async function submitOrder() {
    setError("");
    setSuccess("");
    if (!locationId || !cartItems.length) {
      setError("Choose a branch and add menu items.");
      return;
    }
    if (orderType === "dine_in" && !tableId) {
      setError("Choose a dining table.");
      return;
    }
    if (orderType === "delivery" && !deliveryAddress.trim()) {
      setError("Enter the delivery address.");
      return;
    }
    for (const item of cartItems) {
      for (const group of modifierGroups.filter((entry) => entry.menu_item_id === item.id)) {
        const selected = selectedOptions[`${item.id}:${group.id}`] ?? [];
        if (selected.length < group.min_selections || selected.length > group.max_selections) {
          setError(`${item.name}: choose ${group.min_selections}–${group.max_selections} option(s) for ${group.name}.`);
          return;
        }
      }
    }

    setIsSubmitting(true);
    try {
      const result = await createRestaurantOrder({
        locationId,
        orderType,
        tableId: orderType === "dine_in" ? tableId : null,
        customerName,
        customerPhone,
        deliveryAddress,
        notes,
        items: cartItems.map((item) => ({
          menuItemId: item.id,
          quantity: quantities[item.id],
          notes: "",
          modifierOptionIds: modifierGroups
            .filter((group) => group.menu_item_id === item.id)
            .flatMap((group) => selectedOptions[`${item.id}:${group.id}`] ?? []),
        })),
      });
      setSuccess(`Order #${result.orderNumber} created. Complete payment from Restaurant Orders.`);
      setQuantities({});
      setSelectedOptions({});
      setTableId("");
      setCustomerName("");
      setCustomerPhone("");
      setDeliveryAddress("");
      setNotes("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not create the restaurant order.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return <main className="restaurant-management-page mx-auto max-w-[1600px] space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">Restaurant</p>
        <h1 className="text-2xl font-bold text-slate-950">Point of Sale</h1>
      </div>
      <Link href="/restaurant" className="rounded-lg border px-4 py-2 text-sm font-semibold">Restaurant management</Link>
    </header>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="space-y-4">
        <div className="flex flex-wrap gap-3 rounded-xl border bg-white p-3">
          <label className="min-w-48 flex-1 text-xs font-semibold text-slate-600">Branch
            <select value={locationId} onChange={(event) => { setLocationId(event.target.value); setTableId(""); }} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm">
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </label>
          <label className="min-w-40 flex-1 text-xs font-semibold text-slate-600">Order type
            <select value={orderType} onChange={(event) => setOrderType(event.target.value as OrderType)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm">
              <option value="takeaway">Takeaway</option><option value="dine_in">Dine-in</option><option value="delivery">Delivery</option>
            </select>
          </label>
          {orderType === "dine_in" && <label className="min-w-40 flex-1 text-xs font-semibold text-slate-600">Dining table
            <select value={tableId} onChange={(event) => setTableId(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm">
              <option value="">Select a table</option>
              {availableTables.map((table) => <option key={table.id} value={table.id}>{table.table_name} · {table.seats} seats</option>)}
            </select>
          </label>}
        </div>
        <nav aria-label="Menu categories" className="flex gap-2 overflow-x-auto">
          <button type="button" onClick={() => setCategoryId("all")} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${categoryId === "all" ? "bg-orange-600 text-white" : "border"}`}>All items</button>
          {categories.map((category) => <button key={category.id} type="button" onClick={() => setCategoryId(category.id)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${categoryId === category.id ? "bg-orange-600 text-white" : "border"}`}>{category.name}</button>)}
        </nav>
        {locations.length === 0 && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">There are no branches available to your account.</p>}
        {menuItems.length === 0 && <p className="rounded-xl border bg-white p-4 text-sm text-slate-600">Add active menu items before taking restaurant orders.</p>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visibleItems.map((item) => {
            const quantity = quantities[item.id] ?? 0;
            const groups = modifierGroups.filter((group) => group.menu_item_id === item.id);
            const packagedQuantity = packagedStock.find((stock) => stock.location_id === locationId && stock.menu_item_id === item.id)?.quantity ?? 0;
            const outOfStock = item.item_type === "packaged" && packagedQuantity <= 0;
            return <article key={item.id} className="group flex min-w-0 flex-col items-center overflow-hidden rounded-md bg-gradient-to-br from-white via-white to-slate-50 p-2.5 text-center shadow-[inset_1px_1px_0_rgba(255,255,255,0.95),inset_-1px_-1px_0_rgba(148,163,184,0.1),0_2px_4px_rgba(15,23,42,0.06),0_8px_18px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-0.5">
              <div className="relative mb-2 h-28 w-full overflow-hidden rounded-md bg-gradient-to-br from-white to-slate-100 p-1.5 shadow-inner">
                {item.image_url ? <Image src={item.image_url} alt={item.name} fill unoptimized sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-contain transition-transform duration-200 group-hover:scale-[1.025]" /> : <div className="flex h-full items-center justify-center text-xs text-slate-400">No image</div>}
              </div>
              <div className="flex w-full flex-1 flex-col">
                <div className="w-full min-w-0 rounded-md px-1.5 pb-1 pt-0.5">
                  <h2 className="line-clamp-2 break-words text-[11px] font-semibold leading-tight text-slate-950">{item.name}</h2>
                  {item.description && <p className="mt-1 line-clamp-2 text-[10px] leading-tight text-slate-500">{item.description}</p>}
                  <div className="mt-1 flex w-full items-center justify-between gap-1">
                    <span className="truncate text-xs font-bold text-orange-700 sm:text-sm">{money(Number(item.price), currency)}</span>
                    {item.item_type === "packaged" && <span className={`shrink-0 text-[10px] font-semibold ${outOfStock ? "text-red-700" : "text-slate-500"}`}>{outOfStock ? "Out" : `(${packagedQuantity})`}</span>}
                  </div>
                </div>
                {quantity === 0
                  ? <button type="button" disabled={outOfStock} onClick={() => changeQuantity(item.id, 1)} className="mt-1 w-full rounded-md bg-orange-600 px-2 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400">{outOfStock ? "Unavailable" : "Add to order"}</button>
                  : <div className="mt-1 flex w-full items-center justify-between rounded-md bg-slate-50 p-1">
                    <button type="button" aria-label={`Remove one ${item.name}`} onClick={() => changeQuantity(item.id, -1)} className="h-8 w-9 rounded-md border bg-white text-lg">−</button>
                    <span className="text-sm font-bold">{quantity}</span>
                    <button type="button" aria-label={`Add one ${item.name}`} disabled={item.item_type === "packaged" && quantity >= packagedQuantity} onClick={() => changeQuantity(item.id, 1)} className="h-8 w-9 rounded-md border bg-white text-lg disabled:opacity-40">+</button>
                  </div>}
                {quantity > 0 && groups.map((group) => {
                  const key = `${item.id}:${group.id}`;
                  const selected = selectedOptions[key] ?? [];
                  return <fieldset key={group.id} className="border-t pt-2">
                    <legend className="text-xs font-semibold">{group.name} ({group.min_selections}–{group.max_selections})</legend>
                    {modifierOptions.filter((option) => option.group_id === group.id).map((option) => <label key={option.id} className="flex items-center gap-2 py-1 text-xs">
                      <input type="checkbox" checked={selected.includes(option.id)} disabled={!selected.includes(option.id) && selected.length >= group.max_selections} onChange={() => toggleOption(group, item.id, option.id)} />
                      <span className="flex-1">{option.name}</span><span>{Number(option.price_delta) ? `+${money(Number(option.price_delta), currency)}` : "Included"}</span>
                    </label>)}
                  </fieldset>;
                })}
              </div>
            </article>;
          })}
        </div>
      </section>
      <aside className="h-fit space-y-3 rounded-xl border bg-white p-4 xl:sticky xl:top-4">
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold text-slate-950">Current order</h2><span className="text-xs text-slate-500">{cartItems.reduce((sum, item) => sum + quantities[item.id], 0)} items</span></div>
        {cartItems.length === 0 ? <p className="py-4 text-sm text-slate-500">Choose menu items to start an order.</p> : <ul className="divide-y">
          {cartItems.map((item) => <li key={item.id} className="flex justify-between gap-3 py-2 text-sm"><span>{quantities[item.id]} × {item.name}</span><strong>{money((Number(item.price) + selectedOptionIds(item.id).reduce((sum, id) => sum + Number(modifierOptions.find((option) => option.id === id)?.price_delta ?? 0), 0)) * quantities[item.id], currency)}</strong></li>)}
        </ul>}
        <label className="block text-xs font-semibold text-slate-600">Customer name (optional)<input value={customerName} onChange={(event) => setCustomerName(event.target.value)} maxLength={120} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
        <label className="block text-xs font-semibold text-slate-600">Phone (optional)<input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} maxLength={40} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
        {orderType === "delivery" && <label className="block text-xs font-semibold text-slate-600">Delivery address<input required value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} maxLength={300} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>}
        <label className="block text-xs font-semibold text-slate-600">Order notes<input value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
        <p className="flex justify-between border-t pt-3 font-bold"><span>Total</span><span>{money(total, currency)}</span></p>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs text-red-800">{error}</p>}
        {success && <p role="status" className="rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">{success}</p>}
        <button type="button" disabled={isSubmitting || !cartItems.length} onClick={() => void submitOrder()} className="w-full rounded-lg bg-orange-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{isSubmitting ? "Creating order..." : "Create restaurant order"}</button>
      </aside>
    </div>
  </main>;
}
