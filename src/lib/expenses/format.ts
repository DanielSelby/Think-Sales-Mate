import type { ExpenseStatus, ExpensePaymentStatus } from "@/types/database";

export function formatExpenseNumber(expenseNumber: number) {
  return `EXP-${new Date().getFullYear()}-${String(expenseNumber).padStart(5, "0")}`;
}

/**
 * The table's single "Status" column reads as one combined state even
 * though approval and payment are tracked independently underneath —
 * this is the same derivation the tabs filter on.
 */
export type DisplayStatus = "pending_approval" | "approved" | "paid" | "overdue" | "rejected";

export function deriveDisplayStatus(
  status: ExpenseStatus,
  paymentStatus: ExpensePaymentStatus,
  dueDate: string | null
): DisplayStatus {
  if (paymentStatus === "paid") return "paid";
  if (status === "rejected") return "rejected";
  if (status === "approved") {
    if (dueDate && new Date(dueDate) < new Date()) return "overdue";
    return "approved";
  }
  return "pending_approval";
}

export const DISPLAY_STATUS_LABEL: Record<DisplayStatus, string> = {
  pending_approval: "Pending",
  approved: "Approved",
  paid: "Paid",
  overdue: "Overdue",
  rejected: "Rejected",
};

export const DISPLAY_STATUS_TONE: Record<DisplayStatus, "neutral" | "signal" | "amber" | "alert"> = {
  pending_approval: "amber",
  approved: "signal",
  paid: "signal",
  overdue: "alert",
  rejected: "alert",
};

export const EXPENSE_CATEGORIES = [
  "Office Supplies", "Fuel", "Meals & Entertainment", "Utilities", "Internet & Phone",
  "Marketing", "Maintenance", "Software", "Training", "Rent", "Salaries", "Other",
] as const;

export const PAYMENT_METHODS = ["Cash", "Bank Transfer", "MTN MoMo", "Card", "Cheque"] as const;

export const DEPARTMENTS = ["Operations", "Sales", "Marketing", "Finance", "HR", "IT", "Admin"] as const;

export const RECURRING_FREQUENCIES = ["Weekly", "Monthly", "Quarterly", "Yearly"] as const;

export const EXPENSE_TYPES = ["Operational Expense", "Capital Expense", "Reimbursable", "Petty Cash"] as const;

export const CURRENCIES = ["GH₵", "USD", "EUR", "GBP", "NGN"] as const;