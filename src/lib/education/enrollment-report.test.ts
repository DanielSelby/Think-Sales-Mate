import { describe, expect, it } from "vitest";
import { summarizeEducationEnrollments } from "./enrollment-report";

describe("summarizeEducationEnrollments", () => {
  it("counts enrollments by campus, year, class, and lifecycle status", () => {
    const summaries = summarizeEducationEnrollments([
      { branch_id: "campus-b", academic_year_id: "year-1", class_id: "class-1", status: "active" },
      { branch_id: "campus-a", academic_year_id: "year-1", class_id: "class-2", status: "completed" },
      { branch_id: "campus-b", academic_year_id: "year-1", class_id: "class-1", status: "active" },
      { branch_id: "campus-b", academic_year_id: "year-1", class_id: "class-1", status: "withdrawn" },
    ]);

    expect(summaries).toEqual([
      {
        branch_id: "campus-a",
        academic_year_id: "year-1",
        class_id: "class-2",
        status: "completed",
        enrollment_count: 1,
      },
      {
        branch_id: "campus-b",
        academic_year_id: "year-1",
        class_id: "class-1",
        status: "active",
        enrollment_count: 2,
      },
      {
        branch_id: "campus-b",
        academic_year_id: "year-1",
        class_id: "class-1",
        status: "withdrawn",
        enrollment_count: 1,
      },
    ]);
  });
});
