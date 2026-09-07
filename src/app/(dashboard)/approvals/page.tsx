import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { ApprovalCenter, type ApprovalRow } from "@/components/approvals/approval-center";

export const metadata = { title: "Approval Center · ThinkSales" };

export default async function ApprovalCenterPage() {
  const context = await getCurrentOrgContext((await cookies()).get("active_org_id")?.value);
  if (!context) redirect("/onboarding");
  if (!can(context.role, "inventory.stock_request.approve")) redirect("/dashboard");

  const supabase = await createClient();
  const [{ data: requests }, { data: expenses }, { data: returns }, { data: locations }] = await Promise.all([
    supabase.from("stock_requests").select("id, request_number, requested_by, requesting_location_id, source_location_id, status, priority, submitted_at, created_at").eq("org_id", context.orgId).eq("status", "pending_approval").order("created_at", { ascending: false }),
    supabase.from("expenses").select("id, expense_number, recorded_by, location_id, category, description, amount, status, expense_date, created_at").eq("org_id", context.orgId).eq("status", "pending_approval").order("created_at", { ascending: false }),
    supabase.from("purchase_returns").select("id, return_number, created_by, location_id, total_return_value, status, return_date, created_at").eq("org_id", context.orgId).eq("status", "submitted").order("created_at", { ascending: false }),
    supabase.from("business_locations").select("id, name").eq("org_id", context.orgId),
  ]);

  const userIds = [
    ...(requests ?? []).map((row) => row.requested_by),
    ...(expenses ?? []).map((row) => row.recorded_by),
    ...(returns ?? []).map((row) => row.created_by),
  ];
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", Array.from(new Set(userIds)))
    : { data: [] };
  const locationById = new Map((locations ?? []).map((row) => [row.id, row.name]));
  const profileById = new Map((profiles ?? []).map((row) => [row.id, row]));

  const rows: ApprovalRow[] = [
    ...(requests ?? []).map((row) => ({
      id: row.id, type: "stock_request" as const, document: `REQ-${String(row.request_number).padStart(6, "0")}`,
      title: "Stock Request", requester: profileById.get(row.requested_by)?.full_name ?? "Unknown user",
      branch: locationById.get(row.requesting_location_id) ?? "—", date: row.submitted_at ?? row.created_at,
      amount: null, status: "pending_approval", priority: row.priority, href: `/inventory/stock-requests?id=${row.id}`,
    })),
    ...(expenses ?? []).map((row) => ({
      id: row.id, type: "expense" as const, document: `EXP-${String(row.expense_number).padStart(6, "0")}`,
      title: row.category, requester: profileById.get(row.recorded_by)?.full_name ?? "Unknown user",
      branch: locationById.get(row.location_id ?? "") ?? "—", date: row.expense_date ?? row.created_at,
      amount: row.amount, status: row.status, priority: row.amount >= 10000 ? "high" : "normal", href: `/expenses/${row.id}`,
    })),
    ...(returns ?? []).map((row) => ({
      id: row.id, type: "purchase_return" as const, document: `RET-${String(row.return_number).padStart(6, "0")}`,
      title: "Purchase Return", requester: profileById.get(row.created_by)?.full_name ?? "Unknown user",
      branch: locationById.get(row.location_id) ?? "—", date: row.return_date ?? row.created_at,
      amount: row.total_return_value, status: row.status, priority: row.total_return_value >= 10000 ? "high" : "normal", href: "/purchases/returns/new",
    })),
  ];

  return <ApprovalCenter rows={rows} currency={context.currency || "GHS"} />;
}

