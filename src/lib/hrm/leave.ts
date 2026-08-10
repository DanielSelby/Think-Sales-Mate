import type { LeaveStatus } from "@/types/database";

export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

export const LEAVE_STATUS_TONE: Record<LeaveStatus, "amber" | "signal" | "alert"> = {
  pending: "amber",
  approved: "signal",
  rejected: "alert",
};

export const DEFAULT_LEAVE_TYPES = [
  { name: "Annual Leave", color: "blue", isPaid: true, defaultAnnualDays: 21 },
  { name: "Sick Leave", color: "amber", isPaid: true, defaultAnnualDays: 10 },
  { name: "Personal Leave", color: "green", isPaid: true, defaultAnnualDays: 5 },
  { name: "Maternity Leave", color: "pink", isPaid: true, defaultAnnualDays: 90 },
  { name: "Compassionate Leave", color: "red", isPaid: true, defaultAnnualDays: 5 },
  { name: "Unpaid Leave", color: "neutral", isPaid: false, defaultAnnualDays: 0 },
] as const;

export function countBusinessDays(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  let count = 0;
  const d = new Date(start);
  while (d <= end) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count += 1;
    d.setDate(d.getDate() + 1);
  }
  return Math.max(1, count);
}

export type BalanceBucket = "full" | "partial" | "low" | "none";

export function deriveBalanceBucket(allocated: number, used: number): BalanceBucket {
  const remaining = allocated - used;
  if (used === 0) return "full";
  if (remaining <= 0) return "none";
  if (remaining <= allocated * 0.2) return "low";
  return "partial";
}

export const BALANCE_BUCKET_LABEL: Record<BalanceBucket, string> = {
  full: "Full Balance",
  partial: "Partial Balance",
  low: "Low Balance",
  none: "No Balance",
};

export const BALANCE_BUCKET_COLOR: Record<BalanceBucket, string> = {
  full: "#1d8f5e",
  partial: "#3b82f6",
  low: "#a8781f",
  none: "#b8402f",
};