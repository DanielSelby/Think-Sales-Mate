"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";

function redirectWithError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function parseCustomerForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  return {
    name,
    email: email || null,
    phone: phone || null,
    company: company || null,
    notes: notes || null
  };
}

export async function createCustomer(formData: FormData): Promise<void> {
  const context = await getCurrentOrgContext();
  if (!context) redirectWithError("/crm/new", "Your session expired — please sign in again.");
  if (!can(context.role, "crm.create")) {
    redirectWithError("/crm/new", "You don't have permission to add customers.");
  }

  const fields = parseCustomerForm(formData);
  if (!fields.name) redirectWithError("/crm/new", "Name is required.");

  const supabase = await createClient();
  const { error } = await supabase.from("customers").insert({
    org_id: context.orgId,
    created_by: context.userId,
    ...fields
  });

  if (error) redirectWithError("/crm/new", error.message);

  revalidatePath("/crm");
  redirect("/crm");
}

export async function updateCustomer(customerId: string, formData: FormData): Promise<void> {
  const context = await getCurrentOrgContext();
  if (!context) redirectWithError(`/crm/${customerId}/edit`, "Your session expired — please sign in again.");
  if (!can(context.role, "crm.manage")) {
    redirectWithError(`/crm/${customerId}/edit`, "You don't have permission to edit customers.");
  }

  const fields = parseCustomerForm(formData);
  if (!fields.name) redirectWithError(`/crm/${customerId}/edit`, "Name is required.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", customerId)
    .eq("org_id", context.orgId);

  if (error) redirectWithError(`/crm/${customerId}/edit`, error.message);

  revalidatePath("/crm");
  redirect("/crm");
}

export async function deleteCustomer(customerId: string) {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "crm.manage")) {
    return { error: "You don't have permission to remove customers." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("customers").delete().eq("id", customerId).eq("org_id", context.orgId);
  if (error) return { error: error.message };

  revalidatePath("/crm");
  return { success: true };
}