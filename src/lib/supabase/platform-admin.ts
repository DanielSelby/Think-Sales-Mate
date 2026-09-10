import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { PlatformDatabase } from "@/types/platform-database";
import { PLATFORM_MODULES } from "@/lib/platform-modules";

export function createPlatformAdminClient() {
  const key = process.env.PLATFORM_SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("PLATFORM_SUPABASE_SERVICE_ROLE_KEY is not configured.");
  return createClient<PlatformDatabase>(process.env.PLATFORM_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function syncOrganizationToPlatform(organization: { id: string; name: string }) {
  const platform = createPlatformAdminClient();
  const { error } = await platform.from("platform_organizations").upsert(
    {
      organization_id: organization.id,
      name: organization.name,
    },
    { onConflict: "organization_id", ignoreDuplicates: false },
  );
  if (error) throw new Error(`Could not synchronize organization with Platform Admin: ${error.message}`);
  const { error: featureError } = await platform.from("platform_organization_features").upsert(
    PLATFORM_MODULES.map((module) => ({ organization_id: organization.id, module: module.key, enabled: true })),
    { onConflict: "organization_id,module", ignoreDuplicates: true },
  );
  if (featureError) throw new Error(`Could not initialize organization feature access: ${featureError.message}`);
}

export async function syncAllOrganizationsToPlatform() {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const organizationClient = createAdminClient();
  const { data, error } = await organizationClient.from("organizations").select("id, name");
  if (error) throw new Error(`Could not read organizations for Platform Admin synchronization: ${error.message}`);
  if (!data?.length) return;

  const platform = createPlatformAdminClient();
  const { error: syncError } = await platform.from("platform_organizations").upsert(
    data.map((organization) => ({ organization_id: organization.id, name: organization.name })),
    { onConflict: "organization_id", ignoreDuplicates: false },
  );
  if (syncError) throw new Error(`Could not synchronize organizations with Platform Admin: ${syncError.message}`);
  const { error: featureError } = await platform.from("platform_organization_features").upsert(
    data.flatMap((organization) =>
      PLATFORM_MODULES.map((module) => ({ organization_id: organization.id, module: module.key, enabled: true })),
    ),
    { onConflict: "organization_id,module", ignoreDuplicates: true },
  );
  if (featureError) throw new Error(`Could not initialize organization feature access: ${featureError.message}`);
}

export async function getEnabledOrganizationModules(organizationId: string) {
  const platform = createPlatformAdminClient();
  const { data, error } = await platform
    .from("platform_organization_features")
    .select("module")
    .eq("organization_id", organizationId)
    .eq("enabled", true);
  if (error) throw new Error(`Could not load organization feature access: ${error.message}`);
  return data.map((item) => item.module);
}
