"use client";

import { useRef, useState, useTransition } from "react";
import {
  adjustRestaurantPackagedItemStock,
  createRestaurantPackagedPurchaseOrder,
  recordRestaurantPackagedWaste,
  receiveRestaurantPackagedPurchase,
  saveRestaurantPackagedItemMinimumStock,
  transferRestaurantPackagedStock,
} from "@/app/(dashboard)/restaurant/actions";
import type { Database } from "@/types/database";

type MenuItem = Database["public"]["Tables"]["restaurant_menu_items"]["Row"];
type Stock = Database["public"]["Tables"]["restaurant_packaged_item_stock"]["Row"];
type Movement = Database["public"]["Tables"]["restaurant_packaged_item_movements"]["Row"];
type PurchaseOrder = Database["public"]["Tables"]["restaurant_packaged_purchase_orders"]["Row"];
type PurchaseLine = Database["public"]["Tables"]["restaurant_packaged_purchase_items"]["Row"];
type Location = { id: string; name: string };
type Supplier = { id: string; name: string };

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
  suppliers,
  purchaseOrders,
  purchaseLines,
  outstandingPurchaseOrders,
  outstandingPurchaseLines,
  canCreatePurchases,
  canReceivePurchases,
}: {
  items: MenuItem[];
  locations: Location[];
  stocks: Stock[];
  movements: Movement[];
  canAdjust: boolean;
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  purchaseLines: PurchaseLine[];
  outstandingPurchaseOrders: Array<Pick<PurchaseOrder, "id" | "location_id" | "status">>;
  outstandingPurchaseLines: PurchaseLine[];
  canCreatePurchases: boolean;
  canReceivePurchases: boolean;
}) {
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [menuItemId, setMenuItemId] = useState(items[0]?.id ?? "");
  const [quantityChange, setQuantityChange] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [reference, setReference] = useState("");
  const [purchaseItemId, setPurchaseItemId] = useState(items[0]?.id ?? "");
  const [purchaseQuantity, setPurchaseQuantity] = useState("1");
  const [purchaseCost, setPurchaseCost] = useState("0");
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, string>>({});
  const [destinationLocationId, setDestinationLocationId] = useState(locations.find((entry) => entry.id !== locations[0]?.id)?.id ?? "");
  const [wasteQuantity, setWasteQuantity] = useState("");
  const [wasteReason, setWasteReason] = useState("");
  const [transferQuantity, setTransferQuantity] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [minimumQuantities, setMinimumQuantities] = useState<Record<string, string>>({});
  const [savingThresholdKey, setSavingThresholdKey] = useState<string | null>(null);
  const purchaseFormRef = useRef<HTMLFormElement>(null);
  const location = locations.find((entry) => entry.id === locationId);
  const item = items.find((entry) => entry.id === menuItemId);
  const selectedStock = stocks.find((entry) => entry.location_id === locationId && entry.menu_item_id === menuItemId);
  const outstandingLocationByOrderId = new Map(
    outstandingPurchaseOrders.map((order) => [order.id, order.location_id]),
  );
  const outstandingQuantityByStockKey = new Map<string, number>();
  for (const line of outstandingPurchaseLines) {
    const outstandingLocationId = outstandingLocationByOrderId.get(line.purchase_order_id);
    if (!outstandingLocationId) continue;
    const key = thresholdKey(outstandingLocationId, line.menu_item_id);
    outstandingQuantityByStockKey.set(
      key,
      (outstandingQuantityByStockKey.get(key) ?? 0)
        + Number(line.ordered_quantity) - Number(line.quantity_received),
    );
  }
  const reorderSuggestions = locations.flatMap((branch) => items.flatMap((entry) => {
    if (!entry.is_active) return [];
    const stock = stocks.find((row) => row.location_id === branch.id && row.menu_item_id === entry.id);
    const balance = Number(stock?.quantity ?? 0);
    const minimum = Number(stock?.minimum_quantity ?? 0);
    if (minimum <= 0 || balance >= minimum) return [];
    const outstandingQuantity = outstandingQuantityByStockKey.get(thresholdKey(branch.id, entry.id)) ?? 0;
    return [{
      locationId: branch.id,
      locationName: branch.name,
      menuItemId: entry.id,
      itemName: entry.name,
      balance,
      minimum,
      outstandingQuantity,
      suggestedQuantity: Math.max(0, minimum - balance - outstandingQuantity),
    }];
  }));

  function handleReorderSuggestion(suggestion: (typeof reorderSuggestions)[number]) {
    setLocationId(suggestion.locationId);
    setPurchaseItemId(suggestion.menuItemId);
    setPurchaseQuantity(String(Number(suggestion.suggestedQuantity.toFixed(3))));
    purchaseFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function thresholdKey(locationIdValue: string, menuItemIdValue: string) {
    return `${locationIdValue}:${menuItemIdValue}`;
  }

  function saveThreshold(branchId: string, itemId: string, currentMinimum: number) {
    const key = thresholdKey(branchId, itemId);
    const value = Number(minimumQuantities[key] ?? currentMinimum);
    setError("");
    setMessage("");
    setSavingThresholdKey(key);
    startTransition(async () => {
      try {
        await saveRestaurantPackagedItemMinimumStock({
          locationId: branchId,
          menuItemId: itemId,
          minimumQuantity: value,
        });
        setMessage("Packaged item minimum stock saved.");
        window.location.reload();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "Could not save the packaged stock threshold.");
      } finally {
        setSavingThresholdKey(null);
      }
    });
  }

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

  function submitPurchase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    startTransition(async () => {
      try {
        await createRestaurantPackagedPurchaseOrder({
          locationId,
          supplierId,
          reference,
          items: [{ menuItemId: purchaseItemId, quantity: numberField(purchaseQuantity), unitCost: numberField(purchaseCost) }],
        });
        setMessage("Packaged purchase order created.");
        window.location.reload();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "Could not create the packaged purchase order.");
      }
    });
  }

  function receiveLine(order: PurchaseOrder, line: PurchaseLine) {
    const quantity = numberField(receiveQuantities[line.id] ?? "");
    setError("");
    setMessage("");
    startTransition(async () => {
      try {
        await receiveRestaurantPackagedPurchase({ purchaseOrderId: order.id, items: [{ itemId: line.id, quantity }] });
        setMessage("Packaged purchase received into branch stock.");
        window.location.reload();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "Could not receive the packaged purchase.");
      }
    });
  }

  function recordWaste(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    startTransition(async () => {
      try {
        await recordRestaurantPackagedWaste({
          locationId,
          menuItemId,
          quantity: numberField(wasteQuantity),
          reason: wasteReason,
        });
        setMessage("Packaged item waste recorded.");
        window.location.reload();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "Could not record packaged item waste.");
      }
    });
  }

  function transferStock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    startTransition(async () => {
      try {
        await transferRestaurantPackagedStock({
          sourceLocationId: locationId,
          destinationLocationId,
          menuItemId,
          quantity: numberField(transferQuantity),
          reason: transferReason,
        });
        setMessage("Packaged stock transferred between Restaurant branches.");
        window.location.reload();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "Could not transfer packaged stock.");
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
                  const stock = stocks.find((row) => row.location_id === branch.id && row.menu_item_id === entry.id);
                  const balance = Number(stock?.quantity ?? 0);
                  const minimum = Number(stock?.minimum_quantity ?? 0);
                  const isLow = balance <= minimum;
                  const key = thresholdKey(branch.id, entry.id);
                  return <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-32 flex-1">{entry.name}</span>
                    <span className={`font-semibold ${isLow ? "text-amber-700" : "text-slate-900"}`}>{balance} on hand{isLow ? " · Reorder" : ""}</span>
                    {canAdjust && <label className="flex items-center gap-2 text-xs text-slate-500">
                      Min
                      <input
                        aria-label={`Minimum stock for ${entry.name} at ${branch.name}`}
                        type="number"
                        min="0"
                        step="0.001"
                        value={minimumQuantities[key] ?? String(minimum)}
                        onChange={(event) => setMinimumQuantities((current) => ({ ...current, [key]: event.target.value }))}
                        className="h-8 w-20 rounded border px-2 text-sm"
                      />
                      <button type="button" disabled={isPending || savingThresholdKey === key} onClick={() => saveThreshold(branch.id, entry.id, minimum)} className="rounded border px-2 py-1 text-xs font-semibold disabled:opacity-50">
                        {savingThresholdKey === key ? "Saving" : "Save"}
                      </button>
                    </label>}
                    {!canAdjust && <span className="text-xs text-slate-500">Minimum {minimum}</span>}
                  </li>;
                })}
              </ul>
            </article>
          ))}
        </section>
      </div>}
    {canAdjust && items.length > 0 && <div className="grid gap-4 xl:grid-cols-2">
      <form onSubmit={recordWaste} className="space-y-3 rounded-xl border bg-white p-4">
        <h2 className="font-bold text-slate-950">Record waste / spoilage</h2>
        <p className="text-xs text-slate-500">Waste reduces Restaurant stock and creates a separate auditable movement.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-600">Item<select required value={menuItemId} onChange={(event) => setMenuItemId(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm">{items.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
          <label className="text-xs font-semibold text-slate-600">Quantity<input required type="number" min="0.001" step="0.001" value={wasteQuantity} onChange={(event) => setWasteQuantity(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
          <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Reason<input required maxLength={200} value={wasteReason} onChange={(event) => setWasteReason(event.target.value)} placeholder="Expired, damaged, or spoiled" className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
        </div>
        <button type="submit" disabled={isPending || !locationId} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">Record waste</button>
      </form>
      {locations.length > 1 && <form onSubmit={transferStock} className="space-y-3 rounded-xl border bg-white p-4">
        <h2 className="font-bold text-slate-950">Transfer between branches</h2>
        <p className="text-xs text-slate-500">Transfer is atomic: stock is reduced at the source and added at the destination together.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-600">Destination branch<select required value={destinationLocationId} onChange={(event) => setDestinationLocationId(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm">{locations.filter((entry) => entry.id !== locationId).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
          <label className="text-xs font-semibold text-slate-600">Item<select required value={menuItemId} onChange={(event) => setMenuItemId(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm">{items.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
          <label className="text-xs font-semibold text-slate-600">Quantity<input required type="number" min="0.001" step="0.001" value={transferQuantity} onChange={(event) => setTransferQuantity(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
          <label className="text-xs font-semibold text-slate-600">Reason<input required maxLength={200} value={transferReason} onChange={(event) => setTransferReason(event.target.value)} placeholder="Branch replenishment" className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
        </div>
        <button type="submit" disabled={isPending || !locationId || !destinationLocationId} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">Transfer stock</button>
      </form>}
    </div>}
    <section className="space-y-3">
      <div>
        <h2 className="font-bold text-slate-950">Reorder suggestions</h2>
        <p className="text-xs text-slate-500">Suggested quantities bring stock back to its minimum, after subtracting quantities already on open purchase orders.</p>
      </div>
      {reorderSuggestions.length === 0
        ? <p className="rounded-xl border bg-white p-4 text-sm text-slate-600">No positive minimum-stock thresholds currently need reordering. Set a minimum above zero to receive quantity suggestions.</p>
        : <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Branch</th><th className="p-3">Item</th><th className="p-3">On hand / minimum</th><th className="p-3">Already on order</th><th className="p-3">Suggested quantity</th>{canCreatePurchases && <th className="p-3">Action</th>}</tr></thead>
            <tbody className="divide-y">{reorderSuggestions.map((suggestion) => (
              <tr key={`${suggestion.locationId}:${suggestion.menuItemId}`}>
                <td className="p-3">{suggestion.locationName}</td>
                <td className="p-3 font-medium">{suggestion.itemName}</td>
                <td className="p-3">{suggestion.balance} / {suggestion.minimum}</td>
                <td className="p-3">{suggestion.outstandingQuantity}</td>
                <td className="p-3 font-semibold">{suggestion.suggestedQuantity}</td>
                {canCreatePurchases && <td className="p-3">
                  <button
                    type="button"
                    disabled={suggestion.suggestedQuantity <= 0}
                    onClick={() => handleReorderSuggestion(suggestion)}
                    className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {suggestion.suggestedQuantity > 0 ? "Prepare order" : "Covered by open order"}
                  </button>
                </td>}
              </tr>
            ))}</tbody>
          </table>
        </div>}
    </section>
    {canCreatePurchases && items.length > 0 && <form ref={purchaseFormRef} onSubmit={submitPurchase} className="space-y-3 rounded-xl border bg-white p-4">
      <div><h2 className="font-bold text-slate-950">Order packaged goods from a supplier</h2><p className="text-xs text-slate-500">Receiving updates Restaurant branch stock only; it does not change ERP product inventory.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-semibold text-slate-600">Branch<select required value={locationId} onChange={(event) => setLocationId(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm">{locations.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-600">Supplier<select required value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm">{suppliers.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-600">Reference<input required maxLength={80} value={reference} onChange={(event) => setReference(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
        <label className="text-xs font-semibold text-slate-600">Packaged item<select required value={purchaseItemId} onChange={(event) => setPurchaseItemId(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm">{items.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-600">Quantity<input required type="number" min="0.001" step="0.001" value={purchaseQuantity} onChange={(event) => setPurchaseQuantity(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
        <label className="text-xs font-semibold text-slate-600">Unit cost<input required type="number" min="0" step="0.0001" value={purchaseCost} onChange={(event) => setPurchaseCost(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
      </div>
      <button type="submit" disabled={isPending || !locations.length || !suppliers.length} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{isPending ? "Saving…" : "Create purchase order"}</button>
    </form>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
    <section className="space-y-3">
      <h2 className="font-bold text-slate-950">Packaged supplier purchase orders</h2>
      {purchaseOrders.length === 0 ? <p className="rounded-xl border bg-white p-4 text-sm text-slate-600">No packaged goods purchase orders recorded.</p> : purchaseOrders.map((order) => {
        const orderLines = purchaseLines.filter((line) => line.purchase_order_id === order.id);
        return <article key={order.id} className="space-y-2 rounded-xl border bg-white p-4">
          <div className="flex flex-wrap justify-between gap-2"><div><h3 className="font-semibold">{order.reference}</h3><p className="text-xs text-slate-500">{locations.find((entry) => entry.id === order.location_id)?.name ?? "Branch"} · {suppliers.find((entry) => entry.id === order.supplier_id)?.name ?? "Supplier"} · {new Date(order.created_at).toLocaleDateString()}</p></div><span className="h-fit rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold capitalize">{order.status.replace("_", " ")}</span></div>
          {orderLines.map((line) => {
            const remaining = Number(line.ordered_quantity) - Number(line.quantity_received);
            return <div key={line.id} className="flex flex-wrap items-center justify-between gap-3 border-t pt-2 text-sm">
              <span>{items.find((entry) => entry.id === line.menu_item_id)?.name ?? "Item"} · {Number(line.quantity_received)}/{Number(line.ordered_quantity)} received · unit cost {Number(line.unit_cost)}</span>
              {canReceivePurchases && remaining > 0 && <div className="flex items-center gap-2">
                <input aria-label={`Quantity to receive for ${items.find((entry) => entry.id === line.menu_item_id)?.name ?? "item"}`} type="number" min="0.001" max={remaining} step="0.001" value={receiveQuantities[line.id] ?? String(remaining)} onChange={(event) => setReceiveQuantities((current) => ({ ...current, [line.id]: event.target.value }))} className="h-9 w-24 rounded-lg border px-2" />
                <button type="button" disabled={isPending} onClick={() => receiveLine(order, line)} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">Receive</button>
              </div>}
            </div>;
          })}
        </article>;
      })}
    </section>
    <section className="space-y-3">
      <h2 className="font-bold text-slate-950">Recent packaged stock movements</h2>
      {movements.length === 0 ? <p className="rounded-xl border bg-white p-4 text-sm text-slate-600">No packaged-item stock movements recorded.</p> : <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Date</th><th className="p-3">Branch</th><th className="p-3">Item</th><th className="p-3">Change</th><th className="p-3">Balance</th><th className="p-3">Reason</th></tr></thead>
          <tbody className="divide-y">{movements.map((movement) => <tr key={movement.id}>
            <td className="p-3">{new Date(movement.created_at).toLocaleString()}</td>
            <td className="p-3">{locations.find((entry) => entry.id === movement.location_id)?.name ?? "Branch"}</td>
            <td className="p-3">{items.find((entry) => entry.id === movement.menu_item_id)?.name ?? "Item"}</td>
            <td className={`p-3 font-semibold ${movement.quantity_delta < 0 ? "text-red-700" : "text-emerald-700"}`}>{movement.quantity_delta > 0 ? "+" : ""}{Number(movement.quantity_delta)} <span className="font-normal text-slate-500">({movement.movement_type.replace("_", " ")})</span></td>
            <td className="p-3">{Number(movement.balance_after)}</td>
            <td className="p-3">{movement.reason}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </div>;
}
