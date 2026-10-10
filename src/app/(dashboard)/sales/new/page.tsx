import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient} from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { can } from "@/lib/rbac";
import { getPlatformSystemName } from "@/lib/supabase/platform-admin";
import { getCustomerOutstandingBalances } from "@/lib/sales/customer-outstanding";
import {
  SaleForm,
  type SellableProduct,
  type SaleCustomer,
  type SaleLocation,
  type SalesRep,
  type RecentItem,
  type SalePaymentAccount
} from "@/components/sales/sale-form";

export default async function NewSalePage() {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();
  let locationsQuery = supabase
    .from("business_locations")
    .select("id, name, code, phone, email")
    .eq("org_id", context.orgId)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .order("name");
  if (context.isBranchScoped && context.allowedLocationIds.length > 0) {
    locationsQuery = locationsQuery.in("id", context.allowedLocationIds);
  }
  let stockLevelsQuery = supabase
    .from("product_stock_levels")
    .select("product_id, location_id, quantity")
    .eq("org_id", context.orgId);
  if (context.isBranchScoped) {
    stockLevelsQuery = stockLevelsQuery.in("location_id", context.allowedLocationIds);
  }

  const [
    { data: productRows },
    { data: customerRows },
    { data: locationRows },
    { data: memberRows },
    { data: pastSaleRows },
    { data: recentItemRows },
    { data: stockLevelRows },
    { data: companyprofile }
  ] = await Promise.all([
    supabase
      .from("products")
      .select("id, location_id, sku, barcode, name, unit_price, wholesale_price, vip_price, special_price, cost_price, stock_quantity, allow_negative_stock")
      .eq("org_id", context.orgId)
      .eq("is_active", true)
      .order("name"),
    supabase.from("customers").select("id, name, email, phone, payment_terms_days").eq("org_id", context.orgId).order("name"),
    locationsQuery,
    supabase
      .from("organization_members")
      .select("user_id, invited_email, status")
      .eq("org_id", context.orgId)
      .eq("status", "active"),
    supabase.from("sales").select("customer_id").eq("org_id", context.orgId).not("customer_id", "is", null),
    supabase
      .from("sale_items")
      .select("product_id, created_at, products(id, name, unit_price)")
      .eq("org_id", context.orgId)
      .order("created_at", { ascending: false })
      .limit(20),
    stockLevelsQuery,
    supabase.from("company_profile").select("company_name, logo_url, show_logo_on_invoices, show_contact_on_invoices, sales_invoice_template, invoice_slogan, invoice_thank_you_message, invoice_terms_and_conditions, business_phone, business_email, contact_phone, contact_email, website").eq("org_id", context.orgId).maybeSingle()
  ]);;

  const balances = await getCustomerOutstandingBalances(
    supabase,
    context.orgId,
    context.isBranchScoped ? context.allowedLocationIds : undefined
  );

  const returningCustomerIds = new Set((pastSaleRows ?? []).map((s) => s.customer_id).filter(Boolean) as string[]);

  const customers: SaleCustomer[] = (customerRows ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    outstanding: (balances.byCustomerId.get(c.id) ?? 0) +
      (balances.byCustomerName.get(c.name.trim().toLocaleLowerCase()) ?? 0),
    isReturning: returningCustomerIds.has(c.id),
    paymentTermsDays: c.payment_terms_days,
  }));

  const products: SellableProduct[] = (productRows ?? []).map((p) => ({
      id: p.id,
      locationId: p.location_id,
      sku: p.sku,
      barcode: p.barcode,
      name: p.name,
      unitPrice: p.unit_price,
      wholesalePrice: p.wholesale_price,
      vipPrice: p.vip_price,
      specialPrice: p.special_price,
      costPrice: Number(p.cost_price ?? 0),
      stockQuantity: context.isBranchScoped ? 0 : p.stock_quantity,
      allowNegativeStock: Boolean(p.allow_negative_stock)
    }));

  const locations: SaleLocation[] = (locationRows ?? []).map((l) => ({ id: l.id, name: l.name, code: l.code, phone: l.phone, email: l.email }));

  const memberUserIds = (memberRows ?? []).map((m) => m.user_id).filter(Boolean) as string[];
  const { data: memberProfiles } = memberUserIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", memberUserIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const nameByUserId = new Map((memberProfiles ?? []).map((p) => [p.id, p.full_name]));

  const admin = createAdminClient();
  const { data: paymentAccountRows, error: paymentAccountsError } = await admin
    .from("bank_accounts")
    .select("id, name, account_type, account_number")
    .eq("org_id", context.orgId)
    .order("name");
  if (paymentAccountsError) throw new Error(`Payment accounts could not be loaded: ${paymentAccountsError.message}`);
  const paymentAccounts: SalePaymentAccount[] = (paymentAccountRows ?? []).map((account) => ({
    id: account.id,
    name: account.name,
    accountType: account.account_type,
    accountNumber: account.account_number ?? null,
  }));

  const reps: SalesRep[] = [];
  for (const m of memberRows ?? []) {
    let email = m.invited_email ?? "";
    if (m.user_id) {
      const { data } = await admin.auth.admin.getUserById(m.user_id);
      email = data.user?.email ?? email;
    }
    if (m.user_id) reps.push({ id: m.user_id, email, name: nameByUserId.get(m.user_id) ?? null });
  }

  const seenProducts = new Set<string>();
  const recentItems: RecentItem[] = [];
  for (const row of recentItemRows ?? []) {
    const product = Array.isArray(row.products) ? row.products[0] : row.products;
    if (!product || seenProducts.has(product.id)) continue;
    seenProducts.add(product.id);
    recentItems.push({ id: product.id, name: product.name, unitPrice: product.unit_price });
    if (recentItems.length === 3) break;
  }

  const stockLevels = (stockLevelRows ?? []).map((s) => ({
    productId: s.product_id,
    locationId: s.location_id,
    quantity: s.quantity,
  }));

  const systemName = await getPlatformSystemName().catch(() => "ThinkSales ERP Pro");
  return (
    <SaleForm
      orgId={context.orgId}
      products={products}
      customers={customers}
      locations={locations}
      paymentAccounts={paymentAccounts}
      reps={reps}
      recentItems={recentItems}
      stockLevels={stockLevels}
      currentUserId={context.userId}
      currentUserEmail={context.userEmail}
      orgName={companyprofile?.company_name || context.orgName}
      systemName={systemName}
      currency={context.currency}
      logoUrl={companyprofile?.logo_url ?? null}
      showLogoOnInvoices={companyprofile?.show_logo_on_invoices ?? true}
      organizationPhone={companyprofile?.contact_phone || companyprofile?.business_phone || null}
      organizationEmail={companyprofile?.contact_email || companyprofile?.business_email || null}
      organizationWebsite={companyprofile?.website ?? null}
      showOrganizationContact={companyprofile?.show_contact_on_invoices ?? true}
      invoiceTemplate={companyprofile?.sales_invoice_template ?? "standard"}
      invoiceSlogan={companyprofile?.invoice_slogan ?? null}
      invoiceThankYouMessage={companyprofile?.invoice_thank_you_message ?? null}
      invoiceTermsAndConditions={companyprofile?.invoice_terms_and_conditions ?? null}
      canCheckCrossBranchStock={context.canCheckCrossBranchStock}
      canChoosePriceTier={context.priceGroups.length > 1}
      allowedPriceGroups={context.priceGroups}
    />
  );
}