import { z } from "zod";

export const EDUCATION_NOTIFICATION_TYPES = [
  ["announcement", "Campus announcements"],
  ["attendance", "Attendance"],
  ["results", "Results"],
  ["fees", "Fees and payments"],
  ["admissions", "Admissions"],
  ["transport", "Transport"],
  ["assignment", "Assignment updates"],
] as const;

export const educationNotificationSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  branch_id: z.string().uuid(),
  user_id: z.string().uuid(),
  notification_type: z.enum(["announcement", "attendance", "results", "fees", "admissions", "transport", "assignment"]),
  title: z.string(),
  message: z.string(),
  announcement_id: z.string().uuid().nullable(),
  assignment_id: z.string().uuid().nullable(),
  assignment_event_key: z.string().nullable(),
  delivery_status: z.enum(["delivered", "read"]),
  read_at: z.string().nullable(),
  created_at: z.string().datetime({ offset: true }),
}).refine(
  (notification) => (notification.delivery_status === "read") === (notification.read_at !== null),
  { message: "Read notifications must have a read timestamp." },
);

export const educationNotificationsSchema = z.array(educationNotificationSchema);

export type EducationNotification = z.infer<typeof educationNotificationSchema>;
