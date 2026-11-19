"use server";

import { revalidatePath } from "next/cache";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";

const bankAccountsPath = "/education/accounting/bank-accounts";
const chartPath = "/education/accounting/chart-of-accounts";
const cashbookPath = "/education/accounting/cashbook";
const reconciliationPath = "/education/accounting/bank-reconciliation";
const bankTypes = ["cash", "checking", "savings", "mobile_money", "card", "other"] as const;
const accountCodePattern = /^[A-Z0-9][A-Z0-9._/-]{1,19}$/;

type BankAccountResult = { success?: true; refresh?: true; error?: string };

function formValue(formData: FormData, key: string) {
  const field = formData.get(key);
  return typeof field === "string" ? field.trim() : "";
}

function isBankType(value: string): value is (typeof bankTypes)[number] {
  return bankTypes.some((type) => type === value);
}

function logoExtension(file: File) {
  const extensions: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  };
  return extensions[file.type] ?? null;
}

async function uploadLogo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  accountId: string,
  branchId: string | null,
  file: File,
) {
  if (file.size > 2 * 1024 * 1024) return { error: "Bank logos must be 2 MB or smaller." };
  const extension = logoExtension(file);
  if (!extension) return { error: "Choose a PNG, JPG, or WebP logo." };

  const path = `${orgId}/${accountId}/${branchId ?? "organization"}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("education-bank-account-logos").upload(path, file, {
    contentType: file.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) return { error: `The account was saved, but its logo could not be uploaded: ${error.message}` };
  return { path };
}

export async function saveEducationBankAccount(formData: FormData): Promise<BankAccountResult> {
  let accountId = formValue(formData, "accountId");
  const isNewAccount = !accountId;
  const action = accountId ? "edit" : "create";
  if (!await canTabPermission("education_finance", "finance", "chart_of_accounts", action)) {
    return { error: "You do not have permission to manage Education bank accounts." };
  }

  const context = await getCurrentOrgContext();
  if (!context) return { error: "Your session expired. Sign in and try again." };

  const code = formValue(formData, "code").toUpperCase();
  const name = formValue(formData, "name");
  const accountType = formValue(formData, "bankAccountType");
  const accountNumber = formValue(formData, "accountNumber");
  const branchId = formValue(formData, "branchId") || null;
  const removeLogo = formData.get("removeLogo") === "on";
  const logoValue = formData.get("logo");
  const logo = logoValue instanceof File && logoValue.size > 0 ? logoValue : null;

  if (!accountCodePattern.test(code)) return { error: "Enter an account code with 2–20 letters, numbers, or . _ / - characters." };
  if (name.length < 1 || name.length > 120) return { error: "Account name must be between 1 and 120 characters." };
  if (!isBankType(accountType)) return { error: "Choose a valid bank account type." };
  if (accountNumber.length > 80) return { error: "Account or wallet numbers must be 80 characters or fewer." };
  if (accountId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountId)) {
    return { error: "Select a valid bank account." };
  }
  if (logo && (!logoExtension(logo) || logo.size > 2 * 1024 * 1024)) {
    return { error: "Choose a PNG, JPG, or WebP logo no larger than 2 MB." };
  }

  const supabase = await createClient();
  const campusAccess = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const canEdit = await canTabPermission("education_finance", "finance", "chart_of_accounts", "edit");
  if (logo && !canEdit) {
    return { error: "You need account edit permission to upload a bank logo." };
  }

  if (!accountId && branchId && !campusAccess.campuses.some((campus) => campus.id === branchId)) {
    return { error: "Choose a campus you are authorized to manage." };
  }
  if (!accountId && !branchId && !campusAccess.hasOrganizationScope) {
    return { error: "Select an assigned campus for this account." };
  }

  let existingLogoPath: string | null = null;
  let existingBranchId: string | null = null;
  if (accountId) {
    const { data: existing, error } = await supabase.from("education_accounting_accounts")
      .select("id, branch_id, bank_logo_path")
      .eq("org_id", context.orgId)
      .eq("id", accountId)
      .eq("is_cash_account", true)
      .maybeSingle();
    if (error) return { error: `Could not load the bank account: ${error.message}` };
    if (!existing) return { error: "The bank account was not found or is outside your campus access." };
    existingLogoPath = existing.bank_logo_path;
    existingBranchId = existing.branch_id;
  }

  const accountValues = {
    code,
    name,
    bank_account_type: accountType,
    bank_account_number: accountNumber || null,
    updated_at: new Date().toISOString(),
  };

  if (accountId) {
    const { data, error } = await supabase.from("education_accounting_accounts")
      .update(accountValues)
      .eq("org_id", context.orgId)
      .eq("id", accountId)
      .select("id")
      .maybeSingle();
    if (error) {
      if (error.code === "23505") return { error: "That account code is already in use." };
      return { error: `Could not update the bank account: ${error.message}` };
    }
    if (!data) return { error: "The bank account could not be updated in your campus scope." };
  } else {
    const newAccountId = crypto.randomUUID();
    const { error } = await supabase.from("education_accounting_accounts").insert({
      id: newAccountId,
      org_id: context.orgId,
      branch_id: branchId,
      code,
      name,
      account_type: "asset",
      normal_balance: "debit",
      is_cash_account: true,
      bank_account_type: accountType,
      bank_account_number: accountNumber || null,
    });
    if (error) {
      if (error.code === "23505") return { error: "That account code is already in use." };
      return { error: `Could not create the bank account: ${error.message}` };
    }
    accountId = newAccountId;
  }

  const savedAccountId = accountId;
  if (!savedAccountId) return { error: "The account identifier could not be confirmed. Refresh and try again." };

  let newLogoPath: string | null = null;
  if (logo) {
    const uploaded = await uploadLogo(supabase, context.orgId, savedAccountId, isNewAccount ? branchId : existingBranchId, logo);
    if ("error" in uploaded) {
      revalidatePath(bankAccountsPath);
      return { error: uploaded.error, refresh: true };
    }
    newLogoPath = uploaded.path;
  }

  if (newLogoPath || removeLogo) {
    const { error } = await supabase.from("education_accounting_accounts")
      .update({
        bank_logo_path: newLogoPath ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("org_id", context.orgId)
      .eq("id", savedAccountId);
    if (error) {
      if (newLogoPath) await supabase.storage.from("education-bank-account-logos").remove([newLogoPath]);
      return { error: `Account details were saved, but the logo could not be updated: ${error.message}`, refresh: true };
    }
    if (existingLogoPath && (removeLogo || newLogoPath)) {
      const { error: removeError } = await supabase.storage.from("education-bank-account-logos").remove([existingLogoPath]);
      if (removeError) {
        revalidatePath(bankAccountsPath);
        return { error: `Account details were saved, but its previous logo could not be removed: ${removeError.message}`, refresh: true };
      }
    }
  }

  revalidatePath(bankAccountsPath);
  revalidatePath(chartPath);
  revalidatePath(cashbookPath);
  revalidatePath(reconciliationPath);
  revalidatePath("/education/accounting");
  return { success: true };
}

export async function setEducationBankAccountActive(accountId: string, isActive: boolean): Promise<BankAccountResult> {
  if (!await canTabPermission("education_finance", "finance", "chart_of_accounts", "edit")) {
    return { error: "You do not have permission to update Education bank accounts." };
  }
  const context = await getCurrentOrgContext();
  if (!context) return { error: "Your session expired. Sign in and try again." };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountId)) {
    return { error: "Select a valid bank account." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("education_accounting_accounts")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("org_id", context.orgId)
    .eq("id", accountId)
    .eq("is_cash_account", true)
    .select("id")
    .maybeSingle();
  if (error?.code === "23514" && error.message.includes("automated posting mappings")) {
    return { error: "Remove this account from automated posting mappings before deactivating it." };
  }
  if (error) return { error: `Could not update the bank account: ${error.message}` };
  if (!data) return { error: "The bank account was not found or is outside your campus access." };

  revalidatePath(bankAccountsPath);
  revalidatePath(chartPath);
  revalidatePath(cashbookPath);
  revalidatePath(reconciliationPath);
  return { success: true };
}

export async function deleteEducationBankAccount(accountId: string): Promise<BankAccountResult> {
  if (!await canTabPermission("education_finance", "finance", "chart_of_accounts", "edit")) {
    return { error: "You do not have permission to delete Education bank accounts." };
  }
  const context = await getCurrentOrgContext();
  if (!context) return { error: "Your session expired. Sign in and try again." };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountId)) {
    return { error: "Select a valid bank account." };
  }

  const supabase = await createClient();
  const { data: account, error: accountError } = await supabase.from("education_accounting_accounts")
    .select("id, bank_logo_path")
    .eq("org_id", context.orgId)
    .eq("id", accountId)
    .eq("is_cash_account", true)
    .maybeSingle();
  if (accountError) return { error: `Could not verify the bank account: ${accountError.message}` };
  if (!account) return { error: "The bank account was not found or is outside your campus access." };

  const { data, error } = await supabase.rpc("education_delete_accounting_account", {
    p_org_id: context.orgId,
    p_account_id: accountId,
  });
  if (error?.code === "23503") return { error: "This account has journal, reconciliation, mapping, or child-account history. Deactivate it instead." };
  if (error?.code === "42501") return { error: "You do not have access to delete this bank account." };
  if (error || data !== true) return { error: `Could not delete the bank account${error?.message ? `: ${error.message}` : "."}` };

  let logoError: string | null = null;
  if (account.bank_logo_path) {
    const { error: storageError } = await supabase.storage.from("education-bank-account-logos").remove([account.bank_logo_path]);
    if (storageError) logoError = storageError.message;
  }
  revalidatePath(bankAccountsPath);
  revalidatePath(chartPath);
  revalidatePath(cashbookPath);
  revalidatePath(reconciliationPath);
  if (logoError) return { error: `The account was deleted, but its logo could not be removed: ${logoError}`, refresh: true };
  return { success: true };
}
