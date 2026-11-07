import { describe, expect, it } from "vitest";
import {
  AUTOMATIC_SERVICE_UPDATE_STATUSES,
  buildServiceStatusNotification,
  selectConsentedPreferredChannel,
} from "./status-notification";

describe("automatic repair status notifications", () => {
  it("builds messages only for explicitly selected statuses", () => {
    expect(AUTOMATIC_SERVICE_UPDATE_STATUSES).toEqual([
      "received",
      "awaiting_customer_approval",
      "in_progress",
      "awaiting_parts",
      "ready_for_collection",
      "awaiting_payment",
    ]);
    expect(buildServiceStatusNotification("awaiting_customer_approval", "SR-1"))
      .toBe("Repair update for job SR-1: Your repair estimate is ready. Please contact our team to review it and let us know how you would like to proceed.");
    expect(buildServiceStatusNotification("in_progress", "SR-1"))
      .toBe("Repair update for job SR-1: Work on your repair is in progress.");
    expect(buildServiceStatusNotification("closed", "SR-1")).toBeNull();
  });

  it("uses only the preferred channel when it is explicitly consented and not opted out", () => {
    expect(selectConsentedPreferredChannel("WhatsApp", ["SMS", "WhatsApp"], null)).toBe("WhatsApp");
    expect(selectConsentedPreferredChannel("WhatsApp", ["SMS"], null)).toBeNull();
    expect(selectConsentedPreferredChannel("Email", ["Email"], { whatsapp: true, sms: true, email: false })).toBeNull();
    expect(selectConsentedPreferredChannel("In-App Notification", ["SMS"], null)).toBeNull();
  });
});
