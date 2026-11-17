import { z } from "zod";

export const educationCommunicationDraftInputSchema = z.object({
  communicationId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(5000),
  audience: z.enum(["all", "guardians", "students", "staff"]),
}).strict();

export type EducationCommunicationDraftInput = z.infer<typeof educationCommunicationDraftInputSchema>;

export function escapeEducationCommunicationCsvCell(value: unknown): string {
  const text = String(value ?? "");
  const safeText = /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

export function escapeEducationCommunicationSearchTerm(value: string): string {
  return value.trim().replace(/[%_,\\()]/g, (character) => `\\${character}`);
}

export const educationPortalCommunicationsSchema = z.array(z.object({
  id: z.string().uuid(),
  organizationName: z.string(),
  campusName: z.string(),
  studentName: z.string(),
  title: z.string(),
  body: z.string(),
  publishedAt: z.string().datetime({ offset: true }),
}));

export type EducationPortalCommunication = z.infer<typeof educationPortalCommunicationsSchema>[number];

export const EDUCATION_COMMUNICATION_AUDIENCES = [
  ["all", "Students and families"],
  ["guardians", "Guardians only"],
  ["students", "Students only"],
  ["staff", "Staff only"],
] as const;
