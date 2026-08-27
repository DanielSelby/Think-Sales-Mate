import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { OrderDetailView, type OrderDetail, type OrderItemRow } from "@/components/orders/order-detail-view";

export const metadata = { title: "Order Details · SalesMate ERP" };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getCurrentOrgContext();
  if (!context) return null;

  const supabase = await createClient();
  const [{ data: order }, { data: items }, { data: locations }] = await Promise.all([
    supabase.from("customer_orders").select("*").eq("id", id).eq("org_id", context.orgId).single(),
    supabase.from("customer_order_items").select("id, product_name, quantity, unit_price, line_total").eq("order_id", id),
    supabase.from("business_locations").select("id, name").eq("org_id", context.orgId).eq("is_active", true),
  ]);

  if (!order) return <p className="p-6 text-sm text-ledger-400">Order not found.</p>;

  const detail: OrderDetail = {
    id: order.id,
    orderNumber: order.order_number,
    status: order.status,
    createdAt: order.created_at,
    guestName: order.guest_name,
    guestPhone: order.guest_phone,
    guestEmail: order.guest_email,
    deliveryAddress: order.delivery_address,
    deliveryOption: order.delivery_option,
    deliveryFee: order.delivery_fee,
    paymentMethod: order.payment_method,
    subtotal: order.subtotal,
    total: order.total,
    notes: order.notes,
    adminNotes: order.admin_notes,
  };

  const itemRows: OrderItemRow[] = (items ?? []).map((i) => ({
    id: i.id,
    productName: i.product_name,
    quantity: i.quantity,
    unitPrice: i.unit_price,
    lineTotal: i.line_total,
  }));

  return (
    <OrderDetailView
      order={detail}
      items={itemRows}
      currency={context.currency}
      locations={(locations ?? []).map((l) => ({ id: l.id, name: l.name }))}
    />
  );
}