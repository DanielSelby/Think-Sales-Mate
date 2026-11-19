import { describe, expect, it } from "vitest";
import { calculateEducationClassPosition } from "./class-position";

describe("calculateEducationClassPosition", () => {
  it("ranks students using published scores for the same subject set", () => {
    const position = calculateEducationClassPosition([
      { student_id: "student-a", subject_name: "Math", score: 80, maximum_score: 100 },
      { student_id: "student-a", subject_name: "English", score: 70, maximum_score: 100 },
      { student_id: "student-b", subject_name: "Math", score: 90, maximum_score: 100 },
      { student_id: "student-b", subject_name: "English", score: 80, maximum_score: 100 },
      { student_id: "student-c", subject_name: "Math", score: 100, maximum_score: 100 },
    ], "student-a");

    expect(position).toEqual({ position: 2, cohortSize: 2 });
  });

  it("returns no position when there is no comparable class cohort", () => {
    expect(calculateEducationClassPosition([
      { student_id: "student-a", subject_name: "Math", score: 80, maximum_score: 100 },
      { student_id: "student-b", subject_name: "English", score: 90, maximum_score: 100 },
    ], "student-a")).toBeNull();
    expect(calculateEducationClassPosition([], "student-a")).toBeNull();
  });

  it("gives tied scores the same competition position", () => {
    const results = [
      { student_id: "student-a", subject_name: "Math", score: 80, maximum_score: 100 },
      { student_id: "student-b", subject_name: "Math", score: 80, maximum_score: 100 },
      { student_id: "student-c", subject_name: "Math", score: 60, maximum_score: 100 },
    ];
    expect(calculateEducationClassPosition(results, "student-a")).toEqual({ position: 1, cohortSize: 3 });
    expect(calculateEducationClassPosition(results, "student-b")).toEqual({ position: 1, cohortSize: 3 });
    expect(calculateEducationClassPosition(results, "student-c")).toEqual({ position: 3, cohortSize: 3 });
  });
});
