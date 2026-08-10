import type { AttendanceStatus } from "@/types/database";

export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  early_leave: "Early Leave",
  on_leave: "On Leave",
};

export const ATTENDANCE_STATUS_TONE: Record<AttendanceStatus, "signal" | "alert" | "amber" | "neutral"> = {
  present: "signal",
  absent: "alert",
  late: "amber",
  early_leave: "amber",
  on_leave: "neutral",
};

export const WORK_TYPES = ["Office", "Remote", "Field"] as const;

/** Office start time used to auto-flag late check-ins. A real HR system
 * would make this per-org/per-shift configurable — this is a fixed
 * assumption, not a policy engine. */
export const OFFICE_START_HOUR = 9;
export const OFFICE_START_MINUTE = 0;

export function computeHours(checkIn: string, checkOut: string): number {
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Math.max(0, Math.round((ms / (1000 * 60 * 60)) * 100) / 100);
}

export function isLateCheckIn(checkInIso: string): boolean {
  const d = new Date(checkInIso);
  return d.getHours() > OFFICE_START_HOUR || (d.getHours() === OFFICE_START_HOUR && d.getMinutes() > OFFICE_START_MINUTE);
}

export function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" });
}