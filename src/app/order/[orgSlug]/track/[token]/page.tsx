import Link from "next/link";
import { CheckCircle2, Package } from "lucide-react";
import { formatCurrency } from "@/lib/sales/format";
import { trackOrder } from "@/app/order/[orgSlug]/track/[token]/actions";
import { ORDER_STATUS_LABEL } from "@/lib/customer-portal/format";
import type { CustomerOrderStatus } from "@/types/database";

export default async function TrackOrderPage({ params }: { params: Promise<{ orgSlug: string; token: string }> }) {
  const { orgSlug, token } = await params;
  const order = await trackOrder(token);

  if (!order) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <p className="text-center text-sm text-ledger-500">We couldn&apos;t find that order.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-16 pt-10">
      <div className="mb-6 flex flex-col items-center text-center">
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-signal-soft text-signal dark:bg-signal/10"><CheckCircle2 className="h-6 w-6" /></span>
        <h1 className="font-display text-lg font-semibold text-ink-900 dark:text-white">Order Placed!</h1>
        <p className="text-sm text-ledger-500">Order {order.orderNumber} — {ORDER_STATUS_LABEL[order.status as CustomerOrderStatus]}</p>
        <p className="mt-1 text-xs text-ledger-400">Bookmark this page to check your order status later.</p>
      </div>

      <div className="space-y-3 rounded-md border border-ledger-100 bg-white p-4 dark:border-ledger-700 dark:bg-ink-900">
        <p className="text-sm font-semibold text-ink-900 dark:text-white">Order Items</p>
        {order.items.map((item, i) => (
          <div key={i} className="flex items-center gap-3 text-sm">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ledger-100 dark:bg-white/[0.06]"><Package className="h-3.5 w-3.5 text-ledger-400" /></span>
            <span className="min-w-0 flex-1 truncate text-ink-900 dark:text-white">{item.productName} × {item.quantity}</span>
            {order.showPrices && <span className="font-mono text-ledger-600 dark:text-ledger-300">{formatCurrency(item.lineTotal, order.currency)}</span>}
          </div>
        ))}
        {order.showPrices ? (
          <div className="mt-2 flex items-center justify-between border-t border-ledger-100 pt-2 text-sm font-semibold dark:border-ledger-700">
            <span className="text-ink-900 dark:text-white">Total</span>
            <span className="text-signal">{formatCurrency(order.total, order.currency)}</span>
          </div>
        ) : (
          <p className="text-xs text-ledger-400">Final price to be confirmed by our team.</p>
        )}
      </div>

      <Link href={`/order/${orgSlug}`} className="mt-6 block text-center text-sm font-medium text-signal hover:underline">
        Continue Shopping
      </Link>
    </div>
  );
}