"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission } from "@/lib/rbac/permissions";

function redirectWithError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function parseCustomerForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const rawCreditLimit = String(formData.get("credit_limit") ?? "").trim();
  const creditLimit = rawCreditLimit ? Number(rawCreditLimit) : null;
  const rawPaymentTermsDays = String(formData.get("payment_terms_days") ?? "0").trim();
  const paymentTermsDays = Number(rawPaymentTermsDays);

  return {
    name,
    email: email || null,
    phone: phone || null,
    company: company || null,
    notes: notes || null,
    creditLimit,
    paymentTermsDays,
    creditLimitError: rawCreditLimit && (!Number.isFinite(creditLimit) || (creditLimit ?? -1) < 0)
      ? "Credit limit must be a non-negative amount."
      : null,
    paymentTermsDaysError: !Number.isInteger(paymentTermsDays) || paymentTermsDays < 0
      ? "Credit payment terms must be a non-negative whole number of days."
      : null,
  };
}

export async function createCustomer(formData: FormData): Promise<void> {
  const context = await getCurrentOrgContext();
  if (!context) redirectWithError("/crm/new", "Your session expired — please sign in again.");
  if (!await canPermission("customers", "create")) {
    redirectWithError("/crm/new", "You don't have permission to add customers.");
  }

  const fields = parseCustomerForm(formData);
  if (!fields.name) redirectWithError("/crm/new", "Name is required.");
  if (fields.creditLimitError) redirectWithError("/crm/new", fields.creditLimitError);
  if (fields.paymentTermsDaysError) redirectWithError("/crm/new", fields.paymentTermsDaysError);

  const supabase = await createClient();
  const { error } = await supabase.from("customers").insert({
    org_id: context.orgId,
    created_by: context.userId,
    name: fields.name,
    email: fields.email,
    phone: fields.phone,
    company: fields.company,
    notes: fields.notes,
    credit_limit: fields.creditLimit,
    payment_terms_days: fields.paymentTermsDays,
  });

  if (error) redirectWithError("/crm/new", error.message);

  revalidatePath("/crm");
  redirect("/crm");
}

export async function updateCustomer(customerId: string, formData: FormData): Promise<void> {
  const context = await getCurrentOrgContext();
  if (!context) redirectWithError(`/crm/${customerId}/edit`, "Your session expired — please sign in again.");
  if (!await canPermission("customers", "edit")) {
    redirectWithError(`/crm/${customerId}/edit`, "You don't have permission to edit customers.");
  }

  const fields = parseCustomerForm(formData);
  if (!fields.name) redirectWithError(`/crm/${customerId}/edit`, "Name is required.");
  if (fields.creditLimitError) redirectWithError(`/crm/${customerId}/edit`, fields.creditLimitError);
  if (fields.paymentTermsDaysError) redirectWithError(`/crm/${customerId}/edit`, fields.paymentTermsDaysError);

  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update({
      name: fields.name,
      email: fields.email,
      phone: fields.phone,
      company: fields.company,
      notes: fields.notes,
      credit_limit: fields.creditLimit,
      payment_terms_days: fields.paymentTermsDays,
      updated_at: new Date().toISOString(),
    })
    .eq("id", customerId)
    .eq("org_id", context.orgId);

  if (error) redirectWithError(`/crm/${customerId}/edit`, error.message);

  revalidatePath("/crm");
  redirect("/crm");
}

export async function deleteCustomer(customerId: string) {
  const context = await getCurrentOrgContext();
  if (!context || !await canPermission("customers", "delete")) {
    return { error: "You don't have permission to remove customers." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("customers").delete().eq("id", customerId).eq("org_id", context.orgId);
  if (error) return { error: error.message };

  revalidatePath("/crm");
  return { success: true };
}