import { describe, expect, it } from "vitest";
import { parseServiceRepairPortalView } from "./portal-view";

const validView = {
  jobNumber: "SR-1001",
  jobStatus: "awaiting_customer_approval",
  statusHistory: [
    { status: "received", occurredAt: "2026-11-05T10:00:00+00:00" },
    { status: "awaiting_customer_approval", occurredAt: "2026-11-05T11:00:00+00:00" },
  ],
  reportedProblem: "Device does not power on.",
  currency: "GHS",
  equipment: { type: "Phone", brand: "Example", model: "A1" },
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
  expiresAt: "2026-12-05T10:00:00+00:00",
  canRespond: true,
};

describe("customer repair portal view", () => {
  it("accepts a view with status-only progress history", () => {
    expect(parseServiceRepairPortalView(validView)?.statusHistory).toEqual(validView.statusHistory);
  });

  it("rejects unknown repair statuses in the timeline", () => {
    expect(parseServiceRepairPortalView({
      ...validView,
      statusHistory: [{ status: "internal_note", occurredAt: "2026-11-05T10:00:00+00:00" }],
    })).toBeNull();
  });

  it("rejects malformed timeline timestamps", () => {
    expect(parseServiceRepairPortalView({
      ...validView,
      statusHistory: [{ status: "received", occurredAt: "not-a-date" }],
    })).toBeNull();
  });

  it("rejects timelines larger than the server response limit", () => {
    expect(parseServiceRepairPortalView({
      ...validView,
      statusHistory: Array.from({ length: 51 }, () => validView.statusHistory[0]),
    })).toBeNull();
  });
});
