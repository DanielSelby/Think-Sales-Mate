import { describe, expect, it } from "vitest";
import {
  getActiveEducationSubject,
  isValidEducationSubjectName,
  type EducationSubject,
} from "./subjects";

describe("education subject catalog", () => {
  it("accepts exact nonblank names without normalizing their whitespace", () => {
    expect(isValidEducationSubjectName("  Mathematics ")).toBe(true);
    expect(isValidEducationSubjectName(" \t ")).toBe(false);
    expect(isValidEducationSubjectName("")).toBe(false);
    expect(isValidEducationSubjectName("x".repeat(121))).toBe(false);
  });

  it("resolves only active subject IDs and preserves the canonical name", () => {
    const subjects: EducationSubject[] = [
      { id: "active-id", name: "  Mathematics ", status: "active" },
      { id: "inactive-id", name: "Science", status: "inactive" },
    ];

    expect(getActiveEducationSubject(subjects, "active-id")).toEqual(subjects[0]);
    expect(getActiveEducationSubject(subjects, "inactive-id")).toBeNull();
    expect(getActiveEducationSubject(subjects, "another-org-id")).toBeNull();
  });
});
