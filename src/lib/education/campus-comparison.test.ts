import { describe, expect, it } from "vitest";
import { summarizeEducationCampusComparison } from "./campus-comparison";

describe("summarizeEducationCampusComparison", () => {
  it("compares permitted metrics per campus and excludes excused attendance", () => {
    const rows = summarizeEducationCampusComparison({
      campuses: [
        { id: "campus-b", name: "Beta" },
        { id: "campus-a", name: "Alpha" },
      ],
      applications: [{ branch_id: "campus-a" }, { branch_id: "campus-a" }],
      attendance: [
        { branch_id: "campus-a", status: "present" },
        { branch_id: "campus-a", status: "late" },
        { branch_id: "campus-a", status: "absent" },
        { branch_id: "campus-a", status: "excused" },
        { branch_id: "unassigned-campus", status: "absent" },
      ],
      enrollments: [{ branch_id: "campus-a" }, { branch_id: "unassigned-campus" }],
      outcomes: [
        { branch_id: "campus-a", score: 80, maximum_score: 100 },
        { branch_id: "campus-a", score: 45, maximum_score: 50 },
      ],
      expenses: [
        { branch_id: "campus-a", amount: 12.34 },
        { branch_id: "campus-a", amount: 0.01 },
      ],
    });

    expect(rows).toEqual([
      {
        branch_id: "campus-a",
        campus: "Alpha",
        application_count: 2,
        attendance_rate: 66.67,
        active_enrollment_count: 1,
        average_outcome_percentage: 85,
        approved_expense_total: 12.35,
      },
      {
        branch_id: "campus-b",
        campus: "Beta",
        application_count: 0,
        attendance_rate: null,
        active_enrollment_count: 0,
        average_outcome_percentage: null,
        approved_expense_total: 0,
      },
    ]);
  });

  it("marks metrics unavailable without permission and ignores records outside accessible campuses", () => {
    const rows = summarizeEducationCampusComparison({
      campuses: [{ id: "campus-a", name: "Alpha" }],
      applications: null,
      attendance: null,
      enrollments: null,
      outcomes: null,
      expenses: null,
    });

    expect(rows[0]).toEqual({
      branch_id: "campus-a",
      campus: "Alpha",
      application_count: null,
      attendance_rate: null,
      active_enrollment_count: null,
      average_outcome_percentage: null,
      approved_expense_total: null,
    });
  });
});
