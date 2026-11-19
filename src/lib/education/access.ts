import { createClient } from "@/lib/supabase/server";

export async function getAccessibleEducationCampuses(
  orgId: string,
  userId: string,
  options: { includeInactive?: boolean } = {},
) {
  const supabase = await createClient();
  const includeInactive = options.includeInactive === true;
  const { data: scopes, error: scopesError } = await supabase
    .from("education_member_branch_scopes")
    .select("scope_type, branch_id")
    .eq("org_id", orgId)
    .eq("user_id", userId);
  if (scopesError) throw new Error(`Could not load your Think Education campus access: ${scopesError.message}`);

  const hasOrganizationScope = (scopes ?? []).some((scope) => scope.scope_type === "organization");
  const branchIds = Array.from(new Set((scopes ?? [])
    .flatMap((scope) => scope.scope_type === "branch" && scope.branch_id ? [scope.branch_id] : [])));
  if (!hasOrganizationScope && branchIds.length === 0) return { campuses: [], hasOrganizationScope };

  let educationCampusQuery = supabase.from("education_campuses")
    .select("branch_id, administrator_user_id, status")
    .eq("org_id", orgId);
  if (!includeInactive) educationCampusQuery = educationCampusQuery.eq("status", "active");
  if (!hasOrganizationScope) educationCampusQuery = educationCampusQuery.in("branch_id", branchIds);
  const { data: educationCampuses, error: educationCampusesError } = await educationCampusQuery;
  if (educationCampusesError) {
    throw new Error(`Could not load registered Think Education campuses: ${educationCampusesError.message}`);
  }

  const campusIds = (educationCampuses ?? []).map((campus) => campus.branch_id);
  if (campusIds.length === 0) return { campuses: [], hasOrganizationScope };

  let locationsQuery = supabase.from("business_locations")
    .select("id, name, code, address, city, region, country, phone, email, is_active")
    .eq("org_id", orgId)
    .in("id", campusIds);
  if (!includeInactive) locationsQuery = locationsQuery.eq("is_active", true);
  const { data: locations, error: campusesError } = await locationsQuery.order("name");
  if (campusesError) throw new Error(`Could not load accessible Think Education campuses: ${campusesError.message}`);
  const educationCampusByBranch = new Map((educationCampuses ?? []).map((campus) => [campus.branch_id, campus]));
  const campuses = (locations ?? []).map((location) => ({
    ...location,
    education_status: educationCampusByBranch.get(location.id)?.status ?? "inactive" as const,
    administrator_user_id: educationCampusByBranch.get(location.id)?.administrator_user_id ?? null,
  }));
  return { campuses, hasOrganizationScope };
}
