import { z } from "zod";

export const educationGuardianAttendanceHistorySchema = z.array(z.object({
  record_id: z.string().uuid(),
  student_id: z.string().uuid(),
  attendance_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["present", "absent", "late", "excused"]),
  record_type: z.enum(["Daily", "Lesson"]),
  detail: z.string().max(120),
}));

export type EducationGuardianAttendanceRecord = z.infer<
  typeof educationGuardianAttendanceHistorySchema
>[number];
