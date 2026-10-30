import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { canAccessLocation } from "@/lib/organizations/location-access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getEnabledOrganizationModules } from "@/lib/supabase/platform-admin";
import { formatMoney } from "@/lib/currency";
import PrintReceiptButton from "./print-receipt-button";

function money(value: number, currency: string) {
  return formatMoney(value, currency);
}

export default async function RestaurantReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string; billId?: string }>;
}) {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) redirect("/login");
  if (!(await getEnabledOrganizationModules(context.orgId)).includes("Restaurant")) {
    redirect("/dashboard?moduleDisabled=Restaurant");
  }
  if (!(await canTabPermission("restaurant", "operations", "orders", "view"))) {
    redirect("/dashboard?accessDenied=restaurant.operations");
  }
  const { orderId, billId } = await searchParams;
  if (!orderId || !billId) notFound();

  const supabase = await createClient();
  const [{ data: order, error: orderError }, { data: bill, error: billError }] = await Promise.all([
    supabase.from("restaurant_orders").select("*").eq("org_id", context.orgId).eq("id", orderId).maybeSingle(),
    supabase.from("restaurant_bills").select("*").eq("org_id", context.orgId).eq("id", billId).eq("order_id", orderId).maybeSingle(),
  ]);
  if (orderError || billError) throw new Error(`Could not load receipt: ${orderError?.message ?? billError?.message}`);
  if (!order || !bill || !canAccessLocation(context, order.location_id)) notFound();

  const [
    { data: items, error: itemsError },
    { data: allocations, error: allocationsError },
    { data: payments, error: paymentsError },
    { data: location, error: locationError },
  ] = await Promise.all([
    supabase.from("restaurant_order_items").select("*").eq("org_id", context.orgId).eq("order_id", order.id).order("created_at"),
    supabase.from("restaurant_bill_items").select("*").eq("org_id", context.orgId).eq("bill_id", bill.id),
    supabase.from("restaurant_order_payments").select("*").eq("org_id", context.orgId).eq("bill_id", bill.id).order("paid_at"),
    supabase.from("business_locations").select("name").eq("org_id", context.orgId).eq("id", order.location_id).maybeSingle(),
  ]);
  const detailError = [itemsError, allocationsError, paymentsError, locationError].find((error) => error);
  if (detailError) throw new Error(`Could not load receipt details: ${detailError.message}`);

  const allocatedItems = (allocations ?? []).flatMap((allocation) => {
    const item = (items ?? []).find((entry) => entry.id === allocation.order_item_id);
    return item ? [{ ...item, quantity: allocation.quantity, line_total: Number(item.unit_price) * Number(allocation.quantity) }] : [];
  });
  const netPaid = (payments ?? []).reduce((total, payment) => total + (payment.payment_type === "payment" ? Number(payment.amount) : -Number(payment.amount)), 0);
  const netTips = (payments ?? []).reduce((total, payment) => total + (payment.payment_type === "payment" ? Number(payment.tip_amount) : -Number(payment.tip_amount)), 0);
  const balanceDue = Math.max(0, Number(bill.amount) - netPaid);

  return (
    <main className="mx-auto max-w-xl p-4 sm:p-8">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #restaurant-receipt, #restaurant-receipt * { visibility: visible !important; }
          #restaurant-receipt { position: absolute; inset: 0; width: 100%; max-width: none; padding: 1rem; }
          .no-print { display: none !important; }
        }
      `}</style>
      <PrintReceiptButton />
      <article id="restaurant-receipt" className="rounded-xl border bg-white p-6 text-slate-950 shadow-sm print:border-0 print:shadow-none">
        <header className="border-b pb-4 text-center">
          <p className="text-sm font-bold uppercase tracking-wide">Restaurant receipt</p>
          <h1 className="mt-2 text-xl font-bold">{location?.name ?? "Restaurant"}</h1>
          <p className="mt-1 text-sm">Order #{order.order_number} · {bill.name}</p>
          <p className="mt-1 text-xs text-slate-500">{new Date(order.created_at).toLocaleString()}</p>
          {order.customer_name && <p className="mt-1 text-sm">{order.customer_name}</p>}
        </header>
        <section className="py-4">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Items</h2>
          {bill.split_type === "equal"
            ? <p className="text-sm">Equal share of order</p>
            : <ul className="divide-y">
                {allocatedItems.map((item) => <li key={item.id} className="flex justify-between gap-4 py-2 text-sm">
                  <span>{item.quantity} × {item.item_name}</span>
                  <span>{money(Number(item.line_total), context.currency)}</span>
                </li>)}
              </ul>}
        </section>
        <section className="space-y-1 border-t py-3 text-sm">
          {Number(order.delivery_fee) > 0 && <div className="flex justify-between text-xs text-slate-600"><span>Order delivery fee (included in total)</span><span>{money(Number(order.delivery_fee), context.currency)}</span></div>}
          <div className="flex justify-between font-semibold"><span>Bill total</span><span>{money(Number(bill.amount), context.currency)}</span></div>
          <div className="flex justify-between"><span>Net payments</span><span>{money(netPaid, context.currency)}</span></div>
          <div className="flex justify-between font-semibold"><span>Balance due</span><span>{money(balanceDue, context.currency)}</span></div>
          {netTips !== 0 && <div className="flex justify-between"><span>Net tips</span><span>{money(netTips, context.currency)}</span></div>}
          <div className="flex justify-between text-xs text-slate-600"><span>Order type</span><span className="capitalize">{order.order_type.replace("_", " ")}</span></div>
          <div className="flex justify-between text-xs text-slate-600"><span>Order status</span><span className="capitalize">{order.status}</span></div>
        </section>
        <section className="border-t pt-3">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Payments and refunds</h2>
          {(payments ?? []).length === 0
            ? <p className="text-sm text-slate-500">No payments recorded.</p>
            : <ul className="space-y-2">
                {(payments ?? []).map((payment) => <li key={payment.id} className="flex justify-between gap-3 text-xs">
                  <span>{payment.payment_type === "refund" ? "Refund" : "Payment"} · {payment.payment_provider ?? payment.payment_method.replace("_", " ")} · {new Date(payment.paid_at).toLocaleString()}</span>
                  <span>{payment.payment_type === "refund" ? "-" : ""}{money(Number(payment.amount), context.currency)}{Number(payment.tip_amount) > 0 ? ` ${payment.payment_type === "refund" ? "-" : "+"} ${money(Number(payment.tip_amount), context.currency)} tip` : ""}</span>
                </li>)}
              </ul>}
        </section>
        <footer className="mt-5 border-t pt-4 text-center text-xs text-slate-500">
          Thank you. Refunds are recorded against the original payment.
        </footer>
      </article>
    </main>
  );
}
