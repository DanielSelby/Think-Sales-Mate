import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDownToLine, ArrowLeft, BarChart3, BookOpen, Boxes, CalendarCheck, Package, Receipt, Users, Wallet } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { summarizeEducationOutcomes } from "@/lib/education/outcomes";
import { summarizeEducationEnrollments, type EducationEnrollmentStatus } from "@/lib/education/enrollment-report";
import { summarizeEducationExpenses, type EducationExpenseApprovalStatus, type EducationExpensePaymentStatus } from "@/lib/education/expense-report";
import { summarizeEducationFeeCollections, type EducationFeePaymentMethod } from "@/lib/education/fee-collection-report";
import { summarizeEducationAttendance } from "@/lib/education/attendance-report";
import { summarizeEducationLibraryCirculation, type EducationLibraryCirculationStatus } from "@/lib/education/library-report";
import { summarizeEducationAssets, summarizeEducationInventory, type EducationAssetStatus } from "@/lib/education/inventory-report";
import { summarizeEducationTransportRoutes, type EducationTransportRouteStatus } from "@/lib/education/transport-report";

const REPORT_LIMIT = 5000;
const STAFF_STATUSES = ["active", "on_leave", "inactive", "suspended", "archived"] as const;
const STAFF_CATEGORIES = ["teaching", "non_teaching"] as const;
const ATTENDANCE_STATUSES = ["present", "absent", "late", "excused"] as const;
const ENROLLMENT_STATUSES = ["active", "completed", "withdrawn", "transferred"] as const;
const EXPENSE_APPROVAL_STATUSES = ["pending_approval", "approved", "rejected"] as const;
const EXPENSE_PAYMENT_STATUSES = ["unpaid", "paid"] as const;
const FEE_PAYMENT_METHODS = ["cash", "mobile_money", "bank_transfer", "card", "cheque", "other"] as const;
const LIBRARY_CIRCULATION_STATUSES = ["open", "overdue", "returned"] as const;
const ASSET_STATUSES = ["available", "assigned", "maintenance", "retired"] as const;
const TRANSPORT_ROUTE_STATUSES = ["active", "paused", "retired"] as const;
type StaffStatus = typeof STAFF_STATUSES[number];
type StaffCategory = typeof STAFF_CATEGORIES[number];
type AttendanceStatus = typeof ATTENDANCE_STATUSES[number];
type FeePaymentMethod = typeof FEE_PAYMENT_METHODS[number];
type SearchParams = Record<string, string | string[] | undefined>;

function getParam(params: SearchParams, key: string) {
  return typeof params[key] === "string" ? params[key] as string : "";
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
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

export default async function EducationReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  const [
    canViewStaff,
    canExportStaff,
    canViewAttendanceReport,
    canExportAttendanceReport,
    canViewAttendanceRecords,
    canExportAttendanceRecords,
    canViewAttendanceClasses,
    canViewOutcomesReport,
    canExportOutcomesReport,
    canViewResults,
    canExportResults,
    canViewExaminations,
    canViewEnrollmentReport,
    canExportEnrollmentReport,
    canViewStudents,
    canExportStudents,
    canViewExpenseReport,
    canExportExpenseReport,
    canViewExpenses,
    canExportExpenses,
    canViewFeeCollectionReport,
    canExportFeeCollectionReport,
    canViewFeePayments,
    canExportFeePayments,
    canViewLibraryReport,
    canExportLibraryReport,
    canViewLibraryCirculation,
    canExportLibrary,
    canViewInventoryReport,
    canExportInventoryReport,
    canViewStock,
    canExportStock,
    canViewAssets,
    canExportAssets,
    canViewTransportReport,
    canExportTransportReport,
    canViewTransportFleet,
    canViewTransportAssignments,
    canExportTransportFleet,
    canExportTransportAssignments,
  ] = await Promise.all([
    canTabPermission("education_reports", "reports", "staff", "view"),
    canTabPermission("education_reports", "reports", "staff", "export"),
    canTabPermission("education_reports", "reports", "attendance", "view"),
    canTabPermission("education_reports", "reports", "attendance", "export"),
    canTabPermission("education_attendance", "attendance", "register", "view"),
    canTabPermission("education_attendance", "attendance", "register", "export"),
    canTabPermission("education_academics", "academics", "classes", "view"),
    canTabPermission("education_reports", "reports", "outcomes", "view"),
    canTabPermission("education_reports", "reports", "outcomes", "export"),
    canTabPermission("education_results", "results", "gradebook", "view"),
    canTabPermission("education_results", "results", "gradebook", "export"),
    canTabPermission("education_examinations", "examinations", "schedule", "view"),
    canTabPermission("education_reports", "reports", "enrollment", "view"),
    canTabPermission("education_reports", "reports", "enrollment", "export"),
    canTabPermission("education_students", "students", "list", "view"),
    canTabPermission("education_students", "students", "list", "export"),
    canTabPermission("education_reports", "reports", "expenses", "view"),
    canTabPermission("education_reports", "reports", "expenses", "export"),
    canTabPermission("education_expenses", "expenses", "records", "view"),
    canTabPermission("education_expenses", "expenses", "records", "export"),
    canTabPermission("education_reports", "reports", "fees", "view"),
    canTabPermission("education_reports", "reports", "fees", "export"),
    canTabPermission("education_finance", "finance", "payments", "view"),
    canTabPermission("education_finance", "finance", "payments", "export"),
    canTabPermission("education_reports", "reports", "library", "view"),
    canTabPermission("education_reports", "reports", "library", "export"),
    canTabPermission("education_library", "library", "circulation", "view"),
    canTabPermission("education_library", "library", "circulation", "export"),
    canTabPermission("education_reports", "reports", "inventory", "view"),
    canTabPermission("education_reports", "reports", "inventory", "export"),
    canTabPermission("education_inventory_assets", "inventory", "stock", "view"),
    canTabPermission("education_inventory_assets", "inventory", "stock", "export"),
    canTabPermission("education_inventory_assets", "inventory", "assets", "view"),
    canTabPermission("education_inventory_assets", "inventory", "assets", "export"),
    canTabPermission("education_reports", "reports", "transport", "view"),
    canTabPermission("education_reports", "reports", "transport", "export"),
    canTabPermission("education_transport", "transport", "fleet", "view"),
    canTabPermission("education_transport", "transport", "assignments", "view"),
    canTabPermission("education_transport", "transport", "fleet", "export"),
    canTabPermission("education_transport", "transport", "assignments", "export"),
  ]);
  const canViewAttendance = canViewAttendanceReport && canViewAttendanceRecords;
  const canExportAttendance = canViewAttendance && canExportAttendanceReport && canExportAttendanceRecords;
  const canViewOutcomes = canViewOutcomesReport && canViewResults && canViewExaminations;
  const canExportOutcomes = canViewOutcomes && canExportOutcomesReport && canExportResults;
  const canViewEnrollment = canViewEnrollmentReport && canViewStudents;
  const canExportEnrollment = canViewEnrollment && canExportEnrollmentReport && canExportStudents;
  const canViewExpenseSummary = canViewExpenseReport && canViewExpenses;
  const canExportExpenseSummary = canViewExpenseSummary && canExportExpenseReport && canExportExpenses;
  const canViewFeeCollectionSummary = canViewFeeCollectionReport && canViewFeePayments;
  const canExportFeeCollectionSummary = canViewFeeCollectionSummary && canExportFeeCollectionReport && canExportFeePayments;
  const canViewLibrarySummary = canViewLibraryReport && canViewLibraryCirculation;
  const canExportLibrarySummary = canViewLibrarySummary && canExportLibraryReport && canExportLibrary;
  const canViewInventorySummary = canViewInventoryReport && (canViewStock || canViewAssets);
  const canExportStockSummary = canViewInventoryReport && canExportInventoryReport && canViewStock && canExportStock;
  const canExportAssetSummary = canViewInventoryReport && canExportInventoryReport && canViewAssets && canExportAssets;
  const canViewTransportSummary = canViewTransportReport && canViewTransportFleet && canViewTransportAssignments;
  const canExportTransportSummary = canViewTransportSummary && canExportTransportReport
    && canExportTransportFleet && canExportTransportAssignments;
  if (!canViewStaff && !canViewAttendance && !canViewOutcomes && !canViewEnrollment && !canViewFeeCollectionSummary && !canViewExpenseSummary && !canViewLibrarySummary && !canViewInventorySummary && !canViewTransportSummary) {
    redirect("/dashboard?accessDenied=think-education.reports");
  }

  const params = await searchParams;
  const campusAccess = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campuses = campusAccess.campuses;
  const campusIds = campuses.map((campus) => campus.id);
  const requestedBranch = getParam(params, "branch");
  const branchId = campusIds.includes(requestedBranch) ? requestedBranch : "";
  const requestedCategory = getParam(params, "category");
  const category = STAFF_CATEGORIES.includes(requestedCategory as StaffCategory)
    ? requestedCategory as StaffCategory
    : "";
  const requestedStatus = getParam(params, "status");
  const status = STAFF_STATUSES.includes(requestedStatus as StaffStatus)
    ? requestedStatus as StaffStatus
    : "";
  const branchIds = branchId ? [branchId] : campusIds;
  const attendanceToday = new Date().toISOString().slice(0, 10);
  const attendanceDefaultFrom = new Date(`${attendanceToday}T00:00:00.000Z`);
  attendanceDefaultFrom.setUTCDate(attendanceDefaultFrom.getUTCDate() - 29);
  const attendanceDefaultFromText = attendanceDefaultFrom.toISOString().slice(0, 10);
  const requestedAttendanceFrom = getParam(params, "attendance_from");
  const requestedAttendanceTo = getParam(params, "attendance_to");
  const parsedAttendanceFrom = isValidDate(requestedAttendanceFrom) ? requestedAttendanceFrom : attendanceDefaultFromText;
  const parsedAttendanceTo = isValidDate(requestedAttendanceTo) ? requestedAttendanceTo : attendanceToday;
  const validAttendanceRange = parsedAttendanceFrom <= parsedAttendanceTo;
  const attendanceFrom = validAttendanceRange ? parsedAttendanceFrom : attendanceDefaultFromText;
  const attendanceTo = validAttendanceRange ? parsedAttendanceTo : attendanceToday;
  const attendanceStatusParam = getParam(params, "attendance_status");
  const attendanceStatus = ATTENDANCE_STATUSES.includes(attendanceStatusParam as AttendanceStatus)
    ? attendanceStatusParam as AttendanceStatus
    : "";
  const requestedAttendanceBranch = getParam(params, "attendance_branch");
  const attendanceBranchId = campusIds.includes(requestedAttendanceBranch) ? requestedAttendanceBranch : "";
  const attendanceBranchIds = attendanceBranchId ? [attendanceBranchId] : campusIds;
  const requestedAttendanceClass = getParam(params, "attendance_class");
  const requestedOutcomesBranch = getParam(params, "outcomes_branch");
  const outcomesBranchId = campusIds.includes(requestedOutcomesBranch) ? requestedOutcomesBranch : "";
  const outcomesBranchIds = outcomesBranchId ? [outcomesBranchId] : campusIds;
  const requestedEnrollmentBranch = getParam(params, "enrollment_branch");
  const enrollmentBranchId = campusIds.includes(requestedEnrollmentBranch) ? requestedEnrollmentBranch : "";
  const enrollmentBranchIds = enrollmentBranchId ? [enrollmentBranchId] : campusIds;
  const requestedEnrollmentStatus = getParam(params, "enrollment_status");
  const enrollmentStatus = ENROLLMENT_STATUSES.includes(requestedEnrollmentStatus as EducationEnrollmentStatus)
    ? requestedEnrollmentStatus as EducationEnrollmentStatus
    : "";
  const today = new Date().toISOString().slice(0, 10);
  const expenseDefaultFromDate = new Date(`${today}T00:00:00.000Z`);
  expenseDefaultFromDate.setUTCDate(expenseDefaultFromDate.getUTCDate() - 29);
  const expenseDefaultFrom = expenseDefaultFromDate.toISOString().slice(0, 10);
  const requestedExpenseFrom = getParam(params, "expense_from");
  const requestedExpenseTo = getParam(params, "expense_to");
  const parsedExpenseFrom = isValidDate(requestedExpenseFrom) ? requestedExpenseFrom : expenseDefaultFrom;
  const parsedExpenseTo = isValidDate(requestedExpenseTo) ? requestedExpenseTo : today;
  const validExpenseRange = parsedExpenseFrom <= parsedExpenseTo;
  const expenseFrom = validExpenseRange ? parsedExpenseFrom : expenseDefaultFrom;
  const expenseTo = validExpenseRange ? parsedExpenseTo : today;
  const requestedExpenseBranch = getParam(params, "expense_branch");
  const expenseBranchId = campusIds.includes(requestedExpenseBranch) ? requestedExpenseBranch : "";
  const expenseBranchIds = expenseBranchId ? [expenseBranchId] : campusIds;
  const requestedExpenseStatus = getParam(params, "expense_status");
  const expenseStatus = EXPENSE_APPROVAL_STATUSES.includes(requestedExpenseStatus as EducationExpenseApprovalStatus)
    ? requestedExpenseStatus as EducationExpenseApprovalStatus
    : "";
  const requestedExpensePayment = getParam(params, "expense_payment");
  const expensePayment = EXPENSE_PAYMENT_STATUSES.includes(requestedExpensePayment as EducationExpensePaymentStatus)
    ? requestedExpensePayment as EducationExpensePaymentStatus
    : "";
  const requestedFeeFrom = getParam(params, "fees_from");
  const requestedFeeTo = getParam(params, "fees_to");
  const parsedFeeFrom = isValidDate(requestedFeeFrom) ? requestedFeeFrom : expenseDefaultFrom;
  const parsedFeeTo = isValidDate(requestedFeeTo) ? requestedFeeTo : today;
  const feeRangeTooLong = parsedFeeFrom <= parsedFeeTo
    && (Date.parse(`${parsedFeeTo}T00:00:00.000Z`) - Date.parse(`${parsedFeeFrom}T00:00:00.000Z`)) / 86_400_000 > 366;
  const validFeeRange = parsedFeeFrom <= parsedFeeTo && !feeRangeTooLong;
  const feeFrom = validFeeRange ? parsedFeeFrom : expenseDefaultFrom;
  const feeTo = validFeeRange ? parsedFeeTo : today;
  const requestedFeeBranch = getParam(params, "fees_branch");
  const feeBranchId = campusIds.includes(requestedFeeBranch) ? requestedFeeBranch : "";
  const feeBranchIds = feeBranchId ? [feeBranchId] : campusIds;
  const requestedFeeMethod = getParam(params, "fees_method");
  const feeMethod = FEE_PAYMENT_METHODS.includes(requestedFeeMethod as FeePaymentMethod)
    ? requestedFeeMethod as FeePaymentMethod
    : "";
  const requestedLibraryFrom = getParam(params, "library_from");
  const requestedLibraryTo = getParam(params, "library_to");
  const parsedLibraryFrom = isValidDate(requestedLibraryFrom) ? requestedLibraryFrom : expenseDefaultFrom;
  const parsedLibraryTo = isValidDate(requestedLibraryTo) ? requestedLibraryTo : today;
  const validLibraryRange = parsedLibraryFrom <= parsedLibraryTo;
  const libraryFrom = validLibraryRange ? parsedLibraryFrom : expenseDefaultFrom;
  const libraryTo = validLibraryRange ? parsedLibraryTo : today;
  const requestedLibraryBranch = getParam(params, "library_branch");
  const libraryBranchId = campusIds.includes(requestedLibraryBranch) ? requestedLibraryBranch : "";
  const libraryBranchIds = libraryBranchId ? [libraryBranchId] : campusIds;
  const requestedLibraryStatus = getParam(params, "library_status");
  const libraryStatus = LIBRARY_CIRCULATION_STATUSES.includes(requestedLibraryStatus as EducationLibraryCirculationStatus)
    ? requestedLibraryStatus as EducationLibraryCirculationStatus
    : "";
  const requestedInventoryBranch = getParam(params, "inventory_branch");
  const inventoryBranchId = campusIds.includes(requestedInventoryBranch) ? requestedInventoryBranch : "";
  const inventoryBranchIds = inventoryBranchId ? [inventoryBranchId] : campusIds;
  const requestedAssetStatus = getParam(params, "asset_status");
  const assetStatus = ASSET_STATUSES.includes(requestedAssetStatus as EducationAssetStatus)
    ? requestedAssetStatus as EducationAssetStatus
    : "";
  const requestedTransportBranch = getParam(params, "transport_branch");
  const transportBranchId = campusIds.includes(requestedTransportBranch) ? requestedTransportBranch : "";
  const transportBranchIds = transportBranchId ? [transportBranchId] : campusIds;
  const requestedTransportStatus = getParam(params, "transport_status");
  const transportStatus = TRANSPORT_ROUTE_STATUSES.includes(requestedTransportStatus as EducationTransportRouteStatus)
    ? requestedTransportStatus as EducationTransportRouteStatus
    : "";
  const supabase = await createClient();
  let attendanceClasses: Array<{ id: string; branch_id: string; name: string }> = [];
  if (canViewAttendanceClasses && attendanceBranchIds.length) {
    const { data, error } = await supabase.from("education_classes")
      .select("id, branch_id, name")
      .eq("org_id", context.orgId).in("branch_id", attendanceBranchIds)
      .order("branch_id").order("name").order("id");
    if (error) throw new Error(`Could not load classes for the student attendance report: ${error.message}`);
    attendanceClasses = data ?? [];
  }
  const attendanceClassId = attendanceClasses.some((classRecord) => classRecord.id === requestedAttendanceClass)
    ? requestedAttendanceClass
    : "";
  let feeCollectionRecords: Array<{
    branch_id: string;
    payment_method: FeePaymentMethod;
    amount: number;
  }> = [];
  let feeCollectionPaymentCount = 0;
  let feeCollectionScanTooLarge = false;
  if (canViewFeeCollectionSummary && feeBranchIds.length && validFeeRange) {
    const feeEndExclusive = `${shiftDate(feeTo, 1)}T00:00:00.000Z`;
    let countQuery = supabase.from("education_fee_payments")
      .select("id", { count: "exact", head: true })
      .eq("org_id", context.orgId)
      .gte("created_at", `${feeFrom}T00:00:00.000Z`)
      .lt("created_at", feeEndExclusive);
    if (feeMethod) countQuery = countQuery.eq("payment_method", feeMethod);
    const { count, error } = await countQuery;
    if (error) throw new Error(`Could not count Think Education fee collections: ${error.message}`);
    const paymentCount = count ?? 0;
    feeCollectionScanTooLarge = paymentCount > 50_000;
    if (!feeCollectionScanTooLarge) {
      const pageSize = 500;
      for (let offset = 0; offset < paymentCount; offset += pageSize) {
        let paymentsQuery = supabase.from("education_fee_payments")
          .select("charge_id, payment_method, amount")
          .eq("org_id", context.orgId)
          .gte("created_at", `${feeFrom}T00:00:00.000Z`)
          .lt("created_at", feeEndExclusive)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, Math.min(offset + pageSize - 1, paymentCount - 1));
        if (feeMethod) paymentsQuery = paymentsQuery.eq("payment_method", feeMethod);
        const { data: payments, error: paymentsError } = await paymentsQuery;
        if (paymentsError) throw new Error(`Could not load Think Education fee collections: ${paymentsError.message}`);
        const chargeIds = Array.from(new Set((payments ?? []).map((payment) => payment.charge_id)));
        if (!chargeIds.length) continue;
        const { data: charges, error: chargesError } = await supabase.from("education_fee_charges")
          .select("id, branch_id")
          .eq("org_id", context.orgId)
          .in("branch_id", feeBranchIds)
          .in("id", chargeIds);
        if (chargesError) throw new Error(`Could not scope Think Education fee collections: ${chargesError.message}`);
        const branchByChargeId = new Map((charges ?? []).map((charge) => [charge.id, charge.branch_id]));
        for (const payment of payments ?? []) {
          const branch_id = branchByChargeId.get(payment.charge_id);
          if (branch_id) {
            feeCollectionRecords.push({
              branch_id,
              payment_method: payment.payment_method,
              amount: Number(payment.amount),
            });
          }
        }
      }
    }
  }
  const feeCollectionRows = summarizeEducationFeeCollections(feeCollectionRecords).map((summary) => ({
    ...summary,
    campus: campuses.find((campus) => campus.id === summary.branch_id)?.name ?? "Campus",
  }));
  feeCollectionPaymentCount = feeCollectionRows.reduce((total, row) => total + row.payment_count, 0);
  let publishedExams: Array<{ id: string; branch_id: string; name: string; starts_at: string | null }> = [];
  if (canViewOutcomes && outcomesBranchIds.length) {
    const { data, error } = await supabase.from("education_examinations")
      .select("id, branch_id, name, starts_at")
      .eq("org_id", context.orgId).in("branch_id", outcomesBranchIds).eq("status", "published")
      .order("starts_at", { ascending: false });
    if (error) throw new Error(`Could not load published examinations for the academic outcomes report: ${error.message}`);
    publishedExams = data ?? [];
  }
  const requestedExamId = getParam(params, "outcomes_exam");
  const selectedExam = publishedExams.find((exam) => exam.id === requestedExamId) ?? publishedExams[0] ?? null;
  let academicYears: Array<{ id: string; name: string }> = [];
  if (canViewEnrollment && enrollmentBranchIds.length) {
    const { data, error } = await supabase.from("education_academic_years")
      .select("id, name")
      .eq("org_id", context.orgId).order("starts_on", { ascending: false });
    if (error) throw new Error(`Could not load academic years for the enrollment report: ${error.message}`);
    academicYears = data ?? [];
  }
  const requestedEnrollmentYear = getParam(params, "enrollment_year");
  const enrollmentYearId = academicYears.some((year) => year.id === requestedEnrollmentYear)
    ? requestedEnrollmentYear
    : "";
  let enrollmentRecords: Array<{
    branch_id: string;
    academic_year_id: string;
    class_id: string;
    status: EducationEnrollmentStatus;
  }> = [];
  let enrollmentCount = 0;
  if (canViewEnrollment && enrollmentBranchIds.length) {
    let query = supabase.from("education_student_enrollments")
      .select("branch_id, academic_year_id, class_id, status", { count: "exact" })
      .eq("org_id", context.orgId).in("branch_id", enrollmentBranchIds)
      .order("branch_id").order("academic_year_id").order("class_id").order("id")
      .range(0, REPORT_LIMIT - 1);
    if (enrollmentYearId) query = query.eq("academic_year_id", enrollmentYearId);
    if (enrollmentStatus) query = query.eq("status", enrollmentStatus);
    const { data, count, error } = await query;
    if (error) throw new Error(`Could not load Think Education enrollment report: ${error.message}`);
    enrollmentRecords = (data ?? []) as typeof enrollmentRecords;
    enrollmentCount = count ?? 0;
  }
  const enrollmentSummaries = summarizeEducationEnrollments(enrollmentRecords);
  const classIds = Array.from(new Set(enrollmentSummaries.map((summary) => summary.class_id)));
  let reportClasses: Array<{ id: string; name: string }> = [];
  if (classIds.length && enrollmentBranchIds.length) {
    const { data, error } = await supabase.from("education_classes")
      .select("id, name")
      .eq("org_id", context.orgId).in("branch_id", enrollmentBranchIds).in("id", classIds);
    if (error) throw new Error(`Could not load classes for the enrollment report: ${error.message}`);
    reportClasses = data ?? [];
  }
  const classNameById = new Map(reportClasses.map((classRecord) => [classRecord.id, classRecord.name]));
  const academicYearNameById = new Map(academicYears.map((year) => [year.id, year.name]));
  const enrollmentRows = enrollmentSummaries.map((summary) => ({
    ...summary,
    campus: campuses.find((campus) => campus.id === summary.branch_id)?.name ?? "Campus",
    academic_year: academicYearNameById.get(summary.academic_year_id) ?? "Academic year",
    class_name: classNameById.get(summary.class_id) ?? "Class",
  }));
  let expenseRecords: Array<{
    branch_id: string;
    category: string;
    status: EducationExpenseApprovalStatus;
    payment_status: EducationExpensePaymentStatus;
    amount: number;
  }> = [];
  let expenseCount = 0;
  if (canViewExpenseSummary && expenseBranchIds.length && expenseFrom <= expenseTo) {
    let query = supabase.from("education_expenses")
      .select("branch_id, category, status, payment_status, amount", { count: "exact" })
      .eq("org_id", context.orgId).in("branch_id", expenseBranchIds)
      .gte("expense_date", expenseFrom).lte("expense_date", expenseTo)
      .order("branch_id").order("category").order("status").order("payment_status").order("id")
      .range(0, REPORT_LIMIT - 1);
    if (expenseStatus) query = query.eq("status", expenseStatus);
    if (expensePayment) query = query.eq("payment_status", expensePayment);
    const { data, count, error } = await query;
    if (error) throw new Error(`Could not load Think Education expense report: ${error.message}`);
    expenseRecords = (data ?? []).map((record) => ({ ...record, amount: Number(record.amount) }));
    expenseCount = count ?? 0;
  }
  const expenseRows = summarizeEducationExpenses(expenseRecords).map((summary) => ({
    ...summary,
    campus: campuses.find((campus) => campus.id === summary.branch_id)?.name ?? "Campus",
  }));
  let currencyCode = "USD";
  if (canViewExpenseSummary || canViewFeeCollectionSummary) {
    const { data: organization, error } = await supabase.from("organizations").select("currency").eq("id", context.orgId).single();
    if (error) throw new Error(`Could not load currency for the education finance report: ${error.message}`);
    currencyCode = organization.currency;
  }
  const formatCurrency = (amount: number) => new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currencyCode,
  }).format(amount);
  let libraryLoans: Array<{ branch_id: string; loaned_on: string; due_on: string; returned_on: string | null }> = [];
  let libraryLoanCount = 0;
  if (canViewLibrarySummary && libraryBranchIds.length && libraryFrom <= libraryTo) {
    let query = supabase.from("education_library_loans")
      .select("branch_id, loaned_on, due_on, returned_on", { count: "exact" })
      .eq("org_id", context.orgId).in("branch_id", libraryBranchIds)
      .gte("loaned_on", libraryFrom).lte("loaned_on", libraryTo)
      .order("loaned_on").order("branch_id").order("id")
      .range(0, REPORT_LIMIT - 1);
    if (libraryStatus === "returned") query = query.not("returned_on", "is", null);
    if (libraryStatus === "open") query = query.is("returned_on", null).gte("due_on", today);
    if (libraryStatus === "overdue") query = query.is("returned_on", null).lt("due_on", today);
    const { data, count, error } = await query;
    if (error) throw new Error(`Could not load Think Education library circulation report: ${error.message}`);
    libraryLoans = data ?? [];
    libraryLoanCount = count ?? 0;
  }
  const libraryRows = summarizeEducationLibraryCirculation(libraryLoans, today).map((summary) => ({
    ...summary,
    campus: campuses.find((campus) => campus.id === summary.branch_id)?.name ?? "Campus",
  }));
  let inventoryRecords: Array<{
    branch_id: string;
    category: string;
    unit: string;
    quantity_on_hand: number;
    reorder_level: number;
    status: "active" | "archived";
  }> = [];
  let inventoryCount = 0;
  if (canViewInventoryReport && canViewStock && inventoryBranchIds.length) {
    const { data, count, error } = await supabase.from("education_inventory_items")
      .select("branch_id, category, unit, quantity_on_hand, reorder_level, status", { count: "exact" })
      .eq("org_id", context.orgId).in("branch_id", inventoryBranchIds).eq("status", "active")
      .order("branch_id").order("category").order("unit").order("id").range(0, REPORT_LIMIT - 1);
    if (error) throw new Error(`Could not load Think Education inventory report: ${error.message}`);
    inventoryRecords = (data ?? []).map((record) => ({
      ...record,
      quantity_on_hand: Number(record.quantity_on_hand),
      reorder_level: Number(record.reorder_level),
    }));
    inventoryCount = count ?? 0;
  }
  const inventoryRows = summarizeEducationInventory(inventoryRecords).map((summary) => ({
    ...summary,
    campus: campuses.find((campus) => campus.id === summary.branch_id)?.name ?? "Campus",
  }));
  let assetRecords: Array<{ branch_id: string; category: string; status: EducationAssetStatus }> = [];
  let assetCount = 0;
  if (canViewInventoryReport && canViewAssets && inventoryBranchIds.length) {
    let query = supabase.from("education_assets")
      .select("branch_id, category, status", { count: "exact" })
      .eq("org_id", context.orgId).in("branch_id", inventoryBranchIds)
      .order("branch_id").order("category").order("status").order("id").range(0, REPORT_LIMIT - 1);
    if (assetStatus) query = query.eq("status", assetStatus);
    const { data, count, error } = await query;
    if (error) throw new Error(`Could not load Think Education asset report: ${error.message}`);
    assetRecords = (data ?? []) as typeof assetRecords;
    assetCount = count ?? 0;
  }
  const assetRows = summarizeEducationAssets(assetRecords).map((summary) => ({
    ...summary,
    campus: campuses.find((campus) => campus.id === summary.branch_id)?.name ?? "Campus",
  }));
  let transportRoutes: Array<{
    id: string;
    branch_id: string;
    vehicle_id: string;
    name: string;
    status: EducationTransportRouteStatus;
  }> = [];
  let transportVehicles: Array<{
    id: string;
    branch_id: string;
    registration_number: string;
    capacity: number;
    status: "active" | "maintenance" | "retired";
  }> = [];
  let transportRouteCount = 0;
  let transportAssignments: Array<{ route_id: string }> = [];
  let transportAssignmentCount = 0;
  if (canViewTransportSummary && transportBranchIds.length) {
    let routeQuery = supabase.from("education_transport_routes")
      .select("id, branch_id, vehicle_id, name, status", { count: "exact" })
      .eq("org_id", context.orgId).in("branch_id", transportBranchIds)
      .order("branch_id").order("name").order("id").range(0, REPORT_LIMIT - 1);
    if (transportStatus) routeQuery = routeQuery.eq("status", transportStatus);
    const { data: routeData, count: routeCount, error: routeError } = await routeQuery;
    if (routeError) throw new Error(`Could not load Think Education transport routes: ${routeError.message}`);
    transportRoutes = (routeData ?? []) as typeof transportRoutes;
    transportRouteCount = routeCount ?? 0;
    const vehicleIds = Array.from(new Set(transportRoutes.map((route) => route.vehicle_id)));
    const { data: vehicleData, error: vehicleError } = vehicleIds.length
      ? await supabase.from("education_transport_vehicles")
        .select("id, branch_id, registration_number, capacity, status")
        .eq("org_id", context.orgId).in("branch_id", transportBranchIds).in("id", vehicleIds)
        .order("id").range(0, REPORT_LIMIT - 1)
      : { data: [], error: null };
    if (vehicleError) throw new Error(`Could not load vehicles for the transport report: ${vehicleError.message}`);
    transportVehicles = (vehicleData ?? []).map((vehicle) => ({ ...vehicle, capacity: Number(vehicle.capacity) }));
    const routeIds = transportRoutes.map((route) => route.id);
    if (routeIds.length) {
      const { data, count, error } = await supabase.from("education_transport_assignments")
        .select("route_id", { count: "exact" })
        .eq("org_id", context.orgId).in("branch_id", transportBranchIds).in("route_id", routeIds).eq("status", "active")
        .order("route_id").order("id").range(0, REPORT_LIMIT - 1);
      if (error) throw new Error(`Could not load active transport assignments: ${error.message}`);
      transportAssignments = data ?? [];
      transportAssignmentCount = count ?? 0;
    }
  }
  const transportRows = summarizeEducationTransportRoutes(
    transportRoutes,
    transportVehicles.map((vehicle) => ({
      id: vehicle.id,
      registration_number: vehicle.registration_number,
      capacity: vehicle.capacity,
      status: vehicle.status,
    })),
    transportAssignments,
  ).map((summary) => ({
    ...summary,
    campus: campuses.find((campus) => campus.id === summary.branch_id)?.name ?? "Campus",
  }));
  const transportCapacity = transportRows.reduce((total, row) => total + row.capacity, 0);
  const transportAssignedCount = transportRows.reduce((total, row) => total + row.active_assignment_count, 0);

  let staff: Array<{
    branch_id: string;
    staff_category: StaffCategory;
    status: StaffStatus;
  }> = [];
  let totalCount = 0;
  if (canViewStaff && branchIds.length) {
    let query = supabase.from("education_staff")
      .select("branch_id, staff_category, status", { count: "exact" })
      .eq("org_id", context.orgId).in("branch_id", branchIds)
      .order("branch_id").order("staff_category").order("status").order("id")
      .range(0, REPORT_LIMIT - 1);
    if (category) query = query.eq("staff_category", category);
    if (status) query = query.eq("status", status);
    const { data, count, error } = await query;
    if (error) throw new Error(`Could not load Think Education staff report: ${error.message}`);
    staff = data ?? [];
    totalCount = count ?? 0;
  }

  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const groupedCounts = new Map<string, number>();
  for (const member of staff) {
    const key = `${member.branch_id}:${member.staff_category}:${member.status}`;
    groupedCounts.set(key, (groupedCounts.get(key) ?? 0) + 1);
  }
  const rows = Array.from(groupedCounts, ([key, count]) => {
    const [branch, staffCategory, staffStatus] = key.split(":");
    return {
      branchId: branch,
      campus: campusNameById.get(branch) ?? "Campus",
      category: staffCategory as StaffCategory,
      status: staffStatus as StaffStatus,
      count,
    };
  }).sort((left, right) => left.campus.localeCompare(right.campus)
    || left.category.localeCompare(right.category)
    || left.status.localeCompare(right.status));
  let attendance: Array<{
    branch_id: string;
    class_id: string | null;
    attendance_date: string;
    status: AttendanceStatus;
  }> = [];
  let attendanceCount = 0;
  if (canViewAttendance && attendanceBranchIds.length && attendanceFrom <= attendanceTo) {
    let query = supabase.from("education_attendance")
      .select("branch_id, class_id, attendance_date, status", { count: "exact" })
      .eq("org_id", context.orgId).in("branch_id", attendanceBranchIds)
      .not("student_id", "is", null)
      .gte("attendance_date", attendanceFrom).lte("attendance_date", attendanceTo)
      .order("attendance_date").order("branch_id").order("id")
      .range(0, REPORT_LIMIT - 1);
    if (attendanceStatus) query = query.eq("status", attendanceStatus);
    if (attendanceClassId) query = query.eq("class_id", attendanceClassId);
    const { data, count, error } = await query;
    if (error) throw new Error(`Could not load Think Education student attendance report: ${error.message}`);
    attendance = (data ?? []) as typeof attendance;
    attendanceCount = count ?? 0;
  }
  const attendanceClassNameById = new Map(attendanceClasses.map((classRecord) => [classRecord.id, classRecord.name]));
  const attendanceRows = summarizeEducationAttendance(attendance.map((record) => ({
    ...record,
    class_id: canViewAttendanceClasses ? record.class_id : null,
  }))).map((summary) => ({
    ...summary,
    campus: campusNameById.get(summary.branch_id) ?? "Campus",
    class_name: summary.class_id ? attendanceClassNameById.get(summary.class_id) ?? "Class" : "Unassigned",
  }));
  let outcomeRows: ReturnType<typeof summarizeEducationOutcomes> = [];
  let outcomeCount = 0;
  if (canViewOutcomes && selectedExam) {
    const { data, count, error } = await supabase.from("education_results")
      .select("branch_id, subject_name, score, maximum_score, grade", { count: "exact" })
      .eq("org_id", context.orgId).eq("examination_id", selectedExam.id).eq("status", "published")
      .order("branch_id").order("subject_name").order("id").range(0, REPORT_LIMIT - 1);
    if (error) throw new Error(`Could not load published Think Education results: ${error.message}`);
    outcomeRows = summarizeEducationOutcomes((data ?? []).map((result) => ({
      ...result,
      score: Number(result.score),
      maximum_score: Number(result.maximum_score),
    })));
    outcomeCount = count ?? 0;
  }
  const queryString = new URLSearchParams();
  if (branchId) queryString.set("branch", branchId);
  if (category) queryString.set("category", category);
  if (status) queryString.set("status", status);
  const filterSuffix = queryString.toString();
  const exportHref = `/api/education/reports/staff${filterSuffix ? `?${filterSuffix}` : ""}`;
  const attendanceExportParams = new URLSearchParams({ from: attendanceFrom, to: attendanceTo });
  if (attendanceBranchId) attendanceExportParams.set("branch", attendanceBranchId);
  if (attendanceStatus) attendanceExportParams.set("status", attendanceStatus);
  if (attendanceClassId) attendanceExportParams.set("class", attendanceClassId);
  const attendanceExportHref = `/api/education/reports/attendance?${attendanceExportParams.toString()}`;
  const outcomeExportParams = selectedExam ? new URLSearchParams({ examination: selectedExam.id }) : null;
  if (outcomeExportParams && outcomesBranchId) outcomeExportParams.set("branch", outcomesBranchId);
  const outcomeExportHref = `/api/education/reports/outcomes${outcomeExportParams ? `?${outcomeExportParams.toString()}` : ""}`;
  const enrollmentExportParams = new URLSearchParams();
  if (enrollmentBranchId) enrollmentExportParams.set("branch", enrollmentBranchId);
  if (enrollmentYearId) enrollmentExportParams.set("year", enrollmentYearId);
  if (enrollmentStatus) enrollmentExportParams.set("status", enrollmentStatus);
  const enrollmentExportQuery = enrollmentExportParams.toString();
  const enrollmentExportHref = `/api/education/reports/enrollment${enrollmentExportQuery ? `?${enrollmentExportQuery}` : ""}`;
  const expenseExportParams = new URLSearchParams({ from: expenseFrom, to: expenseTo });
  if (expenseBranchId) expenseExportParams.set("branch", expenseBranchId);
  if (expenseStatus) expenseExportParams.set("status", expenseStatus);
  if (expensePayment) expenseExportParams.set("payment", expensePayment);
  const expenseExportHref = `/api/education/reports/expenses?${expenseExportParams.toString()}`;
  const feeCollectionExportParams = new URLSearchParams({ from: feeFrom, to: feeTo });
  if (feeBranchId) feeCollectionExportParams.set("branch", feeBranchId);
  if (feeMethod) feeCollectionExportParams.set("method", feeMethod);
  const feeCollectionExportHref = `/api/education/reports/fees?${feeCollectionExportParams.toString()}`;
  const libraryExportParams = new URLSearchParams({ from: libraryFrom, to: libraryTo });
  if (libraryBranchId) libraryExportParams.set("branch", libraryBranchId);
  if (libraryStatus) libraryExportParams.set("status", libraryStatus);
  const libraryExportHref = `/api/education/reports/library?${libraryExportParams.toString()}`;
  const inventoryExportParams = new URLSearchParams({ section: "stock" });
  if (inventoryBranchId) inventoryExportParams.set("branch", inventoryBranchId);
  const inventoryExportHref = `/api/education/reports/inventory?${inventoryExportParams.toString()}`;
  const assetExportParams = new URLSearchParams({ section: "assets" });
  if (inventoryBranchId) assetExportParams.set("branch", inventoryBranchId);
  if (assetStatus) assetExportParams.set("status", assetStatus);
  const assetExportHref = `/api/education/reports/inventory?${assetExportParams.toString()}`;
  const transportExportParams = new URLSearchParams();
  if (transportBranchId) transportExportParams.set("branch", transportBranchId);
  if (transportStatus) transportExportParams.set("status", transportStatus);
  const transportExportQuery = transportExportParams.toString();
  const transportExportHref = `/api/education/reports/transport${transportExportQuery ? `?${transportExportQuery}` : ""}`;

  return <main className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
    <header>
      <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Education Reports</h1>
          <p className="mt-1 text-sm text-slate-600">Campus-scoped staff, attendance, academic outcomes, enrollment, fee collections, expenses, library, inventory, and transport summaries.</p>
        </div>
        {canExportStaff && canViewStaff && <a href={exportHref} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
          <ArrowDownToLine className="h-4 w-4" /> Download CSV
        </a>}
      </div>
    </header>

    {canViewStaff && <>
    <form method="get" className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-4">
      <label className="text-sm font-medium text-slate-700">Campus
        <select name="branch" defaultValue={branchId} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
          <option value="">All assigned campuses</option>
          {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">Staff category
        <select name="category" defaultValue={category} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
          <option value="">All categories</option><option value="teaching">Teaching</option><option value="non_teaching">Non-teaching</option>
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">Status
        <select name="status" defaultValue={status} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
          <option value="">All statuses</option>
          {STAFF_STATUSES.map((value) => <option key={value} value={value}>{label(value)}</option>)}
        </select>
      </label>
      <div className="flex items-end gap-2">
        <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Apply filters</button>
        <Link href={getProductAppPath("think-education", "/reports")} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Reset</Link>
      </div>
    </form>

    <section className="grid gap-3 sm:grid-cols-3">
      <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div><p className="text-sm text-slate-500">Matching staff</p><p className="mt-1 text-2xl font-bold text-slate-950">{totalCount.toLocaleString()}</p></div>
        <Users className="h-6 w-6 text-blue-700" />
      </article>
      <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div><p className="text-sm text-slate-500">Campuses in scope</p><p className="mt-1 text-2xl font-bold text-slate-950">{branchId ? 1 : campuses.length}</p></div>
        <BarChart3 className="h-6 w-6 text-blue-700" />
      </article>
      <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div><p className="text-sm text-slate-500">Groups</p><p className="mt-1 text-2xl font-bold text-slate-950">{rows.length}</p></div>
        <BarChart3 className="h-6 w-6 text-blue-700" />
      </article>
    </section>

    {totalCount > REPORT_LIMIT && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      The on-screen breakdown shows the first {REPORT_LIMIT.toLocaleString()} of {totalCount.toLocaleString()} matching records. Narrow the filters to see a complete breakdown and keep exports within the supported limit.
    </p>}

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="font-semibold text-slate-950">Staff headcount</h2>
      </div>
      {rows.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No staff records match these filters in your assigned campuses.</p> : <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-4 py-3">Campus</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Staff count</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => <tr key={`${row.branchId}:${row.category}:${row.status}`}>
              <td className="px-4 py-3 font-medium text-slate-900">{row.campus}</td>
              <td className="px-4 py-3 text-slate-700">{label(row.category)}</td>
              <td className="px-4 py-3 text-slate-700">{label(row.status)}</td>
              <td className="px-4 py-3 text-right font-semibold text-slate-900">{row.count.toLocaleString()}</td>
            </tr>)}
          </tbody>
        </table>
      </div>}
    </section>
    </>}

    {canViewAttendance && <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Student attendance</h2>
          <p className="mt-1 text-sm text-slate-600">Daily attendance records by campus and status. Student names and notes are not included.</p>
        </div>
        {canExportAttendance && <a href={attendanceExportHref} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
          <ArrowDownToLine className="h-4 w-4" /> Download attendance CSV
        </a>}
      </div>
      <form method="get" className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-6">
        <label className="text-sm font-medium text-slate-700">From
          <input required type="date" name="attendance_from" defaultValue={attendanceFrom} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">To
          <input required type="date" name="attendance_to" defaultValue={attendanceTo} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Campus
          <select name="attendance_branch" defaultValue={attendanceBranchId} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All assigned campuses</option>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        {canViewAttendanceClasses && <label className="text-sm font-medium text-slate-700">Class
          <select name="attendance_class" defaultValue={attendanceClassId} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All classes</option>
            {attendanceClasses.map((classRecord) => <option key={classRecord.id} value={classRecord.id}>
              {campusNameById.get(classRecord.branch_id) ?? "Campus"} · {classRecord.name}
            </option>)}
          </select>
        </label>}
        <label className="text-sm font-medium text-slate-700">Status
          <select name="attendance_status" defaultValue={attendanceStatus} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All statuses</option>
            {ATTENDANCE_STATUSES.map((value) => <option key={value} value={value}>{label(value)}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Apply filters</button>
        </div>
      </form>
      {!validAttendanceRange && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">The start date must be on or before the end date. Showing the default 30-day range.</p>}
      <section className="grid gap-3 sm:grid-cols-3">
        <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div><p className="text-sm text-slate-500">Matching attendance records</p><p className="mt-1 text-2xl font-bold text-slate-950">{attendanceCount.toLocaleString()}</p></div>
          <CalendarCheck className="h-6 w-6 text-blue-700" />
        </article>
        <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div><p className="text-sm text-slate-500">Campuses in filter</p><p className="mt-1 text-2xl font-bold text-slate-950">{attendanceBranchId ? 1 : campuses.length}</p></div>
          <BarChart3 className="h-6 w-6 text-blue-700" />
        </article>
        <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div><p className="text-sm text-slate-500">{canViewAttendanceClasses ? "Campus/class/status groups" : "Campus/status groups"}</p><p className="mt-1 text-2xl font-bold text-slate-950">{attendanceRows.length}</p></div>
          <BarChart3 className="h-6 w-6 text-blue-700" />
        </article>
      </section>
      {attendanceCount > REPORT_LIMIT && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        The on-screen breakdown shows the first {REPORT_LIMIT.toLocaleString()} of {attendanceCount.toLocaleString()} matching records. Narrow the date range or filters for a complete breakdown and export.
      </p>}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {attendanceRows.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No student attendance records match these filters in your assigned campuses.</p> : <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">Campus</th>{canViewAttendanceClasses && <th className="px-4 py-3">Class</th>}<th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Records</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {attendanceRows.map((row) => <tr key={`${row.branch_id}:${row.class_id ?? "none"}:${row.status}`}>
                <td className="px-4 py-3 font-medium text-slate-900">{row.campus}</td>
                {canViewAttendanceClasses && <td className="px-4 py-3 text-slate-700">{row.class_name}</td>}
                <td className="px-4 py-3 text-slate-700">{label(row.status)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">{row.record_count.toLocaleString()}</td>
              </tr>)}
            </tbody>
          </table>
        </div>}
      </section>
    </section>}

    {canViewOutcomes && <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Academic outcomes</h2>
          <p className="mt-1 text-sm text-slate-600">Published result summaries by campus and subject. Averages are normalized by each score&apos;s maximum; no pass threshold is assumed.</p>
        </div>
        {canExportOutcomes && selectedExam && <a href={outcomeExportHref} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
          <ArrowDownToLine className="h-4 w-4" /> Download outcomes CSV
        </a>}
      </div>
      <form method="get" className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">Campus
          <select name="outcomes_branch" defaultValue={outcomesBranchId} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All assigned campuses</option>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Published examination
          <select required name="outcomes_exam" defaultValue={selectedExam?.id ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            {publishedExams.length === 0 && <option value="">No published examinations available</option>}
            {publishedExams.map((exam) => <option key={exam.id} value={exam.id}>
              {campusNameById.get(exam.branch_id) ?? "Campus"} · {exam.name}{exam.starts_at ? ` · ${new Date(exam.starts_at).toLocaleDateString()}` : ""}
            </option>)}
          </select>
        </label>
        <div>
          <button type="submit" disabled={!publishedExams.length} className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300">View outcomes</button>
        </div>
      </form>
      {!publishedExams.length ? <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Published examination results will appear here when available.</p> : <>
        <section className="grid gap-3 sm:grid-cols-3">
          <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div><p className="text-sm text-slate-500">Published subject results</p><p className="mt-1 text-2xl font-bold text-slate-950">{outcomeCount.toLocaleString()}</p></div>
            <Users className="h-6 w-6 text-blue-700" />
          </article>
          <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div><p className="text-sm text-slate-500">Subjects summarized</p><p className="mt-1 text-2xl font-bold text-slate-950">{outcomeRows.length.toLocaleString()}</p></div>
            <BarChart3 className="h-6 w-6 text-blue-700" />
          </article>
          <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div><p className="text-sm text-slate-500">Examination</p><p className="mt-1 truncate text-base font-bold text-slate-950">{selectedExam?.name}</p></div>
            <CalendarCheck className="h-6 w-6 text-blue-700" />
          </article>
        </section>
        {outcomeCount > REPORT_LIMIT && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          The on-screen breakdown shows the first {REPORT_LIMIT.toLocaleString()} of {outcomeCount.toLocaleString()} published results. Select a single campus to see a complete breakdown and export.
        </p>}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {outcomeRows.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No published subject results exist for this examination.</p> : <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3">Campus</th><th className="px-4 py-3">Subject</th><th className="px-4 py-3 text-right">Results</th><th className="px-4 py-3 text-right">Average score</th><th className="px-4 py-3">Grade distribution</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {outcomeRows.map((row) => <tr key={`${row.branch_id}:${row.subject_name}`}>
                  <td className="px-4 py-3 font-medium text-slate-900">{campusNameById.get(row.branch_id) ?? "Campus"}</td>
                  <td className="px-4 py-3 text-slate-700">{row.subject_name}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">{row.result_count.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{row.average_percentage.toFixed(1)}%</td>
                  <td className="px-4 py-3 text-slate-700">{Object.entries(row.grade_counts).map(([grade, count]) => `${grade}: ${count}`).join(" · ")}</td>
                </tr>)}
              </tbody>
            </table>
          </div>}
        </section>
      </>}
    </section>}

    {canViewEnrollment && <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Enrollment &amp; progression</h2>
          <p className="mt-1 text-sm text-slate-600">Enrollment lifecycle totals by campus, academic year, and class. No student details are included.</p>
        </div>
        {canExportEnrollment && <a href={enrollmentExportHref} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
          <ArrowDownToLine className="h-4 w-4" /> Download enrollment CSV
        </a>}
      </div>
      <form method="get" className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-medium text-slate-700">Campus
          <select name="enrollment_branch" defaultValue={enrollmentBranchId} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All assigned campuses</option>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Academic year
          <select name="enrollment_year" defaultValue={enrollmentYearId} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All academic years</option>
            {academicYears.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Enrollment status
          <select name="enrollment_status" defaultValue={enrollmentStatus} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All statuses</option>
            {ENROLLMENT_STATUSES.map((value) => <option key={value} value={value}>{label(value)}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Apply filters</button>
          <Link href={getProductAppPath("think-education", "/reports")} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Reset</Link>
        </div>
      </form>
      <section className="grid gap-3 sm:grid-cols-3">
        <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div><p className="text-sm text-slate-500">Matching enrollments</p><p className="mt-1 text-2xl font-bold text-slate-950">{enrollmentCount.toLocaleString()}</p></div>
          <Users className="h-6 w-6 text-blue-700" />
        </article>
        <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div><p className="text-sm text-slate-500">Classes summarized</p><p className="mt-1 text-2xl font-bold text-slate-950">{new Set(enrollmentRows.map((row) => row.class_id)).size.toLocaleString()}</p></div>
          <BarChart3 className="h-6 w-6 text-blue-700" />
        </article>
        <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div><p className="text-sm text-slate-500">Lifecycle groups</p><p className="mt-1 text-2xl font-bold text-slate-950">{enrollmentRows.length.toLocaleString()}</p></div>
          <BarChart3 className="h-6 w-6 text-blue-700" />
        </article>
      </section>
      {enrollmentCount > REPORT_LIMIT && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        The on-screen breakdown shows the first {REPORT_LIMIT.toLocaleString()} of {enrollmentCount.toLocaleString()} matching records. Narrow the filters to see a complete breakdown and keep exports within the supported limit.
      </p>}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {enrollmentRows.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No enrollments match these filters in your assigned campuses.</p> : <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">Campus</th><th className="px-4 py-3">Academic year</th><th className="px-4 py-3">Class</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Enrollments</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {enrollmentRows.map((row) => <tr key={`${row.branch_id}:${row.academic_year_id}:${row.class_id}:${row.status}`}>
                <td className="px-4 py-3 font-medium text-slate-900">{row.campus}</td>
                <td className="px-4 py-3 text-slate-700">{row.academic_year}</td>
                <td className="px-4 py-3 text-slate-700">{row.class_name}</td>
                <td className="px-4 py-3 text-slate-700">{label(row.status)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">{row.enrollment_count.toLocaleString()}</td>
              </tr>)}
            </tbody>
          </table>
        </div>}
      </section>
    </section>}

    {canViewFeeCollectionSummary && <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Fee collection summary</h2>
          <p className="mt-1 text-sm text-slate-600">Payments collected by campus and method, using payment dates.</p>
        </div>
        {canExportFeeCollectionSummary && <a href={feeCollectionExportHref} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
          <ArrowDownToLine className="h-4 w-4" /> Download collections CSV
        </a>}
      </div>
      <form method="get" className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-sm font-medium text-slate-700">From
          <input required type="date" name="fees_from" defaultValue={feeFrom} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">To
          <input required type="date" name="fees_to" defaultValue={feeTo} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Campus
          <select name="fees_branch" defaultValue={feeBranchId} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All assigned campuses</option>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Payment method
          <select name="fees_method" defaultValue={feeMethod} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All methods</option>
            {FEE_PAYMENT_METHODS.map((method) => <option key={method} value={method}>{label(method)}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Apply filters</button>
          <Link href={getProductAppPath("think-education", "/reports")} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Reset</Link>
        </div>
      </form>
      {!validFeeRange && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{feeRangeTooLong ? "The selected date range cannot exceed 366 days." : "The start date must be on or before the end date."} Showing the default 30-day range.</p>}
      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Matching payments</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">{feeCollectionPaymentCount.toLocaleString()}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Total collected</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">{formatCurrency(feeCollectionRows.reduce((total, row) => total + Math.round(row.total_collected * 100), 0) / 100)}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Campus and method groups</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">{feeCollectionRows.length.toLocaleString()}</p>
        </article>
      </section>
      {feeCollectionScanTooLarge && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        The payment volume exceeds the on-screen calculation limit. Narrow the date range or select a payment method, then apply filters again.
      </p>}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {feeCollectionRows.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">{feeCollectionScanTooLarge ? "Narrow the date range or payment method to calculate the fee collection summary." : "No fee payments match these filters in your assigned campuses."}</p> : <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">Campus</th><th className="px-4 py-3">Payment method</th><th className="px-4 py-3 text-right">Payments</th><th className="px-4 py-3 text-right">Total collected</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {feeCollectionRows.map((row) => <tr key={`${row.branch_id}:${row.payment_method}`}>
                <td className="px-4 py-3 font-medium text-slate-900">{row.campus}</td>
                <td className="px-4 py-3 text-slate-700">{label(row.payment_method)}</td>
                <td className="px-4 py-3 text-right text-slate-700">{row.payment_count.toLocaleString()}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrency(row.total_collected)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>}
      </section>
    </section>}

    {canViewExpenseSummary && <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Expense summary</h2>
          <p className="mt-1 text-sm text-slate-600">Operating expense totals by campus, category, approval, and payment status.</p>
        </div>
        {canExportExpenseSummary && <a href={expenseExportHref} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
          <ArrowDownToLine className="h-4 w-4" /> Download expenses CSV
        </a>}
      </div>
      <form method="get" className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-sm font-medium text-slate-700">From
          <input required type="date" name="expense_from" defaultValue={expenseFrom} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">To
          <input required type="date" name="expense_to" defaultValue={expenseTo} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Campus
          <select name="expense_branch" defaultValue={expenseBranchId} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All assigned campuses</option>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Approval status
          <select name="expense_status" defaultValue={expenseStatus} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All statuses</option>
            {EXPENSE_APPROVAL_STATUSES.map((value) => <option key={value} value={value}>{label(value)}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Payment status
          <select name="expense_payment" defaultValue={expensePayment} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All statuses</option>
            {EXPENSE_PAYMENT_STATUSES.map((value) => <option key={value} value={value}>{label(value)}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Apply filters</button>
          <Link href={getProductAppPath("think-education", "/reports")} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Reset</Link>
        </div>
      </form>
      {!validExpenseRange && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">The start date must be on or before the end date. Showing the default 30-day range.</p>}
      <section className="grid gap-3 sm:grid-cols-3">
        <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div><p className="text-sm text-slate-500">Matching expenses</p><p className="mt-1 text-2xl font-bold text-slate-950">{expenseCount.toLocaleString()}</p></div>
          <Receipt className="h-6 w-6 text-blue-700" />
        </article>
        <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div><p className="text-sm text-slate-500">Amount in breakdown</p><p className="mt-1 text-2xl font-bold text-slate-950">{formatCurrency(expenseRows.reduce((total, row) => total + Math.round(row.total_amount * 100), 0) / 100)}</p></div>
          <BarChart3 className="h-6 w-6 text-blue-700" />
        </article>
        <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div><p className="text-sm text-slate-500">Groups summarized</p><p className="mt-1 text-2xl font-bold text-slate-950">{expenseRows.length.toLocaleString()}</p></div>
          <Wallet className="h-6 w-6 text-blue-700" />
        </article>
      </section>
      {expenseCount > REPORT_LIMIT && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        The on-screen breakdown shows the first {REPORT_LIMIT.toLocaleString()} of {expenseCount.toLocaleString()} matching records. Narrow the date range or filters for a complete breakdown and export.
      </p>}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {expenseRows.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No expenses match these filters in your assigned campuses.</p> : <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">Campus</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Approval</th><th className="px-4 py-3">Payment</th><th className="px-4 py-3 text-right">Expenses</th><th className="px-4 py-3 text-right">Total amount</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {expenseRows.map((row) => <tr key={`${row.branch_id}:${row.category}:${row.status}:${row.payment_status}`}>
                <td className="px-4 py-3 font-medium text-slate-900">{row.campus}</td>
                <td className="px-4 py-3 text-slate-700">{row.category}</td>
                <td className="px-4 py-3 text-slate-700">{label(row.status)}</td>
                <td className="px-4 py-3 text-slate-700">{label(row.payment_status)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">{row.expense_count.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(row.total_amount)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>}
      </section>
    </section>}

    {canViewLibrarySummary && <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Library circulation</h2>
          <p className="mt-1 text-sm text-slate-600">Loan counts by campus and circulation status. Borrower details are not included.</p>
        </div>
        {canExportLibrarySummary && <a href={libraryExportHref} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
          <ArrowDownToLine className="h-4 w-4" /> Download library CSV
        </a>}
      </div>
      <form method="get" className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-medium text-slate-700">Loans from
          <input required type="date" name="library_from" defaultValue={libraryFrom} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Loans to
          <input required type="date" name="library_to" defaultValue={libraryTo} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Campus
          <select name="library_branch" defaultValue={libraryBranchId} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All assigned campuses</option>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Circulation status
          <select name="library_status" defaultValue={libraryStatus} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All statuses</option>
            {LIBRARY_CIRCULATION_STATUSES.map((value) => <option key={value} value={value}>{label(value)}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Apply filters</button>
          <Link href={getProductAppPath("think-education", "/reports")} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Reset</Link>
        </div>
      </form>
      {!validLibraryRange && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">The start date must be on or before the end date. Showing the default 30-day range.</p>}
      <section className="grid gap-3 sm:grid-cols-3">
        <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div><p className="text-sm text-slate-500">Matching loans</p><p className="mt-1 text-2xl font-bold text-slate-950">{libraryLoanCount.toLocaleString()}</p></div>
          <BookOpen className="h-6 w-6 text-blue-700" />
        </article>
        <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div><p className="text-sm text-slate-500">Overdue loans</p><p className="mt-1 text-2xl font-bold text-slate-950">{libraryRows.filter((row) => row.status === "overdue").reduce((total, row) => total + row.loan_count, 0).toLocaleString()}</p></div>
          <CalendarCheck className="h-6 w-6 text-amber-700" />
        </article>
        <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div><p className="text-sm text-slate-500">Campus/status groups</p><p className="mt-1 text-2xl font-bold text-slate-950">{libraryRows.length.toLocaleString()}</p></div>
          <BarChart3 className="h-6 w-6 text-blue-700" />
        </article>
      </section>
      {libraryLoanCount > REPORT_LIMIT && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        The on-screen breakdown shows the first {REPORT_LIMIT.toLocaleString()} of {libraryLoanCount.toLocaleString()} matching loans. Narrow the date range or filters for a complete breakdown and export.
      </p>}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {libraryRows.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No library loans match these filters in your assigned campuses.</p> : <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">Campus</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Loans</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {libraryRows.map((row) => <tr key={`${row.branch_id}:${row.status}`}>
                <td className="px-4 py-3 font-medium text-slate-900">{row.campus}</td>
                <td className="px-4 py-3 text-slate-700">{label(row.status)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">{row.loan_count.toLocaleString()}</td>
              </tr>)}
            </tbody>
          </table>
        </div>}
      </section>
    </section>}

    {canViewInventorySummary && <section className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-950">Inventory &amp; asset summary</h2>
        <p className="mt-1 text-sm text-slate-600">Campus stock levels, low-stock counts, and asset register status totals.</p>
      </div>
      <form method="get" className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3">
        <label className="text-sm font-medium text-slate-700">Campus
          <select name="inventory_branch" defaultValue={inventoryBranchId} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All assigned campuses</option>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        {canViewAssets && <label className="text-sm font-medium text-slate-700">Asset status
          <select name="asset_status" defaultValue={assetStatus} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All statuses</option>
            {ASSET_STATUSES.map((value) => <option key={value} value={value}>{label(value)}</option>)}
          </select>
        </label>}
        <div className="flex items-end gap-2">
          <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Apply filters</button>
          <Link href={getProductAppPath("think-education", "/reports")} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Reset</Link>
        </div>
      </form>

      {canViewStock && <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-950">Campus stock</h3>
            <p className="mt-1 text-sm text-slate-600">Active stock items grouped by category and unit.</p>
          </div>
          {canExportStockSummary && <a href={inventoryExportHref} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            <ArrowDownToLine className="h-4 w-4" /> Download stock CSV
          </a>}
        </div>
        <section className="grid gap-3 sm:grid-cols-3">
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">Active stock items</p><p className="mt-1 text-2xl font-bold text-slate-950">{inventoryCount.toLocaleString()}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">Items at/below reorder</p><p className="mt-1 text-2xl font-bold text-slate-950">{inventoryRows.reduce((total, row) => total + row.low_stock_count, 0).toLocaleString()}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">Categories summarized</p><p className="mt-1 text-2xl font-bold text-slate-950">{inventoryRows.length.toLocaleString()}</p>
          </article>
        </section>
        {inventoryCount > REPORT_LIMIT && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          The on-screen breakdown shows the first {REPORT_LIMIT.toLocaleString()} of {inventoryCount.toLocaleString()} active items. Filter to a campus for a complete breakdown and export.
        </p>}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {inventoryRows.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No active stock items exist in your assigned campuses.</p> : <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3">Campus</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Unit</th><th className="px-4 py-3 text-right">Items</th><th className="px-4 py-3 text-right">Quantity</th><th className="px-4 py-3 text-right">Low stock</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {inventoryRows.map((row) => <tr key={`${row.branch_id}:${row.category}:${row.unit}`}>
                  <td className="px-4 py-3 font-medium text-slate-900">{row.campus}</td>
                  <td className="px-4 py-3 text-slate-700">{row.category}</td>
                  <td className="px-4 py-3 text-slate-700">{row.unit}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{row.item_count.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{row.quantity_on_hand.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">{row.low_stock_count.toLocaleString()}</td>
                </tr>)}
              </tbody>
            </table>
          </div>}
        </section>
      </section>}

      {canViewAssets && <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-950">Asset register</h3>
            <p className="mt-1 text-sm text-slate-600">Assets grouped by category and current status.</p>
          </div>
          {canExportAssetSummary && <a href={assetExportHref} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            <ArrowDownToLine className="h-4 w-4" /> Download assets CSV
          </a>}
        </div>
        <section className="grid gap-3 sm:grid-cols-3">
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">Matching assets</p><p className="mt-1 text-2xl font-bold text-slate-950">{assetCount.toLocaleString()}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">Assigned</p><p className="mt-1 text-2xl font-bold text-slate-950">{assetRows.filter((row) => row.status === "assigned").reduce((total, row) => total + row.asset_count, 0).toLocaleString()}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">Available</p><p className="mt-1 text-2xl font-bold text-slate-950">{assetRows.filter((row) => row.status === "available").reduce((total, row) => total + row.asset_count, 0).toLocaleString()}</p>
          </article>
        </section>
        {assetCount > REPORT_LIMIT && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          The on-screen breakdown shows the first {REPORT_LIMIT.toLocaleString()} of {assetCount.toLocaleString()} matching assets. Filter to a campus or status for a complete breakdown and export.
        </p>}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {assetRows.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No assets match these filters in your assigned campuses.</p> : <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3">Campus</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Assets</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assetRows.map((row) => <tr key={`${row.branch_id}:${row.category}:${row.status}`}>
                  <td className="px-4 py-3 font-medium text-slate-900">{row.campus}</td>
                  <td className="px-4 py-3 text-slate-700">{row.category}</td>
                  <td className="px-4 py-3 text-slate-700">{label(row.status)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">{row.asset_count.toLocaleString()}</td>
                </tr>)}
              </tbody>
            </table>
          </div>}
        </section>
      </section>}
    </section>}

    {canViewTransportSummary && <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Transport route utilization</h2>
          <p className="mt-1 text-sm text-slate-600">Active student assignments compared with vehicle capacity. Student details are not included.</p>
        </div>
        {canExportTransportSummary && <a href={transportExportHref} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
          <ArrowDownToLine className="h-4 w-4" /> Download transport CSV
        </a>}
      </div>
      <form method="get" className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3">
        <label className="text-sm font-medium text-slate-700">Campus
          <select name="transport_branch" defaultValue={transportBranchId} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All assigned campuses</option>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Route status
          <select name="transport_status" defaultValue={transportStatus} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All statuses</option>
            {TRANSPORT_ROUTE_STATUSES.map((value) => <option key={value} value={value}>{label(value)}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Apply filters</button>
          <Link href={getProductAppPath("think-education", "/reports")} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Reset</Link>
        </div>
      </form>
      <section className="grid gap-3 sm:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Routes</p><p className="mt-1 text-2xl font-bold text-slate-950">{transportRouteCount.toLocaleString()}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Active assignments</p><p className="mt-1 text-2xl font-bold text-slate-950">{transportAssignmentCount.toLocaleString()}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Seats in routes shown</p><p className="mt-1 text-2xl font-bold text-slate-950">{transportCapacity.toLocaleString()}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Overall utilization</p><p className="mt-1 text-2xl font-bold text-slate-950">{transportCapacity ? `${Math.round((transportAssignedCount / transportCapacity) * 1000) / 10}%` : "—"}</p>
        </article>
      </section>
      {(transportRouteCount > REPORT_LIMIT || transportAssignmentCount > REPORT_LIMIT) && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        The table uses up to {REPORT_LIMIT.toLocaleString()} routes and assignments. Narrow the campus or route-status filters for a complete utilization breakdown and export.
      </p>}
      {transportAssignmentCount > REPORT_LIMIT && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
        Utilization is incomplete because active assignments exceed the report limit. Narrow the campus filter before relying on seat totals.
      </p>}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {transportRows.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No transport routes match these filters in your assigned campuses.</p> : <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">Campus</th><th className="px-4 py-3">Route</th><th className="px-4 py-3">Route status</th><th className="px-4 py-3">Vehicle</th><th className="px-4 py-3 text-right">Assignments</th><th className="px-4 py-3 text-right">Capacity</th><th className="px-4 py-3 text-right">Seats free</th><th className="px-4 py-3 text-right">Utilization</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transportRows.map((row) => <tr key={row.route_id}>
                <td className="px-4 py-3 font-medium text-slate-900">{row.campus}</td>
                <td className="px-4 py-3 text-slate-700">{row.route_name}</td>
                <td className="px-4 py-3 text-slate-700">{label(row.route_status)}</td>
                <td className="px-4 py-3 text-slate-700">{row.vehicle_registration} · {label(row.vehicle_status)}</td>
                <td className="px-4 py-3 text-right text-slate-700">{row.active_assignment_count.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-slate-700">{row.capacity.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-slate-700">{row.available_seats.toLocaleString()}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">{row.utilization_percentage.toFixed(1)}%</td>
              </tr>)}
            </tbody>
          </table>
        </div>}
      </section>
    </section>}
  </main>;
}
