"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission, canTabPermission } from "@/lib/rbac/permissions";

function redirectWithError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function createInvoice(formData: FormData): Promise<void> {
  const context = await getCurrentOrgContext();
  if (!context) redirectWithError("/accounting/invoices/new", "Your session expired — please sign in again.");
  if (!await canPermission("accounting", "create") || !await canTabPermission("accounting", "accounting", "receivables", "create")) {
    redirectWithError("/accounting/invoices/new", "You don't have permission to create invoices.");
  }

  const customerName = String(formData.get("customer_name") ?? "").trim();
  const amount = Number(formData.get("amount"));
  const dueDate = String(formData.get("due_date") ?? "").trim();

  if (!customerName) redirectWithError("/accounting/invoices/new", "Customer name is required.");
  if (Number.isNaN(amount) || amount <= 0) {
    redirectWithError("/accounting/invoices/new", "Enter a valid amount.");
  }
  if (!dueDate) redirectWithError("/accounting/invoices/new", "Due date is required.");

  const supabase = await createClient();
  const { error } = await supabase.from("invoices").insert({
    org_id: context.orgId,
    customer_name: customerName,
    amount,
    due_date: dueDate,
    status: "sent",
    created_by: context.userId
  });

  if (error) redirectWithError("/accounting/invoices/new", error.message);

  revalidatePath("/accounting");
  revalidatePath("/accounting/invoices");
  revalidatePath("/dashboard");
  redirect("/accounting/invoices");
}

export async function markInvoicePaid(invoiceId: string) {
  const context = await getCurrentOrgContext();
  if (!context || !await canPermission("accounting", "edit") || !await canTabPermission("accounting", "accounting", "receivables", "edit")) {
    return { error: "You don't have permission to update invoices." };
  }

  const supabase = await createClient();
  const { data: invoice, error: loadError } = await supabase
    .from("invoices")
    .select("amount, source_catering_event_id, source_service_job_id")
    .eq("id", invoiceId)
    .eq("org_id", context.orgId)
    .maybeSingle();
  if (loadError) return { error: loadError.message };
  if (!invoice) return { error: "Invoice not found." };
  if (invoice.source_catering_event_id) {
    return { error: "Record payments through the linked catering event so its payment history stays accurate." };
  }
  if (invoice.source_service_job_id) {
    return { error: "Record repair invoice payments from the invoice details so each payment has a receipt." };
  }

  const { error } = await supabase
    .from("invoices")
    .update({ status: "paid", amount_paid: invoice.amount, paid_at: new Date().toISOString() })
    .eq("id", invoiceId)
    .eq("org_id", context.orgId)
    .in("status", ["sent", "overdue"]);

  if (error) return { error: error.message };

  revalidatePath("/accounting/invoices");
  revalidatePath("/accounting");
  revalidatePath("/dashboard");
  revalidatePath("/service-center");
  return { success: true };
}

export async function recordServiceInvoicePayment(input: {
  invoiceId: string;
  amount: number;
  paymentMethod: "Cash" | "Card" | "Bank Transfer" | "Mobile Money" | "Other";
  paymentDate: string;
  notes?: string;
}): Promise<{ success: true; paymentId: string } | { error: string }> {
  if (!input
    || typeof input.invoiceId !== "string"
    || typeof input.paymentDate !== "string"
    || typeof input.paymentMethod !== "string"
    || (input.notes !== undefined && typeof input.notes !== "string")) {
    return { error: "Enter complete payment details." };
  }

  const context = await getCurrentOrgContext();
  if (!context
    || !await canPermission("accounting", "edit")
    || !await canTabPermission("accounting", "accounting", "receivables", "edit")) {
    return { error: "You don't have permission to record invoice payments." };
  }

  const amount = Number(input.amount);
  if (!input.invoiceId || !Number.isFinite(amount) || amount <= 0
    || Math.abs(amount - Math.round(amount * 100) / 100) > 1e-8) {
    return { error: "Enter a valid payment amount with up to two decimal places." };
  }
  const methods = ["Cash", "Card", "Bank Transfer", "Mobile Money", "Other"] as const;
  if (!methods.includes(input.paymentMethod)) return { error: "Select a valid payment method." };
  const paymentDate = input.paymentDate.trim();
  const parsedDate = new Date(`${paymentDate}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)
    || Number.isNaN(parsedDate.getTime())
    || parsedDate.toISOString().slice(0, 10) !== paymentDate
    || paymentDate > new Date().toISOString().slice(0, 10)) {
    return { error: "Enter a valid payment date that is not in the future." };
  }
  const notes = input.notes?.trim() || null;
  if (notes && notes.length > 500) return { error: "Payment notes cannot exceed 500 characters." };

  const supabase = await createClient();
  const { data: paymentId, error } = await supabase.rpc("record_service_invoice_payment", {
    p_org_id: context.orgId,
    p_invoice_id: input.invoiceId,
    p_amount: amount,
    p_payment_method: input.paymentMethod,
    p_payment_date: paymentDate,
    p_notes: notes,
  });
  if (error) return { error: error.message };
  if (!paymentId) return { error: "The payment was not saved. Please try again." };

  revalidatePath(`/accounting/invoices/${input.invoiceId}`);
  revalidatePath(`/accounting/invoices/${input.invoiceId}/receipts/${paymentId}`);
  revalidatePath("/accounting/invoices");
  revalidatePath("/accounting");
  revalidatePath("/dashboard");
  revalidatePath("/service-center");
  return { success: true, paymentId };
}

export async function voidInvoice(invoiceId: string) {
  const context = await getCurrentOrgContext();
  if (!context || !await canPermission("accounting", "edit") || !await canTabPermission("accounting", "accounting", "receivables", "edit")) {
    return { error: "You don't have permission to update invoices." };
  }

  const supabase = await createClient();
  const { data: invoice, error: loadError } = await supabase
    .from("invoices")
    .select("source_catering_event_id, source_service_job_id, amount_paid")
    .eq("id", invoiceId)
    .eq("org_id", context.orgId)
    .maybeSingle();
  if (loadError) return { error: loadError.message };
  if (!invoice) return { error: "Invoice not found." };
  if (invoice.source_catering_event_id) {
    return { error: "Catering final invoices cannot be voided from Accounts Receivable." };
  }
  if (invoice.source_service_job_id && Number(invoice.amount_paid) > 0) {
    return { error: "A repair invoice with recorded payments cannot be voided." };
  }

  const { error } = await supabase
    .from("invoices")
    .update({ status: "void" })
    .eq("id", invoiceId)
    .eq("org_id", context.orgId);

  if (error) return { error: error.message };

  revalidatePath("/accounting/invoices");
  revalidatePath("/accounting");
  revalidatePath("/dashboard");
  revalidatePath("/service-center");
  return { success: true };
}