"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission } from "@/lib/rbac/permissions";
import type { BankAccountType } from "@/types/database";

function isBankAccountType(value: string): value is BankAccountType {
  return ["cash", "checking", "savings", "mobile_money", "other"].includes(value);
}

function redirectWithError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function createAccount(formData: FormData): Promise<void> {
  const context = await getCurrentOrgContext();
  if (!context) redirectWithError("/banking/new", "Your session expired — please sign in again.");
  if (!await canPermission("banking", "create")) {
    redirectWithError("/banking/new", "You don't have permission to add accounts.");
  }

  const name = String(formData.get("name") ?? "").trim();
  const accountType = String(formData.get("account_type") ?? "cash").trim();
  const openingBalance = Number(formData.get("opening_balance") ?? 0);

  if (!name) redirectWithError("/banking/new", "Account name is required.");
  if (Number.isNaN(openingBalance) || openingBalance < 0) {
    redirectWithError("/banking/new", "Enter a valid opening balance.");
  }

  const supabase = await createClient();
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
  redirect("/banking?accountCreated=1");
}

export async function recordTransaction(accountId: string, formData: FormData): Promise<void> {
  const context = await getCurrentOrgContext();
  if (!context) redirectWithError(`/banking/${accountId}`, "Your session expired — please sign in again.");
  if (!await canPermission("banking", "edit")) {
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

  const supabase = await createClient();
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
  if (!context || !await canPermission("banking", "delete")) {
    return { error: "You don't have permission to remove accounts." };
  }

  const supabase = await createClient();
  const { data: transaction, error: transactionError } = await supabase
    .from("bank_transactions")
    .select("id")
    .eq("account_id", accountId)
    .eq("org_id", context.orgId)
    .limit(1)
    .maybeSingle();
  if (transactionError) return { error: transactionError.message };
  if (transaction) return { error: "This account has transaction history and cannot be removed." };

  const { error } = await supabase.from("bank_accounts").delete().eq("id", accountId).eq("org_id", context.orgId);
  if (error) return { error: error.message };

  revalidatePath("/banking");
  return { success: true };
}

export async function updateAccount(accountId: string, formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "Your session expired — please sign in again." };
  if (!await canPermission("banking", "edit")) {
    return { error: "You don't have permission to edit accounts." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const accountType = String(formData.get("account_type") ?? "").trim();
  if (!name) return { error: "Account name is required." };
  if (!isBankAccountType(accountType)) return { error: "Choose a valid account type." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("bank_accounts")
    .update({ name, account_type: accountType })
    .eq("id", accountId)
    .eq("org_id", context.orgId);
  if (error) return { error: error.message };

  revalidatePath("/banking");
  revalidatePath(`/banking/${accountId}`);
  return { success: true };
}

export async function transferBankFunds(formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "Your session expired — please sign in again." };
  if (!await canPermission("banking", "edit")) {
    return { error: "You don't have permission to transfer funds." };
  }

  const sourceAccountId = String(formData.get("source_account_id") ?? "").trim();
  const destinationAccountId = String(formData.get("destination_account_id") ?? "").trim();
  const amount = Number(formData.get("amount"));
  const transactionDate = String(formData.get("transaction_date") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!sourceAccountId || !destinationAccountId || sourceAccountId === destinationAccountId) {
    return { error: "Choose two different accounts." };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Enter a valid transfer amount." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) {
    return { error: "Choose a valid transfer date." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_bank_funds", {
    p_org_id: context.orgId,
    p_source_account_id: sourceAccountId,
    p_destination_account_id: destinationAccountId,
    p_amount: amount,
    p_transaction_date: transactionDate,
    p_description: description || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/banking");
  revalidatePath(`/banking/${sourceAccountId}`);
  revalidatePath(`/banking/${destinationAccountId}`);
  return { success: true };
}