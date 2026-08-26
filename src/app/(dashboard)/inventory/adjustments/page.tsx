// Target path (confirmed from your zip): app/(dashboard)/inventory/adjustments/page.tsx
// (/inventory/stock-taking re-exports this same page — no change needed there.)
//
// This replaces my earlier guessed page.tsx. It's now your real
// adjustments/page.tsx with two fixes applied, everything else left as-is
// since the rest of it already works correctly:
//
// 1. currentUserName was resolving to context.orgName (the ORGANIZATION's
//    name), falling back to a hardcoded "Daniel Addy" if that was empty —
//    so the "Responsible Person" avatar initial and any personalization
//    were never actually showing the signed-in person. Now resolved from
//    their profile.
// 2. canManage is now computed and passed, so the finalize/save buttons
//    in the form can actually respect permissions client-side (the server
//    action already enforces this regardless).

import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import {
  StockAdjustmentForm,
  type AdjustLocation,
  type AdjustableProduct,
  type ResponsiblePerson,
} from "@/components/inventory/stock-adjustment-form";

export const metadata = {
  title: "Stock Taking & Adjustment · ThinkSales Pro",
};

export default async function StockAdjustmentPage() {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();

  const [
    { data: locationRows },
    { data: productRows },
    { data: stockLevelRows },
    { data: memberRows },
    { data: profileRows },
  ] = await Promise.all([
    supabase
      .from("business_locations")
      .select("id, name, is_primary")
      .eq("org_id", context.orgId)
      .eq("is_active", true)
      .order("is_primary", { ascending: false })
      .order("name"),
    supabase
      .from("products")
      .select("id, sku, barcode, name, category, brand, stock_quantity, cost_price, unit_price, image_urls, location_id")
      .eq("org_id", context.orgId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("product_stock_levels")
      .select("product_id, location_id, quantity")
      .eq("org_id", context.orgId),
    supabase
      .from("organization_members")
      .select("user_id, role")
      .eq("org_id", context.orgId)
      .eq("status", "active"),
    supabase.from("profiles").select("id, full_name, avatar_url"),
  ]);

  const locations: AdjustLocation[] = (locationRows ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    isPrimary: l.is_primary,
  }));

  // Build stock by product and location
  const stockByProductLoc: Record<string, Record<string, number>> = {};
  (stockLevelRows ?? []).forEach((sl) => {
    if (!stockByProductLoc[sl.product_id]) {
      stockByProductLoc[sl.product_id] = {};
    }
    stockByProductLoc[sl.product_id][sl.location_id] = sl.quantity;
  });

  const products: AdjustableProduct[] = (productRows ?? []).map((p) => ({
    id: p.id,
    sku: p.sku,
    barcode: p.barcode,
    name: p.name,
    category: p.category,
    brand: p.brand,
    locationId: p.location_id,
    stockQuantity: p.stock_quantity ?? 0,
    costPrice: p.cost_price ?? 0,
    unitPrice: p.unit_price ?? 0,
    imageUrl: p.image_urls?.[0] || null,
    locationStocks: stockByProductLoc[p.id] || {},
  }));

  // Build team members. Dropped the `user-${Math.random()}` fallback id
  // for members with no linked user_id (e.g. a still-pending invite) —
  // that produced a fresh random id on every render, which isn't a
  // usable "Responsible Person" selection anyway since it can't be saved
  // against any real user.
  const profileMap = new Map((profileRows ?? []).map((pr) => [pr.id, pr]));
  const teamMembers: ResponsiblePerson[] = (memberRows ?? [])
    .filter((m): m is typeof m & { user_id: string } => !!m.user_id)
    .map((m) => {
      const prof = profileMap.get(m.user_id);
      return {
        id: m.user_id,
        name: prof?.full_name || "Team Member",
        avatarUrl: prof?.avatar_url || null,
        role: m.role,
      };
    });

  const currentUserProfile = profileMap.get(context.userId);
  const currentUserName =
    currentUserProfile?.full_name ||
    teamMembers.find((tm) => tm.id === context.userId)?.name ||
    context.userEmail ||
    "You";

  if (!teamMembers.some((tm) => tm.id === context.userId)) {
    teamMembers.unshift({
      id: context.userId,
      name: currentUserName,
      avatarUrl: currentUserProfile?.avatar_url || null,
      role: context.role,
    });
  }

  return (
    <StockAdjustmentForm
      locations={locations}
      products={products}
      teamMembers={teamMembers}
      currency={context.currency || "GHS"}
      currentUserName={currentUserName}
      currentUserId={context.userId}
      canManage={can(context.role, "inventory.manage")}
    />
  );
}