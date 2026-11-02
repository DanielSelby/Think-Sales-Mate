import { describe, expect, it, vi } from "vitest";
import { getEntitlementRetryAt, processEntitlementEvents } from "./product-entitlement-sync";

describe("product entitlement outbox retries", () => {
  it("records failures for retry and processes successful events", async () => {
    const apply = vi.fn(async (event: { id: string }) => {
      if (event.id === "retry-me") throw new Error("projection unavailable");
    });
    const markProcessed = vi.fn(async () => {});
    const markFailed = vi.fn(async () => {});

    await expect(processEntitlementEvents(
      [{ id: "retry-me", attempts: 0 }, { id: "complete", attempts: 2 }],
      apply,
      markProcessed,
      markFailed,
    )).rejects.toThrow("retry-me: projection unavailable");

    expect(apply).toHaveBeenCalledTimes(2);
    expect(markProcessed).toHaveBeenCalledTimes(1);
    expect(markFailed).toHaveBeenCalledTimes(1);
    expect(markFailed).toHaveBeenCalledWith(
      { id: "retry-me", attempts: 0 },
      "projection unavailable",
    );
  });

  it("surfaces failures to persist retry state instead of hiding them", async () => {
    await expect(processEntitlementEvents(
      [{ id: "retry-state-error", attempts: 0 }],
      async () => { throw new Error("projection failed"); },
      async () => {},
      async () => { throw new Error("outbox update failed"); },
    )).rejects.toThrow("retry-state-error: projection failed; retry state update failed: outbox update failed");
  });

  it("returns a processed count when every event is applied", async () => {
    const result = await processEntitlementEvents(
      [{ id: "first", attempts: 0 }, { id: "second", attempts: 0 }],
      async () => {},
      async () => {},
      async () => {},
    );

    expect(result).toEqual({ processed: 2 });
  });

  it("uses a bounded exponential retry delay", () => {
    const now = new Date("2026-11-02T12:00:00.000Z");

    expect(getEntitlementRetryAt(1, now)).toBe("2026-11-02T12:00:05.000Z");
    expect(getEntitlementRetryAt(2, now)).toBe("2026-11-02T12:00:10.000Z");
    expect(getEntitlementRetryAt(100, now)).toBe("2026-11-02T13:00:00.000Z");
  });
});
