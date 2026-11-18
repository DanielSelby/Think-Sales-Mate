import { describe, expect, it } from "vitest";
import {
  buildAnnouncementSmsContent,
  classifyAnnouncementDelivery,
  sanitizeAnnouncementDeliveryError,
} from "./announcement-messaging";

describe("Think Education announcement messaging", () => {
  it("keeps SMS plain, single-line, and bounded", () => {
    const message = buildAnnouncementSmsContent(
      "North Campus",
      "School closes early",
      `Please collect students at 1pm.\n${"More details ".repeat(50)}`,
    );

    expect(message).toHaveLength(320);
    expect(message).toMatch(/^\[North Campus\] School closes early:/);
    expect(message).not.toMatch(/[\r\n]/);
  });

  it("classifies missing provider configuration separately from delivery errors", () => {
    expect(classifyAnnouncementDelivery({ sent: true, provider: "resend" })).toBe("sent");
    expect(classifyAnnouncementDelivery({ sent: false, provider: "none" })).toBe("unconfigured");
    expect(classifyAnnouncementDelivery({ sent: false, provider: "twilio-sms" })).toBe("failed");
  });

  it("redacts contact details from persisted provider failure reasons", () => {
    expect(sanitizeAnnouncementDeliveryError("Rejected parent@example.org at +1 (415) 555-0199"))
      .toBe("Rejected [redacted email] at [redacted number]");
  });
});
