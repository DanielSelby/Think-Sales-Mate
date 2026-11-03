import { describe, expect, it } from "vitest";
import { getOrganizationExpiryStatus, isValidOrganizationExpiryDate } from "./organization-access-expiry";

describe("organization access expiry", () => {
  it("validates calendar dates without accepting normalized invalid dates", () => {
    expect(isValidOrganizationExpiryDate("2026-02-28")).toBe(true);
    expect(isValidOrganizationExpiryDate("2026-02-30")).toBe(false);
    expect(isValidOrganizationExpiryDate("2026-2-03")).toBe(false);
  });

  it("keeps access through the expiry date in UTC", () => {
    expect(getOrganizationExpiryStatus("2026-06-10", new Date("2026-06-10T23:59:59.000Z")))
      .toEqual({ expired: false, daysRemaining: 0 });
  });

  it("expires access on the UTC day after the configured date", () => {
    expect(getOrganizationExpiryStatus("2026-06-10", new Date("2026-06-11T00:00:00.000Z")))
      .toEqual({ expired: true, daysRemaining: -1 });
  });

  it("reports the seven-day warning window", () => {
    expect(getOrganizationExpiryStatus("2026-06-17", new Date("2026-06-10T12:00:00.000Z")).daysRemaining)
      .toBe(7);
    expect(getOrganizationExpiryStatus("2026-06-18", new Date("2026-06-10T12:00:00.000Z")).daysRemaining)
      .toBe(8);
  });

  it("leaves access unexpired when no organization date is configured", () => {
    expect(getOrganizationExpiryStatus(null, new Date("2026-06-10T00:00:00.000Z")))
      .toEqual({ expired: false, daysRemaining: null });
  });

  it("rejects malformed dates from persisted data", () => {
    expect(() => getOrganizationExpiryStatus("2026-02-30", new Date("2026-02-01T00:00:00.000Z")))
      .toThrow("Organization access expiry date is invalid.");
  });
});
