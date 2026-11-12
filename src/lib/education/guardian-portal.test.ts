import { describe, expect, it } from "vitest";
import { educationGuardianPortalSchema } from "./guardian-portal";

describe("Think Education guardian portal data", () => {
  it("accepts an empty portal and a verified-child data shape", () => {
    expect(educationGuardianPortalSchema.safeParse([]).success).toBe(true);
    expect(educationGuardianPortalSchema.safeParse([{
      organizationName: "Example School",
      currencyCode: "USD",
      guardianFirstName: "Alex",
      guardianLastName: "Guardian",
      children: [{
        id: "00000000-0000-4000-8000-000000000001",
        studentNumber: "ST-001",
        firstName: "Sam",
        lastName: "Student",
        otherNames: null,
        status: "active",
        campusName: "Main Campus",
        className: "Grade 5",
        attendance: { present: 18, absent: 1, late: 0, excused: 1 },
        feeBalance: 25,
        fees: [{ description: "Tuition", dueOn: "2026-11-30", amount: 100, paid: 75, balance: 25 }],
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
      }],
    }]).success).toBe(true);
  });

  it("rejects malformed or incomplete student details instead of displaying defaults", () => {
    expect(educationGuardianPortalSchema.safeParse([{
      organizationName: "Example School",
      guardianFirstName: "Alex",
      guardianLastName: "Guardian",
      children: [{ id: "not-a-uuid" }],
    }]).success).toBe(false);
  });
});
