import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SaleForm,
  type SellableProduct,
  type SaleCustomer,
  type SaleLocation,
  type SalesRep,
  type RecentItem
} from "@/components/sales/sale-form";

export default async function NewSalePage() {
  const activeOrgId = cookies().get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = createClient();

  const [
    { data: productRows },
    { data: customerRows },
    { data: locationRows },
    { data: memberRows },
    { data: openInvoices },
    { data: pastSaleRows },
    { data: recentItemRows }
  ] = await Promise.all([
    supabase
      .from("products")
      .select("id, sku, name, unit_price, stock_quantity")
      .eq("org_id", context.orgId)
      .eq("is_active", true)
      .gt("stock_quantity", 0)
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
      .limit(20)
  ]);

  // Best-effort outstanding balance per customer — invoices only store a
  // free-text customer_name (they predate the customers table), so this
  // matches by name rather than a real foreign key.
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
    isReturning: returningCustomerIds.has(c.id)
  }));

  const products: SellableProduct[] = (productRows ?? []).map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    unitPrice: p.unit_price,
    stockQuantity: p.stock_quantity
  }));

  const locations: SaleLocation[] = (locationRows ?? []).map((l) => ({ id: l.id, name: l.name }));

  const admin = createAdminClient();
  const reps: SalesRep[] = [];
  for (const m of memberRows ?? []) {
    let email = m.invited_email ?? "";
    if (m.user_id) {
      const { data } = await admin.auth.admin.getUserById(m.user_id);
      email = data.user?.email ?? email;
    }
    if (m.user_id) reps.push({ id: m.user_id, email });
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

  return (
    <SaleForm
      products={products}
      customers={customers}
      locations={locations}
      reps={reps}
      recentItems={recentItems}
      currentUserId={context.userId}
      currentUserEmail={context.userEmail}
    />
  );
}