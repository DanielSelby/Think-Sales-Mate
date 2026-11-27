import { describe, expect, it } from "vitest";
import {
  EDUCATION_DOCUMENT_MAX_BYTES,
  educationDocumentDownloadSchema,
  isAllowedEducationDocumentFile,
  isSensitiveEducationDocumentCategory,
} from "./documents";

describe("Think Education document handling", () => {
  it("accepts a PDF only when the file signature matches its declared type", async () => {
    const pdf = new File(["%PDF-1.7 document"], "record.pdf", { type: "application/pdf" });
    const mislabeled = new File(["plain text"], "record.pdf", { type: "application/pdf" });

    await expect(isAllowedEducationDocumentFile(pdf)).resolves.toBe(true);
    await expect(isAllowedEducationDocumentFile(mislabeled)).resolves.toBe(false);
  });

  it("accepts browser-generic mime types when a known file extension matches a valid document signature", async () => {
    const pdf = new File(["%PDF-1.7 document"], "record.pdf", { type: "application/octet-stream" });
    const docx = new File([Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00])], "record.docx", { type: "application/octet-stream" });
    const jpeg = new File([Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])], "record.jpeg", { type: "image/pjpeg" });

    await expect(isAllowedEducationDocumentFile(pdf)).resolves.toBe(true);
    await expect(isAllowedEducationDocumentFile(docx)).resolves.toBe(true);
    await expect(isAllowedEducationDocumentFile(jpeg)).resolves.toBe(true);
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

  it("classifies medical records as sensitive without restricting ordinary student records", () => {
    expect(isSensitiveEducationDocumentCategory("medical")).toBe(true);
    expect(isSensitiveEducationDocumentCategory("student_record")).toBe(false);
  });
});
