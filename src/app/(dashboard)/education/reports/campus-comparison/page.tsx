import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDownToLine, ArrowLeft } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { formatCurrencyAmount } from "@/lib/currency";
import { getOrganizationCurrencyConfig } from "@/lib/currency/settings";
import { summarizeEducationCampusComparison } from "@/lib/education/campus-comparison";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";

const REPORT_LIMIT = 5000;
const MAX_RANGE_DAYS = 366;
type SearchParams = Record<string, string | string[] | undefined>;

function getParam(params: SearchParams, key: string) {
  return typeof params[key] === "string" ? params[key] as string : "";
}

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

function csvCell(value: string | number | null) {
  const text = value === null ? "" : String(value);
  const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

function assertWithinReportLimit(count: number | null, label: string) {
  if ((count ?? 0) > REPORT_LIMIT) {
    throw new Error(`The campus comparison ${label} report exceeds ${REPORT_LIMIT} records. Narrow the date range and try again.`);
  }
}

export default async function EducationCampusComparisonPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");

  const [
    canViewApplications,
    canExportApplications,
    canViewAttendanceReport,
    canExportAttendanceReport,
    canViewAttendanceRecords,
    canExportAttendanceRecords,
    canViewEnrollmentReport,
    canExportEnrollmentReport,
    canViewStudents,
    canExportStudents,
    canViewOutcomesReport,
    canExportOutcomesReport,
    canViewResults,
    canExportResults,
    canViewExaminations,
    canViewExpenseReport,
    canExportExpenseReport,
    canViewExpenses,
    canExportExpenses,
    canViewFeeCollectionReport,
    canExportFeeCollectionReport,
    canViewFeePayments,
    canExportFeePayments,
  ] = await Promise.all([
    canTabPermission("education_admissions", "admissions", "applications", "view"),
    canTabPermission("education_admissions", "admissions", "applications", "export"),
    canTabPermission("education_reports", "reports", "attendance", "view"),
    canTabPermission("education_reports", "reports", "attendance", "export"),
    canTabPermission("education_attendance", "attendance", "register", "view"),
    canTabPermission("education_attendance", "attendance", "register", "export"),
    canTabPermission("education_reports", "reports", "enrollment", "view"),
    canTabPermission("education_reports", "reports", "enrollment", "export"),
    canTabPermission("education_students", "students", "list", "view"),
    canTabPermission("education_students", "students", "list", "export"),
    canTabPermission("education_reports", "reports", "outcomes", "view"),
    canTabPermission("education_reports", "reports", "outcomes", "export"),
    canTabPermission("education_results", "results", "gradebook", "view"),
    canTabPermission("education_results", "results", "gradebook", "export"),
    canTabPermission("education_examinations", "examinations", "schedule", "view"),
    canTabPermission("education_reports", "reports", "expenses", "view"),
    canTabPermission("education_reports", "reports", "expenses", "export"),
    canTabPermission("education_expenses", "expenses", "records", "view"),
    canTabPermission("education_expenses", "expenses", "records", "export"),
    canTabPermission("education_reports", "reports", "fees", "view"),
    canTabPermission("education_reports", "reports", "fees", "export"),
    canTabPermission("education_finance", "finance", "payments", "view"),
    canTabPermission("education_finance", "finance", "payments", "export"),
  ]);
  const canViewAttendance = canViewAttendanceReport && canViewAttendanceRecords;
  const canExportAttendance = canViewAttendance && canExportAttendanceReport && canExportAttendanceRecords;
  const canViewEnrollment = canViewEnrollmentReport && canViewStudents;
  const canExportEnrollment = canViewEnrollment && canExportEnrollmentReport && canExportStudents;
  const canViewOutcomes = canViewOutcomesReport && canViewResults && canViewExaminations;
  const canExportOutcomes = canViewOutcomes && canExportOutcomesReport && canExportResults;
  const canViewExpenseSummary = canViewExpenseReport && canViewExpenses;
  const canExportExpenseSummary = canViewExpenseSummary && canExportExpenseReport && canExportExpenses;
  const canViewFeeCollectionSummary = canViewFeeCollectionReport && canViewFeePayments;
  const canExportFeeCollectionSummary = canViewFeeCollectionSummary
    && canExportFeeCollectionReport && canExportFeePayments;
  if (!canViewApplications && !canViewAttendance && !canViewEnrollment && !canViewOutcomes
    && !canViewExpenseSummary && !canViewFeeCollectionSummary) {
    redirect("/dashboard?accessDenied=think-education.reports");
  }

  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const defaultFrom = shiftDate(today, -29);
  const requestedFrom = getParam(params, "from");
  const requestedTo = getParam(params, "to");
  let from = isValidDate(requestedFrom) ? requestedFrom : defaultFrom;
  let to = isValidDate(requestedTo) ? requestedTo : today;
  const requestedRangeDays = Math.floor(
    (new Date(`${to}T00:00:00.000Z`).getTime() - new Date(`${from}T00:00:00.000Z`).getTime())
    / 86_400_000,
  );
  const invalidRange = from > to || requestedRangeDays >= MAX_RANGE_DAYS;
  if (invalidRange) {
    from = defaultFrom;
    to = today;
  }
  const fromTimestamp = `${from}T00:00:00.000Z`;
  const toExclusiveTimestamp = `${shiftDate(to, 1)}T00:00:00.000Z`;
  const supabase = await createClient();
  const campusAccess = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campuses = campusAccess.campuses;
  const campusIds = campuses.map((campus) => campus.id);

  const [
    applicationData,
    attendanceData,
    enrollmentData,
    outcomeData,
    expenseData,
    feeCollectionData,
    organizationResult,
  ] = await Promise.all([
    (async () => {
      if (!canViewApplications || !campusIds.length) return null;
      const { data, count, error } = await supabase.from("education_admissions")
        .select("branch_id", { count: "exact" })
        .eq("org_id", context.orgId).in("branch_id", campusIds)
        .gte("applied_at", fromTimestamp).lt("applied_at", toExclusiveTimestamp)
        .order("applied_at").order("id").range(0, REPORT_LIMIT - 1);
      if (error) throw new Error(`Could not load campus admission comparisons: ${error.message}`);
      assertWithinReportLimit(count, "admissions");
      return data ?? [];
    })(),
    (async () => {
      if (!canViewAttendance || !campusIds.length) return null;
      const { data, count, error } = await supabase.from("education_attendance")
        .select("branch_id, status", { count: "exact" })
        .eq("org_id", context.orgId).in("branch_id", campusIds)
        .not("student_id", "is", null)
        .gte("attendance_date", from).lte("attendance_date", to)
        .order("attendance_date").order("id").range(0, REPORT_LIMIT - 1);
      if (error) throw new Error(`Could not load campus attendance comparisons: ${error.message}`);
      assertWithinReportLimit(count, "attendance");
      return (data ?? []).map((record) => ({
        branch_id: record.branch_id,
        status: record.status as "present" | "absent" | "late" | "excused",
      }));
    })(),
    (async () => {
      if (!canViewEnrollment || !campusIds.length) return null;
      const { data, count, error } = await supabase.from("education_student_enrollments")
        .select("branch_id", { count: "exact" })
        .eq("org_id", context.orgId).in("branch_id", campusIds).eq("status", "active")
        .order("branch_id").order("id").range(0, REPORT_LIMIT - 1);
      if (error) throw new Error(`Could not load active enrollment comparisons: ${error.message}`);
      assertWithinReportLimit(count, "active enrollment");
      return data ?? [];
    })(),
    (async () => {
      if (!canViewOutcomes || !campusIds.length) return null;
      const { data: exams, count: examCount, error: examError } = await supabase.from("education_examinations")
        .select("id", { count: "exact" })
        .eq("org_id", context.orgId).in("branch_id", campusIds).eq("status", "published")
        .not("starts_at", "is", null).gte("starts_at", fromTimestamp).lt("starts_at", toExclusiveTimestamp)
        .order("id").range(0, REPORT_LIMIT - 1);
      if (examError) throw new Error(`Could not load published examinations for campus comparisons: ${examError.message}`);
      assertWithinReportLimit(examCount, "published examination");
      const examIds = (exams ?? []).map((exam) => exam.id);
      if (!examIds.length) return [];
      const { data, count, error } = await supabase.from("education_results")
        .select("branch_id, score, maximum_score", { count: "exact" })
        .eq("org_id", context.orgId).in("branch_id", campusIds).in("examination_id", examIds)
        .eq("status", "published")
        .order("branch_id").order("id").range(0, REPORT_LIMIT - 1);
      if (error) throw new Error(`Could not load published results for campus comparisons: ${error.message}`);
      assertWithinReportLimit(count, "published result");
      return (data ?? []).map((result) => ({
        branch_id: result.branch_id,
        score: Number(result.score),
        maximum_score: Number(result.maximum_score),
      }));
    })(),
    (async () => {
      if (!canViewExpenseSummary || !campusIds.length) return null;
      const { data, count, error } = await supabase.from("education_expenses")
        .select("branch_id, amount", { count: "exact" })
        .eq("org_id", context.orgId).in("branch_id", campusIds)
        .eq("status", "approved").gte("expense_date", from).lte("expense_date", to)
        .order("expense_date").order("id").range(0, REPORT_LIMIT - 1);
      if (error) throw new Error(`Could not load approved expense comparisons: ${error.message}`);
      assertWithinReportLimit(count, "approved expense");
      return (data ?? []).map((expense) => ({
        branch_id: expense.branch_id,
        amount: Number(expense.amount),
      }));
    })(),
    (async () => {
      if (!canViewFeeCollectionSummary || !campusIds.length) return null;
      const { count, error: countError } = await supabase.from("education_fee_payments")
        .select("id", { count: "exact", head: true })
        .eq("org_id", context.orgId)
        .gte("created_at", fromTimestamp)
        .lt("created_at", toExclusiveTimestamp);
      if (countError) throw new Error(`Could not count campus fee collections: ${countError.message}`);
      assertWithinReportLimit(count, "fee collection");

      const records: Array<{ branch_id: string; amount: number }> = [];
      const paymentCount = count ?? 0;
      for (let offset = 0; offset < paymentCount; offset += 500) {
        const { data: payments, error: paymentsError } = await supabase.from("education_fee_payments")
          .select("charge_id, amount")
          .eq("org_id", context.orgId)
          .gte("created_at", fromTimestamp)
          .lt("created_at", toExclusiveTimestamp)
          .order("created_at").order("id")
          .range(offset, Math.min(offset + 499, paymentCount - 1));
        if (paymentsError) throw new Error(`Could not load campus fee collections: ${paymentsError.message}`);
        const chargeIds = Array.from(new Set((payments ?? []).map((payment) => payment.charge_id)));
        if (!chargeIds.length) continue;
        const { data: charges, error: chargesError } = await supabase.from("education_fee_charges")
          .select("id, branch_id")
          .eq("org_id", context.orgId)
          .in("branch_id", campusIds)
          .in("id", chargeIds);
        if (chargesError) throw new Error(`Could not scope campus fee collections: ${chargesError.message}`);
        const branchByChargeId = new Map((charges ?? []).map((charge) => [charge.id, charge.branch_id]));
        for (const payment of payments ?? []) {
          const branch_id = branchByChargeId.get(payment.charge_id);
          if (branch_id) records.push({ branch_id, amount: Number(payment.amount) });
        }
      }
      return records;
    })(),
    canViewExpenseSummary || canViewFeeCollectionSummary
      ? supabase.from("organizations").select("currency").eq("id", context.orgId).single()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (organizationResult.error) throw new Error(`Could not load organization currency: ${organizationResult.error.message}`);
  const rows = summarizeEducationCampusComparison({
    campuses,
    applications: applicationData,
    attendance: attendanceData,
    enrollments: enrollmentData,
    outcomes: outcomeData,
    expenses: expenseData,
    feeCollections: feeCollectionData,
  });
  const currency = organizationResult.data?.currency ?? "";
  const currencyConfig = await getOrganizationCurrencyConfig();
  const csvRows = [
    ["Campus", "Applications", "Student attendance rate (%)", "Active enrollments", "Published exam average (%)", `Approved expenses${currency ? ` (${currency})` : ""}`, "Fee payment count", `Fees collected${currency ? ` (${currency})` : ""}`],
    ...rows.map((row) => [
      row.campus,
      row.application_count,
      row.attendance_rate,
      row.active_enrollment_count,
      row.average_outcome_percentage,
      row.approved_expense_total,
      row.fee_payment_count,
      row.fee_collection_total,
    ]),
  ];
  const csv = csvRows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const canExport = (canViewApplications || canViewAttendance || canViewEnrollment || canViewOutcomes || canViewExpenseSummary || canViewFeeCollectionSummary)
    && (!canViewApplications || canExportApplications)
    && (!canViewAttendance || canExportAttendance)
    && (!canViewEnrollment || canExportEnrollment)
    && (!canViewOutcomes || canExportOutcomes)
    && (!canViewExpenseSummary || canExportExpenseSummary)
    && (!canViewFeeCollectionSummary || canExportFeeCollectionSummary);
  const formatMoney = (amount: number) => formatCurrencyAmount(amount, currencyConfig);

  return <main className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
    <header>
      <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Campus Comparison</h1>
          <p className="mt-1 text-sm text-slate-600">Compare permitted admissions, student attendance, active enrollment, published outcomes, approved expenses, and fee collections across your assigned campuses.</p>
        </div>
        {canExport && <a
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`}
          download="education-campus-comparison.csv"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          <ArrowDownToLine className="h-4 w-4" /> Download CSV
        </a>}
      </div>
    </header>

    <form method="get" className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3">
      <label className="text-sm font-medium text-slate-700">From
        <input type="date" name="from" value={from} max={to} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
      </label>
      <label className="text-sm font-medium text-slate-700">To
        <input type="date" name="to" value={to} min={from} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
      </label>
      <div className="flex items-end">
        <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Apply filters</button>
      </div>
    </form>
    {invalidRange && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      Date range must be chronological and at most {MAX_RANGE_DAYS} days. Showing the most recent 30 days instead.
    </p>}
    {!campuses.length
      ? <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">No assigned campuses are available for comparison.</p>
      : <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <tr>
              <th scope="col" className="px-4 py-3">Campus</th>
              <th scope="col" className="px-4 py-3">Applications</th>
              <th scope="col" className="px-4 py-3">Attendance rate</th>
              <th scope="col" className="px-4 py-3">Active enrollment</th>
              <th scope="col" className="px-4 py-3">Published exam average</th>
              <th scope="col" className="px-4 py-3">Approved expenses</th>
              <th scope="col" className="px-4 py-3">Fee payments</th>
              <th scope="col" className="px-4 py-3">Fees collected</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {rows.map((row) => <tr key={row.branch_id}>
              <th scope="row" className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">{row.campus}</th>
              <td className="px-4 py-3">{row.application_count === null ? "No access" : row.application_count}</td>
              <td className="px-4 py-3">{row.attendance_rate === null ? "—" : `${row.attendance_rate}%`}</td>
              <td className="px-4 py-3">{row.active_enrollment_count === null ? "No access" : row.active_enrollment_count}</td>
              <td className="px-4 py-3">{row.average_outcome_percentage === null ? "—" : `${row.average_outcome_percentage}%`}</td>
              <td className="px-4 py-3">{row.approved_expense_total === null ? "No access" : formatMoney(row.approved_expense_total)}</td>
              <td className="px-4 py-3">{row.fee_payment_count === null ? "No access" : row.fee_payment_count.toLocaleString()}</td>
              <td className="px-4 py-3">{row.fee_collection_total === null ? "No access" : formatMoney(row.fee_collection_total)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>}
    <p className="text-xs text-slate-500">
        Admissions, attendance, outcomes, expenses, and fees use the selected date range. Fee collections are grouped by the campus on each charge and use payment dates. Active enrollment is current. Attendance rate counts present and late records and excludes excused records; outcome averages use each published result’s score percentage. Metrics without permission are not queried.
    </p>
  </main>;
}
