"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Loader2, PackageCheck, XCircle, Trash2, MapPin,
  CheckCircle2, Truck, Box, Package, User, Building2, Calendar,
  Receipt, ShieldCheck, Check
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/sales/format";
import { useAppStore, THEMES } from "@/store/useAppStore";
import {
  ORDER_STATUS_LABEL, ORDER_STATUS_TONE,
  PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE,
  DELIVERY_STATUS_LABEL, DELIVERY_STATUS_TONE,
} from "@/lib/customer-portal/format";
import {
  updateOrderItem, removeOrderItem, checkOrderStock, setAdminNotes,
  approveAndProcessOrder, declineOrder, assignOrderBranch,
  updateOrderFulfillmentStatus, convertOrderToSale, setOrderSalesPerson,
  setOrderPaymentStatus, setExpectedDeliveryDate,
  type StockCheckResult,
} from "@/app/(dashboard)/orders/actions";
import type { CustomerOrderStatus, OrderPaymentStatus, OrderDeliveryStatus } from "@/types/database";

export interface OrderItemRow {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface OrderTimelineRow {
  id?: string;
  title: string;
  actorName: string;
  status?: string;
  notes?: string | null;
  createdAt: string;
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  status: CustomerOrderStatus;
  paymentStatus: OrderPaymentStatus;
  deliveryStatus: OrderDeliveryStatus;
  locationId: string | null;
  branchName: string | null;
  salesPersonId: string | null;
  salesPersonName: string | null;
  expectedDeliveryDate: string | null;
  stockReserved: boolean;
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
  rejectionReason: string | null;
  linkedSaleId: string | null;
}

interface OrderDetailViewProps {
  order: OrderDetail;
  items: OrderItemRow[];
  timeline: OrderTimelineRow[];
  currency: string;
  locations: { id: string; name: string }[];
  staff: { id: string; name: string }[];
}

export function OrderDetailView({
  order,
  items: initialItems,
  timeline,
  currency,
  locations,
  staff,
}: OrderDetailViewProps) {
  const router = useRouter();
  const { activeTheme } = useAppStore();
  const theme = THEMES[activeTheme] || THEMES.fintech;

  const [items, setItems] = React.useState(initialItems);
  const [adminNotes, setAdminNotesLocal] = React.useState(order.adminNotes ?? "");
  const [locationId, setLocationId] = React.useState(order.locationId ?? locations[0]?.id ?? "");
  const [salesPersonId, setSalesPersonIdLocal] = React.useState(order.salesPersonId ?? "");
  const [paymentStatus, setPaymentStatusLocal] = React.useState(order.paymentStatus);
  const [expectedDate, setExpectedDateLocal] = React.useState(order.expectedDeliveryDate ?? "");

  const [stockResult, setStockResult] = React.useState<StockCheckResult | null>(null);
  const [checkingStock, setCheckingStock] = React.useState(false);
  const [declineOpen, setDeclineOpen] = React.useState(false);
  const [declineReason, setDeclineReason] = React.useState("");
  const [rejectionReason, setRejectReason] = React.useState("");
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
  const total = subtotal + order.deliveryFee;

  function updateLocal(itemId: string, patch: Partial<OrderItemRow>) {
    setItems((prev) =>
      prev.map((i) =>
        i.id === itemId
          ? {
              ...i,
              ...patch,
              lineTotal: (patch.quantity ?? i.quantity) * (patch.unitPrice ?? i.unitPrice),
            }
          : i
      )
    );
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

  function handleBranchChange(newLocId: string) {
    setLocationId(newLocId);
    startTransition(async () => {
      await assignOrderBranch(order.id, newLocId);
      router.refresh();
    });
  }

  function handleSalesPersonChange(spId: string) {
    setSalesPersonIdLocal(spId);
    startTransition(async () => {
      await setOrderSalesPerson(order.id, spId || null);
      router.refresh();
    });
  }

  function handlePaymentStatusChange(ps: OrderPaymentStatus) {
    setPaymentStatusLocal(ps);
    startTransition(async () => {
      await setOrderPaymentStatus(order.id, ps);
      router.refresh();
    });
  }

  function handleExpectedDateChange(dt: string) {
    setExpectedDateLocal(dt);
    startTransition(async () => {
      await setExpectedDeliveryDate(order.id, dt || null);
      router.refresh();
    });
  }

  function handleApprove() {
    setError(null);
    if (!locationId) return setError("Please select a branch location to receive and fulfill this order.");
    startTransition(async () => {
      const result = await approveAndProcessOrder({ orderId: order.id, locationId });
      if (!result.ok) {
        setError(result.error ?? "Failed to approve order.");
        return;
      }
      router.refresh();
    });
  }

  function handleStatusStep(status: CustomerOrderStatus, deliveryStatus?: OrderDeliveryStatus) {
    startTransition(async () => {
      await updateOrderFulfillmentStatus(order.id, status, deliveryStatus);
      router.refresh();
    });
  }

  function handleConvertToSaleClick() {
    startTransition(async () => {
      const res = await convertOrderToSale(order.id);
      if (!res.ok) {
        setError(res.error ?? "Failed to convert to sale.");
        return;
      }
      router.push("/sales");
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
    <div className="space-y-6 pb-28 max-w-6xl mx-auto">
      {/* Top Breadcrumb & Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/orders"
            className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-ledger-500 hover:text-ink-900 dark:hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Order Tracker
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-bold text-ink-900 dark:text-white">Order {order.orderNumber}</h1>
            <Badge tone={ORDER_STATUS_TONE[order.status] ?? "neutral"}>
              {ORDER_STATUS_LABEL[order.status] ?? order.status}
            </Badge>
            {order.stockReserved && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                <ShieldCheck className="h-3.5 w-3.5" /> Stock Reserved
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-ledger-400">
            Placed on {new Date(order.createdAt).toLocaleString("en-GH")} · Source: Customer Online Portal
          </p>
        </div>

        {/* Quick Stepper Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {order.status === "new" && (
            <Button
              variant="primary"
              size="md"
              onClick={handleApprove}
              disabled={isPending}
              style={{ background: theme.colors.primary, color: "#ffffff" }}
              className="hover:opacity-90"
            >
              <PackageCheck className="h-4 w-4 mr-1.5" /> Approve Order
            </Button>
          )}
          {order.status === "approved" && (
            <Button variant="outline" size="md" onClick={() => handleStatusStep("picking")} disabled={isPending} className="border-amber-400 text-amber-700 hover:bg-amber-50">
              <Package className="h-4 w-4 mr-1.5" /> Start Picking
            </Button>
          )}
          {order.status === "picking" && (
            <Button variant="outline" size="md" onClick={() => handleStatusStep("packing")} disabled={isPending} className="border-purple-400 text-purple-700 hover:bg-purple-50">
              <Box className="h-4 w-4 mr-1.5" /> Complete Packing
            </Button>
          )}
          {order.status === "packing" && (
            <Button variant="outline" size="md" onClick={() => handleStatusStep("delivery")} disabled={isPending} className="border-blue-400 text-blue-700 hover:bg-blue-50">
              <Truck className="h-4 w-4 mr-1.5" /> Out for Delivery
            </Button>
          )}
          {order.status === "delivery" && (
            <Button variant="primary" size="md" onClick={() => handleStatusStep("completed")} disabled={isPending} className="bg-emerald-600 hover:bg-emerald-700">
              <CheckCircle2 className="h-4 w-4 mr-1.5" /> Mark Delivered
            </Button>
          )}
          {!isFinal && !order.linkedSaleId && (
            <Button variant="outline" size="md" onClick={handleConvertToSaleClick} disabled={isPending}>
              <Receipt className="h-4 w-4 mr-1.5" /> Convert to Sale
            </Button>
          )}
        </div>
      </div>

      {error && <div className="rounded-lg border border-alert/30 bg-alert-soft px-4 py-3 text-xs font-medium text-alert">{error}</div>}

      {/* Grid of details */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Customer Information */}
        <Card accent="neutral" className="border-ledger-200/80 dark:border-ledger-700/80">
          <CardHeader className="pb-2">
            <CardTitle className="normal-case tracking-normal text-xs font-bold uppercase tracking-wider text-ledger-400">
              Customer Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0 text-xs">
            <p className="text-sm font-semibold text-ink-900 dark:text-white">{order.guestName}</p>
            <p className="text-ledger-600 dark:text-ledger-300">Phone: {order.guestPhone}</p>
            {order.guestEmail && <p className="text-ledger-600 dark:text-ledger-300">Email: {order.guestEmail}</p>}
            {order.notes && (
              <div className="mt-2 rounded bg-ledger-50 p-2.5 dark:bg-ink-800">
                <p className="font-semibold text-ledger-700 dark:text-ledger-200">Customer Note:</p>
                <p className="text-ledger-600 dark:text-ledger-300 italic">{order.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Delivery Details */}
        <Card accent="neutral" className="border-ledger-200/80 dark:border-ledger-700/80">
          <CardHeader className="pb-2">
            <CardTitle className="normal-case tracking-normal text-xs font-bold uppercase tracking-wider text-ledger-400">
              Delivery Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0 text-xs">
            <p className="text-ink-900 dark:text-white">{order.deliveryAddress}</p>
            {order.deliveryOption && (
              <p className="text-ledger-600 dark:text-ledger-300">
                Method: <strong>{order.deliveryOption}</strong> ({formatCurrency(order.deliveryFee, currency)})
              </p>
            )}
            <p className="text-ledger-600 dark:text-ledger-300">Payment Method: {order.paymentMethod}</p>
            <div>
              <label className="mb-1 block text-[11px] text-ledger-400">Expected Delivery Date</label>
              <input
                type="date"
                value={expectedDate}
                disabled={isFinal}
                onChange={(e) => handleExpectedDateChange(e.target.value)}
                className="h-8 w-full rounded border border-ledger-200 bg-white px-2.5 text-xs text-ink-900 focus:outline-none dark:border-ledger-700 dark:bg-ink-800 dark:text-white"
              />
            </div>
          </CardContent>
        </Card>

        {/* Branch & Staff Assignment */}
        <Card accent="neutral" className="border-ledger-200/80 dark:border-ledger-700/80">
          <CardHeader className="pb-2">
            <CardTitle className="normal-case tracking-normal text-xs font-bold uppercase tracking-wider text-ledger-400">
              Branch &amp; Staff Assignment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0 text-xs">
            <div>
              <label className="mb-1 block font-medium text-ledger-600 dark:text-ledger-300">Fulfillment Branch</label>
              <select
                value={locationId}
                disabled={isFinal}
                onChange={(e) => handleBranchChange(e.target.value)}
                className="h-8 w-full rounded border border-ledger-200 bg-white px-2 text-xs text-ink-900 focus:outline-none dark:border-ledger-700 dark:bg-ink-800 dark:text-white"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block font-medium text-ledger-600 dark:text-ledger-300">Assigned Sales Person</label>
              <select
                value={salesPersonId}
                disabled={isFinal}
                onChange={(e) => handleSalesPersonChange(e.target.value)}
                className="h-8 w-full rounded border border-ledger-200 bg-white px-2 text-xs text-ink-900 focus:outline-none dark:border-ledger-700 dark:bg-ink-800 dark:text-white"
              >
                <option value="">Unassigned</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block font-medium text-ledger-600 dark:text-ledger-300">Payment Status</label>
              <select
                value={paymentStatus}
                onChange={(e) => handlePaymentStatusChange(e.target.value as OrderPaymentStatus)}
                className="h-8 w-full rounded border border-ledger-200 bg-white px-2 text-xs text-ink-900 focus:outline-none dark:border-ledger-700 dark:bg-ink-800 dark:text-white"
              >
                <option value="unpaid">Unpaid</option>
                <option value="partial">Partial</option>
                <option value="paid">Paid</option>
              </select>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Order Items Table & Stock Verification */}
      <Card accent="neutral" className="border-ledger-200/80 dark:border-ledger-700/80">
        <CardHeader className="pb-2">
          <CardTitle className="normal-case tracking-normal text-sm font-semibold text-ink-900 dark:text-white flex items-center justify-between">
            <span>Order Line Items</span>
            {!isFinal && (
              <Button variant="outline" size="sm" onClick={runStockCheck} disabled={checkingStock}>
                {checkingStock && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />} Check Inventory Stock
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {stockResult && (
            <div className={cn("mb-3 rounded-lg p-3 text-xs font-medium", stockResult.allInStock ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-rose-50 text-rose-800 dark:bg-rose-950/30 dark:text-rose-300")}>
              {stockResult.allInStock
                ? "All line items are available in stock."
                : stockResult.shortages.map((s, i) => (
                    <div key={i}>
                      Shortage: {s.productName} (Requested: {s.requested}, In Stock: {s.available})
                    </div>
                  ))}
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-ledger-100 dark:border-ledger-800">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-ledger-100 bg-ledger-50/50 text-[11px] font-semibold text-ledger-400 dark:border-ledger-800 dark:bg-ink-850">
                  <th className="px-3 py-2.5">Product Name</th>
                  <th className="w-28 px-3 py-2.5 text-right">Unit Price</th>
                  <th className="w-24 px-3 py-2.5 text-right">Quantity</th>
                  <th className="w-32 px-3 py-2.5 text-right">Subtotal</th>
                  <th className="w-12 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ledger-100 dark:divide-ledger-800">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2.5 font-medium text-ink-900 dark:text-white">{item.productName}</td>
                    <td className="px-3 py-2.5">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.unitPrice}
                        disabled={isFinal}
                        onChange={(e) => updateLocal(item.id, { unitPrice: Number(e.target.value) })}
                        onBlur={() => saveItem(items.find((i) => i.id === item.id)!)}
                        className="h-7 w-full rounded border border-ledger-200 bg-white px-2 text-right text-xs disabled:opacity-60 dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        disabled={isFinal}
                        onChange={(e) => updateLocal(item.id, { quantity: Math.max(1, Number(e.target.value)) })}
                        onBlur={() => saveItem(items.find((i) => i.id === item.id)!)}
                        className="h-7 w-full rounded border border-ledger-200 bg-white px-2 text-right text-xs disabled:opacity-60 dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-ink-900 dark:text-white">
                      {formatCurrency(item.lineTotal, currency)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {!isFinal && items.length > 1 && (
                        <button onClick={() => deleteItem(item.id)} className="rounded p-1 text-ledger-400 hover:text-alert">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Bottom Row: Admin Notes + Timeline */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Admin Notes */}
        <Card accent="neutral" className="border-ledger-200/80 dark:border-ledger-700/80">
          <CardHeader className="pb-2">
            <CardTitle className="normal-case tracking-normal text-xs font-bold uppercase tracking-wider text-ledger-400">
              Internal Admin Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotesLocal(e.target.value)}
              onBlur={saveAdminNotes}
              rows={3}
              disabled={isFinal}
              placeholder="Internal comments for sales &amp; fulfillment team..."
              className="w-full rounded-md border border-ledger-200 bg-white p-2.5 text-xs disabled:opacity-60 dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
            />
            {order.rejectionReason && (
              <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                <strong>Rejection Reason:</strong> {order.rejectionReason}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Order Summary Card */}
        <Card accent="signal" className="border-ledger-200/80 dark:border-ledger-700/80">
          <CardHeader className="pb-2">
            <CardTitle className="normal-case tracking-normal text-xs font-bold uppercase tracking-wider text-ledger-400">
              Financial Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0 text-xs">
            <div className="flex justify-between text-ledger-500">
              <span>Items Subtotal</span>
              <span className="font-mono font-medium text-ink-900 dark:text-white">{formatCurrency(subtotal, currency)}</span>
            </div>
            <div className="flex justify-between text-ledger-500">
              <span>Delivery Fee</span>
              <span className="font-mono font-medium text-ink-900 dark:text-white">{formatCurrency(order.deliveryFee, currency)}</span>
            </div>
            <div className="flex justify-between border-t border-ledger-100 pt-2 text-base font-bold text-ink-900 dark:border-ledger-800 dark:text-white">
              <span>Grand Total</span>
              <span className="font-mono" style={{ color: theme.colors.primary }}>{formatCurrency(total, currency)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Full Timeline Section */}
      <Card accent="neutral" className="border-ledger-200/80 dark:border-ledger-700/80">
        <CardHeader className="pb-2">
          <CardTitle className="normal-case tracking-normal text-xs font-bold uppercase tracking-wider text-ledger-400">
            Order Activity &amp; Audit Timeline
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-ledger-200 dark:before:bg-ledger-700">
            {timeline.map((event, idx) => (
              <div key={idx} className="relative">
                <span
                  style={{ background: theme.colors.primary }}
                  className="absolute -left-6 top-1 flex h-4 w-4 items-center justify-center rounded-full text-white ring-4 ring-white dark:ring-ink-900"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                </span>
                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-xs font-semibold text-ink-900 dark:text-white">{event.title}</p>
                    <span className="font-mono text-[10px] text-ledger-400">
                      {new Date(event.createdAt).toLocaleString("en-GH")}
                    </span>
                  </div>
                  {event.actorName && (
                    <p className="text-[11px] text-ledger-500 dark:text-ledger-400">Recorded by {event.actorName}</p>
                  )}
                  {event.notes && (
                    <p className="mt-0.5 text-[11px] text-ledger-400 italic">{event.notes}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Bottom Sticky Action Toolbar */}
      {!isFinal && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ledger-200 bg-white/95 px-6 py-3.5 backdrop-blur dark:border-ledger-700 dark:bg-ink-900/95">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <Button
              variant="outline"
              size="md"
              onClick={() => setDeclineOpen(true)}
              disabled={isPending}
              className="border-rose-300 text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400"
            >
              <XCircle className="h-4 w-4 mr-1.5" /> Reject Order
            </Button>

            <div className="flex items-center gap-3">
              {order.status === "new" ? (
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleApprove}
                  disabled={isPending}
                  style={{ background: theme.colors.primary, color: "#ffffff" }}
                  className="hover:opacity-90"
                >
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <PackageCheck className="h-4 w-4 mr-1.5" />}
                  Approve &amp; Reserve Stock
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleConvertToSaleClick}
                  disabled={isPending || Boolean(order.linkedSaleId)}
                  style={{ background: theme.colors.primary, color: "#ffffff" }}
                  className="hover:opacity-90"
                >
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Receipt className="h-4 w-4 mr-1.5" />}
                  {order.linkedSaleId ? "Sale Recorded" : "Convert Order to Sale"}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Decline Dialog */}
      <Dialog
        open={declineOpen}
        onClose={() => setDeclineOpen(false)}
        title="Reject Customer Order"
        description="This will cancel the order and send an automated cancellation update to the customer."
      >
        <div className="space-y-3 pt-2">
          <textarea
            value={declineReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            placeholder="Reason for rejecting this order..."
            className="w-full rounded-md border border-ledger-200 bg-white p-2.5 text-xs dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="md" onClick={() => setDeclineOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button variant="destructive" size="md" onClick={handleDecline} disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />} Confirm Rejection
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}