import { describe, expect, it } from "vitest";
import { educationGuardianAttendanceHistorySchema } from "./guardian-attendance";

describe("Think Education guardian attendance history", () => {
  it("accepts bounded daily and lesson records", () => {
    expect(educationGuardianAttendanceHistorySchema.safeParse([
      {
        record_id: "00000000-0000-4000-8000-000000000001",
        student_id: "00000000-0000-4000-8000-000000000002",
        attendance_date: "2026-11-24",
        status: "present",
        record_type: "Daily",
        detail: "Grade 5",
      },
      {
        record_id: "00000000-0000-4000-8000-000000000003",
        student_id: "00000000-0000-4000-8000-000000000002",
        attendance_date: "2026-11-24",
        status: "late",
        record_type: "Lesson",
        detail: "Mathematics",
      },
    ]).success).toBe(true);
  });

  it("rejects unknown status values and malformed dates", () => {
    expect(educationGuardianAttendanceHistorySchema.safeParse([{
      record_id: "00000000-0000-4000-8000-000000000001",
      student_id: "00000000-0000-4000-8000-000000000002",
      attendance_date: "not-a-date",
      status: "unknown",
      record_type: "Daily",
      detail: "Grade 5",
    }]).success).toBe(false);
  });
});
