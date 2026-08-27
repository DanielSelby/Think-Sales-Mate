import type { CustomerOrderStatus, CustomerAccountRequirement } from "@/types/database";

export const ORDER_STATUS_LABEL: Record<CustomerOrderStatus, string> = {
  new: "New",
  processing: "Processing",
  reviewed: "Reviewed",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const ORDER_STATUS_TONE: Record<CustomerOrderStatus, "amber" | "signal" | "neutral" | "alert"> = {
  new: "amber",
  processing: "signal",
  reviewed: "neutral",
  completed: "signal",
  cancelled: "alert",
};

export const ACCOUNT_REQUIREMENT_LABEL: Record<CustomerAccountRequirement, string> = {
  optional: "Optional",
  required: "Required",
  guest_only: "Guest Only",
};

export const ACCOUNT_REQUIREMENT_DESCRIPTION: Record<CustomerAccountRequirement, string> = {
  optional: "Customers can place orders as guests or create an account.",
  required: "Customers must create an account before placing orders.",
  guest_only: "Customers can place orders as guests only (no account).",
};