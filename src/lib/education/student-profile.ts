import { z } from "zod";

export type EducationStudentProfile = {
  id: string;
  student_number: string;
  first_name: string;
  last_name: string;
  other_names: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  gender: string | null;
  branch_id: string;
  status: string;
};

function isValidBirthDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime())
    && date.toISOString().slice(0, 10) === value
    && value <= new Date().toISOString().slice(0, 10);
}

export const educationStudentProfileInputSchema = z.object({
  studentId: z.string().uuid(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  otherNames: z.string().trim().max(100),
  email: z.string().trim().toLowerCase().max(254)
    .refine((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)),
  phone: z.string().trim().max(32),
  dateOfBirth: z.string().trim().refine((value) => !value || isValidBirthDate(value)),
  gender: z.string().trim().max(50),
}).strict();

export type EducationStudentProfileInput = z.infer<typeof educationStudentProfileInputSchema>;
