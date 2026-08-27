import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { OrdersListView, type OrderRow } from "@/components/orders/orders-list-view";

export const metadata = { title: "Incoming Orders · SalesMate ERP" };

export default async function OrdersPage() {
  const context = await getCurrentOrgContext();
  if (!context) return null;

  const supabase = await createClient();
  const { data: orders } = await supabase
    .from("customer_orders")
    .select("id, order_number, guest_name, total, status, created_at")
    .eq("org_id", context.orgId)
    .order("created_at", { ascending: false });

  const rows: OrderRow[] = (orders ?? []).map((o) => ({
    id: o.id,
    orderNumber: o.order_number,
    customerName: o.guest_name,
    createdAt: o.created_at,
    total: o.total,
    status: o.status,
  }));

  return <OrdersListView orders={rows} currency={context.currency} />;
}