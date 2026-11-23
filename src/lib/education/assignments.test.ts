import { describe, expect, it } from "vitest";
import {
  educationCreateAssignmentSchema,
  educationGradeAssignmentSchema,
  educationSubmitAssignmentSchema,
} from "./assignments";

const classId = "a5bc74b6-e268-441a-a317-4d86f3285d38";
const studentId = "3b8f94d5-822f-4d8c-a73e-8b14bc7c6811";
const secondStudentId = "6a36c169-f8be-4aeb-98bf-e0b2031edddc";

describe("education assignments", () => {
  it("accepts a valid class assignment with selected recipients", () => {
    const result = educationCreateAssignmentSchema.safeParse({
      orgId: "a0d60f66-babd-41cc-963b-63835e89d2bc",
      classId,
      title: "Fractions practice",
      description: "Complete the assigned questions.",
      dueOn: "2026-11-24",
      maxScore: 20,
      studentIds: [studentId, secondStudentId],
    });

    expect(result.success).toBe(true);
  });

  it("rejects impossible dates and duplicate recipients", () => {
    const base = {
      orgId: "a0d60f66-babd-41cc-963b-63835e89d2bc",
      classId,
      title: "Fractions practice",
      description: "",
      maxScore: 20,
      studentIds: [studentId],
    };

    expect(educationCreateAssignmentSchema.safeParse({ ...base, dueOn: "2026-02-30" }).success).toBe(false);
    expect(educationCreateAssignmentSchema.safeParse({
      ...base,
      dueOn: "2026-11-24",
      studentIds: [studentId, studentId],
    }).success).toBe(false);
  });

  it("rejects an empty submission and a grade outside the allowed score range", () => {
    expect(educationSubmitAssignmentSchema.safeParse({
      assignmentId: classId,
      studentId,
      submissionText: "   ",
    }).success).toBe(false);
    expect(educationGradeAssignmentSchema.safeParse({
      submissionId: classId,
      score: -1,
      feedback: "",
    }).success).toBe(false);
  });
});
