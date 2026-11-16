import { describe, expect, it } from "vitest";
import { educationResultScoreInputSchema } from "./result-score";

const validInput = {
  resultId: "00000000-0000-4000-8000-000000000001",
  score: "0",
  maximumScore: "100",
  gradeOverride: "A",
};

describe("educationResultScoreInputSchema", () => {
  it("accepts boundary scores and normalizes decimal input", () => {
    const result = educationResultScoreInputSchema.safeParse({
      ...validInput,
      score: "99.25",
      maximumScore: "100.00",
      gradeOverride: " A ",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.score).toBe(99.25);
      expect(result.data.gradeOverride).toBe("A");
    }
  });

  it("rejects negative, oversized, excessive-precision, and above-maximum values", () => {
    expect(educationResultScoreInputSchema.safeParse({ ...validInput, score: "-1" }).success).toBe(false);
    expect(educationResultScoreInputSchema.safeParse({ ...validInput, maximumScore: "0" }).success).toBe(false);
    expect(educationResultScoreInputSchema.safeParse({ ...validInput, score: "100.01" }).success).toBe(false);
    expect(educationResultScoreInputSchema.safeParse({ ...validInput, score: "1.234" }).success).toBe(false);
    expect(educationResultScoreInputSchema.safeParse({ ...validInput, score: "100.01", maximumScore: "100" }).success).toBe(false);
  });
});
