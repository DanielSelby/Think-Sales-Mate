import { describe, expect, it } from "vitest";
import {
  getLegacyProductAppPath,
  filterPermissionMatrixForProduct,
  getRequiredProductSlugs,
  getRequiredProductSlugsForPermissionModule,
  isOrganizationWidePermissionModule,
  hasAnyRequiredProductAccess,
} from "./product-entitlement-routes";

describe("product route entitlement mapping", () => {
  it("uses the same any-active-product rule for route and permission gates", () => {
    const erpOnly = new Set(["thinksales-erp"] as const);
    const restaurantOnly = new Set(["restaurant"] as const);
    const serviceOnly = new Set(["think-service-repairs"] as const);
    const neither = new Set<"thinksales-erp" | "restaurant" | "think-service-repairs">();

    expect(hasAnyRequiredProductAccess(["thinksales-erp"], erpOnly)).toBe(true);
    expect(hasAnyRequiredProductAccess(["restaurant"], erpOnly)).toBe(false);
    expect(hasAnyRequiredProductAccess(["thinksales-erp"], restaurantOnly)).toBe(false);
    expect(hasAnyRequiredProductAccess(["restaurant"], restaurantOnly)).toBe(true);
    expect(hasAnyRequiredProductAccess(["think-service-repairs"], serviceOnly)).toBe(true);
    expect(hasAnyRequiredProductAccess(["think-service-repairs"], erpOnly)).toBe(false);
    expect(hasAnyRequiredProductAccess(["thinksales-erp", "restaurant"], erpOnly)).toBe(true);
    expect(hasAnyRequiredProductAccess(["thinksales-erp", "restaurant"], restaurantOnly)).toBe(true);
    expect(hasAnyRequiredProductAccess(["thinksales-erp", "restaurant"], neither)).toBe(false);
  });

  it("requires the Restaurant product for Restaurant routes", () => {
    expect(getRequiredProductSlugs("/restaurant/pos")).toEqual(["restaurant"]);
  });

  it("requires Think Service & Repairs for all Service Center routes and APIs", () => {
    expect(getRequiredProductSlugs("/service-center")).toEqual(["think-service-repairs"]);
    expect(getRequiredProductSlugs("/service-center/jobs/123")).toEqual(["think-service-repairs"]);
    expect(getRequiredProductSlugs("/api/service-center/jobs")).toEqual(["think-service-repairs"]);
  });

  it("validates namespaced routes against their legacy page ownership", () => {
    expect(getRequiredProductSlugs("/app/thinksales/inventory")).toEqual(["thinksales-erp"]);
    expect(getRequiredProductSlugs("/app/restaurant/menu")).toEqual(["restaurant"]);
    expect(getRequiredProductSlugs("/app/restaurant/expenses")).toEqual(["restaurant"]);
    expect(getRequiredProductSlugs("/app/restaurant/settings/organization")).toEqual(["restaurant"]);
    expect(getRequiredProductSlugs("/app/think-service/jobs")).toEqual(["think-service-repairs"]);
    expect(getRequiredProductSlugs("/app/restaurant/inventory")).toEqual(["restaurant"]);
    expect(getRequiredProductSlugs("/app/unknown/inventory")).toEqual([]);
  });

  it("canonicalizes unambiguous legacy product routes without losing their path", () => {
    expect(getLegacyProductAppPath("/inventory/barcode-labels"))
      .toBe("/app/thinksales/inventory/barcode-labels");
    expect(getLegacyProductAppPath("/restaurant/menu")).toBe("/app/restaurant/menu");
    expect(getLegacyProductAppPath("/service-center/jobs")).toBe("/app/think-service/jobs");
    expect(getLegacyProductAppPath("/expenses/categories")).toBeNull();
  });

  it("allows integrations when either product subscription is active", () => {
    expect(getRequiredProductSlugs("/accounting/restaurant-ledger")).toEqual(["thinksales-erp", "restaurant"]);
    expect(getRequiredProductSlugs("/expenses/categories")).toEqual(["thinksales-erp", "restaurant"]);
    expect(getRequiredProductSlugs("/approvals")).toEqual(["thinksales-erp", "restaurant"]);
  });

  it("requires the ERP product for core ERP routes", () => {
    expect(getRequiredProductSlugs("/dashboard")).toEqual(["thinksales-erp"]);
    expect(getRequiredProductSlugs("/inventory/barcode-labels")).toEqual(["thinksales-erp"]);
    expect(getRequiredProductSlugs("/settings/customer-ordering")).toEqual(["thinksales-erp"]);
    expect(getRequiredProductSlugs("/settings/customer-ordering/branches")).toEqual(["thinksales-erp"]);
  });

  it("leaves onboarding, billing status, and explicitly public API paths outside product gates", () => {
    expect(getRequiredProductSlugs("/")).toBeNull();
    expect(getRequiredProductSlugs("/onboarding")).toBeNull();
    expect(getRequiredProductSlugs("/product-hub")).toBeNull();
    expect(getRequiredProductSlugs("/product-hub/open/restaurant")).toBeNull();
    expect(getRequiredProductSlugs("/support")).toBeNull();
    expect(getRequiredProductSlugs("/subscription-status")).toBeNull();
    expect(getRequiredProductSlugs("/api/restaurant-order/checkout")).toBeNull();
    expect(getRequiredProductSlugs("/api/restaurant-order/paystack/webhook")).toBeNull();
    expect(getRequiredProductSlugs("/api/cron/product-entitlements")).toBeNull();
    expect(getRequiredProductSlugs("/api/system-logo")).toBeNull();
    expect(getRequiredProductSlugs("/service-repair/opaque-customer-token")).toBeNull();
  });

  it("requires the ERP entitlement for authenticated product APIs", () => {
    expect(getRequiredProductSlugs("/api/ai/chat")).toEqual(["thinksales-erp"]);
    expect(getRequiredProductSlugs("/api/offline/sync")).toEqual(["thinksales-erp"]);
  });

  it("maps server-action permission modules to the same product access rules as their pages", () => {
    expect(getRequiredProductSlugsForPermissionModule("sales")).toEqual(["thinksales-erp"]);
    expect(getRequiredProductSlugsForPermissionModule("restaurant")).toEqual(["restaurant"]);
    expect(getRequiredProductSlugsForPermissionModule("service_jobs")).toEqual(["think-service-repairs"]);
    expect(getRequiredProductSlugsForPermissionModule("service_customers")).toEqual(["think-service-repairs"]);
    expect(getRequiredProductSlugsForPermissionModule("customer_assets")).toEqual(["think-service-repairs"]);
    expect(getRequiredProductSlugsForPermissionModule("expenses")).toEqual(["thinksales-erp", "restaurant"]);
    expect(getRequiredProductSlugsForPermissionModule("accounting")).toEqual(["thinksales-erp"]);
    expect(getRequiredProductSlugsForPermissionModule("restaurant")).toEqual(["restaurant"]);
    expect(getRequiredProductSlugsForPermissionModule("approvals")).toEqual(["thinksales-erp", "restaurant"]);
    expect(getRequiredProductSlugsForPermissionModule("customer_orders")).toEqual(["thinksales-erp"]);
    expect(getRequiredProductSlugsForPermissionModule("user_management")).toEqual(["thinksales-erp", "restaurant"]);
    expect(getRequiredProductSlugsForPermissionModule("cash_closing")).toEqual(["thinksales-erp", "restaurant"]);
    expect(getRequiredProductSlugsForPermissionModule("banking", "banking", "reconciliation")).toEqual(["thinksales-erp", "restaurant"]);
    expect(getRequiredProductSlugsForPermissionModule("unmapped_module")).toEqual(["thinksales-erp"]);
  });

  it("filters permission matrices by product while excluding organization-wide administration", () => {
    const matrix = {
      sales: ["view"],
      restaurant: ["create"],
      service_jobs: ["edit"],
      expenses: ["view"],
      "sales.sales.sales_history": ["view"],
      "user_management": ["edit"],
      invalid: { action: true },
    };

    expect(filterPermissionMatrixForProduct(matrix, "thinksales-erp")).toEqual({
      sales: ["view"],
      expenses: ["view"],
      "sales.sales.sales_history": ["view"],
    });
    expect(filterPermissionMatrixForProduct(matrix, "restaurant")).toEqual({
      restaurant: ["create"],
      expenses: ["view"],
    });
    expect(filterPermissionMatrixForProduct(matrix, "think-service-repairs")).toEqual({
      service_jobs: ["edit"],
    });
    expect(isOrganizationWidePermissionModule("user_management")).toBe(true);
    expect(isOrganizationWidePermissionModule("sales")).toBe(false);
  });
});
