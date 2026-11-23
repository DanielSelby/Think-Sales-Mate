import { describe, expect, it } from "vitest";
import {
  getProductNavigationItems,
  getProductNavigationScope,
  getProductScopedHref,
  getVisibleNavigationChildren,
} from "./product-navigation";
import { NAV_ITEMS } from "@/components/nav/navigation";

const navigation = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Think Service & Repairs", href: "/service-center" },
  { label: "Think Education", href: "/education/dashboard" },
  { label: "Restaurant", href: "/restaurant" },
  { label: "Sales", href: "/sales" },
];

describe("product navigation", () => {
  it("uses the current product route to select the navigation scope", () => {
    expect(getProductNavigationScope("/app/think-service/jobs")).toBe("think-service-repairs");
    expect(getProductNavigationScope("/app/think-education/students")).toBe("think-education");
    expect(getProductNavigationScope("/app/restaurant/menu")).toBe("restaurant");
    expect(getProductNavigationScope("/service-center/jobs")).toBe("think-service-repairs");
    expect(getProductNavigationScope("/education/students")).toBe("think-education");
    expect(getProductNavigationScope("/app/think-education/support")).toBe("think-education");
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
    expect(getProductScopedHref("/app/think-education/dashboard", "/support"))
      .toBe("/app/think-education/support");
    expect(getProductScopedHref("/education/dashboard", "/support"))
      .toBe("/app/think-education/support");
    expect(getProductScopedHref("/app/restaurant", "/inventory")).toBeNull();
    expect(getProductScopedHref("/app/restaurant", "/app/thinksales/inventory")).toBeNull();
    expect(getProductScopedHref("/app/restaurant", "/app/unknown/page")).toBeNull();
    expect(getProductScopedHref("/app/restaurant", "/settings/organization"))
      .toBe("/app/restaurant/settings/organization");
    expect(getProductScopedHref("/app/restaurant", "https://example.com")).toBe("https://example.com");
    expect(getProductScopedHref("/app/think-education/dashboard", "/hrm/attendance"))
      .toBe("/app/think-education/hrm/attendance");
    expect(getProductScopedHref("/app/think-service", "/hrm/attendance"))
      .toBe("/app/think-service/hrm/attendance");
  });

  it("preserves each active product when opening support", () => {
    const productRoutes = [
      { pathname: "/app/thinksales/dashboard", scope: "thinksales-erp", expected: "/app/thinksales/support" },
      { pathname: "/app/restaurant/menu", scope: "restaurant", expected: "/app/restaurant/support" },
      { pathname: "/app/think-service/jobs", scope: "think-service-repairs", expected: "/app/think-service/support" },
      { pathname: "/app/think-education/dashboard", scope: "think-education", expected: "/app/think-education/support" },
    ] as const;

    for (const { pathname, scope, expected } of productRoutes) {
      expect(getProductScopedHref(pathname, "/support")).toBe(expected);
      expect(getProductNavigationScope(expected)).toBe(scope);
    }

    expect(getProductScopedHref("/dashboard", "/support")).toBe("/app/thinksales/support");
    expect(getProductScopedHref("/restaurant/menu", "/support")).toBe("/app/restaurant/support");
    expect(getProductScopedHref("/service-center/jobs", "/support")).toBe("/app/think-service/support");
    expect(getProductScopedHref("/education/dashboard", "/support")).toBe("/app/think-education/support");
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

  it("adds the shared attendance entry to every non-ThinkSales product navigation", () => {
    const items = [
      ...navigation,
      { label: "Attendance Management", href: "/hrm/attendance", status: "live" as const, alwaysVisible: true },
    ];
    for (const scope of ["restaurant", "think-service-repairs", "think-education"] as const) {
      expect(getProductNavigationItems(items, scope)[0]).toMatchObject({
        label: "Attendance Management",
        href: "/hrm/attendance",
        alwaysVisible: true,
      });
    }
    expect(getProductNavigationItems(items, "thinksales-erp")).toContainEqual(
      expect.objectContaining({ label: "Attendance Management", href: "/hrm/attendance", alwaysVisible: true })
    );
  });

  it("organizes Think Education links beneath one product heading", () => {
    const education = NAV_ITEMS.find((item) => item.label === "Think Education");
    const sections = Array.from(new Set(education?.children?.map((child) => child.section)));
    const accounting = education?.children?.find((child) => child.label === "Accounting");

    expect(education?.children?.[0].label).toBe("Dashboard");
    expect(accounting).toMatchObject({
      href: "/education/accounting",
      section: "Finance",
      alwaysVisible: true,
    });
    expect(getProductScopedHref("/app/think-education/dashboard", accounting?.href ?? ""))
      .toBe("/app/think-education/accounting");
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
      { label: "Service Jobs", href: "/service-center/jobs" },
      { label: "Appointments", href: "/service-center/appointments" },
      { label: "Legacy integration", href: "/legacy", restaurantIntegration: true },
      { label: "Products & Access", href: "/settings/products", alwaysVisible: true },
    ];
    expect(getVisibleNavigationChildren(children, "Think Service & Repairs", [
      "__children:Think Service & Repairs",
      "Think Service & Repairs:Appointments",
    ])).toEqual([children[1], children[2], children[3]]);
  });
});
