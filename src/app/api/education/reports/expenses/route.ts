import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { summarizeEducationExpenses, type EducationExpenseApprovalStatus, type EducationExpensePaymentStatus } from "@/lib/education/expense-report";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";

const EXPORT_LIMIT = 5000;
const APPROVAL_STATUSES = ["pending_approval", "approved", "rejected"] as const;
const PAYMENT_STATUSES = ["unpaid", "paid"] as const;

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function escapeCsv(value: string) {
  const safeValue = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const context = await getCurrentOrgContext();
  if (!context) return new Response("Unauthorized.", { status: 401 });
  const [canViewReport, canExportReport, canViewExpenses, canExportExpenses] = await Promise.all([
    canTabPermission("education_reports", "reports", "expenses", "view"),
    canTabPermission("education_reports", "reports", "expenses", "export"),
    canTabPermission("education_expenses", "expenses", "records", "view"),
    canTabPermission("education_expenses", "expenses", "records", "export"),
  ]);
  if (!canViewReport || !canExportReport || !canViewExpenses || !canExportExpenses) {
    return new Response("You do not have permission to export this report.", { status: 403 });
  }

  const url = new URL(request.url);
  const requestedBranch = url.searchParams.get("branch") ?? "";
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const statusFilter = url.searchParams.get("status") ?? "";
  const paymentFilter = url.searchParams.get("payment") ?? "";
  if (!isValidDate(from) || !isValidDate(to) || from > to
    || (statusFilter && !APPROVAL_STATUSES.includes(statusFilter as typeof APPROVAL_STATUSES[number]))
    || (paymentFilter && !PAYMENT_STATUSES.includes(paymentFilter as typeof PAYMENT_STATUSES[number]))) {
    return new Response("Invalid report filters.", { status: 400 });
  }

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  if (requestedBranch && !campusIds.includes(requestedBranch)) {
    return new Response("The selected campus is outside your access.", { status: 403 });
  }
  const branchIds = requestedBranch ? [requestedBranch] : campusIds;
  if (!branchIds.length) {
    return new Response("No expenses are available in your assigned campuses.", { status: 404 });
  }

  const supabase = await createClient();
  let query = supabase.from("education_expenses")
    .select("branch_id, category, status, payment_status, amount", { count: "exact" })
    .eq("org_id", context.orgId).in("branch_id", branchIds)
    .gte("expense_date", from).lte("expense_date", to)
    .order("branch_id").order("category").order("status").order("payment_status").order("id")
    .range(0, EXPORT_LIMIT - 1);
  if (statusFilter) query = query.eq("status", statusFilter as EducationExpenseApprovalStatus);
  if (paymentFilter) query = query.eq("payment_status", paymentFilter as EducationExpensePaymentStatus);
  const { data, count, error } = await query;
  if (error) {
    console.error("Could not export Think Education expense report:", error.message);
    return new Response("Could not generate the expense report.", { status: 500 });
  }
  if ((count ?? 0) > EXPORT_LIMIT) {
    return new Response(
      `This export matches more than ${EXPORT_LIMIT.toLocaleString()} expenses. Narrow the date range or filters and try again.`,
      { status: 413 },
    );
  }

  const summaries = summarizeEducationExpenses((data ?? []).map((record) => ({
    ...record,
    amount: Number(record.amount),
  })));
  const { data: organization, error: organizationError } = await supabase.from("organizations")
    .select("currency").eq("id", context.orgId).single();
  if (organizationError) {
    console.error("Could not load currency for Think Education expense export:", organizationError.message);
    return new Response("Could not load currency for the expense report.", { status: 500 });
  }

  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const header = ["Campus", "Category", "Approval status", "Payment status", "Expense count", `Total amount (${organization.currency})`];
  const lines = [
    header.map(escapeCsv).join(","),
    ...summaries.map((summary) => [
      campusNameById.get(summary.branch_id) ?? "Campus",
      summary.category,
      summary.status.replaceAll("_", " "),
      summary.payment_status,
      String(summary.expense_count),
      summary.total_amount.toFixed(2),
    ].map(escapeCsv).join(",")),
  ];

  return new Response(`\uFEFF${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="think-education-expense-summary.csv"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
