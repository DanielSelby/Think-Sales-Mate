import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { getCurrencyConfig, getCurrencyConfigFromSettings, type CurrencyConfig } from "@/lib/currency";

export async function getOrganizationCurrencyConfig(): Promise<CurrencyConfig> {
  const context = await getCurrentOrgContext();
  if (!context) return getCurrencyConfig();

  const supabase = await createClient();
  const [{ data: settings, error: settingsError }, { data: currency, error: currencyError }] = await Promise.all([
    (supabase
      .from("currency_settings")
      .select("currency_code, currency_symbol, currency_name, decimal_places, thousand_separator, decimal_separator, currency_position")
      .eq("org_id", context.orgId)
      .maybeSingle() as any),
    supabase
      .from("currencies")
      .select("code, name, symbol")
      .eq("org_id", context.orgId)
      .eq("code", context.currency)
      .maybeSingle(),
  ]);
  if (settingsError) throw new Error(`Could not load organization currency formatting: ${settingsError.message}`);
  if (currencyError) throw new Error(`Could not load the organization currency symbol: ${currencyError.message}`);

  return getCurrencyConfigFromSettings({
    currency_code: context.currency || settings?.currency_code,
    currency_symbol: currency?.symbol ?? settings?.currency_symbol,
    currency_name: currency?.name ?? settings?.currency_name,
    decimal_places: settings?.decimal_places,
    thousand_separator: settings?.thousand_separator,
    decimal_separator: settings?.decimal_separator,
    currency_position: settings?.currency_position,
  });
}
