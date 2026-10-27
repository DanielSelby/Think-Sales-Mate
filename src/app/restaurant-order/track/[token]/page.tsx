import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import RestaurantOrderTrackingView from "@/components/restaurant/order-tracking-view";

export const dynamic = "force-dynamic";

export default async function RestaurantOrderTrackingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) notFound();

  const admin = createAdminClient();
  const { data: order, error: orderError } = await admin.from("restaurant_orders")
    .select("org_id, order_number, order_type, status, payment_status, payment_option, total, delivery_fee, created_at, location_id")
    .eq("customer_tracking_token", token)
    .eq("order_source", "online")
    .maybeSingle();
  if (orderError) throw new Error(`Could not load restaurant order tracking: ${orderError.message}`);
  if (!order) notFound();

  const [{ data: location, error: locationError }, { data: organization, error: organizationError }] = await Promise.all([
    admin.from("business_locations").select("name").eq("org_id", order.org_id).eq("id", order.location_id).maybeSingle(),
    admin.from("organizations").select("currency").eq("id", order.org_id).maybeSingle(),
  ]);
  if (locationError || organizationError) {
    throw new Error(`Could not load restaurant order details: ${locationError?.message ?? organizationError?.message}`);
  }
  if (!location || !organization) throw new Error("Restaurant order branch or organization was not found.");

  return <RestaurantOrderTrackingView
    orderNumber={order.order_number}
    orderType={order.order_type}
    status={order.status}
    paymentStatus={order.payment_status}
    paymentOption={order.payment_option}
    total={Number(order.total)}
    deliveryFee={Number(order.delivery_fee)}
    createdAt={order.created_at}
    branchName={location.name}
    currency={organization.currency}
  />;
}
