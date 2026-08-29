import Link from "next/link";
import { CheckCircle2, Package, MapPin, Clock, ArrowRight, Truck, Check, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/sales/format";
import { trackOrder } from "@/app/order/[orgSlug]/track/[token]/actions";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from "@/lib/customer-portal/format";
import { Badge } from "@/components/ui/badge";
import type { CustomerOrderStatus } from "@/types/database";

export default async function TrackOrderPage({ params }: { params: Promise<{ orgSlug: string; token: string }> }) {
  const { orgSlug, token } = await params;
  const order = await trackOrder(token);

  if (!order) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-ledger-400" />
          <h1 className="mt-3 font-display text-lg font-semibold text-ink-900 dark:text-white">Order Not Found</h1>
          <p className="mt-1 text-sm text-ledger-500">We couldn&apos;t find an active order matching this tracking link.</p>
          <Link href={`/order/${orgSlug}`} className="mt-4 inline-block text-xs font-semibold text-signal hover:underline">
            Back to Storefront
          </Link>
        </div>
      </div>
    );
  }

  const isCompleted = order.status === "completed";
  const isCancelled = order.status === "cancelled";

  return (
    <div className="mx-auto max-w-2xl px-4 pb-20 pt-8">
      {/* Top success / status card */}
      <div className="mb-6 flex flex-col items-center text-center">
        <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-signal-soft text-signal dark:bg-signal/15">
          {isCompleted ? <Check className="h-7 w-7" /> : <CheckCircle2 className="h-7 w-7" />}
        </span>
        <div className="flex items-center gap-2">
          <h1 className="font-display text-xl font-bold text-ink-900 dark:text-white">Order {order.orderNumber}</h1>
          <Badge tone={ORDER_STATUS_TONE[order.status as CustomerOrderStatus] ?? "neutral"}>
            {ORDER_STATUS_LABEL[order.status as CustomerOrderStatus] ?? order.status}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-ledger-500">
          Placed on {new Date(order.createdAt).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
        </p>
        {order.branchName && (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-ledger-100 px-3 py-1 text-xs font-medium text-ledger-700 dark:bg-ink-800 dark:text-ledger-300">
            <MapPin className="h-3.5 w-3.5 text-signal" />
            <span>Assigned Branch: <strong>{order.branchName}</strong></span>
          </div>
        )}
      </div>

      <div className="space-y-5">
        {/* Timeline tracker */}
        {order.timeline.length > 0 && (
          <div className="rounded-xl border border-ledger-200 bg-white p-5 shadow-sm dark:border-ledger-700 dark:bg-ink-900">
            <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-ledger-400">Order Progress Timeline</h2>
            <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-ledger-200 dark:before:bg-ledger-700">
              {order.timeline.map((event, idx) => (
                <div key={idx} className="relative">
                  <span className="absolute -left-6 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-signal text-white ring-4 ring-white dark:ring-ink-900">
                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  </span>
                  <div>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-xs font-semibold text-ink-900 dark:text-white">{event.title}</p>
                      <span className="font-mono text-[10px] text-ledger-400">
                        {new Date(event.createdAt).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    {event.actorName && (
                      <p className="text-[11px] text-ledger-500 dark:text-ledger-400">By {event.actorName}</p>
                    )}
                    {event.notes && (
                      <p className="mt-0.5 text-[11px] text-ledger-400 italic">{event.notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Order Details & Summary */}
        <div className="rounded-xl border border-ledger-200 bg-white p-5 shadow-sm dark:border-ledger-700 dark:bg-ink-900">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-ledger-400">Order Items</h2>
          <div className="divide-y divide-ledger-100 dark:divide-ledger-800">
            {order.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2.5 text-xs">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded bg-ledger-100 dark:bg-ink-800">
                    <Package className="h-3.5 w-3.5 text-ledger-500" />
                  </span>
                  <div>
                    <p className="font-semibold text-ink-900 dark:text-white">{item.productName}</p>
                    <p className="text-ledger-400">Qty: {item.quantity}</p>
                  </div>
                </div>
                {order.showPrices && (
                  <span className="font-mono font-medium text-ink-900 dark:text-white">
                    {formatCurrency(item.lineTotal, order.currency)}
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 border-t border-ledger-100 pt-3 dark:border-ledger-800 space-y-1.5 text-xs">
            {order.showPrices ? (
              <>
                <div className="flex justify-between text-ledger-500">
                  <span>Subtotal</span>
                  <span className="font-mono">{formatCurrency(order.subtotal, order.currency)}</span>
                </div>
                {order.deliveryOption && (
                  <div className="flex justify-between text-ledger-500">
                    <span>Delivery ({order.deliveryOption})</span>
                    <span className="font-mono">{formatCurrency(order.deliveryFee, order.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-ledger-100 pt-2 text-sm font-bold text-ink-900 dark:border-ledger-800 dark:text-white">
                  <span>Total Amount</span>
                  <span className="font-mono text-signal">{formatCurrency(order.total, order.currency)}</span>
                </div>
              </>
            ) : (
              <p className="text-xs text-amber-700 dark:text-amber-300">Final price will be confirmed upon review.</p>
            )}
          </div>
        </div>

        {/* Customer & Delivery address */}
        <div className="rounded-xl border border-ledger-200 bg-white p-5 shadow-sm dark:border-ledger-700 dark:bg-ink-900">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-ledger-400">Delivery Information</h2>
          <p className="text-xs font-medium text-ink-900 dark:text-white">{order.guestName} ({order.guestPhone})</p>
          <p className="mt-0.5 text-xs text-ledger-600 dark:text-ledger-300">{order.deliveryAddress}</p>
          {order.notes && (
            <p className="mt-2 text-xs text-ledger-500 italic bg-ledger-50 p-2 rounded dark:bg-ink-800">
              Note: {order.notes}
            </p>
          )}
        </div>
      </div>

      <div className="mt-8 text-center">
        <Link
          href={`/order/${orgSlug}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-signal hover:underline"
        >
          Continue Shopping <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}