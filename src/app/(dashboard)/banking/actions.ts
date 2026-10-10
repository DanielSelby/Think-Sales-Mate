"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission } from "@/lib/rbac/permissions";
import type { BankAccountType } from "@/types/database";

function isBankAccountType(value: string): value is BankAccountType {
  return ["cash", "checking", "savings", "mobile_money", "card", "other"].includes(value);
}

function redirectWithError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function logoExtension(file: File): string | null {
  const extensions: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  };
  return extensions[file.type] ?? null;
}

async function uploadAccountLogo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  accountId: string,
  file: File,
): Promise<{ path: string; url: string } | { error: string }> {
  if (file.size > 2 * 1024 * 1024) return { error: "Bank logos must be 2 MB or smaller." };
  const extension = logoExtension(file);
  if (!extension) return { error: "Upload a PNG, JPG, or WebP image for the bank logo." };

  const path = `${orgId}/${accountId}-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("bank-account-logos").upload(path, file, {
    contentType: file.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) return { error: `Bank logo could not be uploaded: ${error.message}` };
  const { data } = supabase.storage.from("bank-account-logos").getPublicUrl(path);
  return { path, url: data.publicUrl };
}

async function saveAccount(formData: FormData): Promise<{ success: true } | { error: string }> {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "Your session expired — please sign in again." };
  if (!await canPermission("banking", "create")) {
    return { error: "You don't have permission to add accounts." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const accountType = String(formData.get("account_type") ?? "cash").trim();
  const openingBalance = Number(formData.get("opening_balance") ?? 0);
  const accountNumber = String(formData.get("account_number") ?? "").trim();
  const logoValue = formData.get("logo");
  if (!isBankAccountType(accountType)) return { error: "Choose a valid account type." };
  if (accountNumber.length > 80) return { error: "Account numbers must be 80 characters or fewer." };

  if (!name) return { error: "Account name is required." };
  if (Number.isNaN(openingBalance) || openingBalance < 0) {
    return { error: "Enter a valid opening balance." };
  }

  const supabase = await createClient();
  const accountId = crypto.randomUUID();
  let logo: { path: string; url: string } | null = null;
  if (logoValue instanceof File && logoValue.size > 0) {
    const uploaded = await uploadAccountLogo(supabase, context.orgId, accountId, logoValue);
    if ("error" in uploaded) return { error: uploaded.error };
    logo = uploaded;
  }

  const { error } = await supabase.from("bank_accounts").insert({
    id: accountId,
    org_id: context.orgId,
    name,
    account_type: accountType,
    account_number: accountNumber || null,
    logo_url: logo?.url ?? null,
    opening_balance: openingBalance,
    current_balance: openingBalance,
    created_by: context.userId
  });

  if (error) {
    if (logo) await supabase.storage.from("bank-account-logos").remove([logo.path]);
    return { error: error.message };
  }

  revalidatePath("/banking");
  return { success: true };
}

export async function createAccountFromDialog(formData: FormData) {
  return saveAccount(formData);
}

export async function createAccount(formData: FormData): Promise<void> {
  const result = await saveAccount(formData);
  if ("error" in result) redirect(`/banking/new?error=${encodeURIComponent(result.error)}`);
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
    transaction_category: type === "withdrawal" ? "expense" : null,
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
  const accountNumber = String(formData.get("account_number") ?? "").trim();
  const logoValue = formData.get("logo");
  if (!name) return { error: "Account name is required." };
  if (!isBankAccountType(accountType)) return { error: "Choose a valid account type." };
  if (accountNumber.length > 80) return { error: "Account numbers must be 80 characters or fewer." };

  const supabase = await createClient();
  let logo: { path: string; url: string } | null = null;
  if (logoValue instanceof File && logoValue.size > 0) {
    const uploaded = await uploadAccountLogo(supabase, context.orgId, accountId, logoValue);
    if ("error" in uploaded) return { error: uploaded.error };
    logo = uploaded;
  }

  const { error } = await supabase
    .from("bank_accounts")
    .update({
      name,
      account_type: accountType,
      account_number: accountNumber || null,
      ...(logo ? { logo_url: logo.url } : {}),
    })
    .eq("id", accountId)
    .eq("org_id", context.orgId);
  if (error) {
    if (logo) await supabase.storage.from("bank-account-logos").remove([logo.path]);
    return { error: error.message };
  }

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