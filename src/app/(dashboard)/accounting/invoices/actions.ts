"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";

function redirectWithError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function createInvoice(formData: FormData): Promise<void> {
  const context = await getCurrentOrgContext();
  if (!context) redirectWithError("/accounting/invoices/new", "Your session expired — please sign in again.");
  if (!can(context.role, "accounting.manage")) {
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

  const supabase = createClient();
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
  if (!context || !can(context.role, "accounting.manage")) {
    return { error: "You don't have permission to update invoices." };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("invoices")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", invoiceId)
    .eq("org_id", context.orgId);

  if (error) return { error: error.message };

  revalidatePath("/accounting/invoices");
  revalidatePath("/accounting");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function voidInvoice(invoiceId: string) {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "accounting.manage")) {
    return { error: "You don't have permission to update invoices." };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("invoices")
    .update({ status: "void" })
    .eq("id", invoiceId)
    .eq("org_id", context.orgId);

  if (error) return { error: error.message };

  revalidatePath("/accounting/invoices");
  revalidatePath("/accounting");
  revalidatePath("/dashboard");
  return { success: true };
}