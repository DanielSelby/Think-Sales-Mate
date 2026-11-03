import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { PlatformDatabase } from "@/types/platform-database";
import { PLATFORM_MODULES } from "@/lib/platform-modules";
import { getCanonicalFeatureModule } from "@/components/nav/navigation";
import {
  hasLegacyProductFeatureGrant,
  hasProductModuleAccess,
  resolveProductEntitlement,
  type ProductEntitlementInput,
} from "@/lib/product-entitlements";
import type { PlatformProductSlug } from "@/types/platform-database";
import { parsePlatformWatermark } from "@/lib/platform-watermark";

const PRODUCT_SLUGS: PlatformProductSlug[] = ["thinksales-erp", "restaurant"];

function isPlatformProductSlug(value: string): value is PlatformProductSlug {
  return PRODUCT_SLUGS.some((slug) => slug === value);
}

export function createPlatformAdminClient() {
  const key = process.env.PLATFORM_SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("PLATFORM_SUPABASE_SERVICE_ROLE_KEY is not configured.");
  return createClient<PlatformDatabase>(process.env.PLATFORM_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function getPlatformSystemLogo() {
  const platform = createPlatformAdminClient();
  const { data, error } = await platform
    .from("platform_settings")
    .select("value")
    .eq("key", "system_logo")
    .maybeSingle();
  if (error) throw new Error(`Could not load platform system logo: ${error.message}`);
  const value = data?.value;
  return value && typeof value === "object" && "url" in value && typeof value.url === "string" ? value.url : null;
}

export async function getPlatformSystemName() {
  const platform = createPlatformAdminClient();
  const { data, error } = await platform
    .from("platform_settings")
    .select("value")
    .eq("key", "system_name")
    .maybeSingle();
  if (error) throw new Error(`Could not load platform system name: ${error.message}`);
  const value = data?.value;
  return value && typeof value === "object" && "name" in value && typeof value.name === "string" && value.name.trim()
    ? value.name.trim()
    : "ThinkSales ERP Pro";
}

export async function getPlatformWatermarkConfiguration() {
  const platform = createPlatformAdminClient();
  const { data, error } = await platform
    .from("platform_settings")
    .select("value, updated_at, updated_by")
    .eq("key", "platform_watermark")
    .maybeSingle();
  if (error) throw new Error(`Could not load platform watermark settings: ${error.message}`);
  if (!data) return parsePlatformWatermark(null);

  const configuration = parsePlatformWatermark(
    data.value,
    data.updated_at,
    data.updated_by,
  );
  if (!configuration.storagePath || !configuration.imageUrl) return configuration;

  const expectedUrl = platform.storage.from("platform-assets").getPublicUrl(configuration.storagePath).data.publicUrl;
  try {
    const storedUrl = new URL(configuration.imageUrl);
    const trustedUrl = new URL(expectedUrl);
    if (storedUrl.origin !== trustedUrl.origin || storedUrl.pathname !== trustedUrl.pathname) {
      return { ...configuration, imageUrl: null, enabled: false };
    }
  } catch {
    return { ...configuration, imageUrl: null, enabled: false };
  }
  return configuration;
}

export async function getPublishedPlatformProducts() {
  const platform = createPlatformAdminClient();
  const { data, error } = await platform
    .from("platform_products")
    .select("slug, name, description")
    .eq("is_published", true)
    .order("name");
  if (error) throw new Error(`Could not load products available for registration: ${error.message}`);
  return data ?? [];
}

export async function syncOrganizationToPlatform(organization: {
  id: string;
  name: string;
  status?: "active" | "trial" | "pending" | "rejected" | "suspended" | "expired";
  ownerUserId?: string;
  ownerEmail?: string;
  requestedProductSlugs?: PlatformProductSlug[];
}) {
  const platform = createPlatformAdminClient();
  const { error } = await platform.from("platform_organizations").upsert(
    {
      organization_id: organization.id,
      name: organization.name,
      ...(organization.status ? {
        status: organization.status,
        registration_state: organization.status === "pending" ? "pending" : "approved",
      } : {}),
      ...(organization.ownerUserId ? { owner_user_id: organization.ownerUserId } : {}),
      ...(organization.ownerEmail ? { owner_email: organization.ownerEmail } : {}),
      ...(organization.requestedProductSlugs
        ? { requested_product_slugs: organization.requestedProductSlugs }
        : {}),
    },
    { onConflict: "organization_id", ignoreDuplicates: false },
  );
  if (error) throw new Error(`Could not synchronize organization with Platform Admin: ${error.message}`);
  const hasProductRequest = (organization.requestedProductSlugs?.length ?? 0) > 0;
  const { error: featureError } = await platform.from("platform_organization_features").upsert(
    PLATFORM_MODULES.map((module) => ({
      organization_id: organization.id,
      module: module.key,
      enabled: !hasProductRequest && module.key !== "Restaurant",
      access_mode: !hasProductRequest && module.key !== "Restaurant" ? "enabled" as const : "disabled" as const,
    })),
    { onConflict: "organization_id,module", ignoreDuplicates: true },
  );
  if (featureError) throw new Error(`Could not initialize organization feature access: ${featureError.message}`);
}

export async function syncAllOrganizationsToPlatform() {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const organizationClient = createAdminClient();
  const { data, error } = await organizationClient.from("organizations").select("id, name, created_by, registration_status");
  if (error) throw new Error(`Could not read organizations for Platform Admin synchronization: ${error.message}`);
  if (!data?.length) return;

  const { data: productRequests, error: productRequestsError } = await organizationClient
    .from("organization_product_requests")
    .select("organization_id, product_slug")
    .in("organization_id", data.map((organization) => organization.id));
  if (productRequestsError) {
    throw new Error(`Could not read organization product requests for Platform Admin synchronization: ${productRequestsError.message}`);
  }
  const requestedProductsByOrganization = new Map<string, PlatformProductSlug[]>();
  (productRequests ?? []).forEach((request) => {
    const productSlug = request.product_slug;
    if (!isPlatformProductSlug(productSlug)) {
      throw new Error(`Unknown product slug in organization registration request: ${productSlug}`);
    }
    const requested = requestedProductsByOrganization.get(request.organization_id) ?? [];
    requested.push(productSlug);
    requestedProductsByOrganization.set(request.organization_id, requested);
  });

  const platform = createPlatformAdminClient();
  const { data: existingOrganizations, error: existingError } = await platform
    .from("platform_organizations")
    .select("organization_id, status")
    .in("organization_id", data.map((organization) => organization.id));
  if (existingError) throw new Error(`Could not check Platform Admin organization synchronization state: ${existingError.message}`);
  const existingById = new Map((existingOrganizations ?? []).map((organization) => [organization.organization_id, organization]));
  const { error: syncError } = await platform.from("platform_organizations").upsert(
    data.map((organization) => {
      const existing = existingById.get(organization.id);
      const status = organization.registration_status;
      const organizationValues = {
        organization_id: organization.id,
        name: organization.name,
        owner_user_id: organization.created_by,
        requested_product_slugs: requestedProductsByOrganization.get(organization.id) ?? [],
      };
      if (status !== "approved" && (!existing || existing.status !== status)) {
        return {
          ...organizationValues,
          status,
          registration_state: status === "pending"
            ? "pending" as const
            : status === "rejected" ? "rejected" as const : "approved" as const,
        };
      }
      return {
        ...organizationValues,
      };
    }),
    { onConflict: "organization_id", ignoreDuplicates: false },
  );
  if (syncError) throw new Error(`Could not synchronize organizations with Platform Admin: ${syncError.message}`);
  const { error: featureError } = await platform.from("platform_organization_features").upsert(
    data.flatMap((organization) =>
      PLATFORM_MODULES.map((module) => {
        const hasProductRequest = (requestedProductsByOrganization.get(organization.id)?.length ?? 0) > 0;
        return {
          organization_id: organization.id,
          module: module.key,
          enabled: !hasProductRequest && module.key !== "Restaurant",
          access_mode: !hasProductRequest && module.key !== "Restaurant" ? "enabled" as const : "disabled" as const,
        };
      }),
    ),
    { onConflict: "organization_id,module", ignoreDuplicates: true },
  );
  if (featureError) throw new Error(`Could not initialize organization feature access: ${featureError.message}`);
}

async function getReadableOrganizationProducts(organizationId: string): Promise<Set<PlatformProductSlug>> {
  const platform = createPlatformAdminClient();
  const [
    { data: organization, error: organizationError },
    { data: subscriptions, error: subscriptionsError },
    { data: features, error: featuresError },
    { data: grants, error: grantsError },
  ] = await Promise.all([
    platform.from("platform_organizations")
      .select("status, registration_state, expires_at, plan_id")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    platform.from("platform_organization_subscriptions")
      .select("product_slug, plan_id, status, current_period_end, trial_ends_at, grace_ends_at, cancel_at_period_end")
      .eq("organization_id", organizationId),
    platform.from("platform_product_features")
      .select("product_slug, module, is_product_entitling_feature"),
    platform.from("platform_organization_features")
      .select("module, enabled, access_mode")
      .eq("organization_id", organizationId),
  ]);
  if (organizationError) throw new Error(`Could not load organization product status: ${organizationError.message}`);
  if (subscriptionsError) throw new Error(`Could not load product subscriptions: ${subscriptionsError.message}`);
  if (featuresError) throw new Error(`Could not load product feature mappings: ${featuresError.message}`);
  if (grantsError) throw new Error(`Could not load product feature grants: ${grantsError.message}`);
  if (!organization) throw new Error("Organization is not registered with Platform Admin.");

  const planIds = [...new Set([
    organization.plan_id,
    ...(subscriptions ?? []).map((subscription) => subscription.plan_id),
  ].filter((planId): planId is string => Boolean(planId)))];
  const { data: planProducts, error: planProductsError } = planIds.length
    ? await platform.from("platform_plan_products")
      .select("plan_id, product_slug")
      .in("plan_id", planIds)
    : { data: [], error: null };
  if (planProductsError) throw new Error(`Could not load plan product assignments: ${planProductsError.message}`);

  const readableProducts = new Set<PlatformProductSlug>();
  for (const productSlug of PRODUCT_SLUGS) {
    const subscription = subscriptions?.find((item) => item.product_slug === productSlug) ?? null;
    const planId = subscription ? subscription.plan_id : organization.plan_id;
    const productMappings = (features ?? []).filter((feature) => feature.product_slug === productSlug);
    const legacyFeatureGranted = hasLegacyProductFeatureGrant(
      productMappings.map((feature) => ({
        module: feature.module,
        isProductEntitlingFeature: feature.is_product_entitling_feature,
      })),
      (grants ?? []).map((feature) => ({
        module: feature.module,
        enabled: feature.enabled,
        accessMode: feature.access_mode,
      })),
    );
    const entitlementInput: ProductEntitlementInput = {
      productSlug,
      organizationStatus: organization.status,
      registrationState: organization.registration_state,
      organizationExpiresAt: organization.expires_at,
      subscription: subscription ? {
        status: subscription.status,
        current_period_end: subscription.current_period_end,
        trial_ends_at: subscription.trial_ends_at,
        grace_ends_at: subscription.grace_ends_at,
        cancel_at_period_end: subscription.cancel_at_period_end,
      } : null,
      legacyFeatureGranted,
      planAllowsProduct: planId
        ? (planProducts ?? []).some((item) => item.plan_id === planId && item.product_slug === productSlug)
        : null,
    };
    if (resolveProductEntitlement(entitlementInput).canReadProductData) {
      readableProducts.add(productSlug);
    }
  }
  return readableProducts;
}

export async function getEnabledOrganizationModules(organizationId: string) {
  const platform = createPlatformAdminClient();
  let { data, error } = await platform
    .from("platform_organization_features")
    .select("module, enabled, access_mode, permission_options")
    .eq("organization_id", organizationId);
  if (error && /permission_options|schema cache/i.test(error.message)) {
    const fallback = await platform
      .from("platform_organization_features")
      .select("module, enabled, access_mode")
      .eq("organization_id", organizationId);
    data = fallback.data?.map((item) => ({ ...item, permission_options: {} })) ?? null;
    error = fallback.error;
  }
  if (error) throw new Error(`Could not load organization feature access: ${error.message}`);
  const enabledModules = new Set<string>();
  const configuredChildren = new Set<string>();
  const enabledChildren = new Set<string>();
  const normalizedRecords = new Map<string, { enabled: boolean; permission_options?: Record<string, boolean>; priority: number }>();
  // Load disabled child rows as well: their presence tells the sidebar that
  // the module has explicit child permissions and should not inherit access.
  (data ?? []).forEach((item) => {
    const canonicalModule = getCanonicalFeatureModule(item.module);
    const priority = canonicalModule === item.module ? 1 : 2;
    const previous = normalizedRecords.get(canonicalModule);
    if (!previous || priority >= previous.priority) {
      normalizedRecords.set(canonicalModule, { enabled: item.enabled, permission_options: item.permission_options, priority });
    }
  });
  normalizedRecords.forEach((item, canonicalModule) => {
    if (!canonicalModule.includes(":")) {
      if (item.enabled) enabledModules.add(canonicalModule);
      return;
    }
    const [parent] = canonicalModule.split(":");
    configuredChildren.add(parent);
    if (item.enabled && !item.permission_options?.hiddenFromMenu) enabledChildren.add(canonicalModule);
  });
  configuredChildren.forEach((module) => enabledModules.add(`__children:${module}`));
  const result = [...enabledModules, ...enabledChildren];
  if (process.env.PRODUCT_ENTITLEMENTS_ENFORCED !== "true") return result;

  const [readableProducts, { data: productFeatures, error: productFeaturesError }] = await Promise.all([
    getReadableOrganizationProducts(organizationId),
    platform.from("platform_product_features")
      .select("product_slug, module, is_product_entitling_feature")
  ]);
  if (productFeaturesError) throw new Error(`Could not load product feature mappings: ${productFeaturesError.message}`);

  return result.filter((module) => {
    const canonicalModule = module.startsWith("__children:")
      ? module.slice("__children:".length)
      : getCanonicalFeatureModule(module);
    return hasProductModuleAccess(
      canonicalModule,
      (productFeatures ?? []).map((feature) => ({
        module: feature.module,
        productSlug: feature.product_slug,
        isProductEntitlingFeature: feature.is_product_entitling_feature,
      })),
      readableProducts,
    );
  });
}
