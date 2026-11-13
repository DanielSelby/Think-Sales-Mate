import { getAccessibleEducationCampuses } from "@/lib/education/access";
import {
  summarizeEducationAssets,
  summarizeEducationInventory,
  type EducationAssetStatus,
} from "@/lib/education/inventory-report";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";

const EXPORT_LIMIT = 5000;
const ASSET_STATUSES = ["available", "assigned", "maintenance", "retired"] as const;

function escapeCsv(value: string) {
  const safeValue = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const context = await getCurrentOrgContext();
  if (!context) return new Response("Unauthorized.", { status: 401 });

  const url = new URL(request.url);
  const section = url.searchParams.get("section") ?? "";
  const requestedBranch = url.searchParams.get("branch") ?? "";
  const statusFilter = url.searchParams.get("status") ?? "";
  if (section !== "stock" && section !== "assets") {
    return new Response("Select a valid inventory report.", { status: 400 });
  }
  if (statusFilter && (section !== "assets"
    || !ASSET_STATUSES.includes(statusFilter as typeof ASSET_STATUSES[number]))) {
    return new Response("Invalid report filters.", { status: 400 });
  }

  const [canViewReport, canExportReport, canViewModule, canExportModule] = await Promise.all([
    canTabPermission("education_reports", "reports", "inventory", "view"),
    canTabPermission("education_reports", "reports", "inventory", "export"),
    canTabPermission(
      "education_inventory_assets",
      "inventory",
      section === "stock" ? "stock" : "assets",
      "view",
    ),
    canTabPermission(
      "education_inventory_assets",
      "inventory",
      section === "stock" ? "stock" : "assets",
      "export",
    ),
  ]);
  if (!canViewReport || !canExportReport || !canViewModule || !canExportModule) {
    return new Response("You do not have permission to export this report.", { status: 403 });
  }

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  if (requestedBranch && !campusIds.includes(requestedBranch)) {
    return new Response("The selected campus is outside your access.", { status: 403 });
  }
  const branchIds = requestedBranch ? [requestedBranch] : campusIds;
  if (!branchIds.length) {
    return new Response("No inventory records are available in your assigned campuses.", { status: 404 });
  }

  const supabase = await createClient();
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  let header: string[];
  let lines: string[];

  if (section === "stock") {
    const { data, count, error } = await supabase.from("education_inventory_items")
      .select("branch_id, category, unit, quantity_on_hand, reorder_level, status", { count: "exact" })
      .eq("org_id", context.orgId).in("branch_id", branchIds).eq("status", "active")
      .order("branch_id").order("category").order("unit").order("id").range(0, EXPORT_LIMIT - 1);
    if (error) {
      console.error("Could not export Think Education stock report:", error.message);
      return new Response("Could not generate the stock report.", { status: 500 });
    }
    if ((count ?? 0) > EXPORT_LIMIT) {
      return new Response(
        `This export matches more than ${EXPORT_LIMIT.toLocaleString()} active stock items. Select a campus and try again.`,
        { status: 413 },
      );
    }
    const summaries = summarizeEducationInventory((data ?? []).map((record) => ({
      ...record,
      quantity_on_hand: Number(record.quantity_on_hand),
      reorder_level: Number(record.reorder_level),
    })));
    header = ["Campus", "Category", "Unit", "Item count", "Quantity on hand", "Items at/below reorder"];
    lines = [
      header.map(escapeCsv).join(","),
      ...summaries.map((summary) => [
        campusNameById.get(summary.branch_id) ?? "Campus",
        summary.category,
        summary.unit,
        String(summary.item_count),
        String(summary.quantity_on_hand),
        String(summary.low_stock_count),
      ].map(escapeCsv).join(",")),
    ];
  } else {
    let query = supabase.from("education_assets")
      .select("branch_id, category, status", { count: "exact" })
      .eq("org_id", context.orgId).in("branch_id", branchIds)
      .order("branch_id").order("category").order("status").order("id").range(0, EXPORT_LIMIT - 1);
    if (statusFilter) query = query.eq("status", statusFilter as EducationAssetStatus);
    const { data, count, error } = await query;
    if (error) {
      console.error("Could not export Think Education asset report:", error.message);
      return new Response("Could not generate the asset report.", { status: 500 });
    }
    if ((count ?? 0) > EXPORT_LIMIT) {
      return new Response(
        `This export matches more than ${EXPORT_LIMIT.toLocaleString()} assets. Select a campus or status and try again.`,
        { status: 413 },
      );
    }
    const summaries = summarizeEducationAssets((data ?? []) as Array<{
      branch_id: string;
      category: string;
      status: EducationAssetStatus;
    }>);
    header = ["Campus", "Category", "Status", "Asset count"];
    lines = [
      header.map(escapeCsv).join(","),
      ...summaries.map((summary) => [
        campusNameById.get(summary.branch_id) ?? "Campus",
        summary.category,
        summary.status,
        String(summary.asset_count),
      ].map(escapeCsv).join(",")),
    ];
  }

  return new Response(`\uFEFF${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="think-education-${section}-summary.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
