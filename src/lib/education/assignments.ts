import { z } from "zod";

const uuidSchema = z.string().uuid();

export const educationAssignmentSchema = z.object({
  id: uuidSchema,
  org_id: uuidSchema,
  class_id: uuidSchema,
  title: z.string().min(1).max(160),
  description: z.string().max(10000),
  due_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  max_score: z.number().positive().max(10000),
  status: z.enum(["draft", "published", "archived"]),
  created_by: uuidSchema,
  created_at: z.string(),
  updated_at: z.string(),
});

export const educationAssignmentsSchema = z.array(educationAssignmentSchema);

export const educationAssignmentTargetSchema = z.object({
  org_id: uuidSchema,
  assignment_id: uuidSchema,
  student_id: uuidSchema,
  created_at: z.string(),
});

export const educationAssignmentTargetsSchema = z.array(educationAssignmentTargetSchema);

export const educationAssignmentSubmissionSchema = z.object({
  id: uuidSchema,
  org_id: uuidSchema,
  assignment_id: uuidSchema,
  student_id: uuidSchema,
  submission_text: z.string().max(10000),
  submitted_at: z.string(),
  score: z.number().nonnegative().nullable(),
  feedback: z.string().max(4000).nullable(),
  graded_by: uuidSchema.nullable(),
  graded_at: z.string().nullable(),
  revision_requested_at: z.string().nullable(),
  revision_requested_by: uuidSchema.nullable(),
  revision_request_note: z.string().max(2000).nullable(),
  updated_at: z.string(),
});

export const educationAssignmentSubmissionsSchema = z.array(educationAssignmentSubmissionSchema);

export const educationAssignmentSubmissionVersionSchema = z.object({
  org_id: uuidSchema,
  submission_id: uuidSchema,
  version_number: z.number().int().min(1).max(20),
  submission_text: z.string().max(10000),
  submitted_at: z.string(),
  score: z.number().nonnegative().nullable(),
  feedback: z.string().max(4000).nullable(),
  graded_at: z.string().nullable(),
  revision_requested_at: z.string().nullable(),
  revision_request_note: z.string().max(2000).nullable(),
  recorded_at: z.string(),
});

export const educationAssignmentSubmissionVersionsSchema = z.array(
  educationAssignmentSubmissionVersionSchema
);

export const educationAssignmentAttachmentSchema = z.object({
  id: uuidSchema,
  org_id: uuidSchema,
  assignment_id: uuidSchema,
  submission_id: uuidSchema.nullable(),
  kind: z.enum(["assignment", "submission"]),
  file_name: z.string().min(1).max(255),
  content_type: z.string(),
  file_size: z.number().int().positive(),
  storage_path: z.string().min(1),
  created_at: z.string(),
}).superRefine((attachment, ctx) => {
  if ((attachment.kind === "assignment") !== (attachment.submission_id === null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["submission_id"],
      message: "Only submission attachments may reference a submission.",
    });
  }
});

export const educationAssignmentAttachmentsSchema = z.array(educationAssignmentAttachmentSchema);

export type EducationAssignmentAttachment = z.infer<typeof educationAssignmentAttachmentSchema>;

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export const educationCreateAssignmentSchema = z.object({
  orgId: uuidSchema,
  classId: uuidSchema,
  title: z.string().trim().min(1).max(160),
  description: z.string().max(10000),
  dueOn: z.string().refine(isCalendarDate, "Enter a valid due date."),
  maxScore: z.number().positive().max(10000),
  studentIds: z.array(uuidSchema).min(1).max(500),
}).strict().superRefine(({ studentIds }, ctx) => {
  if (new Set(studentIds).size !== studentIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["studentIds"], message: "Students must be selected only once." });
  }
});

export const educationSubmitAssignmentSchema = z.object({
  assignmentId: uuidSchema,
  studentId: uuidSchema,
  submissionText: z.string().trim().min(1).max(10000),
}).strict();

export const educationGradeAssignmentSchema = z.object({
  submissionId: uuidSchema,
  score: z.number().nonnegative().max(10000),
  feedback: z.string().max(4000),
}).strict();

export const educationRequestAssignmentRevisionSchema = z.object({
  submissionId: uuidSchema,
  note: z.string().trim().min(1).max(2000),
}).strict();

export type EducationAssignment = z.infer<typeof educationAssignmentSchema>;
export type EducationAssignmentTarget = z.infer<typeof educationAssignmentTargetSchema>;
export type EducationAssignmentSubmission = z.infer<typeof educationAssignmentSubmissionSchema>;
export type EducationAssignmentSubmissionVersion = z.infer<typeof educationAssignmentSubmissionVersionSchema>;
