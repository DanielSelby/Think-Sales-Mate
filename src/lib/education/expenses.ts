export const EDUCATION_EXPENSE_CATEGORIES = [
  "Utilities",
  "Supplies",
  "Repairs & Maintenance",
  "Transport",
  "Meals",
  "Staff",
  "Technology",
  "Security",
  "Events",
  "Other",
] as const;

export const EDUCATION_EXPENSE_PAYMENT_METHODS = [
  ["cash", "Cash"],
  ["mobile_money", "Mobile money"],
  ["bank_transfer", "Bank transfer"],
  ["card", "Card"],
  ["cheque", "Cheque"],
  ["other", "Other"],
] as const;

export type EducationExpenseStatus = "pending_approval" | "approved" | "rejected";
export type EducationExpensePaymentStatus = "unpaid" | "paid";

export function isValidEducationExpenseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === value
    && value <= new Date().toISOString().slice(0, 10);
}
