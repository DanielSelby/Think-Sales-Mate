import { describe, expect, it } from "vitest";
import {
  getProductAppPath,
  getProductAppPathPrefix,
  resolveProductAppRoute,
} from "./product-app-routes";

describe("product application routes", () => {
  it("resolves canonical paths to their legacy page paths", () => {
    expect(resolveProductAppRoute("/app/thinksales/inventory")).toEqual({
      kind: "valid",
      productSlug: "thinksales-erp",
      appPath: "/inventory",
    });
    expect(resolveProductAppRoute("/app/restaurant/menu")).toEqual({
      kind: "valid",
      productSlug: "restaurant",
      appPath: "/restaurant/menu",
    });
    expect(resolveProductAppRoute("/app/restaurant/expenses/categories")).toEqual({
      kind: "valid",
      productSlug: "restaurant",
      appPath: "/expenses/categories",
    });
    expect(resolveProductAppRoute("/app/think-service/jobs")).toEqual({
      kind: "valid",
      productSlug: "think-service-repairs",
      appPath: "/service-center/jobs",
    });
    expect(resolveProductAppRoute("/app/think-education/students")).toEqual({
      kind: "valid",
      productSlug: "think-education",
      appPath: "/education/students",
    });
    expect(resolveProductAppRoute("/app/think-education/settings/users")).toEqual({
      kind: "valid",
      productSlug: "think-education",
      appPath: "/education/settings/users",
    });
  });

  it("uses each product's canonical default path", () => {
    expect(getProductAppPath("thinksales-erp")).toBe("/app/thinksales/dashboard");
    expect(getProductAppPath("restaurant")).toBe("/app/restaurant");
    expect(getProductAppPath("think-service-repairs")).toBe("/app/think-service");
    expect(getProductAppPath("think-education")).toBe("/app/think-education/dashboard");
    expect(resolveProductAppRoute("/app/think-education")).toEqual({
      kind: "valid",
      productSlug: "think-education",
      appPath: "/education/dashboard",
    });
    expect(resolveProductAppRoute("/app/restaurant")).toEqual({
      kind: "valid",
      productSlug: "restaurant",
      appPath: "/restaurant",
    });
    expect(resolveProductAppRoute("/app/restaurant/accounting/restaurant-ledger")).toEqual({
      kind: "valid",
      productSlug: "restaurant",
      appPath: "/accounting/restaurant-ledger",
    });
    expect(resolveProductAppRoute("/app/restaurant/settings/organization")).toEqual({
      kind: "valid",
      productSlug: "restaurant",
      appPath: "/settings/organization",
    });
  });

  it("rejects unknown namespaces and exposes the active namespace prefix", () => {
    expect(resolveProductAppRoute("/app/not-registered/products")).toEqual({ kind: "invalid" });
    expect(getProductAppPathPrefix("/app/restaurant/menu")).toBe("/app/restaurant");
    expect(getProductAppPathPrefix("/inventory")).toBeNull();
  });
});
