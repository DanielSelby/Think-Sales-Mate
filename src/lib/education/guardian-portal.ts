import { z } from "zod";

const GuardianPortalFeeSchema = z.object({
  description: z.string(),
  dueOn: z.string().nullable(),
  amount: z.number(),
  paid: z.number(),
  balance: z.number(),
});

const GuardianPortalResultSchema = z.object({
  examination: z.string(),
  subject: z.string(),
  score: z.number(),
  maximumScore: z.number(),
  grade: z.string().nullable(),
  publishedAt: z.string(),
});

const GuardianPortalTimetableSchema = z.object({
  subject: z.string(),
  weekday: z.number().int().min(1).max(7),
  startsAt: z.string(),
  endsAt: z.string(),
  room: z.string().nullable(),
});

const GuardianPortalChildSchema = z.object({
  id: z.string().uuid(),
  studentNumber: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  otherNames: z.string().nullable(),
  status: z.enum(["active", "on_hold", "graduated", "transferred", "withdrawn", "archived"]),
  campusName: z.string(),
  className: z.string().nullable(),
  attendance: z.object({
    present: z.number().int().nonnegative(),
    absent: z.number().int().nonnegative(),
    late: z.number().int().nonnegative(),
    excused: z.number().int().nonnegative(),
  }),
  feeBalance: z.number().nonnegative(),
  fees: z.array(GuardianPortalFeeSchema),
  results: z.array(GuardianPortalResultSchema),
  timetable: z.array(GuardianPortalTimetableSchema),
});

export const educationGuardianPortalSchema = z.array(z.object({
  organizationId: z.string().uuid(),
  organizationName: z.string(),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  guardianFirstName: z.string(),
  guardianLastName: z.string(),
  children: z.array(GuardianPortalChildSchema),
}));

export type EducationGuardianPortal = z.infer<typeof educationGuardianPortalSchema>;
