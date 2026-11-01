"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordRestaurantStocktake } from "@/app/(dashboard)/restaurant/actions";
import type { Database } from "@/types/database";

type Stocktake = Database["public"]["Tables"]["restaurant_stocktakes"]["Row"];
type StocktakeLine = Database["public"]["Tables"]["restaurant_stocktake_lines"]["Row"];
type StocktakeItem = { id: string; name: string; unit: string; onHand: number };

export function RestaurantStocktakeForm({
  inventoryType,
  locationId,
  locationName,
  items,
  recentStocktakes,
  recentLines,
}: {
  inventoryType: "ingredient" | "packaged";
  locationId: string;
  locationName: string;
  items: StocktakeItem[];
  recentStocktakes: Stocktake[];
  recentLines: StocktakeLine[];
}) {
  const router = useRouter();
  const [counts, setCounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((item) => [item.id, ""])));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const countByStocktake = useMemo(() => {
    const grouped = new Map<string, StocktakeLine[]>();
    for (const line of recentLines) {
      grouped.set(line.stocktake_id, [...(grouped.get(line.stocktake_id) ?? []), line]);
    }
    return grouped;
  }, [recentLines]);
  const itemNameById = useMemo(() => new Map(items.map((item) => [item.id, item.name])), [items]);
  const itemKey = inventoryType === "ingredient" ? "ingredient_id" : "menu_item_id";
  const inventoryLabel = inventoryType === "ingredient" ? "ingredient" : "packaged item";

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!locationId || items.length === 0 || items.length > 500) {
      setError("A stocktake needs an accessible branch and between 1 and 500 active items.");
      return;
    }
    if (!window.confirm(`Submit the physical count for ${items.length} ${inventoryLabel}${items.length === 1 ? "" : "s"} at ${locationName}? This will replace the current stock balances.`)) {
      return;
    }
    const stocktakeCounts = items.map((item) => ({
      itemId: item.id,
      countedQuantity: Number(counts[item.id]),
    }));
    startTransition(async () => {
      try {
        const result = await recordRestaurantStocktake({
          locationId,
          inventoryType,
          counts: stocktakeCounts,
        });
        setMessage(`Stocktake saved: ${result.itemCount} items counted, ${result.varianceCount} balance${result.varianceCount === 1 ? "" : "s"} adjusted.`);
        router.refresh();
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Could not save this stocktake.");
      }
    });
  }

  return <section className="space-y-4 rounded-xl border border-orange-200 bg-orange-50/40 p-4">
    <div>
      <h3 className="font-bold text-slate-950">Physical stock count</h3>
      <p className="mt-1 text-xs text-slate-600">Enter the quantities physically on hand at {locationName}. Saving updates stock and records every difference in the movement history.</p>
    </div>
    {items.length === 0 ? <p className="rounded-lg bg-white p-3 text-sm text-slate-600">There are no active {inventoryLabel}s to count.</p>
      : items.length > 500 ? <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">This branch has more than 500 active {inventoryLabel}s. Split the stocktake into smaller counts before continuing.</p>
        : <form onSubmit={submit} className="space-y-3">
          <div className="max-h-[28rem] overflow-auto rounded-lg border bg-white">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="sticky top-0 border-b bg-slate-50 text-xs text-slate-600">
                <tr><th className="p-3">{inventoryType === "ingredient" ? "Ingredient" : "Packaged item"}</th><th className="p-3 text-right">System</th><th className="p-3">Counted</th></tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item) => <tr key={item.id}>
                  <td className="p-3 font-medium text-slate-800">{item.name}{item.unit && <span className="ml-1 text-xs font-normal text-slate-500">({item.unit})</span>}</td>
                  <td className="p-3 text-right text-slate-600">{item.onHand.toLocaleString(undefined, { maximumFractionDigits: 3 })}</td>
                  <td className="p-2">
                    <input
                      required
                      aria-label={`Counted quantity for ${item.name}`}
                      type="number"
                      min="0"
                      max="99999999999.999"
                      step="0.001"
                      value={counts[item.id] ?? ""}
                      onChange={(change) => setCounts((current) => ({ ...current, [item.id]: change.target.value }))}
                      className="h-9 w-full rounded-md border px-2 text-right text-sm"
                    />
                  </td>
                </tr>)}
              </tbody>
            </table>
          </div>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
          <button type="submit" disabled={isPending || !locationId} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {isPending ? "Saving count..." : "Submit physical count"}
          </button>
        </form>}
    {recentStocktakes.length > 0 && <div className="border-t pt-3">
      <h4 className="text-sm font-semibold text-slate-800">Recent stocktakes</h4>
      <ul className="mt-2 space-y-2">
        {recentStocktakes.slice(0, 10).map((stocktake) => <li key={stocktake.id} className="rounded-lg border bg-white px-3 py-2">
          <details>
            <summary className="cursor-pointer text-xs text-slate-700">
              {new Date(stocktake.created_at).toLocaleString()} · {stocktake.item_count} items · {stocktake.variance_count} variances
            </summary>
            <ul className="mt-2 divide-y">
              {(countByStocktake.get(stocktake.id) ?? []).map((line) => {
                const itemId = line[itemKey];
                const itemName = itemId ? itemNameById.get(itemId) ?? "Inactive item" : "Unknown item";
                return <li key={line.id} className="flex flex-wrap justify-between gap-2 py-1.5 text-xs">
                  <span>{itemName}: {line.expected_quantity} → {line.counted_quantity}</span>
                  <span className={line.variance === 0 ? "text-slate-500" : line.variance < 0 ? "text-red-700" : "text-emerald-700"}>
                    {line.variance > 0 ? "+" : ""}{line.variance}
                  </span>
                </li>;
              })}
            </ul>
          </details>
        </li>)}
      </ul>
    </div>}
  </section>;
}
