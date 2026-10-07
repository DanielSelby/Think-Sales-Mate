import { notFound } from "next/navigation";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission } from "@/lib/rbac/permissions";
import { canAccessLocation } from "@/lib/organizations/location-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { NewBranchReturnForm, type ReturnFormProduct, type ReturnFormLocation } from "@/components/inventory/return-products/new-branch-return-form";

export default async function NewBranchProductReturnPage() {
  const context = await getCurrentOrgContext();
  if (!context || !await canPermission("inventory", "create")) notFound();

  const admin = createAdminClient();
  const { data: locationRows, error: locationsError } = await admin
    .from("business_locations")
    .select("id, name, location_type, is_active")
    .eq("org_id", context.orgId)
    .eq("is_active", true)
    .order("name");
  if (locationsError) throw new Error(`Could not load return locations: ${locationsError.message}`);

  const allLocations = locationRows ?? [];
  const sourceLocations = allLocations.filter((location) => canAccessLocation(context, location.id));
  const destinationLocations = allLocations.filter((location) =>
    location.location_type === "warehouse" || location.location_type === "distribution_center"
  );
  const sourceIds = sourceLocations.map((location) => location.id);
  const locationOptions: ReturnFormLocation[] = sourceLocations.map(({ id, name }) => ({ id, name }));
  const destinationOptions: ReturnFormLocation[] = destinationLocations.map(({ id, name }) => ({ id, name }));
  const { data: levels, error: levelsError } = sourceIds.length
    ? await admin.from("product_stock_levels").select("product_id, location_id, quantity").eq("org_id", context.orgId).in("location_id", sourceIds).gt("quantity", 0)
    : { data: [], error: null };
  if (levelsError) throw new Error(`Could not load branch inventory: ${levelsError.message}`);
  const productIds = [...new Set((levels ?? []).map((level) => level.product_id))];
  const { data: productRows, error: productsError } = productIds.length
    ? await admin.from("products").select("id, name, sku, cost_price, unit, is_active, track_inventory").eq("org_id", context.orgId).in("id", productIds)
    : { data: [], error: null };
  if (productsError) throw new Error(`Could not load branch products: ${productsError.message}`);
  const productById = new Map((productRows ?? [])
    .filter((product) => product.is_active && product.track_inventory)
    .map((product) => [product.id, product]));

  const incomingLocationIds = sourceIds;
  const { data: transferRows, error: transfersError } = incomingLocationIds.length
    ? await admin.from("stock_transfers")
      .select("id, transfer_number, reference_no, transfer_date, to_location_id")
      .eq("org_id", context.orgId)
      .eq("status", "completed")
      .in("to_location_id", incomingLocationIds)
      .order("transfer_date", { ascending: false })
      .limit(500)
    : { data: [], error: null };
  if (transfersError) throw new Error(`Could not load stock transfer history: ${transfersError.message}`);
  const transferIds = (transferRows ?? []).map((transfer) => transfer.id);
  const { data: transferItems, error: transferItemsError } = transferIds.length
    ? await admin.from("stock_transfer_items").select("transfer_id, product_id").eq("org_id", context.orgId).in("transfer_id", transferIds)
    : { data: [], error: null };
  if (transferItemsError) throw new Error(`Could not load transferred product references: ${transferItemsError.message}`);
  const transferById = new Map((transferRows ?? []).map((transfer) => [transfer.id, transfer]));
  const transfersByProductAndLocation = new Map<string, { id: string; label: string }[]>();
  for (const line of transferItems ?? []) {
    const transfer = transferById.get(line.transfer_id);
    if (!transfer) continue;
    const key = `${transfer.to_location_id}:${line.product_id}`;
    const list = transfersByProductAndLocation.get(key) ?? [];
    list.push({
      id: transfer.id,
      label: transfer.reference_no || `TRF-${String(transfer.transfer_number).padStart(6, "0")} · ${transfer.transfer_date}`,
    });
    transfersByProductAndLocation.set(key, list);
  }

  const products: ReturnFormProduct[] = (levels ?? []).flatMap((level) => {
    const product = productById.get(level.product_id);
    if (!product) return [];
    return [{
      id: product.id,
      name: product.name,
      sku: product.sku,
      locationId: level.location_id,
      available: level.quantity,
      unitCost: Number(product.cost_price ?? 0),
      unit: product.unit,
      transfers: transfersByProductAndLocation.get(`${level.location_id}:${level.product_id}`) ?? [],
    }];
  });

  return (
    <NewBranchReturnForm
      locations={locationOptions}
      destinations={destinationOptions}
      products={products}
      currency={context.currency || "GHS"}
    />
  );
}
