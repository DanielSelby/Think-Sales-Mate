import { describe, expect, it } from "vitest";
import {
  getProductNavigationItems,
  getProductNavigationScope,
  getProductScopedHref,
  getVisibleNavigationChildren,
} from "./product-navigation";

const navigation = [
  { label: "Dashboard" },
  { label: "Think Service & Repairs" },
  { label: "Restaurant" },
  { label: "Sales" },
];

describe("product navigation", () => {
  it("uses the current product route to select the navigation scope", () => {
    expect(getProductNavigationScope("/app/think-service/jobs")).toBe("think-service-repairs");
    expect(getProductNavigationScope("/app/restaurant/menu")).toBe("restaurant");
    expect(getProductNavigationScope("/service-center/jobs")).toBe("think-service-repairs");
    expect(getProductNavigationScope("/restaurant/pos")).toBe("restaurant");
    expect(getProductNavigationScope("/inventory")).toBe("thinksales-erp");
  });

  it("keeps local links in the active product namespace and excludes foreign namespaces", () => {
    expect(getProductScopedHref("/app/thinksales/dashboard", "/inventory?view=all#top"))
      .toBe("/app/thinksales/inventory?view=all#top");
    expect(getProductScopedHref("/app/restaurant", "/restaurant/menu"))
      .toBe("/app/restaurant/menu");
    expect(getProductScopedHref("/app/restaurant", "/accounting/restaurant-ledger"))
      .toBe("/app/restaurant/accounting/restaurant-ledger");
    expect(getProductScopedHref("/app/think-service", "/service-center/jobs"))
      .toBe("/app/think-service/jobs");
    expect(getProductScopedHref("/app/restaurant", "/inventory")).toBeNull();
    expect(getProductScopedHref("/app/restaurant", "/app/thinksales/inventory")).toBeNull();
    expect(getProductScopedHref("/app/restaurant", "/app/unknown/page")).toBeNull();
    expect(getProductScopedHref("/app/restaurant", "/settings/organization"))
      .toBe("/app/restaurant/settings/organization");
    expect(getProductScopedHref("/app/restaurant", "https://example.com")).toBe("https://example.com");
  });

  it("shows only the active product group while retaining ThinkSales modules in its scope", () => {
    expect(getProductNavigationItems(navigation, "think-service-repairs").map((item) => item.label))
      .toEqual(["Think Service & Repairs"]);
    expect(getProductNavigationItems(navigation, "restaurant").map((item) => item.label))
      .toEqual(["Restaurant"]);
    expect(getProductNavigationItems(navigation, "thinksales-erp").map((item) => item.label))
      .toEqual(["Dashboard", "Sales"]);
  });

  it("keeps configured child permissions when preparing navigation entries", () => {
    const children = [
      { label: "Service Jobs" },
      { label: "Appointments" },
      { label: "Legacy integration", restaurantIntegration: true },
      { label: "Products & Access", alwaysVisible: true },
    ];
    expect(getVisibleNavigationChildren(children, "Think Service & Repairs", [
      "__children:Think Service & Repairs",
      "Think Service & Repairs:Appointments",
    ])).toEqual([children[1], children[2], children[3]]);
  });
});
