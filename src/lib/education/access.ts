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

  let campusQuery = supabase.from("business_locations")
    .select("id, name, code, city, region, is_active")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("name");
  if (!hasOrganizationScope) campusQuery = campusQuery.in("id", branchIds);
  const { data: campuses, error: campusesError } = await campusQuery;
  if (campusesError) throw new Error(`Could not load accessible Think Education campuses: ${campusesError.message}`);
  return { campuses: campuses ?? [], hasOrganizationScope };
}
