import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { getDraftSales } from "@/app/(dashboard)/sales/actions";
import { DraftsListView } from "@/components/sales/drafts-list-view";
import { getPlatformSystemName } from "@/lib/supabase/platform-admin";

export const metadata = { title: "Drafts & Quotations · SalesMate ERP" };

export default async function DraftsPage({ searchParams }: { searchParams?: { type?: string } }) {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const drafts = await getDraftSales(context.orgId);
  const supabase = await createClient();
  const [{ data: requests }, { data: items }, { data: locations }, { data: companyProfile }] = await Promise.all([
    supabase.from("stock_requests").select("id, request_number, status, requesting_location_id, source_location_id, transfer_id, created_at").eq("org_id", context.orgId).order("created_at", { ascending: false }),
    supabase.from("stock_request_items").select("request_id, quantity").eq("org_id", context.orgId),
    supabase.from("business_locations").select("id, name, phone, email").eq("org_id", context.orgId),
    supabase.from("company_profile").select("company_name, logo_url, show_logo_on_invoices, show_contact_on_invoices, sales_invoice_template, invoice_slogan, invoice_thank_you_message, invoice_terms_and_conditions, business_phone, business_email, contact_phone, contact_email, website").eq("org_id", context.orgId).maybeSingle(),
  ]);
  const locationById = new Map((locations ?? []).map((location) => [location.id, location]));
  const locationNames = new Map((locations ?? []).map((location) => [location.id, location.name]));
  const draftsWithContacts = drafts.map((draft) => {
    const location = draft.locationId ? locationById.get(draft.locationId) : null;
    return {
      ...draft,
      locationName: location?.name ?? null,
      locationPhone: location?.phone ?? null,
      locationEmail: location?.email ?? null,
    };
  });
  const quantities = new Map<string, number>();
  for (const item of items ?? []) quantities.set(item.request_id, (quantities.get(item.request_id) ?? 0) + item.quantity);

  const initialType = searchParams?.type === "quotation" || searchParams?.type === "proforma" || searchParams?.type === "draft"
    ? searchParams.type
    : "all";

  const systemName = await getPlatformSystemName().catch(() => "ThinkSales ERP Pro");
  return <DraftsListView userId={context.userId} initialType={initialType} drafts={draftsWithContacts} currency={context.currency} orgName={companyProfile?.company_name || context.orgName} systemName={systemName}
    logoUrl={companyProfile?.logo_url ?? null}
    showLogoOnInvoices={companyProfile?.show_logo_on_invoices ?? true}
    organizationPhone={companyProfile?.contact_phone || companyProfile?.business_phone || null}
    organizationEmail={companyProfile?.contact_email || companyProfile?.business_email || null}
    organizationWebsite={companyProfile?.website ?? null}
    showOrganizationContact={companyProfile?.show_contact_on_invoices ?? true}
    invoiceTemplate={companyProfile?.sales_invoice_template ?? "standard"}
    invoiceSlogan={companyProfile?.invoice_slogan ?? null}
    invoiceThankYouMessage={companyProfile?.invoice_thank_you_message ?? null}
    invoiceTermsAndConditions={companyProfile?.invoice_terms_and_conditions ?? null}
    branchRequests={(requests ?? []).map((request) => ({
    id: request.id,
    label: `REQ-${String(request.request_number).padStart(4, "0")}`,
    source: locationNames.get(request.source_location_id) ?? "—",
    destination: locationNames.get(request.requesting_location_id) ?? "—",
    createdAt: request.created_at,
    totalQuantity: quantities.get(request.id) ?? 0,
    status: request.status,
    transferId: request.transfer_id,
  }))} />;
}