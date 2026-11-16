import { describe, expect, it } from "vitest";
import { getEducationAutomaticGrade, getEducationResultGrade } from "./grading";

const bands = [
  { label: "A", minimumPercentage: 80 },
  { label: "F", minimumPercentage: 0 },
  { label: "B", minimumPercentage: 60 },
];

describe("getEducationAutomaticGrade", () => {
  it("uses the zero threshold, inclusive boundaries, and includes 100 in the top band", () => {
    expect(getEducationAutomaticGrade(0, 100, bands)).toBe("F");
    expect(getEducationAutomaticGrade(60, 100, bands)).toBe("B");
    expect(getEducationAutomaticGrade(80, 100, bands)).toBe("A");
    expect(getEducationAutomaticGrade(100, 100, bands)).toBe("A");
  });

  it("returns no grade for incomplete or invalid grade scales", () => {
    expect(getEducationAutomaticGrade(50, 100, [])).toBeNull();
    expect(getEducationAutomaticGrade(50, 100, [{ label: "B", minimumPercentage: 50 }])).toBeNull();
    expect(getEducationAutomaticGrade(50, 100, [
      { label: "F", minimumPercentage: 0 },
      { label: "B", minimumPercentage: 100.01 },
    ])).toBeNull();
    expect(getEducationAutomaticGrade(50, 100, [
      { label: "F", minimumPercentage: 0 },
      { label: "B", minimumPercentage: 0 },
    ])).toBeNull();
    expect(getEducationAutomaticGrade(101, 100, bands)).toBeNull();
  });
});

describe("getEducationResultGrade", () => {
  it("preserves a manual override instead of the automatic grade", () => {
    expect(getEducationResultGrade("  Pass  ", 20, 100, bands)).toBe("Pass");
  });

  it("calculates a grade only when the override is blank and a complete scale exists", () => {
    expect(getEducationResultGrade("", 60, 100, bands)).toBe("B");
    expect(getEducationResultGrade(" ", 60, 100, [])).toBeNull();
  });
});
