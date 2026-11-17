import { describe, expect, it } from "vitest";
import { summarizeEducationStaffAttendance } from "./staff-attendance-report";

describe("summarizeEducationStaffAttendance", () => {
  it("groups staff attendance counts by campus and status", () => {
    expect(summarizeEducationStaffAttendance([
      { branch_id: "campus-b", staff_id: "staff-2", status: "late" },
      { branch_id: "campus-a", staff_id: "staff-1", status: "present" },
      { branch_id: "campus-b", staff_id: "staff-2", status: "present" },
      { branch_id: "campus-a", staff_id: "staff-1", status: "absent" },
      { branch_id: "campus-a", staff_id: "staff-2", status: "excused" },
    ])).toEqual([
      {
        branch_id: "campus-a",
        staff_id: "staff-1",
        present_count: 1,
        absent_count: 1,
        late_count: 0,
        excused_count: 0,
        total_records: 2,
      },
      {
        branch_id: "campus-a",
        staff_id: "staff-2",
        present_count: 0,
        absent_count: 0,
        late_count: 0,
        excused_count: 1,
        total_records: 1,
      },
      {
        branch_id: "campus-b",
        staff_id: "staff-2",
        present_count: 1,
        absent_count: 0,
        late_count: 1,
        excused_count: 0,
        total_records: 2,
      },
    ]);
  });

  it("returns no rows for an empty period", () => {
    expect(summarizeEducationStaffAttendance([])).toEqual([]);
  });
});
