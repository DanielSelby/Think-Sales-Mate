import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import RouteSalesWorkspace from "@/components/route-sales/route-sales-workspace";

export const metadata = { title: "Route Sales · SalesMate ERP" };

export default async function RouteSalesPage() {
  const activeOrgId = await (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;
  const supabase = await createClient();
  const [{ data: routes }, { data: customers }, { data: visits }, { data: collections }, { data: sales }, { data: locations }, { data: reps }, { data: products }, { data: mobileOrders }] = await Promise.all([
    (supabase as any).from("route_sales_routes").select("id,name,territory,vehicle,status,route_days,start_time,end_time,assigned_rep_id").eq("org_id", context.orgId).order("name"),
    supabase.from("customers").select("id,name,company,phone,email").eq("org_id", context.orgId).order("name"),
    (supabase as any).from("route_sales_visits").select("id,route_id,customer_id,visit_date,status,sequence_no").eq("org_id", context.orgId).order("visit_date", { ascending: false }),
    (supabase as any).from("route_sales_collections").select("id,route_id,customer_id,outstanding_amount,amount_collected,collection_date,payment_method").eq("org_id", context.orgId).order("collection_date", { ascending: false }),
    supabase.from("sales").select("total,created_at,customer_name,status").eq("org_id", context.orgId).order("created_at", { ascending: false }).limit(500),
    supabase.from("business_locations").select("id,name").eq("org_id", context.orgId).order("name"),
    supabase.from("profiles").select("id,full_name").order("full_name"),
    supabase.from("products").select("id,name,sku,unit_price").eq("org_id", context.orgId).order("name"),
    (supabase as any).from("route_sales_mobile_orders").select("id,customer_id,route_id,status,total,price_level,offline_created,created_at").eq("org_id", context.orgId).order("created_at", { ascending: false }).limit(200),
  ]);
  return <RouteSalesWorkspace
    orgId={context.orgId}
    currency={context.currency}
    initial={{ routes: routes ?? [], customers: customers ?? [], visits: visits ?? [], collections: collections ?? [], sales: sales ?? [], locations: locations ?? [], reps: reps ?? [], products: products ?? [], mobileOrders: mobileOrders ?? [] }}
  />;
}
