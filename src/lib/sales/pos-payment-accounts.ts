import { createAdminClient } from "@/lib/supabase/admin";

export interface PosPaymentAllocation {
  paymentMethod: string;
  accountId?: string | null;
  amount: number;
}

export async function validatePosPaymentAccounts(
  orgId: string,
  allocations: PosPaymentAllocation[],
): Promise<string | null> {
  const accountAllocations = allocations.filter((allocation) =>
    /^(card|momo|mobile money|bank transfer)$/i.test(allocation.paymentMethod.trim())
  );
  if (!accountAllocations.length) return null;

  const missingAccount = accountAllocations.find((allocation) => !allocation.accountId);
  if (missingAccount) {
    if (/^card$/i.test(missingAccount.paymentMethod)) return "Select the bank account that receives the card settlement.";
    if (/^bank transfer$/i.test(missingAccount.paymentMethod)) return "Select the bank account that received the transfer.";
    return "Select the mobile-money account that received the payment.";
  }

  const accountIds = [...new Set(accountAllocations.map((allocation) => allocation.accountId as string))];
  const admin = createAdminClient();
  const { data: accounts, error } = await admin
    .from("bank_accounts")
    .select("id, account_type")
    .eq("org_id", orgId)
    .in("id", accountIds);
  if (error) return `Could not verify payment accounts: ${error.message}`;

  const accountTypes = new Map((accounts ?? []).map((account) => [account.id, account.account_type]));
  for (const allocation of accountAllocations) {
    const accountType = accountTypes.get(allocation.accountId as string);
    if (!accountType) return "A selected payment account is unavailable in this organization.";
    if (/^card$/i.test(allocation.paymentMethod) && !["card", "checking", "savings", "other"].includes(accountType)) {
      return "Card payments must be assigned to a card, checking, savings, or other bank account.";
    }
    if (/^bank transfer$/i.test(allocation.paymentMethod) && !["card", "checking", "savings", "other"].includes(accountType)) {
      return "Bank transfers must be assigned to a card, checking, savings, or other bank account.";
    }
    if (/^(momo|mobile money)$/i.test(allocation.paymentMethod) && accountType !== "mobile_money") {
      return "MoMo payments must be assigned to a mobile-money account.";
    }
  }
  return null;
}

export async function recordSalePaymentDeposits(input: {
  orgId: string;
  saleId: string;
  saleNumber: number;
  customerName: string | null;
  transactionDate: string;
  actorId: string;
  allocations: PosPaymentAllocation[];
}): Promise<string | null> {
  const depositedPayments = input.allocations.filter(
    (allocation): allocation is PosPaymentAllocation & { accountId: string } =>
      /^(card|momo|mobile money|bank transfer)$/i.test(allocation.paymentMethod.trim())
      && typeof allocation.accountId === "string"
      && allocation.accountId.length > 0
      && allocation.amount > 0
  );
  if (!depositedPayments.length) return null;

  const admin = createAdminClient();
  const { error } = await admin.from("bank_transactions").insert(depositedPayments.map((payment) => ({
    org_id: input.orgId,
    account_id: payment.accountId,
    type: "deposit" as const,
    amount: payment.amount,
    description: `${payment.paymentMethod} payment for sale #${input.saleNumber}`,
    counterparty_name: input.customerName?.trim() || "Walk-in Customer",
    transaction_category: "income",
    transaction_date: input.transactionDate,
    recorded_by: input.actorId,
  })));
  return error?.message ?? null;
}
