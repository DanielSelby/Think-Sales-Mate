"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";

function redirectWithError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function createExpense(formData: FormData): Promise<void> {
  const context = await getCurrentOrgContext();
  if (!context) redirectWithError("/accounting/expenses/new", "Your session expired — please sign in again.");
  if (!can(context.role, "accounting.manage")) {
    redirectWithError("/accounting/expenses/new", "You don't have permission to record expenses.");
  }

  const category = String(formData.get("category") ?? "").trim();
  const vendor = String(formData.get("vendor") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const amount = Number(formData.get("amount"));
  const expenseDate = String(formData.get("expense_date") ?? "").trim();

  if (!category) redirectWithError("/accounting/expenses/new", "Category is required.");
  if (Number.isNaN(amount) || amount <= 0) {
    redirectWithError("/accounting/expenses/new", "Enter a valid amount.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("expenses").insert({
    org_id: context.orgId,
    category,
    vendor: vendor || null,
    description: description || null,
    amount,
    expense_date: expenseDate || new Date().toISOString().slice(0, 10),
    recorded_by: context.userId
  });

  if (error) redirectWithError("/accounting/expenses/new", error.message);

  revalidatePath("/accounting");
  revalidatePath("/accounting/expenses");
  revalidatePath("/dashboard");
  redirect("/accounting/expenses");
}

export async function deleteExpense(expenseId: string) {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "accounting.manage")) {
    return { error: "You don't have permission to remove expenses." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("expenses").delete().eq("id", expenseId).eq("org_id", context.orgId);
  if (error) return { error: error.message };

  revalidatePath("/accounting/expenses");
  revalidatePath("/accounting");
  revalidatePath("/dashboard");
  return { success: true };
}