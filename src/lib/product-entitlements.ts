import type {
  PlatformProductSlug,
  PlatformProductSubscriptionStatus,
} from "@/types/platform-database";

export type ProductAccessMode = "full" | "read_only" | "billing_only" | "blocked";
export type EffectiveProductStatus = PlatformProductSubscriptionStatus | "not_entitled";

export interface ProductSubscriptionState {
  status: PlatformProductSubscriptionStatus;
  current_period_end: string | null;
  trial_ends_at: string | null;
  grace_ends_at: string | null;
  cancel_at_period_end: boolean;
}

export interface ProductEntitlementInput {
  productSlug: PlatformProductSlug;
  organizationStatus: "active" | "trial" | "pending" | "rejected" | "suspended" | "expired";
  registrationState: "pending" | "information_requested" | "approved" | "rejected";
  organizationExpiresAt: string | null;
  legacyGraceEndsAt?: string | null;
  subscription: ProductSubscriptionState | null;
  legacyFeatureGranted: boolean;
  planAllowsProduct: boolean | null;
  now?: Date;
}

export interface ProductFeatureMapping {
  module: string;
  isProductEntitlingFeature: boolean;
}

export interface ProductModuleMapping extends ProductFeatureMapping {
  productSlug: PlatformProductSlug;
}

export interface OrganizationFeatureGrant {
  module: string;
  enabled: boolean;
  accessMode: "enabled" | "disabled" | "read_only";
}

export interface ProductEntitlement {
  productSlug: PlatformProductSlug;
  status: EffectiveProductStatus;
  accessMode: ProductAccessMode;
  hasProductAccess: boolean;
  canReadProductData: boolean;
  canWriteProductData: boolean;
  canViewBillingStatus: boolean;
}

function isPast(value: string | null | undefined, now: Date) {
  return value !== null && value !== undefined && Date.parse(value) <= now.getTime();
}

function isFuture(value: string | null | undefined, now: Date) {
  return value !== null && value !== undefined && Date.parse(value) > now.getTime();
}

function result(
  productSlug: PlatformProductSlug,
  status: EffectiveProductStatus,
  accessMode: ProductAccessMode,
): ProductEntitlement {
  const hasProductAccess = accessMode === "full" || accessMode === "read_only";
  return {
    productSlug,
    status,
    accessMode,
    hasProductAccess,
    canReadProductData: hasProductAccess,
    canWriteProductData: accessMode === "full",
    canViewBillingStatus: status !== "not_entitled",
  };
}

export function hasLegacyProductFeatureGrant(
  mappings: ProductFeatureMapping[],
  grants: OrganizationFeatureGrant[],
): boolean {
  const entitlingModules = new Set(
    mappings.filter((mapping) => mapping.isProductEntitlingFeature).map((mapping) => mapping.module),
  );
  return grants.some((grant) => {
    const mapped = entitlingModules.has(grant.module)
      || (entitlingModules.has("Restaurant") && grant.module.startsWith("Restaurant:"));
    return mapped && grant.enabled && grant.accessMode !== "disabled";
  });
}

export function hasProductModuleAccess(
  module: string,
  mappings: ProductModuleMapping[],
  readableProducts: ReadonlySet<PlatformProductSlug>,
): boolean {
  const moduleMappings = mappings.filter((mapping) =>
    mapping.module === module
    || (mapping.module === "Restaurant" && module.startsWith("Restaurant:"))
  );
  return !moduleMappings.length || moduleMappings.some((mapping) => readableProducts.has(mapping.productSlug));
}

export function resolveProductEntitlement(input: ProductEntitlementInput): ProductEntitlement {
  const now = input.now ?? new Date();
  const { productSlug, subscription } = input;

  if (input.registrationState === "pending" || input.registrationState === "information_requested"
    || input.organizationStatus === "pending") {
    return result(productSlug, "pending", "blocked");
  }
  if (input.registrationState === "rejected" || input.organizationStatus === "rejected"
    || input.organizationStatus === "suspended") {
    return result(productSlug, "suspended", "blocked");
  }

  if (!subscription && !input.legacyFeatureGranted) {
    return result(productSlug, "not_entitled", "blocked");
  }

  if (subscription && input.planAllowsProduct === false && !input.legacyFeatureGranted) {
    return result(productSlug, "not_entitled", "blocked");
  }

  let status: EffectiveProductStatus;
  if (subscription) {
    status = subscription.status;
    const subscriptionEnd = subscription.current_period_end
      ?? (status === "trial" ? subscription.trial_ends_at : null);

    if (subscription.cancel_at_period_end && (!subscriptionEnd || isPast(subscriptionEnd, now))) {
      status = "cancelled";
    } else if (status === "trial" && isPast(subscription.trial_ends_at, now)) {
      status = isFuture(subscription.grace_ends_at, now) ? "grace" : "expired";
    } else if ((status === "active" || status === "trial") && isPast(subscriptionEnd, now)) {
      status = isFuture(subscription.grace_ends_at, now) ? "grace" : "expired";
    } else if (status === "grace" && !isFuture(subscription.grace_ends_at, now)) {
      status = "expired";
    } else if (status === "expired" && isFuture(subscription.grace_ends_at, now)) {
      status = "grace";
    }
  } else {
    status = input.organizationStatus === "trial" ? "trial" : "active";
    if (isPast(input.organizationExpiresAt, now)) {
      status = isFuture(input.legacyGraceEndsAt, now) ? "grace" : "expired";
    }
  }

  if (status === "pending" || status === "suspended" || status === "cancelled") {
    return result(productSlug, status, "blocked");
  }
  if (status === "grace") {
    return result(productSlug, "grace", "read_only");
  }
  if (status === "expired" || (input.organizationStatus === "expired" && !subscription)) {
    return result(productSlug, "expired", "billing_only");
  }
  return result(productSlug, status, "full");
}
