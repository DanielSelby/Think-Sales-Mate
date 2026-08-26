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
} from "@/components/sales/sale-form";
import { getSaleForEdit } from "@/app/(dashboard)/sales/actions";

export default async function EditSalePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();
  const initialSale = await getSaleForEdit(id);
  if (!initialSale) notFound();

  const [
    { data: productRows },
    { data: customerRows },
    { data: locationRows },
    { data: memberRows },
    { data: openInvoices },
    { data: pastSaleRows },
    { data: recentItemRows },
    { data: stockLevelRows },
    { data: companyprofile }

  ] = await Promise.all([
    // No stock_quantity filter here — an existing line's product might be
    // fully allocated elsewhere and show 0 org-wide; it's reclaimed below.
    supabase
      .from("products")
      .select("id, sku, name, unit_price, stock_quantity")
      .eq("org_id", context.orgId)
      .eq("is_active", true)
      .order("name"),
    supabase.from("customers").select("id, name, email, phone").eq("org_id", context.orgId).order("name"),
    supabase
      .from("business_locations")
      .select("id, name")
      .eq("org_id", context.orgId)
      .eq("is_active", true)
      .order("is_primary", { ascending: false })
      .order("name"),
    supabase
      .from("organization_members")
      .select("user_id, invited_email, status")
      .eq("org_id", context.orgId)
      .eq("status", "active"),
    supabase.from("invoices").select("customer_name, amount").eq("org_id", context.orgId).in("status", ["sent", "overdue"]),
    supabase.from("sales").select("customer_id").eq("org_id", context.orgId).not("customer_id", "is", null),
    supabase
      .from("sale_items")
      .select("product_id, created_at, products(id, name, unit_price)")
      .eq("org_id", context.orgId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("product_stock_levels").select("product_id, location_id, quantity").eq("org_id", context.orgId),
    supabase.from("company_profile").select("logo_url, show_logo_on_invoices").eq("org_id", context.orgId).maybeSingle()
  ]);;

  const outstandingByName = new Map<string, number>();
  for (const inv of openInvoices ?? []) {
    if (!inv.customer_name) continue;
    outstandingByName.set(inv.customer_name, (outstandingByName.get(inv.customer_name) ?? 0) + Number(inv.amount));
  }
  const returningCustomerIds = new Set((pastSaleRows ?? []).map((s) => s.customer_id).filter(Boolean) as string[]);

  const customers: SaleCustomer[] = (customerRows ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    outstanding: outstandingByName.get(c.name) ?? 0,
    isReturning: returningCustomerIds.has(c.id),
  }));

  // Reclaim this sale's own quantities so its existing lines still show
  // enough "available" stock to edit, even if the product is otherwise
  // fully allocated elsewhere (mirrors the same pattern used on the POS
  // edit-sale flow).
  const reclaimByProduct = new Map<string, number>();
  for (const item of initialSale.items) {
    reclaimByProduct.set(item.productId, (reclaimByProduct.get(item.productId) ?? 0) + item.quantity);
  }
  const products: SellableProduct[] = (productRows ?? []).map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    unitPrice: p.unit_price,
    stockQuantity: p.stock_quantity + (reclaimByProduct.get(p.id) ?? 0),
  }));

  const locations: SaleLocation[] = (locationRows ?? []).map((l) => ({ id: l.id, name: l.name }));

  const memberUserIds = (memberRows ?? []).map((m) => m.user_id).filter(Boolean) as string[];
  const { data: memberProfiles } = memberUserIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", memberUserIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const nameByUserId = new Map((memberProfiles ?? []).map((p) => [p.id, p.full_name]));

  const admin = createAdminClient();
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

  return (
    <SaleForm
      orgId={context.orgId}
      products={products}
      customers={customers}
      locations={locations}
      reps={reps}
      recentItems={recentItems}
      stockLevels={stockLevels}
      initialSale={initialSale}
      currentUserId={context.userId}
      currentUserEmail={context.userEmail}
      orgName={context.orgName}
      currency={context.currency}
      logoUrl={companyprofile?.logo_url ?? null}
      showLogoOnInvoices={companyprofile?.show_logo_on_invoices ?? true}
    />
  );
}