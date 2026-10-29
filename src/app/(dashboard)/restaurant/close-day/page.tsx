import { redirect } from "next/navigation";
import { canAccessLocation } from "@/lib/organizations/location-access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getEnabledOrganizationModules } from "@/lib/supabase/platform-admin";
import { RestaurantCloseDay } from "@/components/restaurant/restaurant-close-day";

export default async function RestaurantCloseDayPage() {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!(await getEnabledOrganizationModules(context.orgId)).includes("Restaurant")) {
    redirect("/dashboard?moduleDisabled=Restaurant");
  }
  if (!(await canTabPermission("restaurant", "operations", "orders", "view"))) {
    redirect("/dashboard?accessDenied=restaurant.operations");
  }
  const supabase = await createClient();
  const { data: locationRows, error: locationsError } = await supabase.from("business_locations")
    .select("id, name").eq("org_id", context.orgId).eq("is_active", true).order("name");
  if (locationsError) throw new Error(`Could not load Restaurant branches: ${locationsError.message}`);
  const locations = (locationRows ?? []).filter((location) => canAccessLocation(context, location.id));
  const locationIds = locations.map((location) => location.id);
  const businessDate = new Date().toISOString().slice(0, 10);
  const { data: closings, error: closingsError } = locationIds.length
    ? await supabase.from("restaurant_day_closings").select("*").eq("org_id", context.orgId)
      .eq("business_date", businessDate).in("location_id", locationIds)
    : { data: [], error: null };
  if (closingsError) throw new Error(`Could not load Restaurant day closings: ${closingsError.message}`);
  return <RestaurantCloseDay
    businessDate={businessDate}
    locations={locations}
    closings={closings ?? []}
    currency={context.currency}
    canClose={await canTabPermission("restaurant", "operations", "orders", "edit")}
  />;
}
