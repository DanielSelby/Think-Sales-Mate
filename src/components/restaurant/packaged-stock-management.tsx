"use client";

import { useState, useTransition } from "react";
import { adjustRestaurantPackagedItemStock } from "@/app/(dashboard)/restaurant/actions";
import type { Database } from "@/types/database";

type MenuItem = Database["public"]["Tables"]["restaurant_menu_items"]["Row"];
type Stock = Database["public"]["Tables"]["restaurant_packaged_item_stock"]["Row"];
type Movement = Database["public"]["Tables"]["restaurant_packaged_item_movements"]["Row"];
type Location = { id: string; name: string };

function numberField(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function PackagedStockManagement({
  items,
  locations,
  stocks,
  movements,
  canAdjust,
}: {
  items: MenuItem[];
  locations: Location[];
  stocks: Stock[];
  movements: Movement[];
  canAdjust: boolean;
}) {
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [menuItemId, setMenuItemId] = useState(items[0]?.id ?? "");
  const [quantityChange, setQuantityChange] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const location = locations.find((entry) => entry.id === locationId);
  const item = items.find((entry) => entry.id === menuItemId);
  const selectedStock = stocks.find((entry) => entry.location_id === locationId && entry.menu_item_id === menuItemId);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const delta = numberField(quantityChange);
    if (!locationId || !menuItemId || delta === 0 || !reason.trim()) {
      setError("Choose a branch and item, enter a non-zero quantity change and provide a reason.");
      return;
    }
    startTransition(async () => {
      try {
        await adjustRestaurantPackagedItemStock({ locationId, menuItemId, quantityDelta: delta, reason });
        setMessage("Packaged stock updated.");
        setQuantityChange("");
        setReason("");
        window.location.reload();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "Could not update packaged stock.");
      }
    });
  }

  return <div className="space-y-6">
    <header>
      <h1 className="text-2xl font-bold text-slate-950">Packaged items for resale</h1>
      <p className="mt-1 text-sm text-slate-600">Bottled drinks, water, biscuits, and other pre-packed items use separate Restaurant branch stock. Sales deduct stock when the paid order is completed.</p>
    </header>
    {items.length === 0
      ? <p className="rounded-xl border bg-white p-5 text-sm text-slate-600">No packaged menu items yet. In Restaurant → Menu Management, add or edit an item and set its type to “Packaged item for resale.”</p>
      : <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
        {canAdjust ? <form onSubmit={submit} className="h-fit space-y-3 rounded-xl border bg-white p-4">
          <h2 className="font-bold text-slate-950">Receive or adjust stock</h2>
          <label className="block text-xs font-semibold text-slate-600">Restaurant branch
            <select required value={locationId} onChange={(event) => setLocationId(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm">
              {locations.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-600">Packaged item
            <select required value={menuItemId} onChange={(event) => setMenuItemId(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm">
              {items.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </select>
          </label>
          <p className="text-sm text-slate-600">Current balance at {location?.name ?? "selected branch"}: <strong>{Number(selectedStock?.quantity ?? 0)}</strong> {item?.sku ? `· SKU ${item.sku}` : ""}</p>
          <label className="block text-xs font-semibold text-slate-600">Quantity change (+ receive / − write off)
            <input required type="number" step="0.001" value={quantityChange} onChange={(event) => setQuantityChange(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" />
          </label>
          <label className="block text-xs font-semibold text-slate-600">Reason
            <input required maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Supplier delivery or damaged goods" className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" />
          </label>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
          <button type="submit" disabled={isPending || !locations.length} className="w-full rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{isPending ? "Saving…" : "Update stock"}</button>
        </form> : <p className="h-fit rounded-xl border bg-white p-4 text-sm text-slate-600">You have read-only access to packaged stock.</p>}
        <section className="space-y-3">
          <h2 className="font-bold text-slate-950">Branch stock balances</h2>
          {locations.length === 0 ? <p className="rounded-xl border bg-white p-4 text-sm text-slate-600">No accessible Restaurant branches.</p> : locations.map((branch) => (
            <article key={branch.id} className="rounded-xl border bg-white p-4">
              <h3 className="font-semibold">{branch.name}</h3>
              <ul className="mt-2 divide-y">
                {items.map((entry) => {
                  const balance = stocks.find((stock) => stock.location_id === branch.id && stock.menu_item_id === entry.id)?.quantity ?? 0;
                  return <li key={entry.id} className="flex items-center justify-between gap-3 py-2 text-sm"><span>{entry.name}</span><strong className={Number(balance) <= 0 ? "text-red-700" : "text-slate-900"}>{Number(balance)}</strong></li>;
                })}
              </ul>
            </article>
          ))}
        </section>
      </div>}
    <section className="space-y-3">
      <h2 className="font-bold text-slate-950">Recent packaged stock movements</h2>
      {movements.length === 0 ? <p className="rounded-xl border bg-white p-4 text-sm text-slate-600">No packaged-item stock movements recorded.</p> : <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Date</th><th className="p-3">Branch</th><th className="p-3">Item</th><th className="p-3">Change</th><th className="p-3">Balance</th><th className="p-3">Reason</th></tr></thead>
          <tbody className="divide-y">{movements.map((movement) => <tr key={movement.id}>
            <td className="p-3">{new Date(movement.created_at).toLocaleString()}</td>
            <td className="p-3">{locations.find((entry) => entry.id === movement.location_id)?.name ?? "Branch"}</td>
            <td className="p-3">{items.find((entry) => entry.id === movement.menu_item_id)?.name ?? "Item"}</td>
            <td className={`p-3 font-semibold ${movement.quantity_delta < 0 ? "text-red-700" : "text-emerald-700"}`}>{movement.quantity_delta > 0 ? "+" : ""}{Number(movement.quantity_delta)} <span className="font-normal text-slate-500">({movement.movement_type})</span></td>
            <td className="p-3">{Number(movement.balance_after)}</td>
            <td className="p-3">{movement.reason}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </div>;
}
