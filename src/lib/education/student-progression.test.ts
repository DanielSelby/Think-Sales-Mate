import { describe, expect, it } from "vitest";
import {
  educationStudentPromotionInputSchema,
  educationStudentTransferInputSchema,
} from "./student-progression";

describe("education student progression validators", () => {
  it("accepts a valid transfer request and rejects same-campus moves", () => {
    const valid = educationStudentTransferInputSchema.safeParse({
      studentNumber: "ST-101",
      sourceBranchId: "00000000-0000-4000-8000-000000000001",
      destinationBranchId: "00000000-0000-4000-8000-000000000002",
      effectiveOn: "2026-11-20",
      reason: "Family relocation",
    });

    expect(valid.success).toBe(true);
    expect(educationStudentTransferInputSchema.safeParse({
      studentNumber: "ST-101",
      sourceBranchId: "00000000-0000-4000-8000-000000000001",
      destinationBranchId: "00000000-0000-4000-8000-000000000001",
      effectiveOn: "2026-11-20",
      reason: "Family relocation",
    }).success).toBe(false);
  });

  it("requires a destination class when promoting a student", () => {
    expect(educationStudentPromotionInputSchema.safeParse({
      studentId: "00000000-0000-4000-8000-000000000003",
      sourceEnrollmentId: "00000000-0000-4000-8000-000000000004",
      action: "promote",
      destinationClassId: "00000000-0000-4000-8000-000000000005",
    }).success).toBe(true);

    expect(educationStudentPromotionInputSchema.safeParse({
      studentId: "00000000-0000-4000-8000-000000000003",
      sourceEnrollmentId: "00000000-0000-4000-8000-000000000004",
      action: "promote",
      destinationClassId: "",
    }).success).toBe(false);

    expect(educationStudentPromotionInputSchema.safeParse({
      studentId: "00000000-0000-4000-8000-000000000003",
      sourceEnrollmentId: "00000000-0000-4000-8000-000000000004",
      action: "graduate",
      destinationClassId: "",
    }).success).toBe(true);
  });
});
