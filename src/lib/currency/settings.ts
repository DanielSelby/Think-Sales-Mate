import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { getCurrencyConfig, getCurrencyConfigFromSettings, type CurrencyConfig } from "@/lib/currency";

export async function getOrganizationCurrencyConfig(): Promise<CurrencyConfig> {
  const context = await getCurrentOrgContext();
  if (!context) return getCurrencyConfig();

  const supabase = await createClient();
  const { data } = await (supabase
    .from("currency_settings")
    .select("currency_code, currency_symbol, currency_name, decimal_places, thousand_separator, decimal_separator, currency_position")
    .eq("org_id", context.orgId)
    .maybeSingle() as any);

  return getCurrencyConfigFromSettings({
    currency_code: data?.currency_code ?? context.currency,
    currency_symbol: data?.currency_symbol,
    currency_name: data?.currency_name,
    decimal_places: data?.decimal_places,
    thousand_separator: data?.thousand_separator,
    decimal_separator: data?.decimal_separator,
    currency_position: data?.currency_position,
  });
}
