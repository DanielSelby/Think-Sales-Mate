import { createClient } from "@/lib/supabase/server";

export async function getAccessibleEducationCampuses(orgId: string, userId: string) {
  const supabase = await createClient();
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
    .select("branch_id")
    .eq("org_id", orgId)
    .eq("status", "active");
  if (!hasOrganizationScope) educationCampusQuery = educationCampusQuery.in("branch_id", branchIds);
  const { data: educationCampuses, error: educationCampusesError } = await educationCampusQuery;
  if (educationCampusesError) {
    throw new Error(`Could not load registered Think Education campuses: ${educationCampusesError.message}`);
  }

  const campusIds = (educationCampuses ?? []).map((campus) => campus.branch_id);
  if (campusIds.length === 0) return { campuses: [], hasOrganizationScope };

  const { data: campuses, error: campusesError } = await supabase.from("business_locations")
    .select("id, name, code, city, region, is_active")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .in("id", campusIds)
    .order("name");
  if (campusesError) throw new Error(`Could not load accessible Think Education campuses: ${campusesError.message}`);
  return { campuses: campuses ?? [], hasOrganizationScope };
}
