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

export const EDUCATION_SENSITIVE_DOCUMENT_CATEGORIES = ["medical"] as const;

export function isSensitiveEducationDocumentCategory(
  category: string,
): category is typeof EDUCATION_SENSITIVE_DOCUMENT_CATEGORIES[number] {
  return EDUCATION_SENSITIVE_DOCUMENT_CATEGORIES.some((value) => value === category);
}

export const educationDocumentDownloadSchema = z.object({
  storage_path: z.string().min(1),
  file_name: z.string().min(1).max(255),
  content_type: z.string().min(1),
});

export const EDUCATION_DOCUMENT_PREVIEW_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export function isPreviewableEducationDocumentContentType(
  contentType: string,
): contentType is typeof EDUCATION_DOCUMENT_PREVIEW_MIME_TYPES[number] {
  return EDUCATION_DOCUMENT_PREVIEW_MIME_TYPES.some((type) => type === contentType);
}

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

const EDUCATION_DOCUMENT_MIME_ALIASES: Record<string, typeof EDUCATION_DOCUMENT_MIME_TYPES[number]> = {
  "application/vnd.ms-word": "application/msword",
  "application/msword": "application/msword",
  "application/x-txt": "text/plain",
  "text/csv": "text/plain",
  "image/pjpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
};

function normalizeEducationDocumentMimeType(value: string) {
  const normalized = value.trim().toLowerCase();
  return EDUCATION_DOCUMENT_MIME_ALIASES[normalized] ?? normalized;
}

type EducationDocumentMimeType = typeof EDUCATION_DOCUMENT_MIME_TYPES[number];

function inferEducationDocumentMimeType(file: File) {
  const rawType = file.type.trim().toLowerCase();
  const declaredType = normalizeEducationDocumentMimeType(rawType);
  if (EDUCATION_DOCUMENT_MIME_TYPES.includes(declaredType as EducationDocumentMimeType)) {
    return declaredType;
  }
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".pdf")) return "application/pdf" as const;
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) return "image/jpeg" as const;
  if (lowerName.endsWith(".png")) return "image/png" as const;
  if (lowerName.endsWith(".webp")) return "image/webp" as const;
  if (lowerName.endsWith(".doc")) return "application/msword" as const;
  if (lowerName.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document" as const;
  if (lowerName.endsWith(".txt")) return "text/plain" as const;
  if (rawType === "application/octet-stream" || rawType === "binary/octet-stream") return "";
  return declaredType;
}

export async function isAllowedEducationDocumentFile(file: File) {
  const detectedType = normalizeEducationDocumentMimeType(inferEducationDocumentMimeType(file));
  if (!detectedType || !EDUCATION_DOCUMENT_MIME_TYPES.includes(detectedType as typeof EDUCATION_DOCUMENT_MIME_TYPES[number])) return false;
  const buffer = await file.slice(0, 16).arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const startsWith = (...signature: number[]) => signature.every((value, index) => bytes[index] === value);
  if (detectedType === "application/pdf") {
    return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  }
  if (detectedType === "image/jpeg") return startsWith(0xff, 0xd8, 0xff);
  if (detectedType === "image/png") return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (detectedType === "image/webp") {
    return new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF"
      && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  }
  if (detectedType === "application/msword") {
    return startsWith(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
  }
  if (detectedType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return startsWith(0x50, 0x4b, 0x03, 0x04);
  }
  if (detectedType === "text/plain") {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
