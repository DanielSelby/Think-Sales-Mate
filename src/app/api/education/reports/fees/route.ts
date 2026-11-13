import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { summarizeEducationFeeCollections, type EducationFeePaymentMethod } from "@/lib/education/fee-collection-report";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";

const EXPORT_LIMIT = 5000;
const MAX_PAYMENT_SCAN = 50_000;
const PAYMENT_METHODS = ["cash", "mobile_money", "bank_transfer", "card", "cheque", "other"] as const;
const PAYMENT_PAGE_SIZE = 500;

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function escapeCsv(value: string) {
  const safeValue = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const context = await getCurrentOrgContext();
  if (!context) return new Response("Unauthorized.", { status: 401 });
  const [canViewReport, canExportReport, canViewPayments, canExportPayments] = await Promise.all([
    canTabPermission("education_reports", "reports", "fees", "view"),
    canTabPermission("education_reports", "reports", "fees", "export"),
    canTabPermission("education_finance", "finance", "payments", "view"),
    canTabPermission("education_finance", "finance", "payments", "export"),
  ]);
  if (!canViewReport || !canExportReport || !canViewPayments || !canExportPayments) {
    return new Response("You do not have permission to export this report.", { status: 403 });
  }

  const url = new URL(request.url);
  const requestedBranch = url.searchParams.get("branch") ?? "";
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const requestedMethod = url.searchParams.get("method") ?? "";
  if (!isValidDate(from) || !isValidDate(to) || from > to
    || (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000 > 366
    || (requestedMethod && !PAYMENT_METHODS.includes(requestedMethod as EducationFeePaymentMethod))) {
    return new Response("Invalid report filters.", { status: 400 });
  }
  const paymentMethod = requestedMethod as EducationFeePaymentMethod | "";

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  if (requestedBranch && !campusIds.includes(requestedBranch)) {
    return new Response("The selected campus is outside your access.", { status: 403 });
  }
  const branchIds = requestedBranch ? [requestedBranch] : campusIds;
  if (!branchIds.length) return new Response("No campuses are available in your assigned scope.", { status: 404 });

  const supabase = await createClient();
  const endExclusive = `${shiftDate(to, 1)}T00:00:00.000Z`;
  let countQuery = supabase.from("education_fee_payments")
    .select("id", { count: "exact", head: true })
    .eq("org_id", context.orgId)
    .gte("created_at", `${from}T00:00:00.000Z`)
    .lt("created_at", endExclusive);
  if (paymentMethod) countQuery = countQuery.eq("payment_method", paymentMethod);
  const { count, error: countError } = await countQuery;
  if (countError) {
    console.error("Could not count Think Education fee collection report payments:", countError.message);
    return new Response("Could not count payments for the fee collection report.", { status: 500 });
  }
  const paymentCount = count ?? 0;
  if (paymentCount > MAX_PAYMENT_SCAN) {
    return new Response(
      `This export requires scanning more than ${MAX_PAYMENT_SCAN.toLocaleString()} payments. Narrow the date range or payment method and try again.`,
      { status: 413 },
    );
  }

  const records: Array<{ branch_id: string; payment_method: EducationFeePaymentMethod; amount: number }> = [];
  for (let offset = 0; offset < paymentCount; offset += PAYMENT_PAGE_SIZE) {
    let paymentsQuery = supabase.from("education_fee_payments")
      .select("charge_id, payment_method, amount")
      .eq("org_id", context.orgId)
      .gte("created_at", `${from}T00:00:00.000Z`)
      .lt("created_at", endExclusive)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, Math.min(offset + PAYMENT_PAGE_SIZE - 1, paymentCount - 1));
    if (paymentMethod) paymentsQuery = paymentsQuery.eq("payment_method", paymentMethod);
    const { data: payments, error: paymentsError } = await paymentsQuery;
    if (paymentsError) {
      console.error("Could not load Think Education fee collection report payments:", paymentsError.message);
      return new Response("Could not load payments for the fee collection report.", { status: 500 });
    }

    const chargeIds = Array.from(new Set((payments ?? []).map((payment) => payment.charge_id)));
    if (!chargeIds.length) continue;
    const { data: charges, error: chargesError } = await supabase.from("education_fee_charges")
      .select("id, branch_id")
      .eq("org_id", context.orgId)
      .in("branch_id", branchIds)
      .in("id", chargeIds);
    if (chargesError) {
      console.error("Could not scope Think Education fee collection report payments:", chargesError.message);
      return new Response("Could not scope payments for the fee collection report.", { status: 500 });
    }
    const branchByChargeId = new Map((charges ?? []).map((charge) => [charge.id, charge.branch_id]));
    for (const payment of payments ?? []) {
      const branchId = branchByChargeId.get(payment.charge_id);
      if (branchId) {
        records.push({
          branch_id: branchId,
          payment_method: payment.payment_method,
          amount: Number(payment.amount),
        });
      }
    }
  }

  if (records.length > EXPORT_LIMIT) {
    return new Response(
      `This export includes more than ${EXPORT_LIMIT.toLocaleString()} payments in the selected campuses. Narrow the date range or filters and try again.`,
      { status: 413 },
    );
  }

  const summaries = summarizeEducationFeeCollections(records);
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const { data: organization, error: organizationError } = await supabase.from("organizations")
    .select("currency")
    .eq("id", context.orgId)
    .single();
  if (organizationError) {
    console.error("Could not load currency for Think Education fee collection report:", organizationError.message);
    return new Response("Could not load currency for the fee collection report.", { status: 500 });
  }

  const header = ["Campus", "Payment method", "Payment count", `Total collected (${organization.currency})`];
  const lines = [
    header.map(escapeCsv).join(","),
    ...summaries.map((summary) => [
      campusNameById.get(summary.branch_id) ?? "Campus",
      summary.payment_method.replaceAll("_", " "),
      String(summary.payment_count),
      summary.total_collected.toFixed(2),
    ].map(escapeCsv).join(",")),
  ];
  return new Response(`\uFEFF${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="think-education-fee-collections-summary.csv"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
