import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission, requirePermission } from "@/lib/rbac/permissions";
import { PosView } from "@/components/pos/pos-view";

export const metadata = { title: "POS · SalesMate ERP" };

export default async function PosPage() {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  await requirePermission("pos", "view");

  const orgId = context.orgId;
  const supabase = await createClient();
  const db = supabase as any;
  const { data: registerSession, error: sessionError } = await db
    .from("pos_register_sessions")
    .select("id, location_id, register_name, cashier_name, opening_cash, opened_at, shift")
    .eq("org_id", orgId)
    .eq("cashier_id", context.userId)
    .eq("status", "open")
    .maybeSingle();
  if (sessionError) throw new Error("Could not verify the register session.");
  if (!registerSession) redirect("/pos/open-register");

  const [{ data: products }, { data: locations }, { data: stockLevels }, { data: profile }, { data: mobileMoneyAccounts }] = await Promise.all([
    supabase
      .from("products")
      .select("id, location_id, name, sku, barcode, category, brand, unit_price, wholesale_price, vip_price, special_price, cost_price, stock_quantity, image_urls")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("name"),
    (() => {
      return supabase
        .from("business_locations")
        .select("id, name")
        .eq("org_id", orgId)
        .eq("id", registerSession.location_id)
        .eq("is_active", true);
    })(),
    // Per-branch stock — the product grid needs this to only show/allow
    // what's actually at the selected branch, not the org-wide total.
    (() => {
      let query = supabase.from("product_stock_levels").select("product_id, location_id, quantity").eq("org_id", orgId);
      return query.eq("location_id", registerSession.location_id);
    })(),
    supabase.from("profiles").select("full_name").eq("id", context.userId).maybeSingle(),
    supabase.from("bank_accounts").select("id, name, current_balance").eq("org_id", orgId).eq("account_type", "mobile_money").order("name")
  ]);

  const rawLocations = context.masterLocationId
    ? (locations ?? []).filter((location) => location.id === context.masterLocationId)
    : (locations ?? []);
  const quantityByProduct = new Map<string, number>();
  for (const stock of stockLevels ?? []) {
    quantityByProduct.set(stock.product_id, (quantityByProduct.get(stock.product_id) ?? 0) + Number(stock.quantity ?? 0));
  }
  const rawProducts = products ?? [];
  const scopedLocations = context.isBranchScoped && context.allowedLocationIds.length > 0
    ? rawLocations.filter((l) => context.allowedLocationIds.includes(l.id))
    : rawLocations;

  return (
    <PosView
      products={rawProducts.map((p) => ({
        id: p.id,
        locationId: p.location_id,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        category: p.category,
        brand: p.brand,
        unitPrice: p.unit_price,
        wholesalePrice: p.wholesale_price,
        vipPrice: p.vip_price,
        specialPrice: p.special_price,
        costPrice: Number(p.cost_price ?? 0),
        stockQuantity: context.isBranchScoped || context.masterLocationId
          ? quantityByProduct.get(p.id) ?? 0
          : p.stock_quantity,
        imageUrl: p.image_urls?.[0] ?? null,
      }))}
      locations={scopedLocations.map((l) => ({ id: l.id, name: l.name }))}
      stockLevels={(stockLevels ?? []).map((s) => ({ productId: s.product_id, locationId: s.location_id, quantity: s.quantity }))}
      currency={context.currency}
      taxRatePercent={15}
      cashierName={profile?.full_name || context.userEmail}
      canCheckCrossBranchStock={context.canCheckCrossBranchStock && !context.isBranchScoped}
      canChoosePriceTier={context.priceGroups.length > 1}
      allowedPriceGroups={context.priceGroups}
      useSystemPrices={context.useSystemPrices}
      canApproveRegisterClosures={
        await canPermission("approvals", "approve") ||
        await canPermission("pos", "approve") ||
        await canPermission("cash_closing", "approve") ||
        await canPermission("banking", "approve")
      }
      registerSession={{
        id: registerSession.id,
        locationId: registerSession.location_id,
        cashierId: context.userId,
        registerName: registerSession.register_name,
        cashierName: registerSession.cashier_name,
        openingCash: Number(registerSession.opening_cash ?? 0),
        openedAt: registerSession.opened_at,
        shift: registerSession.shift,
      }}
      mobileMoneyAccounts={(mobileMoneyAccounts ?? []).map((account) => ({ id: account.id, name: account.name, balance: account.current_balance }))}
    />
  );
}