import { describe, expect, it } from "vitest";
import { educationStudentProfileInputSchema } from "./student-profile";

const validProfile = {
  studentId: "00000000-0000-4000-8000-000000000001",
  firstName: "Ada",
  lastName: "Lovelace",
  otherNames: "",
  email: " ADA@example.com ",
  phone: "",
  dateOfBirth: "2010-02-28",
  gender: "female",
  homeAddress: "",
};

describe("educationStudentProfileInputSchema", () => {
  it("trims fields and normalizes email", () => {
    const result = educationStudentProfileInputSchema.safeParse(validProfile);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("ada@example.com");
    }
  });

  it("accepts profile details that are stored on the student record and trims them", () => {
    const result = educationStudentProfileInputSchema.safeParse({
      ...validProfile,
      gender: " Female ",
      homeAddress: " 123 Main Street, Accra  ",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.gender).toBe("Female");
      expect(result.data.homeAddress).toBe("123 Main Street, Accra");
    }
  });

  it("rejects malformed or future dates and invalid email addresses", () => {
    expect(educationStudentProfileInputSchema.safeParse({
      ...validProfile,
      email: "not-an-email",
    }).success).toBe(false);
    expect(educationStudentProfileInputSchema.safeParse({
      ...validProfile,
      dateOfBirth: "2025-02-30",
    }).success).toBe(false);
    const futureDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    expect(educationStudentProfileInputSchema.safeParse({
      ...validProfile,
      dateOfBirth: futureDate,
    }).success).toBe(false);
  });

  it("rejects workflow fields outside the editable profile", () => {
    expect(educationStudentProfileInputSchema.safeParse({
      ...validProfile,
      status: "withdrawn",
    }).success).toBe(false);
  });
});
