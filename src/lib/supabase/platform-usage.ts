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

  return {
    organizations: snapshots.length,
    synchronized: synchronizedCount,
    windowStart: since,
  };
}
