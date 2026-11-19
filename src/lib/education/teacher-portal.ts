import { z } from "zod";

const teacherStudentSchema = z.object({
  id: z.string().uuid(),
  studentNumber: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  attendanceStatus: z.enum(["present", "absent", "late", "excused"]).nullable(),
});

const teacherClassSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  levelName: z.string().nullable(),
  streamName: z.string().nullable(),
  students: z.array(teacherStudentSchema),
});

const teacherTimetableSchema = z.object({
  classId: z.string().uuid(),
  className: z.string(),
  subject: z.string(),
  weekday: z.number().int().min(1).max(7),
  startsAt: z.string(),
  endsAt: z.string(),
  room: z.string().nullable(),
});

export const educationTeacherPortalSchema = z.array(z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  organizationName: z.string(),
  campusName: z.string(),
  staffNumber: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  jobTitle: z.string().nullable(),
  classes: z.array(teacherClassSchema),
  timetable: z.array(teacherTimetableSchema),
}));

export type EducationTeacherPortal = z.infer<typeof educationTeacherPortalSchema>;
