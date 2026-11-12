import { describe, expect, it } from "vitest";
import { summarizeEducationOutcomes } from "./outcomes";

describe("summarizeEducationOutcomes", () => {
  it("groups published scores by campus and subject with normalized averages and grade counts", () => {
    expect(summarizeEducationOutcomes([
      { branch_id: "campus-a", subject_name: "Math", score: 18, maximum_score: 20, grade: "A" },
      { branch_id: "campus-a", subject_name: "Math", score: 70, maximum_score: 100, grade: "B" },
      { branch_id: "campus-a", subject_name: "English", score: 0, maximum_score: 10, grade: null },
      { branch_id: "campus-b", subject_name: "Math", score: 40, maximum_score: 50, grade: "A" },
    ])).toEqual([
      {
        branch_id: "campus-a",
        subject_name: "English",
        result_count: 1,
        average_percentage: 0,
        grade_counts: { Ungraded: 1 },
      },
      {
        branch_id: "campus-a",
        subject_name: "Math",
        result_count: 2,
        average_percentage: 80,
        grade_counts: { A: 1, B: 1 },
      },
      {
        branch_id: "campus-b",
        subject_name: "Math",
        result_count: 1,
        average_percentage: 80,
        grade_counts: { A: 1 },
      },
    ]);
  });
});
