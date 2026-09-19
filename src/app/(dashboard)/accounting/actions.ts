"use server";

import { revalidatePath } from "next/cache";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { canPermission } from "@/lib/rbac/permissions";

export async function recordCustomerCreditPayment(input: {
  invoiceId: string;
  customerId?: string | null;
  amount: number;
  paymentMethod: string;
  paymentDate?: string;
  locationId?: string | null;
  notes?: string | null;
}) {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "Your session expired." };
  if (!await canPermission("accounting", "create")) return { ok: false, error: "You do not have permission to record customer payments." };
  if (!input.invoiceId || !Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, error: "Enter a valid payment amount." };
  if (input.locationId && context.isBranchScoped && !context.allowedLocationIds.includes(input.locationId)) {
    return { ok: false, error: "You are not assigned to this branch." };
  }
  const db = await createClient() as any;
  const paymentMethod = /mobile money|mobile|momo/i.test(input.paymentMethod) ? "MoMo" : input.paymentMethod || "Cash";
  const { error } = await db.from("customer_credit_payments").insert({
    org_id: context.orgId,
    customer_id: input.customerId || null,
    invoice_id: input.invoiceId,
    amount: input.amount,
    payment_method: paymentMethod,
    payment_date: input.paymentDate || new Date().toISOString().slice(0, 10),
    location_id: input.locationId || (context.isBranchScoped ? context.locationId : null),
    recorded_by: context.userId,
    notes: input.notes || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/accounting");
  revalidatePath("/banking/cash-closing");
  return { ok: true };
}
