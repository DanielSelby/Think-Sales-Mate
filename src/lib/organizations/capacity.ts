import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createPlatformAdminClient } from "@/lib/supabase/platform-admin";

type CapacityResource = "users" | "branches";

export function increasesOrganizationSeatUsage(currentStatus: string, nextStatus: string): boolean {
  return currentStatus === "suspended" && nextStatus === "active";
}

async function getOrganizationCapacityLimit(organizationId: string, resource: CapacityResource) {
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

  return limit;
}

export async function withOrganizationCapacity<T>(
  organizationId: string,
  resource: CapacityResource,
  operation: () => Promise<T>,
  additional = 1,
): Promise<T> {
  if (!Number.isInteger(additional) || additional < 1) {
    throw new Error("Additional organization capacity must be a positive integer.");
  }

  const limit = await getOrganizationCapacityLimit(organizationId, resource);
  if (limit === null) return operation();

  const application = createAdminClient();
  const { data: reservationId, error: reserveError } = await application.rpc("reserve_organization_capacity", {
    p_organization_id: organizationId,
    p_resource: resource,
    p_limit: limit,
    p_additional: additional,
  });
  if (reserveError) throw new Error(reserveError.message);
  if (!reservationId) throw new Error("Could not reserve organization capacity.");

  let result!: T;
  let operationFailed = false;
  let operationError: unknown;
  try {
    result = await operation();
  } catch (error) {
    operationFailed = true;
    operationError = error;
  }

  const { error: releaseError } = await application.rpc("release_organization_capacity", {
    p_reservation_id: reservationId,
  });
  if (releaseError) {
    const operationMessage = operationFailed
      ? operationError instanceof Error ? operationError.message : String(operationError)
      : null;
    throw new Error(
      operationMessage
        ? `Organization capacity reservation cleanup failed: ${releaseError.message}; operation also failed: ${operationMessage}`
        : `Organization capacity was used, but its reservation cleanup failed: ${releaseError.message}`,
    );
  }
  if (operationFailed) throw operationError;
  return result;
}
