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
    PLATFORM_MODULES.map((module) => ({ organization_id: organization.id, module: module.key, enabled: true, access_mode: "enabled" as const })),
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
      PLATFORM_MODULES.map((module) => ({ organization_id: organization.id, module: module.key, enabled: true, access_mode: "enabled" as const })),
    ),
    { onConflict: "organization_id,module", ignoreDuplicates: true },
  );
  if (featureError) throw new Error(`Could not initialize organization feature access: ${featureError.message}`);
}

export async function getEnabledOrganizationModules(organizationId: string) {
  const platform = createPlatformAdminClient();
  let { data, error } = await platform
    .from("platform_organization_features")
    .select("module, enabled, permission_options")
    .eq("organization_id", organizationId);
  if (error && /permission_options|schema cache/i.test(error.message)) {
    const fallback = await platform
      .from("platform_organization_features")
      .select("module, enabled")
      .eq("organization_id", organizationId);
    data = fallback.data?.map((item) => ({ ...item, permission_options: {} })) ?? null;
    error = fallback.error;
  }
  if (error) throw new Error(`Could not load organization feature access: ${error.message}`);
  const enabledModules = new Set<string>();
  const configuredChildren = new Set<string>();
  const enabledChildren = new Set<string>();
  // Load disabled child rows as well: their presence tells the sidebar that
  // the module has explicit child permissions and should not inherit access.
  (data ?? []).forEach((item) => {
    if (!item.module.includes(":")) {
      if (item.enabled) enabledModules.add(item.module);
      return;
    }
    const [parent] = item.module.split(":");
    configuredChildren.add(parent);
    if (item.enabled && !item.permission_options?.hiddenFromMenu) enabledChildren.add(item.module);
  });
  configuredChildren.forEach((module) => enabledModules.add(`__children:${module}`));
  return [...enabledModules, ...enabledChildren];
}
