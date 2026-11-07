import { describe, expect, it } from "vitest";
import {
  getProductNavigationItems,
  getProductNavigationScope,
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
    expect(getProductNavigationScope("/service-center/jobs")).toBe("think-service-repairs");
    expect(getProductNavigationScope("/restaurant/pos")).toBe("restaurant");
    expect(getProductNavigationScope("/inventory")).toBe("thinksales-erp");
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
