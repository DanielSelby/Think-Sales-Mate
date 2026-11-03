import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createPlatformAdminClient } from "@/lib/supabase/platform-admin";

const AI_USAGE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export async function syncPlatformUsageSnapshot(now = new Date()) {
  const since = new Date(now.getTime() - AI_USAGE_WINDOW_MS).toISOString();
  const app = createAdminClient();
  const platform = createPlatformAdminClient();

  const { data: snapshots, error: snapshotError } = await app.rpc(
    "get_platform_usage_snapshot",
    { p_since: since }
  );
  if (snapshotError) {
    throw new Error(`Could not read application usage snapshots: ${snapshotError.message}`);
  }
  if (!snapshots) {
    throw new Error("Application AI usage snapshot returned no result.");
  }

  const { data: synchronizedCount, error: syncError } = await platform.rpc(
    "sync_platform_usage_snapshot",
    { p_snapshots: snapshots }
  );
  if (syncError) {
    throw new Error(`Could not update Platform Admin usage metrics: ${syncError.message}`);
  }
  if (typeof synchronizedCount !== "number" || !Number.isInteger(synchronizedCount) || synchronizedCount < 0) {
    throw new Error("Platform Admin usage synchronization returned an invalid result.");
  }
  if (synchronizedCount > snapshots.length) {
    throw new Error("Platform Admin usage synchronization reported more updates than organizations.");
  }

  const { data: unmatchedOrganizationIds, error: diagnosticsError } = await platform.rpc(
    "get_unmatched_platform_usage_organizations",
    { p_organization_ids: snapshots.map((snapshot) => snapshot.organization_id) }
  );
  if (diagnosticsError) {
    throw new Error(`Could not identify unmatched Platform Admin organizations: ${diagnosticsError.message}`);
  }
  if (
    !Array.isArray(unmatchedOrganizationIds)
    || unmatchedOrganizationIds.some((id) => typeof id !== "string")
    || new Set(unmatchedOrganizationIds).size !== unmatchedOrganizationIds.length
    || unmatchedOrganizationIds.length !== snapshots.length - synchronizedCount
  ) {
    throw new Error("Platform Admin usage diagnostics returned an inconsistent result.");
  }

  return {
    organizations: snapshots.length,
    synchronized: synchronizedCount,
    skipped: unmatchedOrganizationIds.map((organizationId) => ({
      organizationId,
      reason: "not_registered_in_platform_admin",
    })),
    windowStart: since,
  };
}
