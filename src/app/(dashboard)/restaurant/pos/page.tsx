import { redirect } from "next/navigation";
import { canAccessLocation } from "@/lib/organizations/location-access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getEnabledOrganizationModules } from "@/lib/supabase/platform-admin";
import RestaurantPosView from "@/components/restaurant/restaurant-pos-view";

export default async function RestaurantPosPage() {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!(await getEnabledOrganizationModules(context.orgId)).includes("Restaurant")) {
    redirect("/dashboard?moduleDisabled=Restaurant");
  }
  if (!(await canTabPermission("restaurant", "operations", "orders", "create"))) {
    redirect("/dashboard?accessDenied=restaurant.operations");
  }

  const supabase = await createClient();
  const [
    { data: locations, error: locationsError },
    { data: categories, error: categoriesError },
    { data: menuItems, error: menuError },
    { data: packagedStock, error: packagedStockError },
    { data: modifierGroups, error: groupsError },
    { data: modifierOptions, error: optionsError },
    { data: tables, error: tablesError },
  ] = await Promise.all([
    supabase.from("business_locations").select("id, name").eq("org_id", context.orgId).eq("is_active", true).order("name"),
    supabase.from("restaurant_menu_categories").select("id, name").eq("org_id", context.orgId).eq("is_active", true).order("sort_order").order("name"),
    supabase.from("restaurant_menu_items").select("*").eq("org_id", context.orgId).eq("is_active", true).order("sort_order").order("name"),
    supabase.from("restaurant_packaged_item_stock").select("location_id, menu_item_id, quantity").eq("org_id", context.orgId),
    supabase.from("restaurant_modifier_groups").select("*").eq("org_id", context.orgId).eq("is_active", true).order("created_at"),
    supabase.from("restaurant_modifier_options").select("*").eq("org_id", context.orgId).eq("is_active", true).order("created_at"),
    supabase.from("restaurant_tables").select("*").eq("org_id", context.orgId).eq("is_active", true).order("table_name"),
  ]);
  const error = [locationsError, categoriesError, menuError, packagedStockError, groupsError, optionsError, tablesError].find((item) => item);
  if (error) throw new Error(`Could not load restaurant POS: ${error.message}`);

  const accessibleLocations = (locations ?? []).filter((location) => canAccessLocation(context, location.id));
  return <RestaurantPosView
    locations={accessibleLocations}
    categories={categories ?? []}
    menuItems={menuItems ?? []}
    packagedStock={(packagedStock ?? []).filter((stock) => accessibleLocations.some((location) => location.id === stock.location_id))}
    modifierGroups={modifierGroups ?? []}
    modifierOptions={modifierOptions ?? []}
    tables={(tables ?? []).filter((table) => accessibleLocations.some((location) => location.id === table.location_id))}
    currency={context.currency}
  />;
}
