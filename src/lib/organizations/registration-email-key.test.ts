import { describe, expect, it } from "vitest";
import { registrationEmailKey } from "./registration-email-key";

describe("registration email idempotency keys", () => {
  it("normalizes recipient addresses for the same event", () => {
    expect(registrationEmailKey("submitted", "org-1", " Admin@Example.com "))
      .toBe(registrationEmailKey("submitted", "org-1", "admin@example.com"));
  });

  it("keeps separate information requests as separate deliveries", () => {
    const firstRequest = registrationEmailKey("information-requested:request-1", "org-1", "admin@example.com");
    const secondRequest = registrationEmailKey("information-requested:request-2", "org-1", "admin@example.com");

    expect(firstRequest).not.toBe(secondRequest);
  });
});
