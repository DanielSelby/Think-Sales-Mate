import type { CustomerOrderStatus, CustomerAccountRequirement, OrderPaymentStatus, OrderDeliveryStatus } from "@/types/database";

export const ORDER_STATUS_LABEL: Record<CustomerOrderStatus, string> = {
  new: "New Order",
  approved: "Approved",
  picking: "Picking",
  packing: "Packing",
  delivery: "Out for Delivery",
  completed: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
  processing: "Processing",
  reviewed: "Reviewed",
};

export const ORDER_STATUS_TONE: Record<CustomerOrderStatus, "amber" | "signal" | "neutral" | "alert"> = {
  new: "amber",
  approved: "signal",
  picking: "amber",
  packing: "neutral",
  delivery: "signal",
  completed: "signal",
  cancelled: "alert",
  returned: "alert",
  processing: "amber",
  reviewed: "neutral",
};

export const PAYMENT_STATUS_LABEL: Record<OrderPaymentStatus, string> = {
  paid: "Paid",
  partial: "Partial",
  unpaid: "Unpaid",
};

export const PAYMENT_STATUS_TONE: Record<OrderPaymentStatus, "signal" | "amber" | "alert"> = {
  paid: "signal",
  partial: "amber",
  unpaid: "alert",
};

export const DELIVERY_STATUS_LABEL: Record<OrderDeliveryStatus, string> = {
  not_shipped: "Not Shipped",
  picking: "Picking",
  packing: "Packing",
  in_delivery: "In Delivery",
  delivered: "Delivered",
};

export const DELIVERY_STATUS_TONE: Record<OrderDeliveryStatus, "signal" | "neutral" | "amber" | "alert"> = {
  not_shipped: "neutral",
  picking: "amber",
  packing: "neutral",
  in_delivery: "signal",
  delivered: "signal",
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