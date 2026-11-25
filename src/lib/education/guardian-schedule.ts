import { z } from "zod";

const uuidSchema = z.string().uuid();

export const educationGuardianScheduleItemSchema = z.object({
  org_id: uuidSchema,
  student_id: uuidSchema,
  item_type: z.enum(["examination", "event"]),
  item_id: uuidSchema,
  title: z.string(),
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }).nullable(),
  detail: z.string(),
  campus_name: z.string(),
  status: z.string(),
});

export const educationGuardianScheduleSchema = z.array(educationGuardianScheduleItemSchema);
export type EducationGuardianScheduleItem = z.infer<typeof educationGuardianScheduleItemSchema>;

export const educationGuardianContactProfileSchema = z.object({
  org_id: uuidSchema,
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z.string().nullable(),
  phone: z.string().nullable(),
});

export const educationGuardianContactProfilesSchema = z.array(educationGuardianContactProfileSchema);

export const educationGuardianContactUpdateSchema = z.object({
  orgId: uuidSchema,
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().max(254).refine(
    (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    "Enter a valid email address."
  ),
  phone: z.string().trim().max(40),
}).strict();
