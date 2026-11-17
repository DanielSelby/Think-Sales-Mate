import { z } from "zod";

export const educationStudentConsentInputSchema = z.object({
  studentId: z.string().uuid(),
  consentType: z.string().trim().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/),
  disclosureVersion: z.string().trim().min(1).max(120),
  decision: z.enum(["granted", "denied", "withdrawn"]),
  signerName: z.string().trim().min(1).max(150),
  signerRelationship: z.string().trim().min(1).max(80),
  evidenceNote: z.string().trim().max(500),
}).strict();

export type EducationStudentConsentInput = z.infer<typeof educationStudentConsentInputSchema>;
