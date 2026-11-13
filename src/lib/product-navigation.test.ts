import { describe, expect, it } from "vitest";
import {
  getProductNavigationItems,
  getProductNavigationScope,
  getProductScopedHref,
  getVisibleNavigationChildren,
} from "./product-navigation";
import { NAV_ITEMS } from "@/components/nav/navigation";

const navigation = [
  { label: "Dashboard" },
  { label: "Think Service & Repairs" },
  { label: "Think Education" },
  { label: "Restaurant" },
  { label: "Sales" },
];

describe("product navigation", () => {
  it("uses the current product route to select the navigation scope", () => {
    expect(getProductNavigationScope("/app/think-service/jobs")).toBe("think-service-repairs");
    expect(getProductNavigationScope("/app/think-education/students")).toBe("think-education");
    expect(getProductNavigationScope("/app/restaurant/menu")).toBe("restaurant");
    expect(getProductNavigationScope("/service-center/jobs")).toBe("think-service-repairs");
    expect(getProductNavigationScope("/education/students")).toBe("think-education");
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
    expect(getProductScopedHref("/app/think-education/dashboard", "/education/students"))
      .toBe("/app/think-education/students");
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
    expect(getProductNavigationItems(navigation, "think-education").map((item) => item.label))
      .toEqual(["Think Education"]);
    expect(getProductNavigationItems(navigation, "restaurant").map((item) => item.label))
      .toEqual(["Restaurant"]);
    expect(getProductNavigationItems(navigation, "thinksales-erp").map((item) => item.label))
      .toEqual(["Dashboard", "Sales"]);
  });

  it("organizes Think Education links beneath one product heading", () => {
    const education = NAV_ITEMS.find((item) => item.label === "Think Education");
    const sections = Array.from(new Set(education?.children?.map((child) => child.section)));

    expect(education?.children?.[0].label).toBe("Dashboard");
    expect(sections).toEqual([
      "Overview",
      "Students & Admissions",
      "Teaching & Academics",
      "Campus Operations",
      "Finance",
      "Communication & Records",
      "Administration",
    ]);
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
