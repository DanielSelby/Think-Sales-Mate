"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";

function redirectWithError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function createAccount(formData: FormData): Promise<void> {
  const context = await getCurrentOrgContext();
  if (!context) redirectWithError("/banking/new", "Your session expired — please sign in again.");
  if (!can(context.role, "banking.manage")) {
    redirectWithError("/banking/new", "You don't have permission to add accounts.");
  }

  const name = String(formData.get("name") ?? "").trim();
  const accountType = String(formData.get("account_type") ?? "cash").trim();
  const openingBalance = Number(formData.get("opening_balance") ?? 0);

  if (!name) redirectWithError("/banking/new", "Account name is required.");
  if (Number.isNaN(openingBalance) || openingBalance < 0) {
    redirectWithError("/banking/new", "Enter a valid opening balance.");
  }

  const supabase = createClient();
  const { error } = await supabase.from("bank_accounts").insert({
    org_id: context.orgId,
    name,
    account_type: accountType as "cash" | "checking" | "savings" | "mobile_money" | "other",
    opening_balance: openingBalance,
    current_balance: openingBalance,
    created_by: context.userId
  });

  if (error) redirectWithError("/banking/new", error.message);

  revalidatePath("/banking");
  redirect("/banking");
}

export async function recordTransaction(accountId: string, formData: FormData): Promise<void> {
  const context = await getCurrentOrgContext();
  if (!context) redirectWithError(`/banking/${accountId}`, "Your session expired — please sign in again.");
  if (!can(context.role, "banking.manage")) {
    redirectWithError(`/banking/${accountId}`, "You don't have permission to record transactions.");
  }

  const type = String(formData.get("type") ?? "").trim();
  const amount = Number(formData.get("amount"));
  const description = String(formData.get("description") ?? "").trim();
  const transactionDate = String(formData.get("transaction_date") ?? "").trim();

  if (type !== "deposit" && type !== "withdrawal") {
    redirectWithError(`/banking/${accountId}`, "Pick deposit or withdrawal.");
  }
  if (Number.isNaN(amount) || amount <= 0) {
    redirectWithError(`/banking/${accountId}`, "Enter a valid amount.");
  }

  const supabase = createClient();
  const { error } = await supabase.from("bank_transactions").insert({
    org_id: context.orgId,
    account_id: accountId,
    type,
    amount,
    description: description || null,
    transaction_date: transactionDate || new Date().toISOString().slice(0, 10),
    recorded_by: context.userId
  });

  if (error) redirectWithError(`/banking/${accountId}`, error.message);

  revalidatePath(`/banking/${accountId}`);
  revalidatePath("/banking");
  redirect(`/banking/${accountId}`);
}

export async function deleteAccount(accountId: string) {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "banking.manage")) {
    return { error: "You don't have permission to remove accounts." };
  }

  const supabase = createClient();
  const { error } = await supabase.from("bank_accounts").delete().eq("id", accountId).eq("org_id", context.orgId);
  if (error) return { error: error.message };

  revalidatePath("/banking");
  return { success: true };
}