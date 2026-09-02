import os from "node:os";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { getPortalSettings } from "@/app/(dashboard)/settings/customer-ordering/actions";
import { CustomerOrderingSettingsView } from "@/components/customer-portal/customer-ordering-settings-view";

export const metadata = { title: "Customer Ordering Settings · SalesMate ERP" };

function getLanAddress(): string | null {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    const address = entries?.find((entry) => entry.family === "IPv4" && !entry.internal)?.address;
    if (address) return address;
  }
  return null;
}

export default async function CustomerOrderingSettingsPage() {
  const context = await getCurrentOrgContext();
  if (!context) return null;

  const supabase = await createClient();
  const { data: org } = await supabase.from("organizations").select("slug").eq("id", context.orgId).single();

  const settings = await getPortalSettings();
  const configuredSiteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
  const requestHeaders = await headers();
  const requestHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const isLocalUrl = /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?$/i.test(configuredSiteUrl);
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (requestHost?.startsWith("localhost") ? "http" : "https");
  const host = isLocalUrl
    ? `${getLanAddress() ?? "localhost"}${requestHost?.match(/:\d+$/)?.[0] ?? ":3000"}`
    : null;
  const siteUrl = (host ? `${protocol}://${host}` : configuredSiteUrl) || "https://yourapp.com";
  const portalUrl = `${siteUrl}/order/${org?.slug ?? context.orgId}`;

  return <CustomerOrderingSettingsView initial={settings} portalUrl={portalUrl} />;
}