import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { LocationsManager, type LocationRow } from "@/components/dashboard/locations-manager";
import { SettingsTabs } from "@/components/nav/settings-tabs";

export default async function LocationsSettingsPage() {
  const activeOrgId = await (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("business_locations")
    .select("id, name, location_type, address, city, region, country, phone, is_primary, is_active")
    .eq("org_id", context.orgId)
    .order("is_primary", { ascending: false })
    .order("name", { ascending: true });

  const locations: LocationRow[] = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    locationType: row.location_type,
    address: row.address,
    city: row.city,
    region: row.region,
    country: row.country,
    phone: row.phone,
    isPrimary: row.is_primary,
    isActive: row.is_active
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ledger-900 dark:text-white">Business locations</h1>
        <p className="text-sm text-ledger-500 dark:text-ledger-400">
          Manage the branches, shops, or warehouses {context.orgName} operates.
        </p>
      </div>

      <SettingsTabs active="locations" />

      <LocationsManager locations={locations} canManage={can(context.role, "locations.manage")} />
    </div>
  );
}