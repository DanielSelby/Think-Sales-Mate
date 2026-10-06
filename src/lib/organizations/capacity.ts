import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createPlatformAdminClient } from "@/lib/supabase/platform-admin";

type CapacityResource = "users" | "branches";

export async function assertOrganizationCapacity(
  organizationId: string,
  resource: CapacityResource,
  additional = 1,
) {
  const platform = createPlatformAdminClient();
  const { data: organization, error: organizationError } = await platform
    .from("platform_organizations")
    .select("plan_id, max_users_override, max_branches_override")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (organizationError) throw new Error(`Could not check organization ${resource} limit: ${organizationError.message}`);
  if (!organization) throw new Error("This organization is not configured in Platform Admin.");

  let limit = resource === "users" ? organization.max_users_override : organization.max_branches_override;
  if (limit === null && organization.plan_id) {
    const { data: plan, error: planError } = await platform
      .from("subscription_plans")
      .select("max_users, max_branches")
      .eq("id", organization.plan_id)
      .maybeSingle();
    if (planError) throw new Error(`Could not load the organization's subscription limit: ${planError.message}`);
    limit = plan ? resource === "users" ? plan.max_users : plan.max_branches : null;
  }

  const app = createAdminClient();
  const countQuery = resource === "users"
    ? app.from("organization_members").select("id", { count: "exact", head: true }).eq("org_id", organizationId).in("status", ["active", "invited"])
    : app.from("business_locations").select("id", { count: "exact", head: true }).eq("org_id", organizationId);
  const { count, error: countError } = await countQuery;
  if (countError) throw new Error(`Could not check current organization ${resource}: ${countError.message}`);

  if (limit !== null && (count ?? 0) + additional > limit) {
    throw new Error(`This organization has reached its ${resource} limit of ${limit}. Contact your Platform Admin to increase it.`);
  }
}
