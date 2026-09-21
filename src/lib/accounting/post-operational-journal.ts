import type { SupabaseClient } from "@supabase/supabase-js";

type AccountRow = {
  id: string;
  name: string;
  type: "asset" | "liability" | "equity" | "revenue" | "cogs" | "expense";
};

type JournalLine = {
  account_id: string;
  description: string;
  debit: number;
  credit: number;
};

function chooseAccount(accounts: AccountRow[], type: AccountRow["type"], terms: string[]): AccountRow | null {
  const candidates = accounts.filter((account) => account.type === type);
  return candidates.find((account) => terms.some((term) => account.name.toLowerCase().includes(term))) ?? candidates[0] ?? null;
}

export async function postOperationalJournal(
  supabase: SupabaseClient,
  input: {
    orgId: string;
    actorId: string;
    sourceModule: string;
    sourceId: string;
    date: string;
    locationId: string | null;
    reference: string;
    description: string;
    lines: JournalLine[];
  },
): Promise<{ journalId: string | null; error: string | null }> {
  const { data: accounts, error: accountsError } = await supabase
    .from("accounting_accounts")
    .select("id, name, type")
    .eq("org_id", input.orgId)
    .eq("is_active", true);

  if (accountsError) return { journalId: null, error: accountsError.message };
  const availableAccounts = (accounts ?? []) as AccountRow[];
  const accountIds = new Set(availableAccounts.map((account) => account.id));
  if (input.lines.some((line) => !accountIds.has(line.account_id))) {
    return { journalId: null, error: "One or more accounting accounts are not available." };
  }

  const { data, error } = await supabase.rpc("post_operational_journal", {
    p_org_id: input.orgId,
    p_entry_date: input.date,
    p_location_id: input.locationId,
    p_description: input.description,
    p_reference: input.reference,
    p_source_module: input.sourceModule,
    p_source_id: input.sourceId,
    p_lines: input.lines,
    p_created_by: input.actorId,
  });

  return { journalId: data ?? null, error: error?.message ?? null };
}

export async function resolveOperationalAccounts(
  supabase: SupabaseClient,
  orgId: string,
  kind: "sale" | "expense" | "purchase" | "purchase_payment" | "collection",
): Promise<{ debitAccountId: string | null; creditAccountId: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from("accounting_accounts")
    .select("id, name, type")
    .eq("org_id", orgId)
    .eq("is_active", true);
  if (error) return { debitAccountId: null, creditAccountId: null, error: error.message };

  const accounts = (data ?? []) as AccountRow[];
  const debit = kind === "sale" || kind === "collection"
    ? chooseAccount(accounts, "asset", kind === "collection" ? ["cash", "bank", "mobile", "momo"] : ["cash", "bank", "mobile", "momo", "receivable"])
    : kind === "purchase"
      ? chooseAccount(accounts, "asset", ["inventory", "stock", "purchase"])
      : kind === "purchase_payment"
        ? chooseAccount(accounts, "liability", ["payable", "accounts payable"])
      : chooseAccount(accounts, "expense", []);
  const credit = kind === "sale"
    ? chooseAccount(accounts, "revenue", ["sales", "revenue"])
    : kind === "collection"
      ? chooseAccount(accounts, "asset", ["receivable", "accounts receivable", "customer"])
      : kind === "purchase"
        ? chooseAccount(accounts, "liability", ["payable", "accounts payable"])
        : kind === "purchase_payment"
          ? chooseAccount(accounts, "asset", ["cash", "bank", "mobile", "momo"])
        : chooseAccount(accounts, "asset", ["cash", "bank", "mobile", "momo"]);

  if (!debit || !credit) {
    return {
      debitAccountId: debit?.id ?? null,
      creditAccountId: credit?.id ?? null,
      error: kind === "sale"
        ? "Configure an asset cash/receivable account and a revenue account before automatic sales journals can be posted."
        : kind === "purchase"
          ? "Configure an inventory asset account and a payable account before automatic purchase journals can be posted."
          : kind === "collection"
            ? "Configure a cash/bank account and an accounts receivable account before collection journals can be posted."
            : "Configure an expense account and a cash/bank account before automatic expense journals can be posted.",
    };
  }
  return { debitAccountId: debit.id, creditAccountId: credit.id, error: null };
}
