import type { PurchaseStatus } from "@/types/database";

export function formatPurchaseNumber(purchaseNumber: number) {
  return `PO-${new Date().getFullYear()}-${String(purchaseNumber).padStart(5, "0")}`;
}

export const PURCHASE_STATUS_LABEL: Record<PurchaseStatus, string> = {
  draft: "Draft",
  ordered: "Ordered",
  partially_received: "Partially Received",
  received: "Received",
  cancelled: "Cancelled",
};

export const PURCHASE_STATUS_TONE: Record<PurchaseStatus, "neutral" | "signal" | "amber" | "alert"> = {
  draft: "neutral",
  ordered: "amber",
  partially_received: "amber",
  received: "signal",
  cancelled: "alert",
};

export const UNIT_OPTIONS = ["pcs", "box", "carton", "pack", "kg", "litre", "unit"] as const;

export const SHIPPING_METHODS = [
  "Standard Delivery",
  "Express Delivery",
  "Pickup",
  "Freight",
] as const;

export const PAYMENT_TERMS = ["Due on Receipt", "7 Days", "14 Days", "30 Days", "60 Days"] as const;