import { describe, expect, it } from "vitest";
import {
  EDUCATION_DOCUMENT_MAX_BYTES,
  educationDocumentDownloadSchema,
  isAllowedEducationDocumentFile,
} from "./documents";

describe("Think Education document handling", () => {
  it("accepts a PDF only when the file signature matches its declared type", async () => {
    const pdf = new File(["%PDF-1.7 document"], "record.pdf", { type: "application/pdf" });
    const mislabeled = new File(["plain text"], "record.pdf", { type: "application/pdf" });

    await expect(isAllowedEducationDocumentFile(pdf)).resolves.toBe(true);
    await expect(isAllowedEducationDocumentFile(mislabeled)).resolves.toBe(false);
  });

  it("uses a bounded upload size and validates signed-download metadata", () => {
    expect(EDUCATION_DOCUMENT_MAX_BYTES).toBe(15 * 1024 * 1024);
    expect(educationDocumentDownloadSchema.safeParse({
      storage_path: "org/campus/document",
      file_name: "student.pdf",
      content_type: "application/pdf",
    }).success).toBe(true);
    expect(educationDocumentDownloadSchema.safeParse({
      storage_path: "",
      file_name: "student.pdf",
      content_type: "application/pdf",
    }).success).toBe(false);
  });
});
