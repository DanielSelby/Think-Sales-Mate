import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Banknote, CreditCard, Receipt, Wallet } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { formatCurrencyAmount } from "@/lib/currency";
import { getOrganizationCurrencyConfig } from "@/lib/currency/settings";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { EducationFormDialog } from "@/components/education/education-form-dialog";
import { FeePaymentDialog } from "../students/[studentId]/fee-payment-dialog";
import { EducationFeePaymentHistory } from "./education-fee-payment-history";
import { EducationStudentSearch } from "./education-student-search";
import {
  applyEducationFeeSchedule,
  archiveEducationFeeSchedule,
  createEducationFeeCharge,
  createEducationFeeSchedule,
  voidEducationFeeCharge,
} from "../actions";

const PAGE_SIZE = 50;

export default async function EducationFinancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_finance", "finance", "charges", "view")) {
    redirect("/dashboard?accessDenied=think-education.finance");
  }

  const params = await searchParams;
  const requestedBranch = typeof params.branch === "string" ? params.branch : "";
  const requestedYear = typeof params.year === "string" ? params.year : "";
  const currentPage = Math.min(1_000_000, Math.max(1, Number.parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1));
  const currentSchedulePage = Math.min(1_000_000, Math.max(1, Number.parseInt(typeof params.schedulePage === "string" ? params.schedulePage : "1", 10) || 1));
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  const selectedBranch = campusIds.includes(requestedBranch) ? requestedBranch : "";
  const branchIds = selectedBranch ? [selectedBranch] : campusIds;
  const supabase = await createClient();
  const [
    { data: years, error: yearsError },
    currencyConfig,
    canCreateCharge,
    canRecordPayment,
    canViewPayments,
    canPrintReceipt,
    canExportCharges,
    canEditCharges,
    canReadStudents,
    canReadAcademicYears,
  ] = await Promise.all([
    supabase.from("education_academic_years")
      .select("id, name, status")
      .eq("org_id", context.orgId)
      .order("starts_on", { ascending: false }),
    getOrganizationCurrencyConfig(),
    canTabPermission("education_finance", "finance", "charges", "create"),
    canTabPermission("education_finance", "finance", "payments", "create"),
    canTabPermission("education_finance", "finance", "payments", "view"),
    canTabPermission("education_finance", "finance", "payments", "print"),
    canTabPermission("education_finance", "finance", "charges", "export"),
    canTabPermission("education_finance", "finance", "charges", "edit"),
    canTabPermission("education_students", "students", "list", "view"),
    canTabPermission("education_academics", "academics", "calendar", "view"),
  ]);
  if (yearsError) throw new Error(`Could not load academic years for fees: ${yearsError.message}`);
  const academicYears = years ?? [];
  const availableYears = academicYears.filter((year) => year.status === "planned" || year.status === "active");
  const yearIds = academicYears.map((year) => year.id);
  const selectedYear = yearIds.includes(requestedYear) ? requestedYear : "";

  const canPrepareCharge = canCreateCharge && canReadStudents && canReadAcademicYears;
  const canEditFeeSchedules = canEditCharges && canReadStudents && canReadAcademicYears;
  const canViewStudentStatements = canViewPayments && canReadStudents && canReadAcademicYears;
  const canViewAgingReport = canViewPayments && canReadStudents && canReadAcademicYears;
  const canViewCollectionsReport = canViewPayments && canReadStudents && canReadAcademicYears;
  const canExportFinance = canExportCharges && canViewPayments && canReadStudents && canReadAcademicYears;
  const createBranchId = selectedBranch || campuses[0]?.id || "";
  const createYearId = availableYears.some((year) => year.id === selectedYear) ? selectedYear : availableYears[0]?.id || "";
  const [chargesResult, studentCountResult, classesResult, schedulesResult] = branchIds.length ? await Promise.all([
    supabase.rpc("education_get_fee_charges_page", {
      p_org_id: context.orgId,
      p_branch_ids: branchIds,
      p_academic_year_id: selectedYear || null,
      p_limit: PAGE_SIZE,
      p_offset: (currentPage - 1) * PAGE_SIZE,
    }),
    canPrepareCharge && createBranchId
      ? supabase.from("education_students")
      .select("id", { count: "exact", head: true })
      .eq("org_id", context.orgId)
      .eq("branch_id", createBranchId)
      .eq("status", "active")
      : Promise.resolve({ count: 0, error: null }),
    canPrepareCharge && createBranchId && createYearId
      ? supabase.from("education_classes")
      .select("id, branch_id, academic_year_id, name")
      .eq("org_id", context.orgId)
      .eq("branch_id", createBranchId)
      .eq("academic_year_id", createYearId)
      .eq("status", "active")
      .order("name")
      : Promise.resolve({ data: [], error: null }),
    canPrepareCharge ? (() => {
      let query = supabase.from("education_fee_schedules")
        .select("id, branch_id, class_id, academic_year_id, description, amount, due_on, status, created_at", { count: "exact" })
        .eq("org_id", context.orgId)
        .in("branch_id", branchIds)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
      if (selectedYear) query = query.eq("academic_year_id", selectedYear);
      return query.range((currentSchedulePage - 1) * PAGE_SIZE, currentSchedulePage * PAGE_SIZE - 1);
    })() : Promise.resolve({ data: [], count: 0, error: null }),
  ]) : [
    { data: [], error: null },
    { count: 0, error: null },
    { data: [], error: null },
    { data: [], count: 0, error: null },
  ];
  if (chargesResult.error) throw new Error(`Could not load Think Education fee charges: ${chargesResult.error.message}`);
  if (studentCountResult.error) throw new Error(`Could not count active students for fee management: ${studentCountResult.error.message}`);
  if (classesResult.error) throw new Error(`Could not load classes for fee schedules: ${classesResult.error.message}`);
  if (schedulesResult.error) throw new Error(`Could not load Think Education fee schedules: ${schedulesResult.error.message}`);
  const charges = chargesResult.data ?? [];
  const activeStudentCount = studentCountResult.count ?? 0;
  const totalChargeCount = charges[0]?.total_count ?? 0;
  const totalScheduleCount = schedulesResult.count ?? 0;
  const totalSchedulePages = Math.max(1, Math.ceil(totalScheduleCount / PAGE_SIZE));
  const schedulePageHref = (page: number) => {
    const next = new URLSearchParams();
    if (selectedBranch) next.set("branch", selectedBranch);
    if (selectedYear) next.set("year", selectedYear);
    if (currentPage > 1) next.set("page", String(currentPage));
    next.set("schedulePage", String(page));
    return `${getProductAppPath("think-education", "/finance")}?${next.toString()}`;
  };
  if (canPrepareCharge && currentSchedulePage > totalSchedulePages) redirect(schedulePageHref(totalSchedulePages));
  const totalPages = Math.max(1, Math.ceil(totalChargeCount / PAGE_SIZE));
  const queryForPage = (page: number) => {
    const next = new URLSearchParams();
    if (selectedBranch) next.set("branch", selectedBranch);
    if (selectedYear) next.set("year", selectedYear);
    if (currentSchedulePage > 1) next.set("schedulePage", String(currentSchedulePage));
    next.set("page", String(page));
    return `${getProductAppPath("think-education", "/finance")}?${next.toString()}`;
  };
  if (currentPage > totalPages) redirect(queryForPage(totalPages));
  const schedules = schedulesResult.data ?? [];
  const scheduleClassIds = [...new Set(schedules.map((schedule) => schedule.class_id))];
  const { data: scheduleClasses, error: scheduleClassesError } = scheduleClassIds.length
    ? await supabase.from("education_classes")
      .select("id, name")
      .eq("org_id", context.orgId)
      .in("branch_id", branchIds)
      .eq("status", "active")
      .in("id", scheduleClassIds)
    : { data: [], error: null };
  if (scheduleClassesError) throw new Error(`Could not load classes for fee schedules: ${scheduleClassesError.message}`);
  const paidByCharge = new Map(charges.map((charge) => [charge.id, Number(charge.paid)]));
  const paymentCountByCharge = new Map(charges.map((charge) => [charge.id, charge.payment_count]));
  const classes = classesResult.data ?? [];
  const classNameById = new Map([
    ...classes.map((classroom) => [classroom.id, classroom.name] as const),
    ...(scheduleClasses ?? []).map((classroom) => [classroom.id, classroom.name] as const),
  ]);
  const studentById = new Map(charges.map((charge) => {
    const fullName = [charge.first_name, charge.last_name].filter(Boolean).join(" ");
    const label = fullName && charge.student_number
      ? `${fullName} · ${charge.student_number}`
      : fullName || "Student";
    return [charge.student_id, label] as const;
  }));
  const payableCharges = charges.flatMap((charge) => {
    const balance = Math.max(0, charge.amount - (paidByCharge.get(charge.id) ?? 0));
    return charge.status === "open" && balance > 0
      ? [{
        id: charge.id,
        studentId: charge.student_id,
        studentName: studentById.get(charge.student_id) ?? "Student",
        description: charge.description,
        balance,
      }]
      : [];
  });
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const yearNameById = new Map(academicYears.map((year) => [year.id, year.name]));
  const activeCharges = charges.filter((charge) => charge.status === "open");
  const totalCharged = activeCharges.reduce((sum, charge) => sum + charge.amount, 0);
  const totalPaid = activeCharges.reduce((sum, charge) => sum + (paidByCharge.get(charge.id) ?? 0), 0);
  const outstanding = Math.max(0, totalCharged - totalPaid);
  const formatMoney = (amount: number) => formatCurrencyAmount(amount, currencyConfig);
  const createYearClasses = classes.filter((classroom) =>
    classroom.branch_id === createBranchId && classroom.academic_year_id === createYearId
  );
  const exportQuery = new URLSearchParams();
  if (selectedBranch) exportQuery.set("branch", selectedBranch);
  if (selectedYear) exportQuery.set("year", selectedYear);
  const exportFilters = exportQuery.toString();
  const exportHref = `${getProductAppPath("think-education", "/finance/export")}${exportFilters ? `?${exportFilters}` : ""}`;
  const errorMessage = params.error === "invalid"
    ? "Check the selected student or class, academic year, description, due date, and amount."
    : params.error === "payment"
      ? "The payment is invalid or greater than the outstanding balance."
      : params.error === "accounting-mapping"
        ? "Configure the required campus account mappings before recording this fee transaction."
        : params.error === "accounting-period"
          ? "This transaction date is outside an open accounting period. Reopen or create the applicable period before continuing."
      : params.error === "schedule"
        ? "That schedule is inactive, the academic year is no longer open, or the class has no active students."
      : params.error === "schedule-archive-invalid"
        ? "Enter a reason of at least 3 characters to archive the schedule."
      : params.error === "schedule-archive-blocked"
        ? "That schedule is no longer active and cannot be archived."
      : params.error === "void-invalid"
        ? "Enter a reason of at least 3 characters to void the charge."
      : params.error === "void-blocked"
        ? "Only open charges with no recorded payments can be voided."
      : params.error === "not-found"
        ? "That fee charge or schedule could not be found."
        : params.error === "save"
          ? "The finance record could not be saved. Please try again."
          : null;

  return <main className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
      <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-950">Fees & Finance</h1>
      <p className="mt-1 text-sm text-slate-600">Step 1: create a charge for a student. Step 2: record their payment from the charge or payment list. Outstanding balances update automatically.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {canPrepareCharge && campuses.length > 0 && createBranchId && createYearId && activeStudentCount > 0 && <EducationFormDialog
          buttonLabel="Create student charge"
          title="Create student fee charge"
          description="Add a fee to one student’s account. Payments can be recorded after the charge is created."
        >
          <form action={createEducationFeeCharge} className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Campus
              <span className="mt-1 block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-normal text-slate-700">{campusNameById.get(createBranchId)}</span>
              <input type="hidden" name="branch_id" value={createBranchId} />
            </label>
            <label className="text-sm font-medium text-slate-700">Academic year
              <span className="mt-1 block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-normal text-slate-700">{yearNameById.get(createYearId)}</span>
              <input type="hidden" name="academic_year_id" value={createYearId} />
            </label>
            <label className="text-sm font-medium text-slate-700">Student
              <EducationStudentSearch key={createBranchId} branchId={createBranchId} />
            </label>
            <label className="text-sm font-medium text-slate-700">Charge description
              <input required name="description" maxLength={160} placeholder="e.g. Tuition, books, or transport" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>
            <label className="text-sm font-medium text-slate-700">Amount ({currencyConfig.symbol})
              <input required name="amount" type="number" min="0.01" step="0.01" max="9999999999.99" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>
            <label className="text-sm font-medium text-slate-700">Due date
              <input name="due_on" type="date" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>
            <div className="flex justify-end sm:col-span-2">
              <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"><Receipt className="h-4 w-4" /> Create charge</button>
            </div>
          </form>
        </EducationFormDialog>}
        {canViewPayments && <Link href={getProductAppPath("think-education", "/finance/payments")} className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-800 hover:bg-blue-100">
          Fee payment list
        </Link>}
        {canRecordPayment && payableCharges.length > 0 && <FeePaymentDialog
          charges={payableCharges}
          studentId=""
          studentName=""
          currencyConfig={currencyConfig}
          returnToFinance
          buttonLabel="Record fee payment"
        />}
        {canViewCollectionsReport && <Link href={getProductAppPath("think-education", "/finance/collections")} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Payment collections
        </Link>}
        {canViewAgingReport && <Link href={getProductAppPath("think-education", "/finance/aging")} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Outstanding fees aging
        </Link>}
        {canExportFinance && <a href={exportHref} className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-800 hover:bg-blue-100">
          Export matching charges
        </a>}
      </div>
    </header>

    {canPrepareCharge && campuses.length > 0 && (!createYearId || activeStudentCount === 0) && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      {!createYearId ? "Create a planned or active academic year before adding fee charges." : "No active students are available at the selected campus."}
    </p>}

    {params.created === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Fee charge created.</p>}
    {params.scheduleCreated === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Fee schedule created. Apply it when you are ready to post charges to the class.</p>}
    {params.scheduleArchived === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Fee schedule archived. Previously posted charges were not changed.</p>}
    {typeof params.applied === "string" && /^\d+$/.test(params.applied) && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{params.applied} student fee charge(s) posted. Applying the same schedule again will not create duplicates.</p>}
    {params.paid === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Payment recorded and receipt reference generated.</p>}
    {params.voided === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Unpaid fee charge voided and recorded in the audit log.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
      {errorMessage}
      {(params.error === "accounting-mapping" || params.error === "accounting-period") && (
        <> <Link href={getProductAppPath("think-education", params.error === "accounting-mapping" ? "/accounting/settings" : "/accounting/periods")} className="font-semibold underline">Open accounting setup</Link></>
      )}
    </p>}

    <section className="grid gap-3 sm:grid-cols-3">
      {[
        { label: "Charges on this page", value: formatMoney(totalCharged), icon: Receipt },
        { label: "Payments on this page", value: formatMoney(totalPaid), icon: CreditCard },
        { label: "Outstanding on this page", value: formatMoney(outstanding), icon: Wallet },
      ].map(({ label, value, icon: Icon }) => <article key={label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{value}</p></div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon className="h-5 w-5" /></span>
      </article>)}
    </section>

    <section id="fee-payments" className="scroll-mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {canRecordPayment && <div className="border-b border-slate-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
        To add a fee payment, find the student’s outstanding charge below, enter the amount and payment method, then select <strong>Record payment</strong>.
      </div>}
      <form method="get" action={getProductAppPath("think-education", "/finance")} className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-[1fr_1fr_auto]">
        <label className="text-sm font-medium text-slate-700">Campus
          <select name="branch" defaultValue={selectedBranch} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All assigned campuses</option>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Academic year
          <select name="year" defaultValue={selectedYear} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All years</option>
            {academicYears.map((year) => <option key={year.id} value={year.id}>{year.name} · {year.status}</option>)}
          </select>
        </label>
        <button type="submit" className="self-end rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">Apply filters</button>
      </form>

      {charges.length === 0 ? <div className="p-8 text-center">
        <Banknote className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-3 font-semibold text-slate-900">No fee charges found</h2>
        <p className="mt-1 text-sm text-slate-500">Choose an available academic year and campus, then create a student charge.</p>
      </div> : <div className="divide-y divide-slate-100">
        {charges.map((charge) => {
          const paid = paidByCharge.get(charge.id) ?? 0;
          const balance = Math.max(0, charge.amount - paid);
          const studentName = studentById.get(charge.student_id) ?? "Student";
          return <article key={charge.id} className="space-y-4 p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-950">{studentName}</h2>
                {canViewStudentStatements && <Link
                  href={getProductAppPath("think-education", `/finance/students/${charge.student_id}`)}
                  className="mt-1 inline-block text-xs font-semibold text-blue-700 hover:text-blue-900 print:hidden"
                >View student statement</Link>}
                <p className="mt-1 text-sm text-slate-600">{charge.description} · {yearNameById.get(charge.academic_year_id) ?? "Academic year"}</p>
                <p className="mt-1 text-xs text-slate-500">{campusNameById.get(charge.branch_id) ?? "Campus"}{charge.due_on ? ` · Due ${charge.due_on}` : ""}</p>
              </div>
              <div className="text-right text-sm">
                <p className="font-semibold text-slate-900">{formatMoney(charge.amount)}</p>
                <p className="mt-1 text-slate-500">Paid {formatMoney(paid)} · Balance {formatMoney(balance)}</p>
                {charge.status === "void" && <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">Voided</span>}
                {balance === 0 && charge.status === "open" && <span className="mt-1 inline-block rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">Paid in full</span>}
              </div>
            </div>

            {canRecordPayment && charge.status === "open" && balance > 0 && <FeePaymentDialog
              chargeId={charge.id}
              studentId={charge.student_id}
              studentName={studentName}
              chargeDescription={charge.description}
              balance={balance}
              currencyConfig={currencyConfig}
              returnToFinance
            />}

            {canEditCharges && charge.status === "open" && (paymentCountByCharge.get(charge.id) ?? 0) === 0 && <details className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm">
              <summary className="cursor-pointer font-semibold text-rose-800">Void unpaid charge</summary>
              <form action={voidEducationFeeCharge} className="mt-3 flex flex-wrap items-end gap-3">
                <input type="hidden" name="charge_id" value={charge.id} />
                <label className="min-w-60 flex-1 text-xs font-medium text-slate-700">Reason (required)
                  <input required name="reason" minLength={3} maxLength={500} className="mt-1 w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-normal" />
                </label>
                <button type="submit" className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-100">Confirm void</button>
              </form>
              <p className="mt-2 text-xs text-rose-700">Charges with any recorded payment cannot be voided.</p>
            </details>}

            {canViewPayments && (paymentCountByCharge.get(charge.id) ?? 0) > 0 && <EducationFeePaymentHistory
              chargeId={charge.id}
              initialCount={paymentCountByCharge.get(charge.id) ?? 0}
              canPrintReceipt={canPrintReceipt}
            />}
          </article>;
        })}
      </div>}
      {totalChargeCount > 0 && <nav aria-label="Fee charge pages" className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
        <p className="text-slate-500">Showing {Math.min(totalChargeCount, (currentPage - 1) * PAGE_SIZE + 1)}–{Math.min(totalChargeCount, currentPage * PAGE_SIZE)} of {totalChargeCount} charges</p>
        <div className="flex gap-2">
          {currentPage > 1 && <Link href={queryForPage(currentPage - 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">Previous</Link>}
          {currentPage < totalPages && <Link href={queryForPage(currentPage + 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">Next</Link>}
        </div>
      </nav>}
    </section>

    {canPrepareCharge && <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
        <div>
          <h2 className="font-semibold text-slate-950">Class fee schedules</h2>
          <p className="mt-1 text-sm text-slate-500">Create a schedule for an academic year, then post one charge to every currently enrolled active student in that class.</p>
        </div>
        {campuses.length > 0 && createBranchId && createYearId && createYearClasses.length > 0 && <EducationFormDialog
          buttonLabel="Create class schedule"
          title="Create class fee schedule"
          description="Create a reusable fee schedule, then post charges to the class when ready."
        >
          <form action={createEducationFeeSchedule} className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Campus
              <span className="mt-1 block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-normal text-slate-700">{campusNameById.get(createBranchId)}</span>
              <input type="hidden" name="branch_id" value={createBranchId} />
            </label>
            <label className="text-sm font-medium text-slate-700">Academic year
              <span className="mt-1 block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-normal text-slate-700">{yearNameById.get(createYearId)}</span>
              <input type="hidden" name="academic_year_id" value={createYearId} />
            </label>
            <label className="text-sm font-medium text-slate-700">Class
              <select required name="class_id" defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
                <option value="" disabled>Select a class</option>
                {createYearClasses.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">Fee description
              <input required name="description" maxLength={160} placeholder="e.g. Term tuition" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>
            <label className="text-sm font-medium text-slate-700">Amount per student ({currencyConfig.symbol})
              <input required name="amount" type="number" min="0.01" step="0.01" max="9999999999.99" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>
            <label className="text-sm font-medium text-slate-700">Due date
              <input name="due_on" type="date" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>
            <div className="flex justify-end sm:col-span-2"><button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Save fee schedule</button></div>
          </form>
        </EducationFormDialog>}
      </div>
      {schedules.length > 0 && <div className="divide-y divide-slate-100">
        {schedules.map((schedule) => <div key={schedule.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div>
            <p className="font-semibold text-slate-900">{schedule.description} · {formatMoney(schedule.amount)}</p>
            <p className="mt-1 text-sm text-slate-500">
              {campusNameById.get(schedule.branch_id) ?? "Campus"} · {classNameById.get(schedule.class_id) ?? "Class"} · {yearNameById.get(schedule.academic_year_id) ?? "Academic year"}
              {schedule.due_on ? ` · Due ${schedule.due_on}` : ""}
            </p>
            {schedule.status === "archived" && <span className="mt-2 inline-block rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">Archived · existing charges unchanged</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {schedule.status === "active" && canCreateCharge && <form action={applyEducationFeeSchedule}>
              <input type="hidden" name="schedule_id" value={schedule.id} />
              <button type="submit" className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800">Post to enrolled students</button>
            </form>}
            {schedule.status === "active" && canEditFeeSchedules && <details className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              <summary className="cursor-pointer font-semibold text-slate-700">Archive</summary>
              <form action={archiveEducationFeeSchedule} className="mt-3 flex flex-wrap items-end gap-2">
                <input type="hidden" name="schedule_id" value={schedule.id} />
                <label className="min-w-52 flex-1 text-xs font-medium text-slate-700">Reason (required)
                  <input required name="reason" minLength={3} maxLength={500} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
                </label>
                <button type="submit" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Confirm archive</button>
              </form>
              <p className="mt-2 text-xs text-slate-500">Existing student charges remain in the finance ledger.</p>
            </details>}
          </div>
        </div>)}
      </div>}
      {totalScheduleCount > 0 && <nav aria-label="Fee schedule pages" className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
        <p className="text-slate-500">Showing {Math.min(totalScheduleCount, (currentSchedulePage - 1) * PAGE_SIZE + 1)}–{Math.min(totalScheduleCount, currentSchedulePage * PAGE_SIZE)} of {totalScheduleCount} schedules</p>
        <div className="flex gap-2">
          {currentSchedulePage > 1 && <Link href={schedulePageHref(currentSchedulePage - 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">Previous</Link>}
          {currentSchedulePage < totalSchedulePages && <Link href={schedulePageHref(currentSchedulePage + 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">Next</Link>}
        </div>
      </nav>}
      {canPrepareCharge && campuses.length > 0 && createBranchId && createYearId && createYearClasses.length === 0 && <p className="border-t border-slate-200 p-4 text-sm text-slate-600">Create an active class in the selected academic year to set up a class fee schedule.</p>}
    </section>}

    {canCreateCharge && !canPrepareCharge && <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      Student directory view and academic calendar view permissions are required to create charges.
    </p>}
    {canPrepareCharge && campuses.length > 0 && (!createYearId || activeStudentCount === 0) && <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
      {!createYearId ? "Create a planned or active academic year before adding fee charges." : "No active students are available at the selected campus."}
    </p>}
  </main>;
}
