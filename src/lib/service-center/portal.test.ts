import { describe, expect, it } from "vitest";
import {
  createServiceRepairPortalToken,
  getServiceRepairPortalBaseUrl,
  getServiceRepairPortalUrl,
  hashServiceRepairPortalToken,
} from "./portal";
import { parseServiceRepairPortalView } from "./portal-view";

describe("service repair portal tokens", () => {
  it("generates a URL-safe bearer token and stores only a SHA-256 hash", () => {
    const { token, tokenHash } = createServiceRepairPortalToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashServiceRepairPortalToken(token)).toBe(tokenHash);
    expect(hashServiceRepairPortalToken("not-a-token")).toBeNull();
  });

  it("only creates portal URLs from HTTPS origins except local development", () => {
    expect(getServiceRepairPortalBaseUrl("https://repairs.example/path")).toBe("https://repairs.example");
    expect(getServiceRepairPortalBaseUrl("http://localhost:3000")).toBe("http://localhost:3000");
    expect(getServiceRepairPortalBaseUrl("http://repairs.example")).toBeNull();
    expect(getServiceRepairPortalBaseUrl("not a url")).toBeNull();
    expect(getServiceRepairPortalUrl("https://repairs.example", "a".repeat(43)))
      .toBe(`https://repairs.example/service-repair/${"a".repeat(43)}`);
  });
});

describe("service repair portal view", () => {
  const validPortalView = {
    jobNumber: "SR-101",
    jobStatus: "awaiting_customer_approval",
    statusHistory: [
      { status: "received", occurredAt: "2026-11-05T10:00:00.000Z" },
      { status: "awaiting_customer_approval", occurredAt: "2026-11-05T11:00:00.000Z" },
    ],
    reportedProblem: "Device does not turn on",
    currency: "GHS",
    equipment: { type: "Phone", brand: "Example", model: "X1" },
    quotation: {
      version: 1,
      status: "sent",
      notes: null,
      subtotal: 100,
      taxRate: 0,
      taxAmount: 0,
      total: 100,
      items: [{ description: "Repair", quantity: 1, unitPrice: 100, lineTotal: 100 }],
    },
    expiresAt: "2026-12-05T00:00:00.000Z",
    canRespond: true,
  };

  it("accepts a safe customer-facing repair snapshot", () => {
    expect(parseServiceRepairPortalView(validPortalView)).not.toBeNull();
  });

  it("rejects malformed or unexpected data rather than rendering it", () => {
    expect(parseServiceRepairPortalView({ ...validPortalView, internalNotes: "private" })).toBeNull();
  });
});
