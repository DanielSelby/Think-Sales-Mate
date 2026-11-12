import { describe, expect, it } from "vitest";
import { educationStudentPortalSchema } from "./student-portal";

describe("Think Education student portal data", () => {
  it("accepts an empty portal and a valid student payload", () => {
    expect(educationStudentPortalSchema.safeParse([]).success).toBe(true);
    expect(educationStudentPortalSchema.safeParse([{
      id: "00000000-0000-4000-8000-000000000001",
      organizationName: "Example School",
      currencyCode: "USD",
      campusName: "Main Campus",
      studentNumber: "ST-001",
      firstName: "Sam",
      lastName: "Student",
      otherNames: null,
      className: "Grade 5",
      attendance: { present: 18, absent: 1, late: 0, excused: 1 },
      results: [{
        examination: "Term 1",
        subject: "Mathematics",
        score: 85,
        maximumScore: 100,
        grade: "A",
        publishedAt: "2026-11-01T10:00:00Z",
      }],
      timetable: [{
        subject: "Mathematics",
        weekday: 1,
        startsAt: "08:00:00",
        endsAt: "09:00:00",
        room: "Room 1",
      }],
    }]).success).toBe(true);
  });

  it("rejects incomplete student portal data", () => {
    expect(educationStudentPortalSchema.safeParse([{ id: "not-a-uuid" }]).success).toBe(false);
  });
});
