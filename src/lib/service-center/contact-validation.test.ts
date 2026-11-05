import { describe, expect, it } from "vitest";
import { parseServiceContact } from "./contact-validation";

describe("parseServiceContact", () => {
  it("parses and trims a valid customer contact record", () => {
    expect(parseServiceContact({
      direction: "outgoing",
      method: "phone",
      outcome: "left_message",
      details: "  Asked the customer to call back.  ",
    })).toEqual({
      ok: true,
      contact: {
        direction: "outgoing",
        method: "phone",
        outcome: "left_message",
        details: "Asked the customer to call back.",
      },
    });
  });

  it("rejects unknown enum values and empty or oversized details", () => {
    expect(parseServiceContact({
      direction: "sideways",
      method: "phone",
      outcome: "completed",
      details: "Reached the customer.",
    })).toMatchObject({ ok: false });
    expect(parseServiceContact({
      direction: "incoming",
      method: "fax",
      outcome: "completed",
      details: "Reached the customer.",
    })).toMatchObject({ ok: false });
    expect(parseServiceContact({
      direction: "incoming",
      method: "email",
      outcome: "completed",
      details: "  ",
    })).toMatchObject({ ok: false });
    expect(parseServiceContact({
      direction: "incoming",
      method: "email",
      outcome: "completed",
      details: "x".repeat(2001),
    })).toMatchObject({ ok: false });
  });
});
