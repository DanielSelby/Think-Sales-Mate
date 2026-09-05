import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import {
  StockTransferForm,
  type TransferLocation,
  type TransferableProduct,
  type StockLevel,
  type RecentTransferSummary
} from "@/components/inventory/stock-transfer-form";

export default async function NewStockTransferPage({ searchParams }: { searchParams: Promise<{ requestId?: string }> }) {
  const activeOrgId = await (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();
  const { requestId } = await searchParams;

  const [{ data: locationRows }, { data: productRows }, { data: stockLevelRows }, { data: recentRows }] = await Promise.all([
    supabase
      .from("business_locations")
      .select("id, name, location_type")
      .eq("org_id", context.orgId)
      .eq("is_active", true)
      .order("is_primary", { ascending: false })
      .order("name"),
    supabase
      .from("products")
      .select("id, sku, name, unit_price, cost_price")
      .eq("org_id", context.orgId)
      .eq("is_active", true)
      .order("name"),
    supabase.from("product_stock_levels").select("product_id, location_id, quantity").eq("org_id", context.orgId),
    supabase
      .from("stock_transfers")
      .select(
        "id, transfer_number, reference_no, status, from:from_location_id(name), to:to_location_id(name)"
      )
      .eq("org_id", context.orgId)
      .order("created_at", { ascending: false })
      .limit(3)
  ]);

  const locations: TransferLocation[] = (locationRows ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    type: l.location_type
  }));

  const products: TransferableProduct[] = (productRows ?? []).map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    unitCost: p.cost_price ?? p.unit_price
  }));

  const stockLevels: StockLevel[] = (stockLevelRows ?? []).map((s) => ({
    productId: s.product_id,
    locationId: s.location_id,
    quantity: s.quantity
  }));

  const recentTransfers: RecentTransferSummary[] = (recentRows ?? []).map((t) => {
    const from = Array.isArray(t.from) ? t.from[0] : t.from;
    const to = Array.isArray(t.to) ? t.to[0] : t.to;
    return {
      id: t.id,
      label: t.reference_no || `#${String(t.transfer_number).padStart(4, "0")}`,
      fromName: from?.name ?? "—",
      toName: to?.name ?? "—",
      status: t.status
    };
  });

  let initialTransfer:
    | {
        fromLocationId: string;
        toLocationId: string;
        referenceNo: string | null;
        transferDate: string | null;
        reason: string | null;
        notes: string | null;
        items: Array<{ productId: string; quantity: number }>;
      }
    | undefined;
  if (requestId) {
    const [{ data: request }, { data: requestItems }] = await Promise.all([
      supabase
        .from("stock_requests")
        .select("source_location_id, requesting_location_id, reference, notes")
        .eq("id", requestId)
        .eq("org_id", context.orgId)
        .maybeSingle(),
      supabase
        .from("stock_request_items")
        .select("product_id, quantity")
        .eq("request_id", requestId)
        .eq("org_id", context.orgId),
    ]);
    if (request) {
      initialTransfer = {
        fromLocationId: request.source_location_id,
        toLocationId: request.requesting_location_id,
        referenceNo: request.reference,
        transferDate: new Date().toISOString().slice(0, 10),
        reason: "Approved branch stock request",
        notes: request.notes,
        items: (requestItems ?? []).map((item) => ({ productId: item.product_id, quantity: item.quantity })),
      };
    }
  }

  return (
    <StockTransferForm
      locations={locations}
      products={products}
      stockLevels={stockLevels}
      recentTransfers={recentTransfers}
      currentUserEmail={context.userEmail}
      currentUserName={context.userEmail ? context.userEmail.split("@")[0] : "Daniel Kofi"}
      currentUserRole={context.role || "Administrator"}
      currency={context.currency || "GHS"}
      initialTransfer={initialTransfer}
    />
  );
}