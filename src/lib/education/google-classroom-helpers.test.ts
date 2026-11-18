import { describe, expect, it } from "vitest";
import {
  normalizeEducationEmail,
  parseGoogleEducationEncryptionKey,
  previewGoogleClassroomRoster,
} from "./google-classroom-helpers";

describe("Google Classroom roster matching", () => {
  it("normalizes email and matches only active students supplied for the mapped campus", () => {
    const preview = previewGoogleClassroomRoster([
      { userId: "google-1", emailAddress: "  LEARNER@example.com ", fullName: "Google Learner" },
      { userId: "google-2", emailAddress: "elsewhere@example.com", fullName: "No match" },
      { userId: "google-3", fullName: "Private email" },
    ], [
      {
        id: "student-1",
        email: "learner@example.com",
        first_name: "Existing",
        last_name: "Student",
        student_number: "ST-1",
        status: "active",
      },
      {
        id: "student-2",
        email: "elsewhere@example.com",
        first_name: "Inactive",
        last_name: "Student",
        student_number: "ST-2",
        status: "withdrawn",
      },
    ]);

    expect(preview.matched).toMatchObject([{ studentId: "student-1", email: "learner@example.com" }]);
    expect(preview.unmatched).toHaveLength(2);
    expect(preview.ambiguous).toHaveLength(0);
    expect(normalizeEducationEmail("Not an email")).toBeNull();
  });

  it("blocks matches when either the Google roster or active Education records are ambiguous", () => {
    const preview = previewGoogleClassroomRoster([
      { userId: "google-1", emailAddress: "dup@example.com", fullName: "First" },
      { userId: "google-2", emailAddress: "DUP@example.com", fullName: "Second" },
      { userId: "google-3", emailAddress: "multiple@example.com", fullName: "Third" },
    ], [
      {
        id: "student-1", email: "multiple@example.com", first_name: "One", last_name: "Student",
        student_number: "ST-1", status: "active",
      },
      {
        id: "student-2", email: "multiple@example.com", first_name: "Two", last_name: "Student",
        student_number: "ST-2", status: "active",
      },
      {
        id: "student-3", email: "dup@example.com", first_name: "Unique", last_name: "Student",
        student_number: "ST-3", status: "active",
      },
    ]);

    expect(preview.matched).toHaveLength(0);
    expect(preview.ambiguous).toHaveLength(3);
  });
});

describe("Google Classroom token encryption key configuration", () => {
  it("accepts exactly 32 base64-decoded bytes", () => {
    expect(parseGoogleEducationEncryptionKey(Buffer.alloc(32, 7).toString("base64"))).toHaveLength(32);
    expect(() => parseGoogleEducationEncryptionKey(Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
    expect(() => parseGoogleEducationEncryptionKey("not-base64")).toThrow(/32 bytes/);
  });
});
