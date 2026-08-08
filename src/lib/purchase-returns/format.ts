import type { PurchaseReturnStatus } from "@/types/database";

export function formatReturnNumber(returnNumber: number) {
  return `PR-${new Date().getFullYear()}-${String(returnNumber).padStart(5, "0")}`;
}

export const RETURN_STATUS_LABEL: Record<PurchaseReturnStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
};

export const RETURN_STATUS_TONE: Record<PurchaseReturnStatus, "neutral" | "signal" | "amber" | "alert"> = {
  draft: "neutral",
  submitted: "amber",
  approved: "signal",
  rejected: "alert",
};

export const RETURN_REASONS = [
  "Damaged Goods", "Wrong Item", "Defective / Not Working", "Expired", "Overstock", "Quality Issue", "Other",
] as const;

export const ITEM_CONDITIONS = ["New", "Damaged", "Defective", "Wrong Item", "Not Working", "Expired"] as const;

export const REFUND_METHODS = ["Bank Transfer", "Cash", "Mobile Money", "Store Credit", "Cheque"] as const;

export const REFUND_STATUSES = ["Pending", "Processed"] as const;