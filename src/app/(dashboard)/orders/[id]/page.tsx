import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { OrderDetailView, type OrderDetail, type OrderItemRow, type OrderTimelineRow } from "@/components/orders/order-detail-view";

export const metadata = { title: "Order Details · ThinkSales Pro" };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getCurrentOrgContext();
  if (!context) return null;

  const supabase = await createClient();
  const [{ data: order }, { data: items }, { data: locations }, { data: members }, { data: timeline }] = await Promise.all([
    supabase
      .from("customer_orders")
      .select("*, business_locations(name), profiles:sales_person_id(full_name)")
      .eq("id", id)
      .eq("org_id", context.orgId)
      .single(),
    supabase.from("customer_order_items").select("id, product_id, product_name, quantity, unit_price, line_total").eq("order_id", id),
    supabase.from("business_locations").select("id, name").eq("org_id", context.orgId).eq("is_active", true).order("name"),
    supabase.from("organization_members").select("user_id, profiles(id, full_name)").eq("org_id", context.orgId).eq("status", "active"),
    supabase.from("customer_order_timeline").select("id, title, actor_name, status, notes, created_at").eq("order_id", id).order("created_at", { ascending: true }),
  ]);

  if (!order) return <p className="p-6 text-sm text-ledger-400">Order not found.</p>;

  const detail: OrderDetail = {
  id: order.id,
  orderNumber: order.order_number,
  status: order.status,
  paymentStatus: order.payment_status ?? "unpaid",
  deliveryStatus: order.delivery_status ?? "not_shipped",
  locationId: order.location_id,
  branchName: (order.business_locations as any)?.name ?? null,
  salesPersonId: order.sales_person_id,
  salesPersonName: (order.profiles as any)?.full_name ?? null,
  expectedDeliveryDate: order.expected_delivery_date,
  stockReserved: Boolean(order.stock_reserved),
  createdAt: order.created_at,

  guestName: order.guest_name,
  guestPhone: order.guest_phone,
  guestEmail: order.guest_email,
  deliveryAddress: order.delivery_address,
  deliveryOption: order.delivery_option,
  deliveryFee: Number(order.delivery_fee ?? 0),
  paymentMethod: order.payment_method ?? "Cash on Delivery",

  subtotal: Number(order.subtotal ?? 0),
  total: Number(order.total ?? 0),

  notes: order.notes,
  adminNotes: order.admin_notes,
  rejectionReason: order.rejection_reason,
  linkedSaleId: order.linked_sale_id,

  // ADD THIS
  voiceNoteUrl: order.voice_note_url ?? null,
};

  const itemRows: OrderItemRow[] = (items ?? []).map((i) => ({
    id: i.id,
    productName: i.product_name,
    quantity: Number(i.quantity),
    unitPrice: Number(i.unit_price),
    lineTotal: Number(i.line_total),
  }));

  const timelineRows: OrderTimelineRow[] = (timeline ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    actorName: t.actor_name,
    status: t.status,
    notes: t.notes,
    createdAt: t.created_at,
  }));

  const staffOptions = (members ?? [])
    .filter((m) => m.profiles)
    .map((m) => ({
      id: (m.profiles as any).id,
      name: (m.profiles as any).full_name || "Staff",
    }));

  return (
    <OrderDetailView
      order={detail}
      items={itemRows}
      timeline={timelineRows}
      currency={context.currency}
      locations={(locations ?? []).map((l) => ({ id: l.id, name: l.name }))}
      staff={staffOptions}
    />
  );
}