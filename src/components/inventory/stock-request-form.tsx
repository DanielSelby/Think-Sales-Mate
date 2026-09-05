"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { CalendarDays, ChevronRight, FileText, Plus, Search, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createStockRequest } from "@/app/(dashboard)/inventory/stock-requests/actions";

interface LocationOption { id: string; name: string; type: string; }
interface ProductOption { id: string; name: string; sku: string; unit: string; stockByLocation: Record<string, number>; }
interface RequestRow { productId: string; quantity: number; reason: string; }

export function StockRequestForm({
  locations,
  products,
  defaultRequestingLocationId,
  allowedSourceLocationIds,
  currency,
}: {
  locations: LocationOption[];
  products: ProductOption[];
  defaultRequestingLocationId: string;
  allowedSourceLocationIds: string[];
  currency: string;
}) {
  const [requestingLocationId, setRequestingLocationId] = useState(defaultRequestingLocationId);
  const [sourceLocationId, setSourceLocationId] = useState(allowedSourceLocationIds[0] ?? "");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const sourceLocations = locations.filter((location) => allowedSourceLocationIds.includes(location.id) && location.id !== requestingLocationId);
  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return products.filter((product) => product.name.toLowerCase().includes(normalized) || product.sku.toLowerCase().includes(normalized)).slice(0, 8);
  }, [products, query]);
  const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0);
  const totalValue = rows.reduce((sum, row) => {
    const product = products.find((item) => item.id === row.productId);
    return sum + row.quantity * (product?.stockByLocation[sourceLocationId] ?? 0);
  }, 0);

  const addProduct = (product: ProductOption) => {
    setRows((current) => current.some((row) => row.productId === product.id) ? current : [...current, { productId: product.id, quantity: 1, reason: "Store replenishment" }]);
    setQuery("");
  };
  const submit = (shouldSubmit: boolean) => startTransition(async () => {
    const result = await createStockRequest({ requestingLocationId, sourceLocationId, expectedDeliveryDate, priority, reference, notes, submit: shouldSubmit, items: rows });
    setMessage(result.error ?? (shouldSubmit ? "Request submitted for approval." : "Request saved as draft."));
    if (!result.error) setRows([]);
  });

  return (
    <div className="space-y-4 pb-20 text-xs">
      <div className="flex items-start justify-between gap-3">
        <div><h1 className="font-display text-2xl font-bold text-ink-900 dark:text-white">Branch Stock Request</h1><p className="mt-1 text-sm text-ledger-500">Request stock from your main branch or other branches.</p></div>
        <Link href="/inventory/stock-requests/history"><Button variant="outline"><FileText className="h-3.5 w-3.5" /> View Request History</Button></Link>
      </div>
      {message && <div className="rounded-xl border border-signal/20 bg-signal-soft px-4 py-3 text-signal">{message}</div>}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
        <main className="space-y-4">
          <section className="rounded-2xl border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <div className="grid gap-4 md:grid-cols-4">
              <label>Request Number<input disabled value="Auto generated" className="mt-1 w-full rounded-lg border border-ledger-100 bg-ledger-50 px-3 py-2 text-xs dark:border-ledger-700 dark:bg-ink-800" /></label>
              <label>Request Date<input type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="mt-1 w-full rounded-lg border border-ledger-100 px-3 py-2 text-xs dark:border-ledger-700 dark:bg-ink-800" /></label>
              <label>Requesting Branch<select value={requestingLocationId} onChange={(event) => setRequestingLocationId(event.target.value)} className="mt-1 w-full rounded-lg border border-ledger-100 px-3 py-2 text-xs dark:border-ledger-700 dark:bg-ink-800">{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
              <label>Request From (Source)<select value={sourceLocationId} onChange={(event) => setSourceLocationId(event.target.value)} className="mt-1 w-full rounded-lg border border-ledger-100 px-3 py-2 text-xs dark:border-ledger-700 dark:bg-ink-800">{sourceLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-4">
              <label>Expected Delivery Date<input type="date" value={expectedDeliveryDate} onChange={(event) => setExpectedDeliveryDate(event.target.value)} className="mt-1 w-full rounded-lg border border-ledger-100 px-3 py-2 text-xs dark:border-ledger-700 dark:bg-ink-800" /></label>
              <label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)} className="mt-1 w-full rounded-lg border border-ledger-100 px-3 py-2 text-xs capitalize dark:border-ledger-700 dark:bg-ink-800">{["low", "normal", "high", "urgent"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <label className="md:col-span-2">Reference / Note<textarea value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Reason for requesting stock..." className="mt-1 w-full rounded-lg border border-ledger-100 px-3 py-2 text-xs dark:border-ledger-700 dark:bg-ink-800" rows={2} /></label>
            </div>
          </section>
          <section className="rounded-2xl border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <div className="mb-3 flex items-center justify-between"><h2 className="font-display text-sm font-bold">Requested Items</h2><div className="relative w-80"><Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-ledger-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search product by name, SKU or barcode..." className="w-full rounded-lg border border-ledger-100 py-2 pl-9 pr-3 text-xs dark:border-ledger-700 dark:bg-ink-800" />{filteredProducts.length > 0 && <div className="absolute z-10 mt-1 w-full rounded-lg border border-ledger-100 bg-white p-1 shadow-card dark:border-ledger-700 dark:bg-ink-900">{filteredProducts.map((product) => <button key={product.id} onClick={() => addProduct(product)} className="block w-full rounded px-2 py-2 text-left hover:bg-ledger-50 dark:hover:bg-ink-800">{product.name} <span className="text-ledger-400">{product.sku}</span></button>)}</div>}</div></div>
            <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="border-y border-ledger-100 text-[10px] uppercase tracking-wide text-ledger-400"><tr><th className="py-2">#</th><th>Product</th><th>SKU</th><th>Available Stock</th><th>Request Qty</th><th>Unit</th><th>Reason</th><th /></tr></thead><tbody>{rows.map((row, index) => { const product = products.find((item) => item.id === row.productId)!; const available = product.stockByLocation[sourceLocationId] ?? 0; return <tr key={row.productId} className="border-b border-ledger-50 dark:border-ledger-800"><td className="py-3">{index + 1}</td><td className="font-medium">{product.name}</td><td className="text-ledger-400">{product.sku}</td><td className="font-semibold text-signal">{available.toLocaleString()}</td><td><input type="number" min={1} value={row.quantity} onChange={(event) => setRows((current) => current.map((item) => item.productId === row.productId ? { ...item, quantity: Math.max(1, Number(event.target.value)) } : item))} className="w-20 rounded border border-ledger-100 px-2 py-1 dark:border-ledger-700 dark:bg-ink-800" /></td><td>{product.unit}</td><td><select value={row.reason} onChange={(event) => setRows((current) => current.map((item) => item.productId === row.productId ? { ...item, reason: event.target.value } : item))} className="rounded border border-ledger-100 px-2 py-1 dark:border-ledger-700 dark:bg-ink-800"><option>Store replenishment</option><option>Promotion</option><option>New branch opening</option></select></td><td><button onClick={() => setRows((current) => current.filter((item) => item.productId !== row.productId))} className="text-alert"><Trash2 className="h-3.5 w-3.5" /></button></td></tr>; })}</tbody></table></div>
            <button onClick={() => document.querySelector<HTMLInputElement>("input[placeholder^='Search product']")?.focus()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-ledger-200 py-2 text-ledger-500 hover:border-signal hover:text-signal"><Plus className="h-3.5 w-3.5" /> Add Another Item</button>
          </section>
          <section className="grid gap-4 md:grid-cols-2"><label className="rounded-2xl border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">Additional Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} className="mt-2 w-full rounded-lg border border-ledger-100 px-3 py-2 dark:border-ledger-700 dark:bg-ink-800" /></label><div className="rounded-2xl border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900"><p className="font-semibold">Attachments (Optional)</p><div className="mt-2 flex h-24 items-center justify-center rounded-lg border border-dashed border-ledger-200 text-ledger-400"><UploadCloud className="mr-2 h-4 w-4" /> Click to upload or drag and drop</div></div></section>
        </main>
        <aside className="h-fit rounded-2xl border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900"><h2 className="font-display text-sm font-bold">Request Summary</h2><dl className="mt-4 space-y-3"><div className="flex justify-between"><dt>Total Items</dt><dd className="font-semibold">{rows.length}</dd></div><div className="flex justify-between"><dt>Total Quantity</dt><dd className="font-semibold">{totalQuantity}</dd></div><div className="flex justify-between"><dt>Est. Total Value</dt><dd className="font-semibold">{currency} {totalValue.toLocaleString()}</dd></div></dl><div className="mt-5 rounded-lg bg-blue-50 p-3 text-blue-700">This is a request. Stock will be reserved after approval.</div><div className="mt-5 space-y-2"><Button disabled={isPending || !rows.length} onClick={() => submit(true)} className="w-full bg-signal text-white"><CalendarDays className="h-3.5 w-3.5" /> Submit Request</Button><Button disabled={isPending || !rows.length} variant="outline" onClick={() => submit(false)} className="w-full">Save as Draft</Button></div></aside>
      </div>
    </div>
  );
}
