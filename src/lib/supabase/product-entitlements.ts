import "server-only";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import {
  hasLegacyProductFeatureGrant,
  resolveProductEntitlement,
  type ProductEntitlement,
  type ProductEntitlementInput,
} from "@/lib/product-entitlements";
import {
  getEntitlementRetryAt,
  processEntitlementEvents,
} from "@/lib/product-entitlement-sync";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPlatformAdminClient } from "@/lib/supabase/platform-admin";
import type {
  PlatformProductSlug,
  PlatformProductSubscriptionStatus,
} from "@/types/platform-database";

type OrganizationStatus = ProductEntitlementInput["organizationStatus"];
type RegistrationState = ProductEntitlementInput["registrationState"];

interface ProjectionPayload {
  organization_id: string;
  product_slug: PlatformProductSlug;
  plan_id: string | null;
  status: PlatformProductSubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  grace_ends_at: string | null;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
  source: string;
  version: number;
  updated_at: string;
  organization_status: OrganizationStatus;
  registration_state: RegistrationState;
  organization_expires_at: string | null;
}

function isSubscriptionStatus(value: unknown): value is PlatformProductSubscriptionStatus {
  return value === "pending" || value === "trial" || value === "active" || value === "grace"
    || value === "suspended" || value === "expired" || value === "cancelled";
}

function isOrganizationStatus(value: unknown): value is OrganizationStatus {
  return value === "active" || value === "trial" || value === "pending" || value === "rejected"
    || value === "suspended" || value === "expired";
}

function isRegistrationState(value: unknown): value is RegistrationState {
  return value === "pending" || value === "information_requested" || value === "approved" || value === "rejected";
}

function nullableString(value: unknown): string | null | undefined {
  if (value === null || typeof value === "string") return value;
  return undefined;
}

function parseOutboxPayload(
  payload: Record<string, unknown>,
  event: { organization_id: string; product_slug: PlatformProductSlug; version: number },
): ProjectionPayload {
  const nullableFields = {
    plan_id: nullableString(payload.plan_id),
    current_period_start: nullableString(payload.current_period_start),
    current_period_end: nullableString(payload.current_period_end),
    trial_ends_at: nullableString(payload.trial_ends_at),
    grace_ends_at: nullableString(payload.grace_ends_at),
    cancelled_at: nullableString(payload.cancelled_at),
    organization_expires_at: nullableString(payload.organization_expires_at),
  };
  if (Object.values(nullableFields).some((value) => value === undefined)
    || payload.organization_id !== event.organization_id
    || payload.product_slug !== event.product_slug
    || payload.version !== event.version
    || !isSubscriptionStatus(payload.status)
    || typeof payload.cancel_at_period_end !== "boolean"
    || typeof payload.source !== "string"
    || typeof payload.updated_at !== "string"
    || !isOrganizationStatus(payload.organization_status)
    || !isRegistrationState(payload.registration_state)) {
    throw new Error(`Entitlement outbox event ${event.version} has an invalid payload.`);
  }

  return {
    organization_id: event.organization_id,
    product_slug: event.product_slug,
    plan_id: nullableFields.plan_id ?? null,
    status: payload.status,
    current_period_start: nullableFields.current_period_start ?? null,
    current_period_end: nullableFields.current_period_end ?? null,
    trial_ends_at: nullableFields.trial_ends_at ?? null,
    grace_ends_at: nullableFields.grace_ends_at ?? null,
    cancel_at_period_end: payload.cancel_at_period_end,
    cancelled_at: nullableFields.cancelled_at ?? null,
    source: payload.source,
    version: event.version,
    updated_at: payload.updated_at,
    organization_status: payload.organization_status,
    registration_state: payload.registration_state,
    organization_expires_at: nullableFields.organization_expires_at ?? null,
  };
}

async function applyProjection(payload: ProjectionPayload) {
  const application = createAdminClient();
  const { error } = await application.rpc("apply_product_entitlement_projection", {
    p_organization_id: payload.organization_id,
    p_product_slug: payload.product_slug,
    p_plan_id: payload.plan_id,
    p_status: payload.status,
    p_current_period_start: payload.current_period_start,
    p_current_period_end: payload.current_period_end,
    p_trial_ends_at: payload.trial_ends_at,
    p_grace_ends_at: payload.grace_ends_at,
    p_cancel_at_period_end: payload.cancel_at_period_end,
    p_cancelled_at: payload.cancelled_at,
    p_source: payload.source,
    p_source_version: payload.version,
    p_source_updated_at: payload.updated_at,
    p_organization_status: payload.organization_status,
    p_registration_state: payload.registration_state,
    p_organization_expires_at: payload.organization_expires_at,
  });
  if (error) throw new Error(`Could not apply entitlement projection: ${error.message}`);
}

export async function getCurrentProductEntitlement(
  productSlug: PlatformProductSlug,
): Promise<ProductEntitlement> {
  const currentOrganization = await getCurrentOrgContext();
  if (!currentOrganization) throw new Error("An approved organization membership is required.");

  const platform = createPlatformAdminClient();
  const organizationId = currentOrganization.orgId;
  const [productResult, organizationResult, subscriptionResult, featureMapResult] = await Promise.all([
    platform.from("platform_products").select("slug").eq("slug", productSlug).maybeSingle(),
    platform.from("platform_organizations")
      .select("status, registration_state, expires_at, plan_id")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    platform.from("platform_organization_subscriptions")
      .select("status, current_period_end, trial_ends_at, grace_ends_at, cancel_at_period_end, plan_id")
      .eq("organization_id", organizationId)
      .eq("product_slug", productSlug)
      .maybeSingle(),
    platform.from("platform_product_features")
      .select("module, is_product_entitling_feature")
      .eq("product_slug", productSlug),
  ]);
  if (productResult.error) throw new Error(`Could not verify product catalogue entry: ${productResult.error.message}`);
  if (!productResult.data) throw new Error(`Product "${productSlug}" is not registered.`);
  if (organizationResult.error) throw new Error(`Could not load organization entitlement status: ${organizationResult.error.message}`);
  if (!organizationResult.data) throw new Error("Organization is not registered with Platform Admin.");
  if (subscriptionResult.error) throw new Error(`Could not load product subscription: ${subscriptionResult.error.message}`);
  if (featureMapResult.error) throw new Error(`Could not load product feature mapping: ${featureMapResult.error.message}`);

  const { data: featureRows, error: featureError } = await platform.from("platform_organization_features")
    .select("module, enabled, access_mode")
    .eq("organization_id", organizationId);
  if (featureError) throw new Error(`Could not load organization feature grants: ${featureError.message}`);

  let planRows: Array<{ product_slug: PlatformProductSlug }> = [];
  const planId = subscriptionResult.data
    ? subscriptionResult.data.plan_id
    : organizationResult.data.plan_id;
  if (planId) {
    const { data, error: planError } = await platform
      .from("platform_plan_products")
      .select("product_slug")
      .eq("plan_id", planId);
    if (planError) throw new Error(`Could not load plan product grants: ${planError.message}`);
    planRows = data ?? [];
  }

  const legacyFeatureGranted = hasLegacyProductFeatureGrant(
    (featureMapResult.data ?? []).map((feature) => ({
      module: feature.module,
      isProductEntitlingFeature: feature.is_product_entitling_feature,
    })),
    (featureRows ?? []).map((feature) => ({
      module: feature.module,
      enabled: feature.enabled,
      accessMode: feature.access_mode,
    })),
  );
  const planAllowsProduct = planId
    ? planRows.some((row) => row.product_slug === productSlug)
    : null;

  const entitlementInput: ProductEntitlementInput = {
    productSlug,
    organizationStatus: organizationResult.data.status,
    registrationState: organizationResult.data.registration_state,
    organizationExpiresAt: organizationResult.data.expires_at,
    subscription: subscriptionResult.data
      ? {
          status: subscriptionResult.data.status,
          current_period_end: subscriptionResult.data.current_period_end,
          trial_ends_at: subscriptionResult.data.trial_ends_at,
          grace_ends_at: subscriptionResult.data.grace_ends_at,
          cancel_at_period_end: subscriptionResult.data.cancel_at_period_end,
        }
      : null,
    legacyFeatureGranted,
    planAllowsProduct,
  };

  return resolveProductEntitlement(entitlementInput);
}

export async function syncPendingProductEntitlements(limit = 50, eventId?: string): Promise<{ processed: number }> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Entitlement synchronization limit must be an integer between 1 and 100.");
  }
  if (eventId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId)) {
    throw new Error("Entitlement synchronization event ID is invalid.");
  }

  const platform = createPlatformAdminClient();
  let pendingEventsQuery = platform
    .from("platform_entitlement_outbox")
    .select("id, organization_id, product_slug, version, payload, attempts")
    .is("processed_at", null)
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);
  if (eventId) pendingEventsQuery = pendingEventsQuery.eq("id", eventId);
  const { data: events, error } = await pendingEventsQuery;
  if (error) throw new Error(`Could not load pending entitlement events: ${error.message}`);

  return processEntitlementEvents(
    events ?? [],
    async (event) => {
      const payload = parseOutboxPayload(event.payload, event);
      await applyProjection(payload);
    },
    async (event) => {
      const { error: completeError } = await platform
        .from("platform_entitlement_outbox")
        .update({
          attempts: event.attempts + 1,
          last_error: null,
          processed_at: new Date().toISOString(),
        })
        .eq("id", event.id);
      if (completeError) throw new Error(`Could not mark event processed: ${completeError.message}`);
    },
    async (event, message) => {
      const { error: retryError } = await platform
        .from("platform_entitlement_outbox")
        .update({
          attempts: event.attempts + 1,
          next_attempt_at: getEntitlementRetryAt(event.attempts + 1),
          last_error: message.slice(0, 2000),
        })
        .eq("id", event.id);
      if (retryError) throw new Error(retryError.message);
    },
  );
}

export async function reconcileCurrentProductEntitlements(): Promise<{ synchronized: number }> {
  const currentOrganization = await getCurrentOrgContext();
  if (!currentOrganization) throw new Error("An approved organization membership is required.");

  const platform = createPlatformAdminClient();
  const [{ data: organization, error: organizationError }, { data: subscriptions, error: subscriptionsError }] = await Promise.all([
    platform.from("platform_organizations")
      .select("status, registration_state, expires_at")
      .eq("organization_id", currentOrganization.orgId)
      .maybeSingle(),
    platform.from("platform_organization_subscriptions")
      .select("organization_id, product_slug, plan_id, status, current_period_start, current_period_end, trial_ends_at, grace_ends_at, cancel_at_period_end, cancelled_at, source, version, updated_at")
      .eq("organization_id", currentOrganization.orgId),
  ]);
  if (organizationError) throw new Error(`Could not load organization reconciliation state: ${organizationError.message}`);
  if (!organization) throw new Error("Organization is not registered with Platform Admin.");
  if (subscriptionsError) throw new Error(`Could not load subscriptions for reconciliation: ${subscriptionsError.message}`);

  for (const subscription of subscriptions ?? []) {
    await applyProjection({
      organization_id: subscription.organization_id,
      product_slug: subscription.product_slug,
      plan_id: subscription.plan_id,
      status: subscription.status,
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end,
      trial_ends_at: subscription.trial_ends_at,
      grace_ends_at: subscription.grace_ends_at,
      cancel_at_period_end: subscription.cancel_at_period_end,
      cancelled_at: subscription.cancelled_at,
      source: subscription.source,
      version: subscription.version,
      updated_at: subscription.updated_at,
      organization_status: organization.status,
      registration_state: organization.registration_state,
      organization_expires_at: organization.expires_at,
    });
  }

  return { synchronized: subscriptions?.length ?? 0 };
}
