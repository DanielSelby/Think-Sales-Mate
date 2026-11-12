import { describe, expect, it } from "vitest";
import { educationPortalCommunicationsSchema } from "./communications";

describe("Think Education portal communications", () => {
  it("accepts scoped published announcements", () => {
    expect(educationPortalCommunicationsSchema.safeParse([{
      id: "92235979-07d6-4f82-b29a-9d0b55076442",
      organizationName: "North School",
      campusName: "Main Campus",
      studentName: "A. Student",
      title: "Term opening",
      body: "School opens Monday.",
      publishedAt: "2026-09-01T10:00:00Z",
    }]).success).toBe(true);
  });

  it("rejects malformed or incomplete announcement data", () => {
    expect(educationPortalCommunicationsSchema.safeParse([{
      id: "not-a-uuid",
      title: "Unexpected payload",
    }]).success).toBe(false);
  });
});
