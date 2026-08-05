import type { Database, SaleStatus } from "@/types/database";

export type PaymentStatus = "paid" | "partially_paid" | "pending";

export const SALE_STATUS_LABEL: Record<SaleStatus, string> = {
  completed: "Completed",
  returned: "Returned",
  cancelled: "Cancelled",
};

export type { SaleStatus };

/**
 * The `sales` table has no status column — payment state is derived from
 * amount_paid vs total. If you later add refunds/void tracking, extend
 * this instead of adding a free-text status column.
 */
export function derivePaymentStatus(total: number, amountPaid: number | null): PaymentStatus {
  const paid = amountPaid ?? 0;
  if (paid <= 0) return "pending";
  if (paid >= total) return "paid";
  return "partially_paid";
}

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  paid: "Paid",
  partially_paid: "Partially Paid",
  pending: "Pending",
};

export function formatInvoiceNumber(saleNumber: number) {
  return `INV-${new Date().getFullYear()}-${String(saleNumber).padStart(5, "0")}`;
}

export function formatCurrency(amount: number, currency: Database["public"]["Tables"]["organizations"]["Row"]["currency"] = "GHS") {
  try {
    return new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Fallback if currency code from org settings isn't ISO-4217 valid
    return `${currency} ${amount.toLocaleString("en-GH", { minimumFractionDigits: 2 })}`;
  }
}

export function formatDateTime(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" }),
  };
}