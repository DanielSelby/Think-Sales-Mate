import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SaleForm,
  type SellableProduct,
  type SaleCustomer,
  type SaleLocation,
  type SalesRep,
  type RecentItem,
  type SaleStockLevel,
  type SalePaymentAccount,
} from "@/components/sales/sale-form";
import { getSaleForEdit } from "@/app/(dashboard)/sales/actions";
import { can } from "@/lib/rbac";
import { getPlatformSystemName } from "@/lib/supabase/platform-admin";
import { getCustomerOutstandingBalances } from "@/lib/sales/customer-outstanding";

export default async function EditSalePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();
  const initialSale = await getSaleForEdit(id);
  if (!initialSale) notFound();

  let locationsQuery = supabase
    .from("business_locations")
    .select("id, name, code, phone, email")
    .eq("org_id", context.orgId)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .order("name");
  let stockLevelsQuery = supabase
    .from("product_stock_levels")
    .select("product_id, location_id, quantity")
    .eq("org_id", context.orgId);
  if (context.isBranchScoped) {
    locationsQuery = locationsQuery.in("id", context.allowedLocationIds);
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
    // No stock_quantity filter here — an existing line's product might be
    // fully allocated elsewhere and show 0 org-wide; it's reclaimed below.
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

  // Reclaim this sale's own quantities so its existing lines still show
  // enough "available" stock to edit, even if the product is otherwise
  // fully allocated elsewhere (mirrors the same pattern used on the POS
  // edit-sale flow).
  const reclaimByProduct = new Map<string, number>();
  for (const item of initialSale.items) {
    reclaimByProduct.set(item.productId, (reclaimByProduct.get(item.productId) ?? 0) + item.quantity);
  }
  const availableByProduct = new Set(
    (stockLevelRows ?? [])
      .filter((row) => Number(row.quantity) > 0)
      .map((row) => row.product_id)
  );
  const quantityByProduct = new Map<string, number>();
  for (const level of stockLevelRows ?? []) {
    quantityByProduct.set(level.product_id, (quantityByProduct.get(level.product_id) ?? 0) + Number(level.quantity ?? 0));
  }
  const existingProductIds = new Set(initialSale.items.map((item) => item.productId));
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
    stockQuantity: (context.isBranchScoped ? quantityByProduct.get(p.id) ?? 0 : p.stock_quantity) + (reclaimByProduct.get(p.id) ?? 0),
    allowNegativeStock: Boolean(p.allow_negative_stock),
  })).filter((p) =>
    !context.isBranchScoped ||
    availableByProduct.has(p.id) ||
    existingProductIds.has(p.id) ||
    p.allowNegativeStock
  );

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

  const stockLevels: SaleStockLevel[] = (stockLevelRows ?? []).map((s) => ({
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
      initialSale={initialSale}
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