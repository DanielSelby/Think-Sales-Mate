import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { GeneralSettingsForm } from "@/components/settings/general-settings-form";
import { getGeneralSettings } from "@/app/(dashboard)/settings/general/actions";

export const metadata = { title: "General Settings · SalesMate ERP" };

export default async function GeneralSettingsPage() {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();
  const [{ data: orgRow }, settings, { data: currencySettingsRow }] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", context.orgId).single(),
    getGeneralSettings(context.orgId),
    supabase.from("currency_settings").select("multi_currency_enabled").eq("org_id", context.orgId).maybeSingle(),
  ]);

  return (
    <GeneralSettingsForm
      businessName={orgRow?.name ?? context.orgName}
      currentCurrency={context.currency}
      settings={settings}
      multiCurrencyEnabled={currencySettingsRow?.multi_currency_enabled ?? false}
      canManage={can(context.role, "settings.edit")}
    />
  );
}