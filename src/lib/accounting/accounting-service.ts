import { createClient } from "@/lib/supabase/server";

export async function fetchLiveAccountingData(orgId: string) {
  try {
    const supabase = await createClient();

    const client = supabase as any;
    // Query available tables in parallel
    const [
      { data: accounts },
      { data: journals },
      { data: invoices },
      { data: purchases },
      { data: expenses },
      { data: bankAccounts },
      { data: assets },
    ] = await Promise.all([
      client.from("accounting_accounts").select("*").eq("org_id", orgId).order("code"),
      client.from("journal_entries").select("*, journal_entry_lines(*)").eq("org_id", orgId).order("entry_date", { ascending: false }).limit(50),
      client.from("invoices").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(50),
      client.from("purchases").select("*, suppliers(name)").eq("org_id", orgId).order("purchase_date", { ascending: false }).limit(50),
      client.from("expenses").select("*").eq("org_id", orgId).order("expense_date", { ascending: false }).limit(50),
      client.from("bank_accounts").select("*").eq("org_id", orgId).order("name"),
      client.from("fixed_assets_register").select("*").eq("org_id", orgId).order("asset_code"),
    ]);

    return {
      accounts: accounts ?? [],
      journals: journals ?? [],
      invoices: invoices ?? [],
      purchases: purchases ?? [],
      expenses: expenses ?? [],
      bankAccounts: bankAccounts ?? [],
      assets: assets ?? [],
    };
  } catch {
    return null;
  }
}
