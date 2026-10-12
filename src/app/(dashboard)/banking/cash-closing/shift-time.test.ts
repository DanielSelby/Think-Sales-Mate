import { describe, expect, it } from "vitest";
import { businessDateForSchedule, getCashClosingPeriod } from "./shift-time";

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
});
