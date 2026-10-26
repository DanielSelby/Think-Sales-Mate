import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { canAccessLocation } from "@/lib/organizations/location-access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getEnabledOrganizationModules } from "@/lib/supabase/platform-admin";
import RestaurantView from "./restaurant-view";

type RestaurantViewKey = "orders" | "menu" | "tables";

export default async function RestaurantPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) redirect("/login");

  const { view: requestedView } = await searchParams;
  const view: RestaurantViewKey = requestedView === "menu" || requestedView === "tables" ? requestedView : "orders";
  if (!(await getEnabledOrganizationModules(context.orgId)).includes("Restaurant")) {
    redirect("/dashboard?moduleDisabled=Restaurant");
  }
  if (!(await canTabPermission("restaurant", "operations", view, "view"))) {
    redirect("/dashboard?accessDenied=restaurant.operations");
  }

  const supabase = await createClient();
  const [
    { data: locations, error: locationsError },
    { data: categories, error: categoriesError },
    { data: menuItems, error: menuItemsError },
    { data: tables, error: tablesError },
    { data: orders, error: ordersError },
    { data: openOrders, error: openOrdersError },
  ] = await Promise.all([
    supabase.from("business_locations").select("id, name").eq("org_id", context.orgId).eq("is_active", true).order("name"),
    supabase.from("restaurant_menu_categories").select("*").eq("org_id", context.orgId).order("sort_order").order("name"),
    supabase.from("restaurant_menu_items").select("*").eq("org_id", context.orgId).order("sort_order").order("name"),
    supabase.from("restaurant_tables").select("*").eq("org_id", context.orgId).order("table_name"),
    supabase.from("restaurant_orders").select("*").eq("org_id", context.orgId).order("created_at", { ascending: false }).limit(100),
    supabase.from("restaurant_orders").select("*").eq("org_id", context.orgId).in("status", ["new", "confirmed", "preparing", "ready", "served"]),
  ]);
  const dataError = [locationsError, categoriesError, menuItemsError, tablesError, ordersError, openOrdersError].find((error) => error);
  if (dataError) throw new Error(`Could not load restaurant management data: ${dataError.message}`);

  const accessibleLocations = (locations ?? []).filter((location) => canAccessLocation(context, location.id));
  const locationIds = accessibleLocations.map(({ id }) => id);
  const accessibleTables = (tables ?? []).filter((table) => locationIds.includes(table.location_id));
  const accessibleOrders = Array.from(new Map([...(orders ?? []), ...(openOrders ?? [])]
    .filter((order) => locationIds.includes(order.location_id))
    .map((order) => [order.id, order])).values())
    .sort((first, second) => second.created_at.localeCompare(first.created_at));
  const orderIds = accessibleOrders.map(({ id }) => id);
  const [{ data: orderItems, error: orderItemsError }, { data: payments, error: paymentsError }] = orderIds.length
    ? await Promise.all([
        supabase.from("restaurant_order_items").select("*").eq("org_id", context.orgId).in("order_id", orderIds).order("created_at"),
        supabase.from("restaurant_order_payments").select("*").eq("org_id", context.orgId).in("order_id", orderIds).order("paid_at"),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (orderItemsError || paymentsError) {
    throw new Error(`Could not load restaurant order details: ${orderItemsError?.message ?? paymentsError?.message}`);
  }

  return (
    <RestaurantView
      view={view}
      currency={context.currency}
      branchScoped={context.isBranchScoped}
      canCreateOrders={await canTabPermission("restaurant", "operations", "orders", "create")}
      canEditOrders={await canTabPermission("restaurant", "operations", "orders", "edit")}
      canCreateMenu={!context.isBranchScoped && await canTabPermission("restaurant", "operations", "menu", "create")}
      canEditMenu={!context.isBranchScoped && await canTabPermission("restaurant", "operations", "menu", "edit")}
      canCreateTables={await canTabPermission("restaurant", "operations", "tables", "create")}
      canEditTables={await canTabPermission("restaurant", "operations", "tables", "edit")}
      locations={accessibleLocations}
      categories={categories ?? []}
      menuItems={menuItems ?? []}
      tables={accessibleTables}
      orders={accessibleOrders}
      orderItems={orderItems ?? []}
      payments={payments ?? []}
    />
  );
}
