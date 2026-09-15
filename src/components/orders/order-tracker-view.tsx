"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Activity, ArrowLeft, CheckCircle2, Clock3, FileText, MapPin,
  MessageSquare, Package, Printer, RefreshCw, Truck, UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/sales/format";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE, PAYMENT_STATUS_LABEL } from "@/lib/customer-portal/format";
import type { CustomerOrderStatus, OrderDeliveryStatus } from "@/types/database";
import type { OrderRow } from "./orders-list-view";

type TrackerTab = "overview" | "timeline" | "items" | "payments" | "delivery" | "communications" | "documents" | "activity";

const stages: Array<{ key: string; status?: CustomerOrderStatus; label: string }> = [
  { key: "created", status: "new", label: "Order Created" },
  { key: "payment", label: "Payment Received" },
  { key: "approved", status: "approved", label: "Order Approved" },
  { key: "reserved", label: "Inventory Reserved" },
  { key: "picking", status: "picking", label: "Picking" },
  { key: "packing", status: "packing", label: "Packing" },
  { key: "ready", label: "Ready for Pickup" },
  { key: "dispatched", label: "Dispatched" },
  { key: "delivery", status: "delivery", label: "Out for Delivery" },
  { key: "delivered", status: "completed", label: "Delivered" },
  { key: "completed", status: "completed", label: "Completed" },
];

export function OrderTrackerView({
  orders,
  currency,
  onStatusChange,
}: {
  orders: OrderRow[];
  currency: string;
  onStatusChange: (order: OrderRow, status: CustomerOrderStatus, deliveryStatus?: OrderDeliveryStatus) => void;
}) {
  const [selectedId, setSelectedId] = useState(orders[0]?.id ?? "");
  const [tab, setTab] = useState<TrackerTab>("overview");
  const [isPending, startTransition] = useTransition();
  const order = orders.find((item) => item.id === selectedId) ?? orders[0] ?? null;

  const progress = useMemo(() => {
    if (!order) return 0;
    if (order.status === "cancelled" || order.status === "returned") return 0;
    return Math.round((getCompletedStages(order).filter(Boolean).length / stages.length) * 100);
  }, [order]);

  const metrics = {
    total: orders.length,
    inProgress: orders.filter((item) => ["new", "processing", "approved", "picking", "packing"].includes(item.status)).length,
    pickup: orders.filter((item) => item.status === "packing" && item.deliveryStatus !== "in_delivery").length,
    delivery: orders.filter((item) => item.status === "delivery" || item.deliveryStatus === "in_delivery").length,
    deliveredToday: orders.filter((item) => item.status === "completed" && item.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10)).length,
    delayed: orders.filter((item) => item.expectedDeliveryDate && new Date(item.expectedDeliveryDate) < new Date() && item.status !== "completed").length,
  };

  if (!order) {
    return <div className="rounded-2xl border border-dashed border-ledger-200 bg-white p-12 text-center text-sm text-ledger-500">No orders are available to track.</div>;
  }

  const update = (status: CustomerOrderStatus, deliveryStatus?: OrderDeliveryStatus) => {
    startTransition(() => onStatusChange(order, status, deliveryStatus));
  };

  const tabLabels: Array<[TrackerTab, string]> = [
    ["overview", "Overview"], ["timeline", "Timeline"], ["items", "Items"], ["payments", "Payments"],
    ["delivery", "Delivery"], ["communications", "Communications"], ["documents", "Documents"], ["activity", "Activity Logs"],
  ];

  return (
    <div className="space-y-5 pb-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/orders?view=list" className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-ledger-500 hover:text-signal"><ArrowLeft className="h-3.5 w-3.5" /> Back to Order List</Link>
          <p className="text-xs text-ledger-400">Sales / Orders / Order Tracker</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-ink-900 dark:text-white">Order Tracker</h1>
          <p className="mt-1 text-sm text-ledger-500">Monitor one order from creation through delivery and completion.</p>
        </div>
        <div className="flex gap-2">
          <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="h-9 rounded-lg border border-ledger-200 bg-white px-3 text-xs font-medium dark:border-ledger-700 dark:bg-ink-900 dark:text-white">
            {orders.map((item) => <option key={item.id} value={item.id}>{item.orderNumber} · {item.customerName}</option>)}
          </select>
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-ledger-200 bg-white px-3 text-xs font-semibold text-ledger-700 hover:bg-ledger-50 dark:border-ledger-700 dark:bg-ink-900 dark:text-white"><Printer className="h-3.5 w-3.5" /> Print</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {([
          ["Total Orders", metrics.total, Package, "text-blue-600 bg-blue-50"],
          ["In Progress", metrics.inProgress, Clock3, "text-amber-600 bg-amber-50"],
          ["Ready for Pickup", metrics.pickup, CheckCircle2, "text-violet-600 bg-violet-50"],
          ["Out for Delivery", metrics.delivery, Truck, "text-sky-600 bg-sky-50"],
          ["Delivered Today", metrics.deliveredToday, CheckCircle2, "text-emerald-600 bg-emerald-50"],
          ["Delayed Orders", metrics.delayed, Activity, "text-rose-600 bg-rose-50"],
        ] as [string, number, LucideIcon, string][]).map(([label, value, Icon, tone]) => (
          <div key={String(label)} className="rounded-xl border border-ledger-100 bg-white p-3 shadow-sm dark:border-ledger-700 dark:bg-ink-900">
            <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${tone}`}><Icon className="h-4 w-4" /></div>
            <p className="text-[11px] text-ledger-500">{label}</p><p className="mt-1 text-xl font-bold text-ink-900 dark:text-white">{String(value)}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <main className="min-w-0 space-y-4">
          <section className="rounded-2xl border border-ledger-100 bg-white p-5 shadow-sm dark:border-ledger-700 dark:bg-ink-900">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-xs text-ledger-400">Order Number</p><h2 className="font-mono text-xl font-bold text-ink-900 dark:text-white">{order.orderNumber}</h2><p className="mt-1 text-sm text-ledger-500">{order.customerName} · {order.branchName ?? "Branch not assigned"}</p></div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${ORDER_STATUS_TONE[order.status]}`}>{ORDER_STATUS_LABEL[order.status] ?? order.status}</span>
            </div>
            <div className="mt-5 overflow-x-auto pb-2">
              <div className="flex min-w-[980px] items-start gap-2">
              {stages.map((stage, index) => {
                const complete = getCompletedStages(order)[index];
                const current = !complete && index === getCompletedStages(order).findIndex((value) => !value);
                return <div key={stage.key} className="flex min-w-0 flex-1 items-start gap-2"><div className="flex min-w-0 flex-1 flex-col items-center gap-2"><div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${complete ? "bg-signal text-white" : current ? "bg-blue-600 text-white ring-4 ring-blue-100 dark:ring-blue-950" : "bg-ledger-100 text-ledger-400 dark:bg-ledger-800"}`}>{complete ? "✓" : index + 1}</div><span className={`text-center text-[10px] leading-tight ${complete || current ? "font-semibold text-ink-900 dark:text-white" : "text-ledger-400"}`}>{stage.label}</span></div>{index < stages.length - 1 && <div className={`mt-3 h-0.5 flex-1 ${complete ? "bg-signal/60" : "bg-ledger-200 dark:bg-ledger-700"}`} />}</div>;
              })}
              </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-ledger-100 dark:bg-ledger-800"><div className="h-full rounded-full bg-signal transition-all" style={{ width: `${progress}%` }} /></div>
            <p className="mt-1 text-right text-xs font-semibold text-signal">{progress}% complete</p>
          </section>

          <div className="overflow-x-auto rounded-xl border border-ledger-100 bg-white dark:border-ledger-700 dark:bg-ink-900"><div className="flex min-w-max border-b border-ledger-100 dark:border-ledger-700">{tabLabels.map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`px-4 py-3 text-xs font-semibold ${tab === key ? "border-b-2 border-signal text-signal" : "text-ledger-500 hover:text-ink-900 dark:hover:text-white"}`}>{label}</button>)}</div></div>

          <section className="rounded-2xl border border-ledger-100 bg-white p-5 shadow-sm dark:border-ledger-700 dark:bg-ink-900">
            {tab === "overview" && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Info label="Customer" value={order.customerName} /><Info label="Branch" value={order.branchName ?? "Not assigned"} /><Info label="Sales Officer" value={order.salesPersonName ?? "Not assigned"} /><Info label="Order Type" value={order.deliveryOption ?? "Standard order"} /><Info label="Payment Status" value={PAYMENT_STATUS_LABEL[order.paymentStatus] ?? order.paymentStatus} /><Info label="Expected Delivery" value={order.expectedDeliveryDate ? new Date(order.expectedDeliveryDate).toLocaleDateString() : "Not set"} /><Info label="Subtotal" value={formatCurrency(order.subtotal, currency)} /><Info label="Delivery Fee" value={formatCurrency(order.deliveryFee, currency)} /><Info label="Net Total" value={formatCurrency(order.total, currency)} /><div className="sm:col-span-2 lg:col-span-3"><Info label="Order Notes" value={order.notes || order.adminNotes || "No notes recorded"} /></div></div>}
            {tab === "timeline" && <Timeline order={order} />}
            {tab === "items" && <Items order={order} currency={currency} />}
            {tab === "payments" && <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><Info label="Payment Method" value={order.paymentMethod} /><Info label="Amount Paid" value={order.paymentStatus === "paid" ? formatCurrency(order.total, currency) : formatCurrency(0, currency)} /><Info label="Balance Due" value={order.paymentStatus === "paid" ? formatCurrency(0, currency) : formatCurrency(order.total, currency)} /></div><Empty icon={FileText} text="Payment history will appear here as payments are recorded against this order." /></div>}
            {tab === "delivery" && <div className="grid gap-4 sm:grid-cols-2"><Info label="Delivery Method" value={order.deliveryOption ?? "Not specified"} /><Info label="Delivery Status" value={order.deliveryStatus.replaceAll("_", " ")} /><Info label="Delivery Address" value={order.deliveryAddress} /><Info label="Delivery Cost" value={formatCurrency(order.deliveryFee, currency)} /><div className="sm:col-span-2 rounded-xl border border-dashed border-sky-200 bg-sky-50 p-4 text-sm text-sky-800"><MapPin className="mb-2 h-5 w-5" />Live GPS tracking becomes available when a driver is assigned.</div></div>}
            {tab === "communications" && <Empty icon={MessageSquare} text="No customer communications have been recorded for this order." />}
            {tab === "documents" && <Empty icon={FileText} text="No documents have been attached to this order." />}
            {tab === "activity" && <Timeline order={order} />}
          </section>
        </main>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <section className="rounded-2xl border border-ledger-100 bg-white p-4 shadow-sm dark:border-ledger-700 dark:bg-ink-900"><h3 className="text-sm font-bold text-ink-900 dark:text-white">Order Summary</h3><div className="mt-3 space-y-3"><Info label="Customer" value={order.customerName} /><Info label="Branch" value={order.branchName ?? "Unassigned"} /><Info label="Order Value" value={formatCurrency(order.total, currency)} /><Info label="Created" value={new Date(order.createdAt).toLocaleString()} /><Info label="Progress" value={`${progress}%`} /></div></section>
          <section className="rounded-2xl border border-ledger-100 bg-white p-4 shadow-sm dark:border-ledger-700 dark:bg-ink-900"><h3 className="text-sm font-bold text-ink-900 dark:text-white">Quick Actions</h3><div className="mt-3 space-y-2">{order.status === "new" && <Action label="Approve Order" onClick={() => update("approved")} disabled={isPending} />} {order.status === "approved" && <Action label="Start Picking" onClick={() => update("picking")} disabled={isPending} />} {order.status === "picking" && <Action label="Start Packing" onClick={() => update("packing")} disabled={isPending} />} {order.status === "packing" && <Action label="Dispatch Order" onClick={() => update("delivery", "in_delivery")} disabled={isPending} />} {order.status === "delivery" && <Action label="Mark Delivered" onClick={() => update("completed", "delivered")} disabled={isPending} />} <Link href={`/orders/${order.id}`} className="flex w-full items-center justify-center gap-2 rounded-lg border border-ledger-200 px-3 py-2 text-xs font-semibold text-ledger-700 hover:bg-ledger-50 dark:border-ledger-700 dark:text-white"><RefreshCw className="h-3.5 w-3.5" /> Open full order</Link></div></section>
          <section className="rounded-2xl border border-ledger-100 bg-white p-4 shadow-sm dark:border-ledger-700 dark:bg-ink-900"><h3 className="text-sm font-bold text-ink-900 dark:text-white">Assigned Staff</h3><p className="mt-3 flex items-center gap-2 text-sm text-ledger-600 dark:text-ledger-300"><UserRound className="h-4 w-4 text-signal" />{order.salesPersonName ?? "Not assigned"}</p></section>
        </aside>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[11px] font-medium uppercase tracking-wide text-ledger-400">{label}</p><p className="mt-1 text-sm font-medium text-ink-900 dark:text-white">{value}</p></div>;
}

function Action({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return <button onClick={onClick} disabled={disabled} className="w-full rounded-lg bg-signal px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">{label}</button>;
}

function Timeline({ order }: { order: OrderRow }) {
  return order.timeline.length ? <div className="space-y-4">{order.timeline.map((event) => <div key={event.id ?? event.createdAt} className="flex gap-3"><div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-signal-soft text-signal"><Activity className="h-3.5 w-3.5" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-semibold text-ink-900 dark:text-white">{event.title}</p><time className="text-[11px] text-ledger-400">{new Date(event.createdAt).toLocaleString()}</time></div><p className="mt-1 text-xs text-ledger-500">{event.notes || "Status update recorded."} · by {event.actorName}</p></div></div>)}</div> : <Empty icon={Activity} text="No timeline events have been recorded yet." />;
}

function Items({ order, currency }: { order: OrderRow; currency: string }) {
  return <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="border-b border-ledger-100 text-[10px] uppercase text-ledger-400 dark:border-ledger-700"><tr><th className="px-2 py-2">Product</th><th className="px-2 py-2 text-right">Qty</th><th className="px-2 py-2 text-right">Unit Price</th><th className="px-2 py-2 text-right">Total</th></tr></thead><tbody className="divide-y divide-ledger-100 dark:divide-ledger-700">{order.items.map((item) => <tr key={item.id}><td className="px-2 py-3 font-medium text-ink-900 dark:text-white">{item.productName}</td><td className="px-2 py-3 text-right">{item.quantity}</td><td className="px-2 py-3 text-right">{formatCurrency(item.unitPrice, currency)}</td><td className="px-2 py-3 text-right font-semibold">{formatCurrency(item.lineTotal, currency)}</td></tr>)}</tbody></table></div>;
}

function Empty({ icon: Icon, text }: { icon: typeof Activity; text: string }) {
  return <div className="rounded-xl border border-dashed border-ledger-200 p-8 text-center text-sm text-ledger-500 dark:border-ledger-700"><Icon className="mx-auto mb-2 h-6 w-6 text-ledger-400" />{text}</div>;
}

function getCompletedStages(order: OrderRow): boolean[] {
  const titles = order.timeline.map((event) => event.title.toLowerCase());
  const has = (...terms: string[]) => titles.some((title) => terms.some((term) => title.includes(term)));
  const progressed = ["approved", "processing", "picking", "packing", "delivery", "completed"].includes(order.status);
  return [
    true,
    order.paymentStatus === "paid" || has("payment received", "payment recorded"),
    progressed || has("order approved", "approved"),
    order.stockReserved || has("stock reserved", "inventory reserved"),
    ["picking", "packing", "delivery", "completed"].includes(order.status) || has("picking"),
    ["packing", "delivery", "completed"].includes(order.status) || has("packing"),
    has("ready for pickup"),
    ["delivery", "completed"].includes(order.status) || has("dispatched"),
    ["delivery", "completed"].includes(order.status) || order.deliveryStatus === "in_delivery" || has("out for delivery"),
    order.status === "completed" || order.deliveryStatus === "delivered" || has("order delivered", "delivered"),
    order.status === "completed" || Boolean(order.timeline.some((event) => event.title.toLowerCase().includes("completed"))),
  ];
}
