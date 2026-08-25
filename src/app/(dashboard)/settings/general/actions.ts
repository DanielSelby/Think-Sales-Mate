"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";
import { updateCurrency } from "@/app/(dashboard)/settings/organization/actions";
import { updateCurrencySettings, ensureCurrencySettings } from "@/app/(dashboard)/settings/currencies/actions";

async function requireAdmin() {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "Your session expired — please sign in again." } as const;
  if (!can(context.role, "settings.edit")) {
    return { error: "You don't have permission to edit general settings." } as const;
  }
  return { context } as const;
}

export interface GeneralSettingsRow {
  business_short_name: string | null;
  default_language: string;
  timezone: string;
  date_format: string;
  time_format: "12h" | "24h";
  financial_year_start: string;
  default_tax_rate: number;
  enable_barcode_scanning: boolean;
  enable_notifications: boolean;
  enable_email_alerts: boolean;
  session_timeout_minutes: number;
  auto_logout_minutes: number;
  default_landing_page: string;
}

export async function getGeneralSettings(orgId: string): Promise<GeneralSettingsRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_general_settings")
    .select(
      "business_short_name, default_language, timezone, date_format, time_format, financial_year_start, default_tax_rate, enable_barcode_scanning, enable_notifications, enable_email_alerts, session_timeout_minutes, auto_logout_minutes, default_landing_page"
    )
    .eq("org_id", orgId)
    .maybeSingle();
  return data as GeneralSettingsRow | null;
}

export interface GeneralSettingsFields {
  businessName: string;
  businessShortName?: string;
  defaultCurrency: string;
  defaultLanguage: string;
  timezone: string;
  dateFormat: string;
  timeFormat: "12h" | "24h";
  financialYearStart: string; // MM-DD
  defaultTaxRate: number;
  enableMultiCurrency: boolean;
  enableBarcodeScanning: boolean;
  enableNotifications: boolean;
  enableEmailAlerts: boolean;
  sessionTimeoutMinutes: number;
  autoLogoutMinutes: number;
  defaultLandingPage: string;
}

export async function saveGeneralSettings(fields: GeneralSettingsFields) {
  const check = await requireAdmin();
  if ("error" in check) return check;

  if (!fields.businessName.trim()) return { error: "Business name is required." };
  if (!/^\d{2}-\d{2}$/.test(fields.financialYearStart)) {
    return { error: "Financial year start must be in MM-DD format, e.g. 01-01." };
  }
  if (Number.isNaN(fields.defaultTaxRate) || fields.defaultTaxRate < 0 || fields.defaultTaxRate > 100) {
    return { error: "Default tax rate must be between 0 and 100." };
  }
  if (Number.isNaN(fields.sessionTimeoutMinutes) || fields.sessionTimeoutMinutes <= 0) {
    return { error: "Session timeout must be a positive number of minutes." };
  }
  if (Number.isNaN(fields.autoLogoutMinutes) || fields.autoLogoutMinutes <= 0) {
    return { error: "Auto logout duration must be a positive number of minutes." };
  }

  const supabase = await createClient();

  // Business Name lives on organizations — same field every other page reads.
  const { error: orgError } = await supabase
    .from("organizations")
    .update({ name: fields.businessName.trim() })
    .eq("id", check.context.orgId);
  if (orgError) return { error: orgError.message };

  // Default Currency reuses organizations.currency + the same permission
  // check as Settings > Organization / Currencies, rather than a second
  // copy of "the" currency that could drift out of sync.
  const currencyResult = await updateCurrency(fields.defaultCurrency);
  if (currencyResult && "error" in currencyResult) return currencyResult;

  // Enable Multi-Currency reuses currency_settings.multi_currency_enabled,
  // which Settings > Currencies already owns.
  await ensureCurrencySettings(check.context.orgId);
  const currencySettingsResult = await updateCurrencySettings({ multiCurrencyEnabled: fields.enableMultiCurrency });
  if (currencySettingsResult?.error) return currencySettingsResult;

  const { error } = await supabase.from("org_general_settings").upsert(
    {
      org_id: check.context.orgId,
      business_short_name: fields.businessShortName || null,
      default_language: fields.defaultLanguage,
      timezone: fields.timezone,
      date_format: fields.dateFormat,
      time_format: fields.timeFormat,
      financial_year_start: fields.financialYearStart,
      default_tax_rate: fields.defaultTaxRate,
      enable_barcode_scanning: fields.enableBarcodeScanning,
      enable_notifications: fields.enableNotifications,
      enable_email_alerts: fields.enableEmailAlerts,
      session_timeout_minutes: fields.sessionTimeoutMinutes,
      auto_logout_minutes: fields.autoLogoutMinutes,
      default_landing_page: fields.defaultLandingPage,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id" }
  );

  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { success: true };
}

const DEFAULTS: GeneralSettingsRow = {
  business_short_name: null,
  default_language: "en",
  timezone: "UTC",
  date_format: "MMM DD, YYYY",
  time_format: "12h",
  financial_year_start: "01-01",
  default_tax_rate: 0,
  enable_barcode_scanning: false,
  enable_notifications: true,
  enable_email_alerts: true,
  session_timeout_minutes: 30,
  auto_logout_minutes: 30,
  default_landing_page: "/dashboard",
};

export async function resetGeneralSettings() {
  const check = await requireAdmin();
  if ("error" in check) return check;

  const supabase = await createClient();
  const { error } = await supabase
    .from("org_general_settings")
    .upsert({ org_id: check.context.orgId, ...DEFAULTS, updated_at: new Date().toISOString() }, { onConflict: "org_id" });

  if (error) return { error: error.message };
  revalidatePath("/settings/general");
  return { success: true };
}