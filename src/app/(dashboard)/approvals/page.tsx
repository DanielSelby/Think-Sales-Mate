import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { canPermission } from "@/lib/rbac/permissions";
import { ApprovalCenter, type ApprovalRow } from "@/components/approvals/approval-center";

export const metadata = { title: "Approval Center · ThinkSales" };

export default async function ApprovalCenterPage() {
  const context = await getCurrentOrgContext((await cookies()).get("active_org_id")?.value);
  if (!context) redirect("/onboarding");
  const canManageRegisterClosures =
    await canPermission("approvals", "approve") ||
    await canPermission("pos", "approve") ||
    await canPermission("cash_closing", "approve") ||
    await canPermission("banking", "approve");
  const canManageApprovalHistory = await canPermission("approvals", "approve");
  const canAccessEndOfDay =
    await canPermission("cash_closing", "view") ||
    await canPermission("cash_closing", "create");
  const canManageLegacyApprovalQueue = can(context.role, "inventory.stock_request.approve");
  if (!canManageRegisterClosures && !canManageLegacyApprovalQueue) redirect("/dashboard");

  const supabase = await createClient();
  const [{ data: requests }, { data: requestItems }, { data: expenses }, { data: returns }, { data: customerOrders }, { data: completed }, { data: locations }, { data: registerClosures, error: registerClosuresError }] = await Promise.all([
    supabase.from("stock_requests").select("id, request_number, requested_by, requesting_location_id, source_location_id, status, priority, submitted_at, created_at").eq("org_id", context.orgId).eq("status", "pending_approval").order("created_at", { ascending: false }),
    supabase.from("stock_request_items").select("request_id, product_id, quantity, reason, products(name, sku)").eq("org_id", context.orgId),
    supabase.from("expenses").select("id, expense_number, recorded_by, location_id, category, description, amount, status, expense_date, created_at").eq("org_id", context.orgId).eq("status", "pending_approval").order("created_at", { ascending: false }),
    supabase.from("purchase_returns").select("id, return_number, created_by, location_id, total_return_value, status, return_date, created_at").eq("org_id", context.orgId).eq("status", "submitted").order("created_at", { ascending: false }),
    supabase.from("customer_orders").select("id, order_number, guest_name, location_id, total, status, created_at").eq("org_id", context.orgId).eq("status", "new").order("created_at", { ascending: false }),
    supabase.from("audit_logs").select("entity_type, entity_id").eq("org_id", context.orgId).eq("action", "approval.completed"),
    supabase.from("business_locations").select("id, name").eq("org_id", context.orgId),
    supabase.from("register_closures").select("id, closed_by, location_id, scope, cashier_name, status, created_at, net_total, variance, sales_count").eq("org_id", context.orgId).eq("status", "pending_approval").order("created_at", { ascending: false }),
  ]);
  if (registerClosuresError) throw new Error(`Could not load pending register approvals: ${registerClosuresError.message}`);

  const userIds = [
    ...(requests ?? []).map((row) => row.requested_by),
    ...(expenses ?? []).map((row) => row.recorded_by),
    ...(returns ?? []).map((row) => row.created_by),
    ...(registerClosures ?? []).map((row) => row.closed_by),
  ];
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", Array.from(new Set(userIds)))
    : { data: [] };
  const locationById = new Map((locations ?? []).map((row) => [row.id, row.name]));
  const profileById = new Map((profiles ?? []).map((row) => [row.id, row]));

  const completedKeys = new Set((completed ?? []).map((row) => `${row.entity_type}:${row.entity_id}`));
  const visible = <T extends { requesting_location_id?: string | null; source_location_id?: string | null; location_id?: string | null }>(row: T) =>
    !context.isBranchScoped || context.allowedLocationIds.some((id) =>
      id === row.requesting_location_id || id === row.source_location_id || id === row.location_id);
  const rows: ApprovalRow[] = [
    ...(requests ?? []).filter(visible).map((row) => ({
      id: row.id, type: "stock_request" as const, document: `REQ-${String(row.request_number).padStart(6, "0")}`,
      title: "Stock Request", requester: profileById.get(row.requested_by)?.full_name ?? "Unknown user",
      branch: locationById.get(row.requesting_location_id) ?? "—", date: row.submitted_at ?? row.created_at,
      amount: null, status: "pending_approval", priority: row.priority, href: `/inventory/stock-requests/history?id=${row.id}`,
      details: [{ label: "Source", value: locationById.get(row.source_location_id) ?? "—" }],
      items: (requestItems ?? []).filter((item) => item.request_id === row.id).map((item) => { const product = Array.isArray(item.products) ? item.products[0] : item.products; return { productName: product?.name ?? "Unknown product", sku: product?.sku ?? null, quantity: item.quantity, reason: item.reason }; }),
    })),
    ...(expenses ?? []).filter(visible).map((row) => ({
      id: row.id, type: "expense" as const, document: `EXP-${String(row.expense_number).padStart(6, "0")}`,
      title: row.category, requester: profileById.get(row.recorded_by)?.full_name ?? "Unknown user",
      branch: locationById.get(row.location_id ?? "") ?? "—", date: row.expense_date ?? row.created_at,
      amount: row.amount, status: row.status, priority: row.amount >= 10000 ? "high" : "normal", href: `/expenses/${row.id}`,
    })),
    ...(returns ?? []).filter(visible).map((row) => ({
      id: row.id, type: "purchase_return" as const, document: `RET-${String(row.return_number).padStart(6, "0")}`,
      title: "Purchase Return", requester: profileById.get(row.created_by)?.full_name ?? "Unknown user",
      branch: locationById.get(row.location_id) ?? "—", date: row.return_date ?? row.created_at,
      amount: row.total_return_value, status: row.status, priority: row.total_return_value >= 10000 ? "high" : "normal", href: "/purchases/returns/new",
    })),
    ...(customerOrders ?? []).filter((row) => !context.isBranchScoped || context.allowedLocationIds.includes(row.location_id ?? "")).map((row) => ({
      id: row.id, type: "customer_order" as const, document: row.order_number,
      title: "Customer Order", requester: row.guest_name, branch: locationById.get(row.location_id ?? "") ?? "—",
      date: row.created_at, amount: row.total, status: row.status, priority: row.total >= 10000 ? "high" : "normal", href: `/orders/${row.id}`,
    })),
    ...(registerClosures ?? []).filter(visible).map((row) => ({
      id: row.id, type: "register_closure" as const, document: `REG-${row.id.slice(0, 8).toUpperCase()}`,
      title: row.scope === "all" ? "All Cashiers Register Close" : `${row.cashier_name ?? "Individual"} Register Close`,
      requester: profileById.get(row.closed_by)?.full_name ?? row.cashier_name ?? "Unknown user",
      branch: locationById.get(row.location_id ?? "") ?? "—", date: row.created_at,
      amount: row.net_total, status: row.status, priority: Number(row.variance ?? 0) !== 0 ? "high" : "normal",
      href: "/pos",
      details: [
        { label: "Sales count", value: String(row.sales_count) },
        { label: "Cash variance", value: context.currency ? `${context.currency} ${Number(row.variance ?? 0).toFixed(2)}` : Number(row.variance ?? 0).toFixed(2) },
      ],
    })),
  ];

  const approvals = await getApprovedRows(supabase, context.orgId, locationById, profileById, context.isBranchScoped ? context.allowedLocationIds : null);
  const visibleRows = canManageApprovalHistory || canManageLegacyApprovalQueue
    ? rows
    : rows.filter((row) => row.type === "register_closure");
  const visibleApprovals = canManageApprovalHistory || canManageLegacyApprovalQueue
    ? approvals
    : approvals.filter((row) => row.type === "register_closure");
  const approvedRows = visibleApprovals.filter((row) => !completedKeys.has(`${row.type}:${row.id}`));
  const historyRows = visibleApprovals.filter((row) => completedKeys.has(`${row.type}:${row.id}`));

  return <ApprovalCenter rows={visibleRows} approvedRows={approvedRows} historyRows={historyRows} currency={context.currency || "GHS"} canManageApprovalHistory={canManageApprovalHistory} canAccessEndOfDay={canAccessEndOfDay} />;
}

async function getApprovedRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  locationById: Map<string, string>,
  profileById: Map<string, { full_name: string | null }>,
  allowedLocationIds: string[] | null
): Promise<ApprovalRow[]> {
  const [{ data: requests }, { data: expenses }, { data: returns }, { data: registerClosures, error: registerClosuresError }] = await Promise.all([
    supabase.from("stock_requests").select("id, request_number, requested_by, requesting_location_id, submitted_at, created_at, status, priority").eq("org_id", orgId).eq("status", "approved"),
    supabase.from("expenses").select("id, expense_number, recorded_by, location_id, category, amount, expense_date, created_at, status").eq("org_id", orgId).eq("status", "approved"),
    supabase.from("purchase_returns").select("id, return_number, created_by, location_id, total_return_value, return_date, created_at, status").eq("org_id", orgId).eq("status", "approved"),
    supabase.from("register_closures").select("id, closed_by, location_id, scope, cashier_name, created_at, net_total, status").eq("org_id", orgId).eq("status", "approved").order("created_at", { ascending: false }),
  ]);
  if (registerClosuresError) throw new Error(`Could not load approved register closures: ${registerClosuresError.message}`);
  const visible = <T extends { requesting_location_id?: string | null; location_id?: string | null }>(row: T) =>
    !allowedLocationIds || allowedLocationIds.some((id) => id === row.requesting_location_id || id === row.location_id);
  return [
    ...(requests ?? []).filter(visible).map((row) => ({ id: row.id, type: "stock_request" as const, document: `REQ-${String(row.request_number).padStart(6, "0")}`, title: "Stock Request", requester: profileById.get(row.requested_by)?.full_name ?? "Unknown user", branch: locationById.get(row.requesting_location_id) ?? "—", date: row.submitted_at ?? row.created_at, amount: null, status: row.status, priority: row.priority, href: `/inventory/stock-requests/history?id=${row.id}` })),
    ...(expenses ?? []).filter(visible).map((row) => ({ id: row.id, type: "expense" as const, document: `EXP-${String(row.expense_number).padStart(6, "0")}`, title: row.category, requester: profileById.get(row.recorded_by)?.full_name ?? "Unknown user", branch: locationById.get(row.location_id ?? "") ?? "—", date: row.expense_date ?? row.created_at, amount: row.amount, status: row.status, priority: row.amount >= 10000 ? "high" : "normal", href: `/expenses/${row.id}` })),
    ...(returns ?? []).filter(visible).map((row) => ({ id: row.id, type: "purchase_return" as const, document: `RET-${String(row.return_number).padStart(6, "0")}`, title: "Purchase Return", requester: profileById.get(row.created_by)?.full_name ?? "Unknown user", branch: locationById.get(row.location_id) ?? "—", date: row.return_date ?? row.created_at, amount: row.total_return_value, status: row.status, priority: row.total_return_value >= 10000 ? "high" : "normal", href: "/purchases/returns/new" })),
    ...(registerClosures ?? []).filter(visible).map((row) => ({ id: row.id, type: "register_closure" as const, document: `REG-${row.id.slice(0, 8).toUpperCase()}`, title: row.scope === "all" ? "All Cashiers Register Close" : `${row.cashier_name ?? "Individual"} Register Close`, requester: profileById.get(row.closed_by)?.full_name ?? row.cashier_name ?? "Unknown user", branch: locationById.get(row.location_id ?? "") ?? "—", date: row.created_at, amount: row.net_total, status: row.status, priority: "normal", href: "/pos" })),
  ];
}
