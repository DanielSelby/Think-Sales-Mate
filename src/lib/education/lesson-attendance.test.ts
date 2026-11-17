import { describe, expect, it } from "vitest";
import {
  educationLessonAttendanceInputSchema,
  getEducationISOWeekday,
  isValidEducationAttendanceDate,
} from "./lesson-attendance";

describe("Think Education lesson attendance", () => {
  it("accepts valid lesson attendance records", () => {
    expect(educationLessonAttendanceInputSchema.safeParse({
      timetableEntryId: "11111111-1111-4111-8111-111111111111",
      studentId: "22222222-2222-4222-8222-222222222222",
      attendanceDate: "2026-11-16",
      status: "present",
      note: "",
    }).success).toBe(true);
  });

  it("rejects impossible dates and unsupported statuses", () => {
    expect(isValidEducationAttendanceDate("2026-02-30")).toBe(false);
    expect(educationLessonAttendanceInputSchema.safeParse({
      timetableEntryId: "11111111-1111-4111-8111-111111111111",
      studentId: "22222222-2222-4222-8222-222222222222",
      attendanceDate: "2026-11-16",
      status: "holiday",
      note: "",
    }).success).toBe(false);
  });

  it("maps calendar dates to ISO weekdays used by timetable entries", () => {
    expect(getEducationISOWeekday("2026-11-16")).toBe(1);
    expect(getEducationISOWeekday("2026-11-22")).toBe(7);
    expect(getEducationISOWeekday("invalid")).toBeNull();
  });
});
