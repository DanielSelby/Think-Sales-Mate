import { describe, expect, it } from "vitest";
import { aiLocationScope, canReadAiBusinessModule } from "@/lib/ai/access";

describe("AI business-data access", () => {
  it("requires the requested module's explicit view permission except for owners", () => {
    const permissions = { sales: ["view"], inventory: [] } as const;
    expect(canReadAiBusinessModule("manager", permissions, "sales")).toBe(true);
    expect(canReadAiBusinessModule("manager", permissions, "inventory")).toBe(false);
    expect(canReadAiBusinessModule("owner", {}, "hrm_payroll")).toBe(true);
  });

  it("restricts branch-scoped reads to the resolved assigned locations", () => {
    expect(aiLocationScope({
      isBranchScoped: true,
      allowedLocationIds: ["location-a", "location-b"],
    })).toEqual(["location-a", "location-b"]);
    expect(aiLocationScope({
      isBranchScoped: true,
      allowedLocationIds: ["__no_assigned_location__"],
    })).toEqual(["__no_assigned_location__"]);
    expect(aiLocationScope({
      isBranchScoped: false,
      allowedLocationIds: [],
    })).toBeUndefined();
  });
});
