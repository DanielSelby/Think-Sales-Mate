"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type OrderStatus = "pending_payment" | "new" | "confirmed" | "preparing" | "ready" | "served" | "completed" | "cancelled";

const statusLabels: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  new: "Order received",
  confirmed: "Confirmed",
  preparing: "Being prepared",
  ready: "Ready",
  served: "Served",
  completed: "Completed",
  cancelled: "Cancelled",
};

const progress: OrderStatus[] = ["new", "confirmed", "preparing", "ready", "completed"];

function money(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
}

export default function RestaurantOrderTrackingView({
  orderNumber,
  orderType,
  status,
  paymentStatus,
  paymentOption,
  total,
  deliveryFee,
  createdAt,
  branchName,
  currency,
  orderingUrl,
}: {
  orderNumber: number;
  orderType: "dine_in" | "takeaway" | "delivery";
  status: OrderStatus;
  paymentStatus: "unpaid" | "partial" | "paid";
  paymentOption: "pay_at_fulfillment" | "paystack";
  total: number;
  deliveryFee: number;
  createdAt: string;
  branchName: string;
  currency: string;
  orderingUrl: string;
}) {
  const router = useRouter();
  const isClosed = status === "cancelled" || status === "completed";

  useEffect(() => {
    if (isClosed) return;
    const timer = window.setInterval(() => router.refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, [isClosed, router]);

  const displayedStatus = statusLabels[status];
  const activeProgressStatus = status === "served" ? "completed" : status;
  const currentStep = progress.indexOf(activeProgressStatus);

  return <main className="mx-auto max-w-xl space-y-5 px-4 py-12">
    <Link href={orderingUrl} className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
      Back to restaurant menu
    </Link>
    <header className="rounded-2xl bg-slate-950 p-6 text-white">
      <p className="text-sm font-semibold text-orange-300">{branchName}</p>
      <h1 className="mt-1 text-2xl font-bold">Track order #{orderNumber}</h1>
      <p className="mt-2 text-sm text-slate-300">Updates refresh automatically while this page is open.</p>
    </header>
    <section className="space-y-5 rounded-2xl border bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Order status</p>
          <p className={`mt-1 text-xl font-bold ${status === "cancelled" ? "text-red-700" : "text-emerald-700"}`}>{displayedStatus}</p>
        </div>
        <button type="button" onClick={() => router.refresh()} className="rounded-lg border px-3 py-2 text-sm font-semibold text-slate-700">Refresh</button>
      </div>
      {status === "pending_payment" ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Payment is not confirmed yet. The restaurant will receive your order after payment verification.</p>
        : status === "cancelled" ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">This order was cancelled. Contact the restaurant if you need help.</p>
          : <ol className="space-y-3">
            {progress.map((step, index) => {
              const isCurrent = step === activeProgressStatus;
              const isComplete = currentStep >= 0 && index < currentStep;
              const label = step === "completed" && orderType === "dine_in" ? "Served / complete" : statusLabels[step];
              return <li key={step} className="flex items-center gap-3">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${isCurrent ? "bg-orange-600 text-white" : isComplete ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
                  {isComplete ? "✓" : index + 1}
                </span>
                <span className={`text-sm ${isCurrent ? "font-bold text-slate-950" : isComplete ? "text-emerald-800" : "text-slate-500"}`}>{label}</span>
              </li>;
            })}
          </ol>}
      <div className="border-t pt-4 text-sm">
        <p className="flex justify-between"><span>Fulfillment</span><span>{orderType === "delivery" ? "Delivery" : orderType === "takeaway" ? "Pickup" : "Dine-in"}</span></p>
        {deliveryFee > 0 && <p className="mt-1 flex justify-between"><span>Delivery fee</span><span>{money(deliveryFee, currency)}</span></p>}
        <p className="mt-1 flex justify-between font-semibold"><span>Total</span><span>{money(total, currency)}</span></p>
        <p className="mt-2 flex justify-between"><span>Payment</span><span>{paymentStatus === "paid" ? "Paid" : paymentOption === "paystack" ? "Online payment pending" : "Pay at fulfillment"}</span></p>
        <p className="mt-2 text-xs text-slate-500">Placed {new Date(createdAt).toLocaleString()}</p>
      </div>
      {isClosed && <p className="text-xs text-slate-500">This order is closed. Refreshing will no longer change its status.</p>}
    </section>
  </main>;
}
