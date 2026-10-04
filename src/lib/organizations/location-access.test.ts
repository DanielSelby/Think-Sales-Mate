import { describe, expect, it } from "vitest";
import type { CurrentOrgContext } from "./current";
import { canAccessLocation, canUseLocation, getPosRegisterLocation } from "./location-access";

function makeContext(overrides: Partial<CurrentOrgContext> = {}): CurrentOrgContext {
  return {
    userId: "user-1",
    userEmail: "user@example.com",
    orgId: "org-1",
    orgName: "Example",
    currency: "USD",
    role: "staff",
    branchScope: "assigned",
    locationId: "branch-a",
    secondaryLocationIds: ["branch-b"],
    canViewOtherTransactions: false,
    canCheckCrossBranchStock: false,
    accessPermissions: {},
    priceGroups: ["retail"],
    useSystemPrices: true,
    isBranchScoped: true,
    allowedLocationIds: ["branch-a", "branch-b"],
    masterLocationId: null,
    memberships: [],
    ...overrides,
  };
}

describe("branch-scoped location access", () => {
  it("allows primary and secondary assigned branches", () => {
    const context = makeContext();

    expect(canAccessLocation(context, "branch-a")).toBe(true);
    expect(canAccessLocation(context, "branch-b")).toBe(true);
    expect(canUseLocation(context, "branch-b")).toBe(true);
  });

  it("denies unassigned, missing, and null locations to scoped users", () => {
    const context = makeContext();

    expect(canAccessLocation(context, "branch-c")).toBe(false);
    expect(canAccessLocation(context, null)).toBe(false);
    expect(canUseLocation(context, undefined)).toBe(false);
  });

  it("allows any organization branch for all-branch users", () => {
    const context = makeContext({
      branchScope: "all",
      isBranchScoped: false,
      allowedLocationIds: [],
      locationId: null,
    });

    expect(canAccessLocation(context, "branch-c")).toBe(true);
    expect(canUseLocation(context, null)).toBe(true);
  });

  it("selects the assigned primary branch for a scoped user", () => {
    const context = makeContext();
    const locations = [{ id: "branch-a" }, { id: "branch-b" }];

    expect(getPosRegisterLocation(context, locations)).toEqual({ id: "branch-a" });
    expect(getPosRegisterLocation(makeContext({ locationId: "branch-c" }), locations)).toBeNull();
  });

  it("prefers the requested master branch for an all-branch user", () => {
    const context = makeContext({
      branchScope: "all",
      isBranchScoped: false,
      locationId: null,
      allowedLocationIds: [],
      masterLocationId: "branch-b",
    });
    const locations = [{ id: "branch-a" }, { id: "branch-b" }];

    expect(getPosRegisterLocation(context, locations)).toEqual({ id: "branch-b" });
    expect(getPosRegisterLocation({ ...context, masterLocationId: null }, locations)).toEqual({ id: "branch-a" });
  });
});
