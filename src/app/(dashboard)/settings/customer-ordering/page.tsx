import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { getPortalSettings } from "@/app/(dashboard)/settings/customer-ordering/actions";
import { CustomerOrderingSettingsView } from "@/components/customer-portal/customer-ordering-settings-view";

export const metadata = { title: "Customer Ordering Settings · SalesMate ERP" };

export default async function CustomerOrderingSettingsPage() {
  const context = await getCurrentOrgContext();
  if (!context) return null;

  const supabase = await createClient();
  const { data: org } = await supabase.from("organizations").select("slug").eq("id", context.orgId).single();

  const settings = await getPortalSettings();
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
  const portalUrl = `${siteUrl || "https://yourapp.com"}/order/${org?.slug ?? context.orgId}`;

  return <CustomerOrderingSettingsView initial={settings} portalUrl={portalUrl} />;
}