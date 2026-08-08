import type { SupplierStatus } from "@/types/database";

export const SUPPLIER_STATUS_LABEL: Record<SupplierStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  blacklisted: "Blacklisted",
};

export const SUPPLIER_STATUS_TONE: Record<SupplierStatus, "signal" | "neutral" | "alert"> = {
  active: "signal",
  inactive: "neutral",
  blacklisted: "alert",
};

export const SUPPLIER_CATEGORIES = [
  "Electronics", "Machinery", "Plumbing", "Fuel & Oil", "Food & Beverages",
  "Personal Care", "Cosmetics", "Plastic", "Furniture", "Stationery", "Other",
] as const;

export const PAYMENT_TERMS_OPTIONS = ["Due on Receipt", "7 Days", "15 Days", "30 Days", "45 Days", "60 Days"] as const;