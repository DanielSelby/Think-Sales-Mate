import { describe, expect, it } from "vitest";
import { parseServiceIntake } from "./intake-validation";

describe("parseServiceIntake", () => {
  it("trims intake data and filters blank accessory lines", () => {
    expect(parseServiceIntake({
      conditionOnArrival: "  Screen cracked  ",
      accessories: "Charger\n\n Carry case ",
      confirmedBy: "  Alex Customer ",
      confirmedAs: "customer",
      acknowledged: "on",
    })).toEqual({
      ok: true,
      intake: {
        conditionOnArrival: "Screen cracked",
        accessories: ["Charger", "Carry case"],
        confirmedBy: "Alex Customer",
        confirmedAs: "customer",
      },
    });
  });

  it("requires the intake acknowledgment and valid accessory limits", () => {
    const valid = {
      conditionOnArrival: "Operational",
      accessories: "",
      confirmedBy: "Customer",
      confirmedAs: "customer",
      acknowledged: "on",
    };
    expect(parseServiceIntake({ ...valid, acknowledged: "" })).toMatchObject({ ok: false });
    expect(parseServiceIntake({ ...valid, accessories: Array.from({ length: 21 }, () => "Item").join("\n") })).toMatchObject({ ok: false });
    expect(parseServiceIntake({ ...valid, conditionOnArrival: "" })).toMatchObject({ ok: false });
  });
});
