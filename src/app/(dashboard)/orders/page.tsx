import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";
import { OrdersListView, type OrderRow, type LocationOption, type StaffOption } from "@/components/orders/orders-list-view";

export const metadata = { title: "Order Tracker · ThinkSales Pro" };

export default async function OrdersPage() {
  const context = await getCurrentOrgContext();
  if (!context) return null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Check user member record for location assignment
  const { data: member } = user
    ? await supabase
        .from("organization_members")
        .select("location_id, role")
        .eq("org_id", context.orgId)
        .eq("user_id", user.id)
        .maybeSingle()
    : { data: null };

  const canViewAll = can(context.role, "orders.view_all");
  const userLocationId = member?.location_id ?? null;

  // Build query
  let ordersQuery = supabase
    .from("customer_orders")
    .select(`
      id,
      order_number,
      guest_name,
      guest_phone,
      guest_email,
      delivery_address,
      delivery_option,
      delivery_fee,
      notes,
      admin_notes,
      subtotal,
      total,
      payment_method,
      payment_status,
      delivery_status,
      status,
      location_id,
      sales_person_id,
      expected_delivery_date,
      stock_reserved,
      created_at,
      business_locations ( id, name ),
      profiles:sales_person_id ( id, full_name, avatar_url ),
      customer_order_items ( id, product_id, product_name, quantity, unit_price, line_total ),
      customer_order_timeline ( id, title, actor_name, actor_id, status, notes, created_at )
    `)
    .eq("org_id", context.orgId)
    .order("created_at", { ascending: false });

  // If user is branch-scoped and cannot view all, filter by their branch
  if (!canViewAll && userLocationId) {
    ordersQuery = ordersQuery.eq("location_id", userLocationId);
  }

  const [{ data: orders }, { data: locations }, { data: members }, { data: customers }] = await Promise.all([
    ordersQuery,
    supabase.from("business_locations").select("id, name, city, region").eq("org_id", context.orgId).eq("is_active", true).order("name"),
    supabase.from("organization_members").select("user_id, role, profiles ( id, full_name, avatar_url )").eq("org_id", context.orgId).eq("status", "active"),
    supabase.from("customers").select("id, name, phone, email").eq("org_id", context.orgId).order("name"),
  ]);

  const locationOptions: LocationOption[] = (locations ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    city: l.city,
  }));

  const staffOptions: StaffOption[] = (members ?? [])
    .filter((m) => m.profiles)
    .map((m) => {
      const p = m.profiles as any;
      return {
        id: p.id,
        name: p.full_name || "Staff Member",
        avatarUrl: p.avatar_url,
      };
    });

  const customerNames = Array.from(
    new Set([
      ...(customers ?? []).map((c) => c.name),
      ...(orders ?? []).map((o) => o.guest_name),
    ])
  ).filter(Boolean);

  const rows: OrderRow[] = (orders ?? []).map((o: any) => ({
    id: o.id,
    orderNumber: o.order_number,
    customerName: o.guest_name,
    customerPhone: o.guest_phone,
    customerEmail: o.guest_email,
    deliveryAddress: o.delivery_address,
    deliveryOption: o.delivery_option,
    deliveryFee: Number(o.delivery_fee ?? 0),
    notes: o.notes,
    adminNotes: o.admin_notes,
    subtotal: Number(o.subtotal ?? 0),
    total: Number(o.total ?? 0),
    paymentMethod: o.payment_method ?? "Cash on Delivery",
    paymentStatus: o.payment_status ?? "unpaid",
    deliveryStatus: o.delivery_status ?? "not_shipped",
    status: o.status,
    locationId: o.location_id,
    branchName: o.business_locations?.name ?? null,
    salesPersonId: o.sales_person_id,
    salesPersonName: o.profiles?.full_name ?? null,
    expectedDeliveryDate: o.expected_delivery_date,
    stockReserved: Boolean(o.stock_reserved),
    createdAt: o.created_at,
    items: (o.customer_order_items ?? []).map((item: any) => ({
      id: item.id,
      productName: item.product_name,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      lineTotal: Number(item.line_total),
    })),
    timeline: (o.customer_order_timeline ?? [])
      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((t: any) => ({
        id: t.id,
        title: t.title,
        actorName: t.actor_name,
        actorId: t.actor_id,
        status: t.status,
        notes: t.notes,
        createdAt: t.created_at,
      })),
  }));

  return (
    <OrdersListView
      orders={rows}
      currency={context.currency}
      locations={locationOptions}
      staff={staffOptions}
      customerNames={customerNames}
      userRole={context.role}
      canViewAll={canViewAll}
      userLocationId={userLocationId}
    />
  );
}