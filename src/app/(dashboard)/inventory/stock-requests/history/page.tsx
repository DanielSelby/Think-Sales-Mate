import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { StockRequestHistory } from "@/components/inventory/stock-request-history";

export default async function StockRequestHistoryPage({ searchParams }: { searchParams?: { id?: string } }) {
  const context = await getCurrentOrgContext((await cookies()).get("active_org_id")?.value);
  if (!context) return null;
  const supabase = await createClient();
  const [{ data: requests }, { data: items }, { data: locations }] = await Promise.all([
    supabase.from("stock_requests").select("id, request_number, status, requesting_location_id, source_location_id, transfer_id, created_at, requested_by, priority, notes, reference").eq("org_id", context.orgId).order("created_at", { ascending: false }),
    supabase.from("stock_request_items").select("request_id, quantity, reason, products(name, sku)").eq("org_id", context.orgId),
    supabase.from("business_locations").select("id, name").eq("org_id", context.orgId),
  ]);
  const locationNames = new Map((locations ?? []).map((location) => [location.id, location.name]));
  const requesterIds = [...new Set((requests ?? []).map((request) => request.requested_by).filter(Boolean))];
  const { data: profiles } = requesterIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", requesterIds)
    : { data: [] };
  const requesterNames = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));
  const quantities = new Map<string, number>();
  for (const item of items ?? []) quantities.set(item.request_id, (quantities.get(item.request_id) ?? 0) + item.quantity);
  const visibleRequests = (requests ?? []).filter((request) =>
    !context.isBranchScoped ||
    (context.allowedLocationIds.includes(request.source_location_id) || context.allowedLocationIds.includes(request.requesting_location_id))
  );
  return <StockRequestHistory initialRequestId={searchParams?.id} canApprove={can(context.role, "inventory.stock_request.approve")} requests={visibleRequests.map((request) => ({
    id: request.id,
    label: `REQ-${String(request.request_number).padStart(4, "0")}`,
    status: request.status,
    source: locationNames.get(request.source_location_id) ?? "—",
    destination: locationNames.get(request.requesting_location_id) ?? "—",
    createdAt: request.created_at,
    requestedBy: requesterNames.get(request.requested_by) ?? "Unknown user",
    totalQuantity: quantities.get(request.id) ?? 0,
    itemCount: (items ?? []).filter((item) => item.request_id === request.id).length,
    requestType: request.transfer_id ? "Stock Transfer" : "Stock Replenishment",
    priority: request.priority,
    notes: request.notes,
    transferId: request.transfer_id,
    items: (items ?? []).filter((item) => item.request_id === request.id).map((item) => {
      const product = Array.isArray(item.products) ? item.products[0] : item.products;
      return { productName: product?.name ?? "Unknown product", sku: product?.sku ?? null, quantity: item.quantity, reason: item.reason };
    }),
  }))} />;
}
