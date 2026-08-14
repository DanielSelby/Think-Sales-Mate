import { createClient } from "@/lib/supabase/server";

export async function getActiveCurrencies(orgId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("currencies")
    .select("code, name, symbol, exchange_rate_to_base, is_base, is_default")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("is_base", { ascending: false });
  return data ?? [];
}

/**
 * Converts an amount in `fromCode` into the org's base currency, using the
 * stored rate snapshot. Returns the original amount unchanged if the
 * currency isn't found or is already the base currency.
 */
export async function convertToBase(orgId: string, amount: number, fromCode: string): Promise<number> {
  if (!fromCode) return amount;
  const supabase = await createClient();
  const { data } = await supabase
    .from("currencies")
    .select("exchange_rate_to_base, is_base")
    .eq("org_id", orgId)
    .eq("code", fromCode)
    .maybeSingle();

  if (!data || data.is_base) return amount;
  return amount * data.exchange_rate_to_base;
}