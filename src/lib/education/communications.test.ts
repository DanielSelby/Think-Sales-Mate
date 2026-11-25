import { describe, expect, it } from "vitest";
import {
  educationCommunicationDraftInputSchema,
  educationPortalCommunicationsSchema,
  escapeEducationCommunicationCsvCell,
  escapeEducationCommunicationSearchTerm,
} from "./communications";

describe("Think Education portal communications", () => {
  it("escapes filter syntax and wildcard characters in announcement searches", () => {
    expect(escapeEducationCommunicationSearchTerm(" term, 50% (draft) \\ "))
      .toBe("term\\, 50\\% \\(draft\\) \\\\");
  });

  it("neutralizes spreadsheet formulas and escapes CSV quotes", () => {
    expect(escapeEducationCommunicationCsvCell("=HYPERLINK(\"https://example.test\")"))
      .toBe("\"'=HYPERLINK(\"\"https://example.test\"\")\"");
    expect(escapeEducationCommunicationCsvCell("  +SUM(1,2)"))
      .toBe("\"'  +SUM(1,2)\"");
    expect(escapeEducationCommunicationCsvCell("School opens Monday"))
      .toBe("\"School opens Monday\"");
  });

  it("accepts scoped published announcements", () => {
    expect(educationPortalCommunicationsSchema.safeParse([{
      id: "92235979-07d6-4f82-b29a-9d0b55076442",
      organizationId: "92235979-07d6-4f82-b29a-9d0b55076442",
      organizationName: "North School",
      campusName: "Main Campus",
      studentName: "A. Student",
      title: "Term opening",
      body: "School opens Monday.",
      publishedAt: "2026-09-01T10:00:00Z",
    }]).success).toBe(true);
  });

  describe("educationCommunicationDraftInputSchema", () => {
    it("accepts a valid draft edit and normalizes whitespace", () => {
      const result = educationCommunicationDraftInputSchema.safeParse({
        communicationId: "92235979-07d6-4f82-b29a-9d0b55076442",
        title: "  Term opening  ",
        body: "  School opens Monday.  ",
        audience: "all",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("Term opening");
        expect(result.data.body).toBe("School opens Monday.");
      }
    });

    it("rejects invalid IDs, empty content, oversized content, and unsupported audiences", () => {
      expect(educationCommunicationDraftInputSchema.safeParse({
        communicationId: "invalid",
        title: "Title",
        body: "Message",
        audience: "all",
      }).success).toBe(false);
      expect(educationCommunicationDraftInputSchema.safeParse({
        communicationId: "92235979-07d6-4f82-b29a-9d0b55076442",
        title: " ",
        body: "Message",
        audience: "all",
      }).success).toBe(false);
      expect(educationCommunicationDraftInputSchema.safeParse({
        communicationId: "92235979-07d6-4f82-b29a-9d0b55076442",
        title: "Title",
        body: "x".repeat(5001),
        audience: "all",
      }).success).toBe(false);
      expect(educationCommunicationDraftInputSchema.safeParse({
        communicationId: "92235979-07d6-4f82-b29a-9d0b55076442",
        title: "Title",
        body: "Message",
        audience: "parents",
      }).success).toBe(false);
    });
  });

  it("rejects malformed or incomplete announcement data", () => {
    expect(educationPortalCommunicationsSchema.safeParse([{
      id: "not-a-uuid",
      title: "Unexpected payload",
    }]).success).toBe(false);
  });
});
