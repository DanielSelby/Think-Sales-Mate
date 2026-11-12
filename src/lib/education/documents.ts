import { z } from "zod";

export const EDUCATION_DOCUMENT_CATEGORIES = [
  ["student_record", "Student record"],
  ["admission", "Admission"],
  ["medical", "Medical"],
  ["finance", "Finance"],
  ["staff", "Staff"],
  ["institutional", "Institutional"],
  ["other", "Other"],
] as const;

export const educationDocumentDownloadSchema = z.object({
  storage_path: z.string().min(1),
  file_name: z.string().min(1).max(255),
  content_type: z.string().min(1),
});

export const EDUCATION_DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;
export const EDUCATION_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
] as const;

export async function isAllowedEducationDocumentFile(file: File) {
  if (!EDUCATION_DOCUMENT_MIME_TYPES.includes(file.type as typeof EDUCATION_DOCUMENT_MIME_TYPES[number])) return false;
  const buffer = await file.slice(0, 16).arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const startsWith = (...signature: number[]) => signature.every((value, index) => bytes[index] === value);
  if (file.type === "application/pdf") {
    return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  }
  if (file.type === "image/jpeg") return startsWith(0xff, 0xd8, 0xff);
  if (file.type === "image/png") return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (file.type === "image/webp") {
    return new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF"
      && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  }
  if (file.type === "application/msword") {
    return startsWith(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
  }
  if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return startsWith(0x50, 0x4b, 0x03, 0x04);
  }
  if (file.type === "text/plain") {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
