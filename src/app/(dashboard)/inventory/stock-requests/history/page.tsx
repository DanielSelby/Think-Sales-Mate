import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { StockRequestHistory } from "@/components/inventory/stock-request-history";

export default async function StockRequestHistoryPage() {
  const context = await getCurrentOrgContext((await cookies()).get("active_org_id")?.value);
  if (!context) return null;
  const supabase = await createClient();
  const [{ data: requests }, { data: items }, { data: locations }] = await Promise.all([
    supabase.from("stock_requests").select("id, request_number, status, requesting_location_id, source_location_id, transfer_id, created_at").eq("org_id", context.orgId).order("created_at", { ascending: false }),
    supabase.from("stock_request_items").select("request_id, quantity").eq("org_id", context.orgId),
    supabase.from("business_locations").select("id, name").eq("org_id", context.orgId),
  ]);
  const locationNames = new Map((locations ?? []).map((location) => [location.id, location.name]));
  const quantities = new Map<string, number>();
  for (const item of items ?? []) quantities.set(item.request_id, (quantities.get(item.request_id) ?? 0) + item.quantity);
  return <StockRequestHistory canApprove={can(context.role, "inventory.stock_request.approve")} requests={(requests ?? []).map((request) => ({ id: request.id, label: `REQ-${String(request.request_number).padStart(4, "0")}`, status: request.status, source: locationNames.get(request.source_location_id) ?? "—", destination: locationNames.get(request.requesting_location_id) ?? "—", createdAt: request.created_at, totalQuantity: quantities.get(request.id) ?? 0, transferId: request.transfer_id }))} />;
}
