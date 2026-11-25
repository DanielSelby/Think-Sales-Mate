import "server-only";

import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { isAllowedEducationDocumentFile } from "@/lib/education/documents";

export const EDUCATION_ASSIGNMENT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

const MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
};

type EducationSupabaseClient = Awaited<ReturnType<typeof createClient>>;
type AttachmentKind = "assignment" | "submission";

export type ValidatedEducationAssignmentFile = {
  file: File;
  fileName: string;
  contentType: string;
};

export async function validateEducationAssignmentAttachmentFile(
  value: FormDataEntryValue | null
): Promise<ValidatedEducationAssignmentFile | null> {
  if (!(value instanceof File) || value.size < 1 || value.size > EDUCATION_ASSIGNMENT_ATTACHMENT_MAX_BYTES) {
    return null;
  }
  const fileName = value.name.replace(/[\/\\\u0000-\u001f\u007f]/g, "_").trim();
  if (!fileName || fileName.length > 255 || !await isAllowedEducationDocumentFile(value)) {
    return null;
  }
  const declaredType = value.type.trim().toLowerCase();
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  const contentType = MIME_TYPES.has(declaredType) ? declaredType : MIME_BY_EXTENSION[extension];
  if (!contentType || !MIME_TYPES.has(contentType)) return null;
  return { file: value, fileName, contentType };
}

export async function uploadEducationAssignmentAttachment(
  supabase: EducationSupabaseClient,
  input: {
    orgId: string;
    assignmentId: string;
    file: ValidatedEducationAssignmentFile;
    kind: AttachmentKind;
    submissionId?: string;
    studentId?: string;
  }
) {
  const { orgId, assignmentId, file, kind, submissionId, studentId } = input;
  if ((kind === "assignment" && (submissionId || studentId))
    || (kind === "submission" && (!submissionId || !studentId))) {
    return { ok: false as const, error: "Attachment details are invalid." };
  }

  const fileId = randomUUID();
  const storagePath = kind === "assignment"
    ? `${orgId}/${assignmentId}/assignment/${fileId}`
    : `${orgId}/${assignmentId}/submission/${studentId}/${fileId}`;
  const { error: uploadError } = await supabase.storage
    .from("education-assignment-attachments")
    .upload(storagePath, file.file, { contentType: file.contentType, upsert: false });
  if (uploadError) {
    console.error("Could not upload education assignment attachment:", uploadError.message);
    return { ok: false as const, error: "The attachment could not be uploaded." };
  }

  const { data: attachmentId, error: registerError } = await supabase.rpc(
    "education_assignment_attachment_register",
    {
      p_org_id: orgId,
      p_assignment_id: assignmentId,
      p_submission_id: submissionId ?? null,
      p_student_id: studentId ?? null,
      p_kind: kind,
      p_file_name: file.fileName,
      p_content_type: file.contentType,
      p_file_size: file.file.size,
      p_storage_path: storagePath,
    }
  );
  if (registerError || !attachmentId) {
    const { error: cleanupError } = await supabase.storage
      .from("education-assignment-attachments")
      .remove([storagePath]);
    if (cleanupError) {
      console.error("Could not remove unregistered education assignment attachment:", cleanupError.message);
    }
    if (registerError) {
      console.error("Could not register education assignment attachment:", registerError.message);
    }
    return { ok: false as const, error: "The attachment could not be saved." };
  }

  return { ok: true as const, attachmentId };
}
