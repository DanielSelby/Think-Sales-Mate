import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import PaymentStatusRefresh from "./payment-status-refresh";

export default async function RestaurantOrderConfirmationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) notFound();
  const admin = createAdminClient();
  const [{ data: confirmations, error }, { data: attempt, error: attemptError }] = await Promise.all([
    admin.rpc("get_restaurant_online_order_confirmation", { p_token: token }),
    admin.from("restaurant_online_payment_attempts")
      .select("order_id").eq("confirmation_token", token).maybeSingle(),
  ]);
  if (error) throw new Error(`Could not load restaurant order confirmation: ${error.message}`);
  if (attemptError) throw new Error(`Could not load restaurant order tracking: ${attemptError.message}`);
  const confirmation = confirmations?.[0];
  if (!confirmation) notFound();
  const { data: trackedOrder, error: trackedOrderError } = attempt
    ? await admin.from("restaurant_orders").select("customer_tracking_token").eq("id", attempt.order_id).maybeSingle()
    : { data: null, error: null };
  if (trackedOrderError) throw new Error(`Could not load restaurant order tracking: ${trackedOrderError.message}`);

  const isPaid = confirmation.payment_attempt_status === "successful" && confirmation.payment_status === "paid";
  const isFailed = confirmation.payment_attempt_status === "failed";
  const isPending = !isPaid && !isFailed;
  const title = isPaid ? "Payment confirmed"
    : isFailed ? "Payment was not completed"
      : "Payment confirmation pending";
  const message = isPaid
    ? "Your restaurant order is confirmed as paid."
    : isFailed
      ? "Your payment was not completed. Contact the restaurant before placing the order again."
      : "We are confirming your payment. This usually takes a few seconds.";

  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
    <section className="w-full max-w-lg rounded-2xl border bg-white p-8 text-center shadow-sm">
      <p className={`text-sm font-bold uppercase tracking-wide ${isPaid ? "text-emerald-700" : isFailed ? "text-red-700" : "text-amber-700"}`}>{title}</p>
      <h1 className="mt-2 text-2xl font-bold text-slate-950">Restaurant order #{confirmation.order_number}</h1>
      <p className="mt-3 text-sm text-slate-600">{message}</p>
      {isPending && <PaymentStatusRefresh />}
      {trackedOrder?.customer_tracking_token && <Link href={`/restaurant-order/track/${encodeURIComponent(trackedOrder.customer_tracking_token)}`} className="mt-5 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Track your order</Link>}
      <Link href="/" className="mt-6 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Close</Link>
    </section>
  </main>;
}
