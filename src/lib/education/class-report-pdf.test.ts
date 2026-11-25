import { describe, expect, it } from "vitest";
import { createClassReportPdf } from "./class-report-pdf";

describe("createClassReportPdf", () => {
  it("creates a valid single-page PDF and escapes PDF text delimiters", () => {
    const pdf = createClassReportPdf(["Grade (A)"]);
    const text = pdf.toString("ascii");

    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("(Grade \\(A\\)) Tj T*");
    expect(text).toContain("/Count 1");
    expect(text).not.toContain("undefined");
    expect(text.endsWith("%%EOF")).toBe(true);
  });

  it("splits long reports across PDF pages", () => {
    const pdf = createClassReportPdf(Array.from({ length: 55 }, (_, index) => `Row ${index + 1}`));

    expect(pdf.toString("ascii")).toContain("/Count 2");
  });
});
