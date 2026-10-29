import { redirect } from "next/navigation";
import { canAccessLocation } from "@/lib/organizations/location-access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getEnabledOrganizationModules } from "@/lib/supabase/platform-admin";
import { PackagedStockManagement } from "@/components/restaurant/packaged-stock-management";

export default async function RestaurantPackagedItemsPage() {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!(await getEnabledOrganizationModules(context.orgId)).includes("Restaurant")) {
    redirect("/dashboard?moduleDisabled=Restaurant");
  }
  if (!(await canTabPermission("restaurant", "operations", "ingredients", "view"))) {
    redirect("/dashboard?accessDenied=restaurant.operations");
  }

  const supabase = await createClient();
  const { data: locations, error: locationsError } = await supabase.from("business_locations")
    .select("id, name").eq("org_id", context.orgId).eq("is_active", true).order("name");
  if (locationsError) throw new Error(`Could not load Restaurant branches: ${locationsError.message}`);
  const accessibleLocations = (locations ?? []).filter((location) => canAccessLocation(context, location.id));
  const locationIds = accessibleLocations.map(({ id }) => id);
  const [
    { data: items, error: itemsError },
    stockResult,
    movementResult,
    supplierResult,
    purchaseOrderResult,
    outstandingPurchaseOrderResult,
  ] = await Promise.all([
    supabase.from("restaurant_menu_items").select("*").eq("org_id", context.orgId)
      .eq("item_type", "packaged").order("name"),
    locationIds.length
      ? supabase.from("restaurant_packaged_item_stock").select("*").eq("org_id", context.orgId).in("location_id", locationIds)
      : Promise.resolve({ data: [], error: null }),
    locationIds.length
      ? supabase.from("restaurant_packaged_item_movements").select("*").eq("org_id", context.orgId)
        .in("location_id", locationIds).order("created_at", { ascending: false }).limit(200)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("suppliers").select("id, name").eq("org_id", context.orgId).eq("is_active", true).order("name"),
    locationIds.length
      ? supabase.from("restaurant_packaged_purchase_orders").select("*").eq("org_id", context.orgId)
        .in("location_id", locationIds).order("created_at", { ascending: false }).limit(100)
      : Promise.resolve({ data: [], error: null }),
    locationIds.length
      ? supabase.from("restaurant_packaged_purchase_orders").select("id, location_id, status")
        .eq("org_id", context.orgId).in("location_id", locationIds).in("status", ["ordered", "partially_received"])
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (itemsError) throw new Error(`Could not load packaged menu items: ${itemsError.message}`);
  if (stockResult.error) throw new Error(`Could not load packaged stock balances: ${stockResult.error.message}`);
  if (movementResult.error) throw new Error(`Could not load packaged stock movements: ${movementResult.error.message}`);
  if (supplierResult.error) throw new Error(`Could not load packaged goods suppliers: ${supplierResult.error.message}`);
  if (purchaseOrderResult.error) throw new Error(`Could not load packaged purchase orders: ${purchaseOrderResult.error.message}`);
  if (outstandingPurchaseOrderResult.error) {
    throw new Error(`Could not load outstanding packaged purchase orders: ${outstandingPurchaseOrderResult.error.message}`);
  }
  const purchaseOrderIds = [...new Set([
    ...(purchaseOrderResult.data ?? []).map((order) => order.id),
    ...(outstandingPurchaseOrderResult.data ?? []).map((order) => order.id),
  ])];
  const { data: purchaseLines, error: purchaseLinesError } = purchaseOrderIds.length
    ? await supabase.from("restaurant_packaged_purchase_items").select("*").eq("org_id", context.orgId)
      .in("purchase_order_id", purchaseOrderIds)
    : { data: [], error: null };
  if (purchaseLinesError) throw new Error(`Could not load packaged purchase order lines: ${purchaseLinesError.message}`);
  return <main className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-6">
    <PackagedStockManagement
      items={items ?? []}
      locations={accessibleLocations}
      stocks={stockResult.data ?? []}
      movements={movementResult.data ?? []}
      canAdjust={await canTabPermission("restaurant", "operations", "ingredients", "edit")}
      suppliers={supplierResult.data ?? []}
      purchaseOrders={purchaseOrderResult.data ?? []}
      purchaseLines={purchaseLines ?? []}
      outstandingPurchaseOrders={outstandingPurchaseOrderResult.data ?? []}
      outstandingPurchaseLines={(purchaseLines ?? []).filter((line) =>
        (outstandingPurchaseOrderResult.data ?? []).some((order) => order.id === line.purchase_order_id))}
      canCreatePurchases={await canTabPermission("restaurant", "operations", "ingredients", "create")}
      canReceivePurchases={await canTabPermission("restaurant", "operations", "ingredients", "edit")}
    />
  </main>;
}
