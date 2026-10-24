import { describe, expect, it } from "vitest";
import { getStorefrontStockQuantity } from "./branch-catalog";

describe("getStorefrontStockQuantity", () => {
  it("uses only the selected branch inventory for a branch storefront", () => {
    expect(getStorefrontStockQuantity({
      organizationStock: 20,
      branchId: "east",
      activeLocationCount: 2,
      visibleLocationIds: ["east", "west"],
      stockLevels: [
        { locationId: "east", quantity: 3 },
        { locationId: "west", quantity: 17 },
      ],
    })).toBe(3);
  });

  it("does not expose a product that has no inventory record at the branch", () => {
    expect(getStorefrontStockQuantity({
      organizationStock: 20,
      branchId: "east",
      activeLocationCount: 2,
      visibleLocationIds: ["east", "west"],
      stockLevels: [{ locationId: "west", quantity: 20 }],
    })).toBeNull();
  });

  it("aggregates inventory from visible branches only", () => {
    expect(getStorefrontStockQuantity({
      organizationStock: 24,
      activeLocationCount: 3,
      visibleLocationIds: ["east", "west"],
      stockLevels: [
        { locationId: "east", quantity: 4 },
        { locationId: "west", quantity: 5 },
        { locationId: "hidden", quantity: 15 },
      ],
    })).toBe(9);
  });

  it("excludes products stocked only at hidden branches", () => {
    expect(getStorefrontStockQuantity({
      organizationStock: 15,
      activeLocationCount: 2,
      visibleLocationIds: ["east"],
      stockLevels: [{ locationId: "hidden", quantity: 15 }],
    })).toBeNull();
  });

  it("preserves organization-wide stock when branch inventory is not tracked", () => {
    expect(getStorefrontStockQuantity({
      organizationStock: 7,
      activeLocationCount: 1,
      visibleLocationIds: ["east"],
      stockLevels: [],
    })).toBe(7);
  });

  it("preserves the legacy catalog when an organization has no active branches", () => {
    expect(getStorefrontStockQuantity({
      organizationStock: 7,
      activeLocationCount: 0,
      visibleLocationIds: [],
      stockLevels: [],
    })).toBe(7);
  });
});
