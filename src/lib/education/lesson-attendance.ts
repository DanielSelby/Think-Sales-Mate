import { z } from "zod";

export const educationLessonAttendanceStatuses = ["present", "absent", "late", "excused"] as const;

export function isValidEducationAttendanceDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function getEducationISOWeekday(value: string) {
  if (!isValidEducationAttendanceDate(value)) return null;
  const day = new Date(`${value}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export const educationLessonAttendanceInputSchema = z.object({
  timetableEntryId: z.string().uuid(),
  studentId: z.string().uuid(),
  attendanceDate: z.string().refine(isValidEducationAttendanceDate),
  status: z.enum(educationLessonAttendanceStatuses),
  note: z.string().max(500),
});
