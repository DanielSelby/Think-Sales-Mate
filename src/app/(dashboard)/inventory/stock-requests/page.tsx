import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { StockRequestForm } from "@/components/inventory/stock-request-form";

export default async function BranchStockRequestPage() {
  const context = await getCurrentOrgContext((await cookies()).get("active_org_id")?.value);
  if (!context) return null;
  const supabase = await createClient();
  const [{ data: locations }, { data: products }, { data: levels }] = await Promise.all([
    supabase.from("business_locations").select("id, name, location_type").eq("org_id", context.orgId).eq("is_active", true).order("name"),
    supabase.from("products").select("id, name, sku, unit").eq("org_id", context.orgId).eq("is_active", true).order("name"),
    (() => {
      let query = supabase.from("product_stock_levels").select("product_id, location_id, quantity").eq("org_id", context.orgId);
      return context.isBranchScoped ? query.in("location_id", context.allowedLocationIds) : query;
    })(),
  ]);
  const stockByProduct = new Map<string, Record<string, number>>();
  for (const level of levels ?? []) stockByProduct.set(level.product_id, { ...(stockByProduct.get(level.product_id) ?? {}), [level.location_id]: level.quantity });
  const allowedSourceLocationIds = context.branchScope === "all" ? (locations ?? []).map((location) => location.id) : context.allowedLocationIds;
  const visibleLocations = context.isBranchScoped
    ? (locations ?? []).filter((location) => context.allowedLocationIds.includes(location.id))
    : locations ?? [];
  const defaultRequestingLocationId = context.locationId ?? visibleLocations[0]?.id ?? "";
  return <StockRequestForm locations={visibleLocations.map((location) => ({ id: location.id, name: location.name, type: location.location_type }))} products={(products ?? []).map((product) => ({ id: product.id, name: product.name, sku: product.sku, unit: product.unit ?? "PCS", stockByLocation: stockByProduct.get(product.id) ?? {} }))} defaultRequestingLocationId={defaultRequestingLocationId} allowedSourceLocationIds={allowedSourceLocationIds} currency={context.currency || "GHS"} />;
}
