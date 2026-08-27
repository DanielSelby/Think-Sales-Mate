"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, PackageCheck, XCircle, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/sales/format";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from "@/lib/customer-portal/format";
import {
  updateOrderItem, removeOrderItem, checkOrderStock, setAdminNotes, approveAndProcessOrder, declineOrder,
  type StockCheckResult,
} from "@/app/(dashboard)/orders/actions";
import type { CustomerOrderStatus } from "@/types/database";

export interface OrderItemRow {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  status: CustomerOrderStatus;
  createdAt: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string | null;
  deliveryAddress: string;
  deliveryOption: string | null;
  deliveryFee: number;
  paymentMethod: string;
  subtotal: number;
  total: number;
  notes: string | null;
  adminNotes: string | null;
}

interface OrderDetailViewProps {
  order: OrderDetail;
  items: OrderItemRow[];
  currency: string;
  locations: { id: string; name: string }[];
}

export function OrderDetailView({ order, items: initialItems, currency, locations }: OrderDetailViewProps) {
  const router = useRouter();
  const [items, setItems] = React.useState(initialItems);
  const [adminNotes, setAdminNotesLocal] = React.useState(order.adminNotes ?? "");
  const [locationId, setLocationId] = React.useState(locations[0]?.id ?? "");
  const [stockResult, setStockResult] = React.useState<StockCheckResult | null>(null);
  const [checkingStock, setCheckingStock] = React.useState(false);
  const [declineOpen, setDeclineOpen] = React.useState(false);
  const [declineReason, setDeclineReason] = React.useState("");
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
  const total = subtotal + order.deliveryFee;

  function updateLocal(itemId: string, patch: Partial<OrderItemRow>) {
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, ...patch, lineTotal: (patch.quantity ?? i.quantity) * (patch.unitPrice ?? i.unitPrice) } : i)));
  }

  function saveItem(item: OrderItemRow) {
    startTransition(async () => {
      await updateOrderItem(order.id, { itemId: item.id, quantity: item.quantity, unitPrice: item.unitPrice });
      router.refresh();
    });
  }

  function deleteItem(itemId: string) {
    startTransition(async () => {
      await removeOrderItem(order.id, itemId);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      router.refresh();
    });
  }

  function runStockCheck() {
    setCheckingStock(true);
    checkOrderStock(order.id).then((result) => {
      setStockResult(result);
      setCheckingStock(false);
    });
  }

  function saveAdminNotes() {
    startTransition(async () => {
      await setAdminNotes(order.id, adminNotes);
    });
  }

  function handleApprove() {
    setError(null);
    if (!locationId) return setError("Select a location to receive this order into.");
    startTransition(async () => {
      const result = await approveAndProcessOrder({ orderId: order.id, locationId });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.push("/orders");
    });
  }

  function handleDecline() {
    startTransition(async () => {
      const result = await declineOrder(order.id, declineReason || undefined);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setDeclineOpen(false);
      router.push("/orders");
    });
  }

  const isFinal = order.status === "completed" || order.status === "cancelled";

  return (
    <div className="space-y-5 pb-24">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/orders" className="mb-1 flex items-center gap-1 text-sm text-ledger-500 hover:text-ink-900 dark:hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> Back to Orders</Link>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-xl font-semibold text-ink-900 dark:text-white">Order {order.orderNumber}</h1>
            <Badge tone={ORDER_STATUS_TONE[order.status]}>{ORDER_STATUS_LABEL[order.status]}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-ledger-400">Placed on {new Date(order.createdAt).toLocaleString("en-GH")}</p>
        </div>
      </div>

      {error && <div className="rounded-md border border-alert/30 bg-alert-soft px-4 py-2.5 text-sm text-alert">{error}</div>}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Card accent="neutral">
          <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Customer Information</CardTitle></CardHeader>
          <CardContent className="space-y-1 pt-0 text-sm text-ledger-600 dark:text-ledger-300">
            <p className="font-medium text-ink-900 dark:text-white">{order.guestName}</p>
            <p>{order.guestPhone}</p>
            {order.guestEmail && <p>{order.guestEmail}</p>}
          </CardContent>
        </Card>
        <Card accent="neutral">
          <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Delivery Information</CardTitle></CardHeader>
          <CardContent className="space-y-1 pt-0 text-sm text-ledger-600 dark:text-ledger-300">
            <p>{order.deliveryAddress}</p>
            {order.deliveryOption && <p>Delivery Option: {order.deliveryOption} · {formatCurrency(order.deliveryFee, currency)}</p>}
            <p>Payment Method: {order.paymentMethod}</p>
          </CardContent>
        </Card>
      </div>

      <Card accent="neutral">
        <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Order Items</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto rounded-md border border-ledger-100 dark:border-ledger-700">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-ledger-100 bg-ledger-50/60 text-xs text-ledger-400 dark:border-ledger-700 dark:bg-white/[0.03]">
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="w-24 px-3 py-2 text-right font-medium">Price</th>
                  <th className="w-20 px-3 py-2 text-right font-medium">Qty</th>
                  <th className="w-28 px-3 py-2 text-right font-medium">Subtotal</th>
                  <th className="w-10 px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2 text-ink-900 dark:text-white">{item.productName}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number" min={0} step="0.01" value={item.unitPrice} disabled={isFinal}
                        onChange={(e) => updateLocal(item.id, { unitPrice: Number(e.target.value) })}
                        onBlur={() => saveItem(items.find((i) => i.id === item.id)!)}
                        className="h-8 w-full rounded border border-ledger-200 bg-white px-2 text-right text-sm disabled:opacity-60 dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number" min={1} value={item.quantity} disabled={isFinal}
                        onChange={(e) => updateLocal(item.id, { quantity: Math.max(1, Number(e.target.value)) })}
                        onBlur={() => saveItem(items.find((i) => i.id === item.id)!)}
                        className="h-8 w-full rounded border border-ledger-200 bg-white px-2 text-right text-sm disabled:opacity-60 dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-medium text-ink-900 dark:text-white">{formatCurrency(item.lineTotal, currency)}</td>
                    <td className="px-3 py-2">
                      {!isFinal && (
                        <button onClick={() => deleteItem(item.id)} className="rounded p-1.5 text-alert/70 hover:bg-alert-soft hover:text-alert"><Trash2 className="h-4 w-4" /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!isFinal && (
            <div className="mt-3">
              <Button variant="outline" size="sm" onClick={runStockCheck} disabled={checkingStock}>
                {checkingStock && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Check Stock
              </Button>
              {stockResult && (
                <div className={`mt-2 rounded-md px-3 py-2 text-xs ${stockResult.allInStock ? "bg-signal-soft text-ink-900 dark:bg-signal/10 dark:text-white" : "bg-alert-soft text-alert"}`}>
                  {stockResult.allInStock ? "All items are in stock." : stockResult.shortages.map((s, i) => <div key={i}>{s.productName}: requested {s.requested}, only {s.available} available</div>)}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Card accent="neutral">
          <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Admin Notes (Optional)</CardTitle></CardHeader>
          <CardContent className="pt-0">
            <textarea
              value={adminNotes} onChange={(e) => setAdminNotesLocal(e.target.value)} onBlur={saveAdminNotes}
              rows={3} disabled={isFinal}
              placeholder="Add notes about this order..."
              className="w-full rounded-md border border-ledger-200 bg-white px-3 py-2 text-sm disabled:opacity-60 dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
            />
            {order.notes && <p className="mt-2 text-xs text-ledger-400">Customer note: {order.notes}</p>}
          </CardContent>
        </Card>

        <Card accent="signal">
          <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Order Summary</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 pt-0 text-sm">
            <div className="flex items-center justify-between"><span className="text-ledger-500">Subtotal</span><span className="text-ink-900 dark:text-white">{formatCurrency(subtotal, currency)}</span></div>
            <div className="flex items-center justify-between"><span className="text-ledger-500">Delivery Fee</span><span className="text-ink-900 dark:text-white">{formatCurrency(order.deliveryFee, currency)}</span></div>
            <div className="flex items-center justify-between border-t border-ledger-100 pt-2 text-base font-semibold dark:border-ledger-700"><span className="text-ink-900 dark:text-white">Total</span><span className="text-signal">{formatCurrency(total, currency)}</span></div>
            {!isFinal && locations.length > 0 && (
              <div className="pt-2">
                <label className="mb-1 block text-xs font-medium text-ledger-500">Receive into Location</label>
                <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="h-9 w-full rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white">
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {!isFinal && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ledger-100 bg-white/95 px-6 py-3 backdrop-blur dark:border-ledger-700 dark:bg-ink-900/95">
          <div className="mx-auto flex max-w-[1400px] items-center justify-between">
            <Button variant="outline" size="md" onClick={() => setDeclineOpen(true)} disabled={isPending} className="border-alert text-alert hover:bg-alert-soft">
              <XCircle className="h-4 w-4" /> Decline Order
            </Button>
            <Button variant="primary" size="md" onClick={handleApprove} disabled={isPending} className="bg-signal hover:bg-signal/90">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />} Approve &amp; Process
            </Button>
          </div>
        </div>
      )}

      <Dialog open={declineOpen} onClose={() => setDeclineOpen(false)} title="Decline Order" description="This marks the order as cancelled. No stock or sale is created.">
        <div className="space-y-3">
          <textarea value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} rows={2} placeholder="Reason (optional)" className="w-full rounded-md border border-ledger-200 bg-white px-3 py-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="md" onClick={() => setDeclineOpen(false)} disabled={isPending}>Cancel</Button>
            <Button variant="destructive" size="md" onClick={handleDecline} disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />} Decline Order
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}