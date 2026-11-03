import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createPlatformAdminClient } from "@/lib/supabase/platform-admin";

export interface OrganizationUsageSummary {
  members: number;
  branches: number;
  userLimit: number | null;
  branchLimit: number | null;
}

export async function getOrganizationUsageSummary(organizationId: string): Promise<OrganizationUsageSummary> {
  const platform = createPlatformAdminClient();
  const application = createAdminClient();
  const [
    { data: organization, error: organizationError },
    { count: members, error: membersError },
    { count: branches, error: branchesError },
  ] = await Promise.all([
    platform.from("platform_organizations")
      .select("plan_id, max_users_override, max_branches_override")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    application.from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("org_id", organizationId)
      .in("status", ["active", "invited"]),
    application.from("business_locations")
      .select("id", { count: "exact", head: true })
      .eq("org_id", organizationId),
  ]);
  if (organizationError) throw new Error(`Could not load organization usage limits: ${organizationError.message}`);
  if (!organization) throw new Error("Organization is not configured in Platform Admin.");
  if (membersError) throw new Error(`Could not load organization seat usage: ${membersError.message}`);
  if (branchesError) throw new Error(`Could not load organization branch usage: ${branchesError.message}`);

  let userLimit = organization.max_users_override;
  let branchLimit = organization.max_branches_override;
  if ((userLimit === null || branchLimit === null) && organization.plan_id) {
    const { data: plan, error: planError } = await platform.from("subscription_plans")
      .select("max_users, max_branches")
      .eq("id", organization.plan_id)
      .maybeSingle();
    if (planError) throw new Error(`Could not load organization plan limits: ${planError.message}`);
    userLimit ??= plan?.max_users ?? null;
    branchLimit ??= plan?.max_branches ?? null;
  }

  return {
    members: members ?? 0,
    branches: branches ?? 0,
    userLimit,
    branchLimit,
  };
}
