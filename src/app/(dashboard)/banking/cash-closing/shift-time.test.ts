import { describe, expect, it } from "vitest";
import { businessDateForSchedule, findMissedCashClosings, getCashClosingPeriod } from "./shift-time";

describe("cash closing shift periods", () => {
  it("attributes an active overnight shift to the date it started", () => {
    const schedule = {
      requiredShifts: ["night"],
      shiftWindows: { night: { start: "22:00", end: "06:00" } },
    };

    expect(businessDateForSchedule(
      new Date("2026-06-10T08:00:00.000Z"),
      "America/Los_Angeles",
      schedule.requiredShifts,
      schedule.shiftWindows,
    )).toBe("2026-06-09");

    expect(businessDateForSchedule(
      new Date("2026-06-10T13:00:00.000Z"),
      "America/Los_Angeles",
      schedule.requiredShifts,
      schedule.shiftWindows,
    )).toBe("2026-06-10");
  });

  it("converts a full local day across daylight-saving time", () => {
    const { start, end } = getCashClosingPeriod("2026-03-08", "full_day", "America/Los_Angeles");

    expect(end.getTime() - start.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it("keeps an unclosed prior business date outstanding after the next day is closed", () => {
    const missed = findMissedCashClosings({
      startDate: "2026-06-09",
      endDate: "2026-06-10",
      requiredShifts: ["full_day"],
      shiftWindows: {},
      timeZone: "UTC",
      now: new Date("2026-06-11T12:00:00.000Z"),
      closings: [{ closingDate: "2026-06-10", shift: "full_day", status: "approved" }],
      acknowledgements: [],
    });

    expect(missed).toEqual([{ closingDate: "2026-06-09", shift: "full_day" }]);
  });

  it("stops listing a missed closing after it is acknowledged", () => {
    const missed = findMissedCashClosings({
      startDate: "2026-06-09",
      endDate: "2026-06-10",
      requiredShifts: ["full_day"],
      shiftWindows: {},
      timeZone: "UTC",
      now: new Date("2026-06-11T12:00:00.000Z"),
      closings: [{ closingDate: "2026-06-10", shift: "full_day", status: "approved" }],
      acknowledgements: [{ closingDate: "2026-06-09", shift: "full_day" }],
    });

    expect(missed).toEqual([]);
  });
});
