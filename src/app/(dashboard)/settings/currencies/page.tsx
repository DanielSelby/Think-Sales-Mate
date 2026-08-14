import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { CurrenciesManager, type CurrencyRow, type CurrencySettingsData } from "@/components/settings/currencies-manager";
import { ensureCurrencySettings } from "@/app/(dashboard)/settings/currencies/actions";

export default async function CurrenciesPage() {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  await ensureCurrencySettings(context.orgId);

  const supabase = await createClient();
  const [{ data: currencyRows }, { data: settingsRow }] = await Promise.all([
    supabase
      .from("currencies")
      .select("id, code, name, symbol, exchange_rate_to_base, is_active, is_default, is_base, last_updated_at")
      .eq("org_id", context.orgId)
      .order("is_base", { ascending: false })
      .order("code"),
    supabase.from("currency_settings").select("*").eq("org_id", context.orgId).single()
  ]);

  const currencies: CurrencyRow[] = (currencyRows ?? []).map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    symbol: c.symbol,
    exchangeRate: c.exchange_rate_to_base,
    isActive: c.is_active,
    isDefault: c.is_default,
    isBase: c.is_base,
    lastUpdatedAt: c.last_updated_at
  }));

  const settings: CurrencySettingsData = settingsRow
    ? {
        exchangeRateSource: settingsRow.exchange_rate_source,
        rateUpdateFrequency: settingsRow.rate_update_frequency,
        decimalPlaces: settingsRow.decimal_places,
        roundingMode: settingsRow.rounding_mode,
        multiCurrencyEnabled: settingsRow.multi_currency_enabled,
        homeCurrencyDisplay: settingsRow.home_currency_display,
        exchangeRateOnTransaction: settingsRow.exchange_rate_on_transaction,
        revaluationEnabled: settingsRow.revaluation_enabled
      }
    : {
        exchangeRateSource: "manual",
        rateUpdateFrequency: "daily",
        decimalPlaces: 2,
        roundingMode: "none",
        multiCurrencyEnabled: false,
        homeCurrencyDisplay: true,
        exchangeRateOnTransaction: true,
        revaluationEnabled: false
      };

  return (
    <CurrenciesManager
      currencies={currencies}
      settings={settings}
      canManage={can(context.role, "settings.edit")}
    />
  );
}