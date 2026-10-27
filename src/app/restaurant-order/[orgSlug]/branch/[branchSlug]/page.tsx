import { getEnabledOrganizationModules } from "@/lib/supabase/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { isRestaurantPaystackAvailable } from "@/lib/restaurant/online-ordering";
import OnlineOrderingView from "@/components/restaurant/online-ordering-view";

export default async function RestaurantOnlineOrderingPage({
  params,
}: {
  params: Promise<{ orgSlug: string; branchSlug: string }>;
}) {
  const { orgSlug, branchSlug } = await params;
  const admin = createAdminClient();
  const { data: organization, error: organizationError } = await admin.from("organizations")
    .select("id, name, currency").eq("slug", orgSlug).maybeSingle();
  if (organizationError) throw new Error(`Could not load restaurant storefront: ${organizationError.message}`);
  if (!organization || !(await getEnabledOrganizationModules(organization.id)).includes("Restaurant")) {
    return <StorefrontUnavailable />;
  }
  const { data: location, error: locationError } = await admin.from("business_locations")
    .select("id, name, customer_portal_slug").eq("org_id", organization.id)
    .eq("customer_portal_slug", branchSlug).eq("is_active", true).maybeSingle();
  if (locationError) throw new Error(`Could not load restaurant branch: ${locationError.message}`);
  if (!location) return <StorefrontUnavailable />;

  const { data: settings, error: settingsError } = await admin.from("restaurant_online_settings")
    .select("*").eq("org_id", organization.id).eq("location_id", location.id).maybeSingle();
  if (settingsError) throw new Error(`Could not load restaurant online ordering settings: ${settingsError.message}`);
  if (!settings?.is_enabled || (!settings.accepts_pickup && !settings.accepts_delivery)) {
    return <StorefrontUnavailable organizationName={organization.name} />;
  }

  const [
    { data: categories, error: categoriesError },
    { data: menuItems, error: menuItemsError },
    { data: modifierGroups, error: modifierGroupsError },
    { data: modifierOptions, error: modifierOptionsError },
  ] = await Promise.all([
    admin.from("restaurant_menu_categories").select("id, name").eq("org_id", organization.id).eq("is_active", true).order("sort_order").order("name"),
    admin.from("restaurant_menu_items").select("id, category_id, name, description, price").eq("org_id", organization.id).eq("is_active", true).order("sort_order").order("name"),
    admin.from("restaurant_modifier_groups").select("id, menu_item_id, name, min_selections, max_selections").eq("org_id", organization.id).eq("is_active", true).order("created_at"),
    admin.from("restaurant_modifier_options").select("id, group_id, name, price_delta").eq("org_id", organization.id).eq("is_active", true).order("created_at"),
  ]);
  const menuError = [categoriesError, menuItemsError, modifierGroupsError, modifierOptionsError].find((error) => error);
  if (menuError) throw new Error(`Could not load restaurant menu: ${menuError.message}`);

  return <OnlineOrderingView
    orgSlug={orgSlug}
    branchSlug={branchSlug}
    organizationName={organization.name}
    branchName={location.name}
    currency={organization.currency}
    categories={categories ?? []}
    menuItems={menuItems ?? []}
    modifierGroups={modifierGroups ?? []}
    modifierOptions={modifierOptions ?? []}
    acceptsPickup={settings.accepts_pickup}
    acceptsDelivery={settings.accepts_delivery}
    deliveryFee={Number(settings.delivery_fee)}
    paystackEnabled={isRestaurantPaystackAvailable(organization.currency)}
  />;
}

function StorefrontUnavailable({ organizationName }: { organizationName?: string }) {
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
    <section className="max-w-md rounded-2xl border bg-white p-8 text-center shadow-sm">
      <h1 className="text-xl font-bold text-slate-950">{organizationName ?? "Restaurant ordering"}</h1>
      <p className="mt-2 text-sm text-slate-600">This restaurant is not accepting online orders right now.</p>
    </section>
  </main>;
}
