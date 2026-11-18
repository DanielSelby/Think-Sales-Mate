import { describe, expect, it } from "vitest";
import { findDuplicateEducationStudentNumberRows } from "./student-import";

describe("findDuplicateEducationStudentNumberRows", () => {
  it("finds repeated student numbers regardless of case or surrounding whitespace", () => {
    expect(findDuplicateEducationStudentNumberRows([
      { student_number: "ST-101" },
      { student_number: " st-101 " },
      { student_number: "ST-102" },
      { student_number: "" },
    ])).toEqual(new Set([1]));
  });
});
