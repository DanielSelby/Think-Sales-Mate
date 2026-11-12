import { z } from "zod";

export const educationStudentPortalSchema = z.array(z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  organizationName: z.string(),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  campusName: z.string(),
  studentNumber: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  otherNames: z.string().nullable(),
  className: z.string().nullable(),
  attendance: z.object({
    present: z.number().int().nonnegative(),
    absent: z.number().int().nonnegative(),
    late: z.number().int().nonnegative(),
    excused: z.number().int().nonnegative(),
  }),
  results: z.array(z.object({
    examination: z.string(),
    subject: z.string(),
    score: z.number(),
    maximumScore: z.number(),
    grade: z.string().nullable(),
    publishedAt: z.string(),
  })),
  timetable: z.array(z.object({
    subject: z.string(),
    weekday: z.number().int().min(1).max(7),
    startsAt: z.string(),
    endsAt: z.string(),
    room: z.string().nullable(),
  })),
}));

export type EducationStudentPortal = z.infer<typeof educationStudentPortalSchema>;
