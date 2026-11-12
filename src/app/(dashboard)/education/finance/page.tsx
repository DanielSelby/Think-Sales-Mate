import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Banknote, CreditCard, Receipt, Wallet } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import {
  applyEducationFeeSchedule,
  archiveEducationFeeSchedule,
  createEducationFeeCharge,
  createEducationFeeSchedule,
  recordEducationFeePayment,
  voidEducationFeeCharge,
} from "../actions";

const PAGE_SIZE = 50;

type PaymentRecord = {
  id: string;
  charge_id: string;
  amount: number;
  payment_method: string;
  reference: string | null;
  created_at: string;
};

const PAYMENT_METHODS = [
  ["cash", "Cash"],
  ["mobile_money", "Mobile money"],
  ["bank_transfer", "Bank transfer"],
  ["card", "Card"],
  ["cheque", "Cheque"],
  ["other", "Other"],
] as const;

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
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  const selectedBranch = campusIds.includes(requestedBranch) ? requestedBranch : "";
  const branchIds = selectedBranch ? [selectedBranch] : campusIds;
  const supabase = await createClient();
  const [{ data: years, error: yearsError }, { data: organization, error: organizationError }] = await Promise.all([
    supabase.from("education_academic_years")
      .select("id, name, status")
      .eq("org_id", context.orgId)
      .order("starts_on", { ascending: false }),
    supabase.from("organizations")
      .select("currency")
      .eq("id", context.orgId)
      .single(),
  ]);
  if (yearsError) throw new Error(`Could not load academic years for fees: ${yearsError.message}`);
  if (organizationError) throw new Error(`Could not load the organization currency: ${organizationError.message}`);
  const academicYears = years ?? [];
  const availableYears = academicYears.filter((year) => year.status === "planned" || year.status === "active");
  const yearIds = academicYears.map((year) => year.id);
  const selectedYear = yearIds.includes(requestedYear) ? requestedYear : "";

  const [canCreateCharge, canRecordPayment, canViewPayments, canPrintReceipt, canExportCharges, canEditCharges] = await Promise.all([
    canTabPermission("education_finance", "finance", "charges", "create"),
    canTabPermission("education_finance", "finance", "payments", "create"),
    canTabPermission("education_finance", "finance", "payments", "view"),
    canTabPermission("education_finance", "finance", "payments", "print"),
    canTabPermission("education_finance", "finance", "charges", "export"),
    canTabPermission("education_finance", "finance", "charges", "edit"),
  ]);
  const [canReadStudents, canReadAcademicYears] = await Promise.all([
    canTabPermission("education_students", "students", "list", "view"),
    canTabPermission("education_academics", "academics", "calendar", "view"),
  ]);
  const canPrepareCharge = canCreateCharge && canReadStudents && canReadAcademicYears;
  const canEditFeeSchedules = canEditCharges && canReadStudents && canReadAcademicYears;
  const canViewStudentStatements = canViewPayments && canReadStudents && canReadAcademicYears;
  const canViewAgingReport = canViewPayments && canReadStudents && canReadAcademicYears;
  const canViewCollectionsReport = canViewPayments && canReadStudents && canReadAcademicYears;
  const canExportFinance = canExportCharges && canViewPayments && canReadStudents && canReadAcademicYears;
  const [chargesResult, studentsResult] = branchIds.length ? await Promise.all([
    (() => {
      let query = supabase.from("education_fee_charges")
        .select("id, branch_id, student_id, academic_year_id, description, amount, due_on, status, created_at", { count: "exact" })
        .eq("org_id", context.orgId)
        .in("branch_id", branchIds)
        .order("created_at", { ascending: false })
        .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);
      if (selectedYear) query = query.eq("academic_year_id", selectedYear);
      return query;
    })(),
    supabase.from("education_students")
      .select("id, branch_id, student_number, first_name, last_name")
      .eq("org_id", context.orgId)
      .in("branch_id", branchIds)
      .eq("status", "active")
      .order("last_name")
      .order("first_name"),
  ]) : [
    { data: [], error: null },
    { data: [], error: null },
  ];
  if (chargesResult.error) throw new Error(`Could not load Think Education fee charges: ${chargesResult.error.message}`);
  if (studentsResult.error) throw new Error(`Could not load students for fee management: ${studentsResult.error.message}`);
  const [classesResult, schedulesResult] = branchIds.length ? await Promise.all([
    supabase.from("education_classes")
      .select("id, branch_id, academic_year_id, name")
      .eq("org_id", context.orgId)
      .in("branch_id", branchIds)
      .eq("status", "active")
      .order("name"),
    (() => {
      let query = supabase.from("education_fee_schedules")
        .select("id, branch_id, class_id, academic_year_id, description, amount, due_on, status, created_at")
        .eq("org_id", context.orgId)
        .in("branch_id", branchIds)
        .order("created_at", { ascending: false });
      if (selectedYear) query = query.eq("academic_year_id", selectedYear);
      return query;
    })(),
  ]) : [
    { data: [], error: null },
    { data: [], error: null },
  ];
  if (classesResult.error) throw new Error(`Could not load classes for fee schedules: ${classesResult.error.message}`);
  if (schedulesResult.error) throw new Error(`Could not load Think Education fee schedules: ${schedulesResult.error.message}`);
  const charges = chargesResult.data ?? [];
  const totalChargeCount = chargesResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalChargeCount / PAGE_SIZE));
  const queryForPage = (page: number) => {
    const next = new URLSearchParams();
    if (selectedBranch) next.set("branch", selectedBranch);
    if (selectedYear) next.set("year", selectedYear);
    next.set("page", String(page));
    return `${getProductAppPath("think-education", "/finance")}?${next.toString()}`;
  };
  if (currentPage > totalPages) redirect(queryForPage(totalPages));
  const chargeIds = charges.map((charge) => charge.id);
  let payments: PaymentRecord[] = [];
  if (chargeIds.length) {
    const { data, error } = await supabase.from("education_fee_payments")
      .select("id, charge_id, amount, payment_method, reference, created_at")
      .eq("org_id", context.orgId)
      .in("charge_id", chargeIds)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Could not load Think Education payments: ${error.message}`);
    payments = (data ?? []) as PaymentRecord[];
  }

  const paidByCharge = new Map<string, number>();
  const paymentsByCharge = new Map<string, PaymentRecord[]>();
  for (const payment of payments) {
    paidByCharge.set(payment.charge_id, (paidByCharge.get(payment.charge_id) ?? 0) + payment.amount);
    paymentsByCharge.set(payment.charge_id, [...(paymentsByCharge.get(payment.charge_id) ?? []), payment]);
  }
  const students = studentsResult.data ?? [];
  const classes = classesResult.data ?? [];
  const schedules = schedulesResult.data ?? [];
  const studentById = new Map(students.map((student) => [
    student.id,
    `${student.first_name} ${student.last_name} · ${student.student_number}`,
  ]));
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const yearNameById = new Map(academicYears.map((year) => [year.id, year.name]));
  const activeCharges = charges.filter((charge) => charge.status === "open");
  const totalCharged = activeCharges.reduce((sum, charge) => sum + charge.amount, 0);
  const totalPaid = activeCharges.reduce((sum, charge) => sum + (paidByCharge.get(charge.id) ?? 0), 0);
  const outstanding = Math.max(0, totalCharged - totalPaid);
  const currency = organization.currency;
  const formatMoney = (amount: number) => `${currency} ${amount.toFixed(2)}`;
  const createBranchId = selectedBranch || campuses[0]?.id || "";
  const createYearId = availableYears.some((year) => year.id === selectedYear) ? selectedYear : availableYears[0]?.id || "";
  const createBranchStudents = students.filter((student) => student.branch_id === createBranchId);
  const createYearClasses = classes.filter((classroom) =>
    classroom.branch_id === createBranchId && classroom.academic_year_id === createYearId
  );
  const classNameById = new Map(classes.map((classroom) => [classroom.id, classroom.name]));
  const exportQuery = new URLSearchParams();
  if (selectedBranch) exportQuery.set("branch", selectedBranch);
  if (selectedYear) exportQuery.set("year", selectedYear);
  const exportFilters = exportQuery.toString();
  const exportHref = `${getProductAppPath("think-education", "/finance/export")}${exportFilters ? `?${exportFilters}` : ""}`;
  const errorMessage = params.error === "invalid"
    ? "Check the selected student or class, academic year, description, due date, and amount."
    : params.error === "payment"
      ? "The payment is invalid or greater than the outstanding balance."
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
      <p className="mt-1 text-sm text-slate-600">Create student fee charges, record payments, and track outstanding balances.</p>
      </div>
      <div className="flex flex-wrap gap-2">
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

    {params.created === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Fee charge created.</p>}
    {params.scheduleCreated === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Fee schedule created. Apply it when you are ready to post charges to the class.</p>}
    {params.scheduleArchived === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Fee schedule archived. Previously posted charges were not changed.</p>}
    {typeof params.applied === "string" && /^\d+$/.test(params.applied) && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{params.applied} student fee charge(s) posted. Applying the same schedule again will not create duplicates.</p>}
    {params.paid === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Payment recorded and receipt reference generated.</p>}
    {params.voided === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Unpaid fee charge voided and recorded in the audit log.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

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

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
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

            {canRecordPayment && charge.status === "open" && balance > 0 && <form action={recordEducationFeePayment} className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
              <input type="hidden" name="charge_id" value={charge.id} />
              <label className="text-xs font-medium text-slate-600">Payment amount
                <input required name="amount" type="number" min="0.01" max={balance.toFixed(2)} step="0.01" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal" />
              </label>
              <label className="text-xs font-medium text-slate-600">Method
                <select required name="payment_method" defaultValue="cash" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal">
                  {PAYMENT_METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600 sm:col-span-2">Reference
                <input name="reference" maxLength={120} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal" />
              </label>
              <div className="flex items-end"><button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800"><CreditCard className="h-4 w-4" /> Record</button></div>
            </form>}

            {canEditCharges && charge.status === "open" && (paymentsByCharge.get(charge.id) ?? []).length === 0 && <details className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm">
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

            {(paymentsByCharge.get(charge.id) ?? []).length > 0 && <details className="text-sm">
              <summary className="cursor-pointer font-medium text-blue-800">Payment history ({(paymentsByCharge.get(charge.id) ?? []).length})</summary>
              <ul className="mt-2 space-y-2 pl-4">
                {(paymentsByCharge.get(charge.id) ?? []).map((payment) => <li key={payment.id} className="flex flex-wrap justify-between gap-2 text-slate-600">
                  <span>{new Date(payment.created_at).toLocaleString()} · {payment.payment_method.replace("_", " ")}{payment.reference ? ` · ${payment.reference}` : ""}</span>
                  <span className="flex items-center gap-3">
                    <span className="font-medium text-slate-800">{formatMoney(payment.amount)} · Receipt {payment.id.toUpperCase()}</span>
                    {canViewPayments && canPrintReceipt && <Link
                      href={getProductAppPath("think-education", `/finance/receipts/${payment.id}`)}
                      className="font-semibold text-blue-700 hover:text-blue-900 print:hidden"
                    >Open receipt</Link>}
                  </span>
                </li>)}
              </ul>
            </details>}
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
      <div className="border-b border-slate-200 p-5">
        <h2 className="font-semibold text-slate-950">Class fee schedules</h2>
        <p className="mt-1 text-sm text-slate-500">Create a schedule for an academic year, then post one charge to every currently enrolled active student in that class.</p>
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
      {canPrepareCharge && campuses.length > 0 && createBranchId && createYearId && createYearClasses.length > 0 && <div className="border-t border-slate-200 p-5">
        <h3 className="font-semibold text-slate-950">Create class schedule</h3>
        <form action={createEducationFeeSchedule} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
          <label className="text-sm font-medium text-slate-700">Amount per student ({currency})
            <input required name="amount" type="number" min="0.01" step="0.01" max="9999999999.99" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-medium text-slate-700">Due date
            <input name="due_on" type="date" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <div className="flex items-end"><button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Save fee schedule</button></div>
        </form>
      </div>}
      {canPrepareCharge && campuses.length > 0 && createBranchId && createYearId && createYearClasses.length === 0 && <p className="border-t border-slate-200 p-4 text-sm text-slate-600">Create an active class in the selected academic year to set up a class fee schedule.</p>}
    </section>}

    {canPrepareCharge && campuses.length > 0 && createBranchId && createYearId && createBranchStudents.length > 0 && <section id="add-charge" className="scroll-mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-950">Create student fee charge</h2>
      <p className="mt-1 text-sm text-slate-500">Charges and payments are retained in an auditable ledger. Payments cannot exceed the remaining balance.</p>
      <form action={createEducationFeeCharge} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm font-medium text-slate-700">Campus
          <span className="mt-1 block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-normal text-slate-700">{campusNameById.get(createBranchId)}</span>
          <input type="hidden" name="branch_id" value={createBranchId} />
        </label>
        <label className="text-sm font-medium text-slate-700">Academic year
          <span className="mt-1 block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-normal text-slate-700">{yearNameById.get(createYearId)}</span>
          <input type="hidden" name="academic_year_id" value={createYearId} />
        </label>
        <label className="text-sm font-medium text-slate-700">Student
          <select required name="student_id" defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="" disabled>Select a student</option>
            {createBranchStudents.map((student) => <option key={student.id} value={student.id}>{student.first_name} {student.last_name} · {student.student_number}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Charge description
          <input required name="description" maxLength={160} placeholder="e.g. Tuition, books, or transport" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Amount ({currency})
          <input required name="amount" type="number" min="0.01" step="0.01" max="9999999999.99" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Due date
          <input name="due_on" type="date" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <div className="flex items-end"><button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"><Receipt className="h-4 w-4" /> Create charge</button></div>
      </form>
    </section>}
    {canCreateCharge && !canPrepareCharge && <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      Student directory view and academic calendar view permissions are required to create charges.
    </p>}
    {canPrepareCharge && campuses.length > 0 && (!createYearId || createBranchStudents.length === 0) && <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
      {!createYearId ? "Create a planned or active academic year before adding fee charges." : "No active students are available at the selected campus."}
    </p>}
  </main>;
}
