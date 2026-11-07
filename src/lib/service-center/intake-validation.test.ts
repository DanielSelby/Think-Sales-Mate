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
      customerUpdateChannels: ["WhatsApp", "SMS", "WhatsApp"],
      customerUpdateConsentAcknowledged: "on",
    })).toEqual({
      ok: true,
      intake: {
        conditionOnArrival: "Screen cracked",
        accessories: ["Charger", "Carry case"],
        confirmedBy: "Alex Customer",
        confirmedAs: "customer",
        customerUpdateChannels: ["WhatsApp", "SMS"],
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
      customerUpdateChannels: [],
      customerUpdateConsentAcknowledged: "",
    };
    expect(parseServiceIntake({ ...valid, acknowledged: "" })).toMatchObject({ ok: false });
    expect(parseServiceIntake({ ...valid, accessories: Array.from({ length: 21 }, () => "Item").join("\n") })).toMatchObject({ ok: false });
    expect(parseServiceIntake({ ...valid, conditionOnArrival: "" })).toMatchObject({ ok: false });
  });

  it("requires affirmative consent when update channels are selected", () => {
    const valid = {
      conditionOnArrival: "Operational",
      accessories: "",
      confirmedBy: "Customer",
      confirmedAs: "customer",
      acknowledged: "on",
      customerUpdateChannels: ["Email"],
      customerUpdateConsentAcknowledged: "",
    };
    expect(parseServiceIntake(valid)).toMatchObject({ ok: false });
    expect(parseServiceIntake({ ...valid, customerUpdateConsentAcknowledged: "on" })).toMatchObject({
      ok: true,
      intake: { customerUpdateChannels: ["Email"] },
    });
    expect(parseServiceIntake({ ...valid, customerUpdateChannels: ["Push"] })).toMatchObject({ ok: false });
  });
});
