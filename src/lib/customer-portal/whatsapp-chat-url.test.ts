import { describe, expect, it } from "vitest";
import { buildWhatsAppChatUrl } from "./whatsapp-chat-url";

describe("buildWhatsAppChatUrl", () => {
  it("creates a direct chat link with the configured prefilled message", () => {
    expect(buildWhatsAppChatUrl("+1 (555) 123-4567", "Hello, I need help."))
      .toBe("https://wa.me/15551234567?text=Hello%2C%20I%20need%20help.");
  });

  it("uses the default greeting when no custom message is configured", () => {
    expect(buildWhatsAppChatUrl("15551234567", null))
      .toBe("https://wa.me/15551234567?text=Hello%2C%20I%20have%20a%20question%20about%20your%20products.");
  });

  it("does not create a link for missing or invalid numbers", () => {
    expect(buildWhatsAppChatUrl(null, "Hello")).toBeNull();
    expect(buildWhatsAppChatUrl("1234", "Hello")).toBeNull();
  });
});
