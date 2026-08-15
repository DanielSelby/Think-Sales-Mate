import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { LocationsManager, type LocationRow } from "@/components/settings/locations-manager";

export default async function LocationsSettingsPage() {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("business_locations")
    .select(
      "id, name, code, location_type, manager_name, address, city, region, country, phone, email, is_primary, is_active, created_at"
    )
    .eq("org_id", context.orgId)
    .order("is_primary", { ascending: false })
    .order("name");

  const locations: LocationRow[] = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    locationType: row.location_type,
    managerName: row.manager_name,
    address: row.address,
    city: row.city,
    region: row.region,
    country: row.country,
    phone: row.phone,
    email: row.email,
    isPrimary: row.is_primary,
    isActive: row.is_active,
    createdAt: row.created_at
  }));

  return <LocationsManager locations={locations} canManage={can(context.role, "locations.manage")} orgName={context.orgName} />;
}