import { describe, expect, it } from "vitest";
import {
  hasLegacyProductFeatureGrant,
  hasProductModuleAccess,
  resolveProductEntitlement,
  type ProductEntitlementInput,
} from "./product-entitlements";

const now = new Date("2026-11-02T12:00:00.000Z");

function input(overrides: Partial<ProductEntitlementInput> = {}): ProductEntitlementInput {
  return {
    productSlug: "restaurant",
    organizationStatus: "active",
    registrationState: "approved",
    organizationExpiresAt: null,
    subscription: {
      status: "active",
      current_period_end: "2026-12-01T00:00:00.000Z",
      trial_ends_at: null,
      grace_ends_at: null,
      cancel_at_period_end: false,
    },
    legacyFeatureGranted: false,
    planAllowsProduct: true,
    now,
    ...overrides,
  };
}

describe("product entitlement resolution", () => {
  it("allows active and trial subscriptions", () => {
    expect(resolveProductEntitlement(input()).accessMode).toBe("full");
    expect(resolveProductEntitlement(input({
      subscription: { ...input().subscription!, status: "trial" },
    })).status).toBe("trial");
  });

  it("uses the product subscription rather than a legacy organization expiration", () => {
    expect(resolveProductEntitlement(input({
      organizationStatus: "expired",
      subscription: { ...input().subscription!, status: "active" },
    })).accessMode).toBe("full");
  });

  it("blocks pending and suspended organization or subscription states", () => {
    expect(resolveProductEntitlement(input({ organizationStatus: "pending" })).accessMode).toBe("blocked");
    expect(resolveProductEntitlement(input({
      subscription: { ...input().subscription!, status: "suspended" },
    })).accessMode).toBe("blocked");
  });

  it("grants read-only access during grace", () => {
    const entitlement = resolveProductEntitlement(input({
      subscription: {
        ...input().subscription!,
        status: "grace",
        current_period_end: "2026-11-01T00:00:00.000Z",
        grace_ends_at: "2026-11-05T00:00:00.000Z",
      },
    }));

    expect(entitlement.accessMode).toBe("read_only");
    expect(entitlement.canReadProductData).toBe(true);
    expect(entitlement.canWriteProductData).toBe(false);
  });

  it("limits expired access to billing and subscription status", () => {
    const entitlement = resolveProductEntitlement(input({
      organizationStatus: "expired",
      subscription: { ...input().subscription!, status: "expired" },
    }));

    expect(entitlement.accessMode).toBe("billing_only");
    expect(entitlement.canReadProductData).toBe(false);
    expect(entitlement.canViewBillingStatus).toBe(true);
  });

  it("allows read-only access through an organization expiration grace period", () => {
    const entitlement = resolveProductEntitlement(input({
      organizationStatus: "expired",
      organizationExpiresAt: "2026-11-01T00:00:00.000Z",
      subscription: {
        ...input().subscription!,
        status: "expired",
        current_period_end: "2026-11-01T00:00:00.000Z",
        grace_ends_at: "2026-11-05T00:00:00.000Z",
      },
    }));

    expect(entitlement.status).toBe("grace");
    expect(entitlement.accessMode).toBe("read_only");
  });

  it("keeps a scheduled cancellation active until the billing term ends", () => {
    const scheduled = resolveProductEntitlement(input({
      subscription: {
        ...input().subscription!,
        cancel_at_period_end: true,
        current_period_end: "2026-12-01T00:00:00.000Z",
      },
    }));
    const ended = resolveProductEntitlement(input({
      subscription: {
        ...input().subscription!,
        cancel_at_period_end: true,
        current_period_end: "2026-11-01T00:00:00.000Z",
      },
    }));

    expect(scheduled.accessMode).toBe("full");
    expect(ended.status).toBe("cancelled");
    expect(ended.accessMode).toBe("blocked");
    expect(resolveProductEntitlement(input({
      subscription: {
        ...input().subscription!,
        cancel_at_period_end: true,
        current_period_end: null,
      },
    })).accessMode).toBe("blocked");
  });

  it("preserves access from legacy feature grants while requiring a grant when no subscription exists", () => {
    const legacy = resolveProductEntitlement(input({
      subscription: null,
      legacyFeatureGranted: true,
    }));
    const ungranted = resolveProductEntitlement(input({
      subscription: null,
      legacyFeatureGranted: false,
    }));

    expect(legacy.accessMode).toBe("full");
    expect(ungranted.status).toBe("not_entitled");
  });

  it("respects a plan restriction unless an explicit legacy organization grant exists", () => {
    expect(resolveProductEntitlement(input({ planAllowsProduct: false })).status).toBe("not_entitled");
    expect(resolveProductEntitlement(input({ planAllowsProduct: null })).accessMode).toBe("full");
    expect(resolveProductEntitlement(input({
      planAllowsProduct: false,
      legacyFeatureGranted: true,
    })).accessMode).toBe("full");
  });

  it("does not mistake shared Dashboard access for a Restaurant product grant", () => {
    const mappings = [
      { module: "Dashboard", isProductEntitlingFeature: false },
      { module: "Restaurant", isProductEntitlingFeature: true },
    ];

    expect(hasLegacyProductFeatureGrant(mappings, [
      { module: "Dashboard", enabled: true, accessMode: "enabled" },
    ])).toBe(false);
    expect(hasLegacyProductFeatureGrant(mappings, [
      { module: "Restaurant:Restaurant POS", enabled: true, accessMode: "enabled" },
    ])).toBe(true);
  });

  it("allows shared modules through any active mapped product but blocks them when none is active", () => {
    const mappings = [
      { module: "Expenses", productSlug: "thinksales-erp" as const, isProductEntitlingFeature: true },
      { module: "Expenses", productSlug: "restaurant" as const, isProductEntitlingFeature: false },
      { module: "Restaurant", productSlug: "restaurant" as const, isProductEntitlingFeature: true },
    ];

    expect(hasProductModuleAccess("Expenses", mappings, new Set(["restaurant"]))).toBe(true);
    expect(hasProductModuleAccess("Expenses", mappings, new Set())).toBe(false);
    expect(hasProductModuleAccess("Restaurant:Restaurant POS", mappings, new Set(["restaurant"]))).toBe(true);
    expect(hasProductModuleAccess("Unmapped module", mappings, new Set())).toBe(true);
  });

  it("blocks organizations pending approval even if an old feature grant exists", () => {
    expect(resolveProductEntitlement(input({
      registrationState: "information_requested",
      subscription: null,
      legacyFeatureGranted: true,
    })).accessMode).toBe("blocked");
  });
});
