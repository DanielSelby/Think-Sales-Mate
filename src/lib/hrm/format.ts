import type { EmploymentType, PayrollRunStatus } from "@/types/database";

export function formatEmployeeCode(employeeNumber: number) {
  return `EMP-${employeeNumber}`;
}

export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  full_time: "Full Time",
  part_time: "Part Time",
  contract: "Contract",
  intern: "Intern",
};

export const EMPLOYMENT_TYPE_TONE: Record<EmploymentType, "signal" | "amber" | "neutral"> = {
  full_time: "signal",
  part_time: "amber",
  contract: "neutral",
  intern: "neutral",
};

/** Mirrors the derived-status pattern used for expenses — "On Leave" isn't
 * a stored status, it's active + on_leave_until in the future. */
export type EmployeeDisplayStatus = "active" | "on_leave" | "inactive";

export function deriveEmployeeStatus(status: "active" | "inactive", onLeaveUntil: string | null): EmployeeDisplayStatus {
  if (status === "inactive") return "inactive";
  if (onLeaveUntil && new Date(onLeaveUntil) >= new Date()) return "on_leave";
  return "active";
}

export const EMPLOYEE_STATUS_LABEL: Record<EmployeeDisplayStatus, string> = {
  active: "Active",
  on_leave: "On Leave",
  inactive: "Inactive",
};

export const EMPLOYEE_STATUS_TONE: Record<EmployeeDisplayStatus, "signal" | "amber" | "neutral"> = {
  active: "signal",
  on_leave: "amber",
  inactive: "neutral",
};

export const PAYROLL_STATUS_LABEL: Record<PayrollRunStatus, string> = {
  draft: "Draft",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
};

export const PAYROLL_STATUS_TONE: Record<PayrollRunStatus, "neutral" | "amber" | "signal" | "alert"> = {
  draft: "neutral",
  processing: "amber",
  completed: "signal",
  failed: "alert",
};

export const PAYROLL_TYPES = ["Monthly Payroll", "Weekly Payroll", "Bi-Weekly Payroll"] as const;