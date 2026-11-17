import { describe, expect, it } from "vitest";
import { educationStudentConsentInputSchema } from "./student-consent";

const validInput = {
  studentId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  consentType: "photo.media",
  disclosureVersion: "media-disclosure-2026-01",
  decision: "granted",
  signerName: "Taylor Guardian",
  signerRelationship: "Guardian",
  evidenceNote: "Signed form filed in the student record.",
};

describe("educationStudentConsentInputSchema", () => {
  it("accepts a consent event that references a disclosure managed by the school", () => {
    expect(educationStudentConsentInputSchema.safeParse(validInput).success).toBe(true);
  });

  it("rejects invalid consent keys and incomplete signer evidence", () => {
    expect(educationStudentConsentInputSchema.safeParse({
      ...validInput,
      consentType: "Photo consent",
      signerName: " ",
    }).success).toBe(false);
  });
});
