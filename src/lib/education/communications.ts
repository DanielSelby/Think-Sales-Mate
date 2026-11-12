import { z } from "zod";

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
