import { describe, expect, it } from "vitest";
import { buildOrderTrackingTimeline, type OrderTrackingEvent } from "./order-tracking-timeline";

const createdAt = "2026-10-24T10:00:00.000Z";
const makeInput = (overrides: Partial<Parameters<typeof buildOrderTrackingTimeline>[0]> = {}) => ({
  status: "new",
  paymentStatus: "unpaid",
  deliveryStatus: "not_shipped",
  deliveryOption: "Standard Delivery",
  stockReserved: false,
  createdAt,
  updatedAt: createdAt,
  events: [{ title: "Order Created", actorName: "Customer", status: "completed", notes: null, createdAt }] as OrderTrackingEvent[],
  ...overrides,
});

describe("buildOrderTrackingTimeline", () => {
  it("shows only payment when paid and marks the approval step current for a new order", () => {
    const stages = buildOrderTrackingTimeline(makeInput({ paymentStatus: "paid" }));

    expect(stages.map((stage) => stage.title)).toEqual([
      "Order Created",
      "Payment Received",
      "Order Approved",
      "Picking",
      "Packing",
      "Out for Delivery",
      "Delivered",
    ]);
    expect(stages.find((stage) => stage.title === "Order Approved")?.state).toBe("current");
  });

  it("uses the pickup path instead of delivery stages", () => {
    const stages = buildOrderTrackingTimeline(makeInput({
      status: "packing",
      deliveryOption: "Pickup / In-Store Collection",
    }));

    expect(stages.map((stage) => stage.title)).toContain("Ready for Pickup");
    expect(stages.map((stage) => stage.title)).not.toContain("Out for Delivery");
  });

  it("shows actual history and a terminal cancellation event without future fulfillment stages", () => {
    const cancellation: OrderTrackingEvent = {
      title: "Order Cancelled / Rejected",
      actorName: "Staff",
      status: "completed",
      notes: "Reason: unavailable",
      createdAt: "2026-10-24T11:00:00.000Z",
    };
    const stages = buildOrderTrackingTimeline(makeInput({
      status: "cancelled",
      events: [
        { title: "Order Created", actorName: "Customer", status: "completed", notes: null, createdAt },
        cancellation,
      ],
    }));

    expect(stages.map((stage) => stage.title)).toEqual(["Order Created", "Order Cancelled / Rejected"]);
    expect(stages[1].state).toBe("terminal");
    expect(stages.some((stage) => stage.title === "Delivered")).toBe(false);
  });

  it("adds a return terminal event when the timeline does not contain one", () => {
    const stages = buildOrderTrackingTimeline(makeInput({ status: "returned" }));

    expect(stages.at(-1)?.title).toBe("Order Returned");
    expect(stages.at(-1)?.state).toBe("terminal");
  });
});
