"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";

async function requireAdmin() {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "Your session expired — please sign in again." } as const;
  if (!can(context.role, "settings.edit")) {
    return { error: "You don't have permission to change currency settings." } as const;
  }
  return { context } as const;
}

export async function ensureCurrencySettings(orgId: string) {
  const supabase = createClient();
  const { data: existing } = await supabase.from("currency_settings").select("org_id").eq("org_id", orgId).maybeSingle();
  if (!existing) {
    await supabase.from("currency_settings").insert({ org_id: orgId });
  }
}

export async function updateCurrencySettings(fields: {
  exchangeRateSource?: "manual" | "frankfurter";
  rateUpdateFrequency?: "manual" | "hourly" | "daily" | "weekly";
  decimalPlaces?: number;
  roundingMode?: "none" | "nearest_1" | "nearest_5" | "nearest_10" | "nearest_100";
  multiCurrencyEnabled?: boolean;
  homeCurrencyDisplay?: boolean;
  exchangeRateOnTransaction?: boolean;
  revaluationEnabled?: boolean;
}) {
  const check = await requireAdmin();
  if ("error" in check) return check;

  const supabase = createClient();
  await ensureCurrencySettings(check.context.orgId);

  const { error } = await supabase
    .from("currency_settings")
    .update({
      exchange_rate_source: fields.exchangeRateSource,
      rate_update_frequency: fields.rateUpdateFrequency,
      decimal_places: fields.decimalPlaces,
      rounding_mode: fields.roundingMode,
      multi_currency_enabled: fields.multiCurrencyEnabled,
      home_currency_display: fields.homeCurrencyDisplay,
      exchange_rate_on_transaction: fields.exchangeRateOnTransaction,
      revaluation_enabled: fields.revaluationEnabled,
      updated_at: new Date().toISOString()
    })
    .eq("org_id", check.context.orgId);

  if (error) return { error: error.message };
  revalidatePath("/settings/currencies");
  return { success: true };
}

export async function createCurrency(input: { code: string; name: string; symbol: string; exchangeRate: number }) {
  const check = await requireAdmin();
  if ("error" in check) return check;

  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return { error: "Currency code must be 3 letters, e.g. USD." };
  if (!input.name.trim()) return { error: "Currency name is required." };
  if (Number.isNaN(input.exchangeRate) || input.exchangeRate <= 0) return { error: "Enter a valid exchange rate." };

  const supabase = createClient();
  const { error } = await supabase.from("currencies").insert({
    org_id: check.context.orgId,
    code,
    name: input.name.trim(),
    symbol: input.symbol.trim() || code,
    exchange_rate_to_base: input.exchangeRate
  });

  if (error) {
    return { error: error.code === "23505" ? `${code} is already added.` : error.message };
  }
  revalidatePath("/settings/currencies");
  return { success: true };
}

export async function updateCurrency(
  id: string,
  fields: { exchangeRate?: number; isActive?: boolean; name?: string; symbol?: string }
) {
  const check = await requireAdmin();
  if ("error" in check) return check;

  const supabase = createClient();
  const { error } = await supabase
    .from("currencies")
    .update({
      exchange_rate_to_base: fields.exchangeRate,
      is_active: fields.isActive,
      name: fields.name,
      symbol: fields.symbol,
      last_updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .eq("org_id", check.context.orgId);

  if (error) return { error: error.message };
  revalidatePath("/settings/currencies");
  return { success: true };
}

export async function setDefaultCurrency(id: string) {
  const check = await requireAdmin();
  if ("error" in check) return check;

  const supabase = createClient();
  await supabase.from("currencies").update({ is_default: false }).eq("org_id", check.context.orgId);
  const { error } = await supabase
    .from("currencies")
    .update({ is_default: true })
    .eq("id", id)
    .eq("org_id", check.context.orgId);

  if (error) return { error: error.message };
  revalidatePath("/settings/currencies");
  return { success: true };
}

export async function setBaseCurrency(id: string) {
  const check = await requireAdmin();
  if ("error" in check) return check;

  const supabase = createClient();

  const { data: target } = await supabase.from("currencies").select("code").eq("id", id).single();
  if (!target) return { error: "Currency not found." };

  // The base currency's own rate is always 1 by definition; every other
  // currency's rate is relative to whichever one is base.
  await supabase.from("currencies").update({ is_base: false }).eq("org_id", check.context.orgId);
  await supabase.from("currencies").update({ is_base: true, exchange_rate_to_base: 1 }).eq("id", id);
  await ensureCurrencySettings(check.context.orgId);
  await supabase.from("currency_settings").update({ updated_at: new Date().toISOString() }).eq("org_id", check.context.orgId);

  const { error } = await supabase.from("currency_settings").upsert(
    { org_id: check.context.orgId, updated_at: new Date().toISOString() },
    { onConflict: "org_id" }
  );

  revalidatePath("/settings/currencies");
  return error ? { error: error.message } : { success: true };
}

export async function deleteCurrency(id: string) {
  const check = await requireAdmin();
  if ("error" in check) return check;

  const supabase = createClient();
  const { data: currency } = await supabase.from("currencies").select("is_base").eq("id", id).single();
  if (currency?.is_base) return { error: "You can't remove the base currency." };

  const { error } = await supabase.from("currencies").delete().eq("id", id).eq("org_id", check.context.orgId);
  if (error) return { error: error.message };
  revalidatePath("/settings/currencies");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Real automatic rate refresh via Frankfurter.app (free, ECB rates, no key).
// ---------------------------------------------------------------------------
export async function refreshExchangeRates() {
  const check = await requireAdmin();
  if ("error" in check) return check;

  const supabase = createClient();
  const { data: base } = await supabase
    .from("currencies")
    .select("code")
    .eq("org_id", check.context.orgId)
    .eq("is_base", true)
    .maybeSingle();

  if (!base) return { error: "Set a base currency before refreshing rates." };

  const { data: currencies } = await supabase
    .from("currencies")
    .select("id, code, is_base")
    .eq("org_id", check.context.orgId)
    .eq("is_active", true);

  const targets = (currencies ?? []).filter((c) => !c.is_base);
  if (targets.length === 0) return { success: true, updated: 0 };

  try {
    const symbols = targets.map((t) => t.code).join(",");
    const res = await fetch(`https://api.frankfurter.app/latest?from=${base.code}&to=${symbols}`);
    if (!res.ok) throw new Error(`Rate provider returned ${res.status}`);
    const data: { rates: Record<string, number> } = await res.json();

    let updated = 0;
    for (const currency of targets) {
      const rate = data.rates[currency.code];
      if (!rate) continue;
      await supabase
        .from("currencies")
        .update({ exchange_rate_to_base: rate, last_updated_at: new Date().toISOString() })
        .eq("id", currency.id);
      updated++;
    }

    revalidatePath("/settings/currencies");
    return { success: true, updated };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not reach the exchange rate provider." };
  }
}