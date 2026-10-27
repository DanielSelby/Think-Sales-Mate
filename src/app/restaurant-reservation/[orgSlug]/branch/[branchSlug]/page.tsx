import { getEnabledOrganizationModules } from "@/lib/supabase/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import OnlineReservationView from "@/components/restaurant/online-reservation-view";

export const dynamic = "force-dynamic";

export default async function RestaurantOnlineReservationPage({
  params,
}: {
  params: Promise<{ orgSlug: string; branchSlug: string }>;
}) {
  const { orgSlug, branchSlug } = await params;
  const admin = createAdminClient();
  const { data: organization, error: organizationError } = await admin.from("organizations")
    .select("id, name").eq("slug", orgSlug).maybeSingle();
  if (organizationError) throw new Error(`Could not load restaurant: ${organizationError.message}`);
  if (!organization || !(await getEnabledOrganizationModules(organization.id)).includes("Restaurant")) {
    return <ReservationUnavailable />;
  }

  const { data: location, error: locationError } = await admin.from("business_locations")
    .select("id, name").eq("org_id", organization.id).eq("customer_portal_slug", branchSlug)
    .eq("is_active", true).maybeSingle();
  if (locationError) throw new Error(`Could not load restaurant branch: ${locationError.message}`);
  if (!location) return <ReservationUnavailable />;

  const { data: setting, error: settingError } = await admin.from("restaurant_online_settings")
    .select("accepts_online_reservations").eq("org_id", organization.id)
    .eq("location_id", location.id).maybeSingle();
  if (settingError) throw new Error(`Could not load reservation settings: ${settingError.message}`);
  if (!setting?.accepts_online_reservations) return <ReservationUnavailable organizationName={organization.name} />;

  const { data: tables, error: tablesError } = await admin.from("restaurant_tables")
    .select("seats").eq("org_id", organization.id).eq("location_id", location.id).eq("is_active", true);
  if (tablesError) throw new Error(`Could not load reservation availability: ${tablesError.message}`);
  const maximumPartySize = Math.min(20, (tables ?? []).reduce((maximum, table) => Math.max(maximum, table.seats), 0));

  return <OnlineReservationView
    orgSlug={orgSlug}
    branchSlug={branchSlug}
    organizationName={organization.name}
    branchName={location.name}
    maximumPartySize={maximumPartySize}
    bookingNow={Date.now()}
  />;
}

function ReservationUnavailable({ organizationName }: { organizationName?: string }) {
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
    <section className="max-w-md rounded-2xl border bg-white p-8 text-center shadow-sm">
      <h1 className="text-xl font-bold text-slate-950">{organizationName ?? "Restaurant reservations"}</h1>
      <p className="mt-2 text-sm text-slate-600">This restaurant is not accepting online reservations right now.</p>
    </section>
  </main>;
}
