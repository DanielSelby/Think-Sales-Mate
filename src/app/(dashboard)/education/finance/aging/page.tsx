import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDownToLine, ArrowLeft, Clock3, Wallet } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { formatCurrencyAmount } from "@/lib/currency";
import { getOrganizationCurrencyConfig } from "@/lib/currency/settings";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { FeePaymentDialog } from "../../students/[studentId]/fee-payment-dialog";

const MAX_CHARGES = 20_000;
const REPORT_PAGE_SIZE = 50;

type AgingBucket = "notDue" | "days1To30" | "days31To60" | "days61To90" | "over90";

type AgingAccount = {
  studentId: string;
  studentNumber: string;
  firstName: string;
  lastName: string;
  campusId: string;
  charges: number;
  balance: number;
  notDue: number;
  days1To30: number;
  days31To60: number;
  days61To90: number;
  over90: number;
};

export default async function EducationFeeAgingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");

  const [
    canViewCharges,
    canExportCharges,
    canViewPayments,
    canExportPayments,
    canViewStudents,
    canExportStudents,
    canViewAcademicYears,
    canRecordPayment,
  ] = await Promise.all([
    canTabPermission("education_finance", "finance", "charges", "view"),
    canTabPermission("education_finance", "finance", "charges", "export"),
    canTabPermission("education_finance", "finance", "payments", "view"),
    canTabPermission("education_finance", "finance", "payments", "export"),
    canTabPermission("education_students", "students", "list", "view"),
    canTabPermission("education_students", "students", "list", "export"),
    canTabPermission("education_academics", "academics", "calendar", "view"),
    canTabPermission("education_finance", "finance", "payments", "create"),
  ]);
  if (!canViewCharges || !canViewPayments || !canViewStudents || !canViewAcademicYears) {
    redirect("/dashboard?accessDenied=think-education.finance.aging");
  }

  const params = await searchParams;
  const paymentErrorMessage = params.error === "invalid" || params.error === "payment"
    ? "Check the payment amount and details, then try again."
    : params.error === "accounting-mapping"
      ? "Fee payments need an accounting mapping before they can be recorded."
      : params.error === "accounting-period"
        ? "Payments cannot be recorded because the accounting period is closed."
        : params.error === "not-found"
          ? "The fee charge is no longer available."
          : params.error === "save" ? "The payment could not be saved. Please try again." : null;
  const requestedBranch = typeof params.branch === "string" ? params.branch : "";
  const requestedYear = typeof params.year === "string" ? params.year : "";
  const currentPage = Math.min(1_000_000, Math.max(1, Number.parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1));
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  const selectedBranch = campusIds.includes(requestedBranch) ? requestedBranch : "";
  const branchIds = selectedBranch ? [selectedBranch] : campusIds;
  const supabase = await createClient();

  const [{ data: years, error: yearsError }, currencyConfig] = await Promise.all([
    supabase.from("education_academic_years")
      .select("id, name")
      .eq("org_id", context.orgId)
      .order("starts_on", { ascending: false }),
    getOrganizationCurrencyConfig(),
  ]);
  if (yearsError) throw new Error(`Could not load academic years for fee aging: ${yearsError.message}`);
  const academicYears = years ?? [];
  const selectedYear = academicYears.some((year) => year.id === requestedYear) ? requestedYear : "";
  const canExportAging = canViewCharges && canExportCharges && canViewPayments && canExportPayments
    && canViewStudents && canExportStudents && canViewAcademicYears;
  const exportParams = new URLSearchParams();
  if (selectedBranch) exportParams.set("branch", selectedBranch);
  if (selectedYear) exportParams.set("year", selectedYear);
  const exportQuery = exportParams.toString();
  const exportHref = `/api/education/finance/aging/export${exportQuery ? `?${exportQuery}` : ""}`;

  let countQuery = supabase.from("education_fee_charges")
    .select("id", { count: "exact", head: true })
    .eq("org_id", context.orgId)
    .in("branch_id", branchIds)
    .eq("status", "open");
  if (selectedYear) countQuery = countQuery.eq("academic_year_id", selectedYear);
  const { count, error: countError } = branchIds.length ? await countQuery : { count: 0, error: null };
  if (countError) throw new Error(`Could not count open fee charges for aging: ${countError.message}`);
  const chargeCount = count ?? 0;
  const reportTooLarge = chargeCount > MAX_CHARGES;

  const localToday = new Date();
  const asOfDate = `${localToday.getFullYear()}-${String(localToday.getMonth() + 1).padStart(2, "0")}-${String(localToday.getDate()).padStart(2, "0")}`;
  const { data: agingRows, error: agingError } = !reportTooLarge && branchIds.length
    ? await supabase.rpc("education_get_fee_aging_page", {
      p_org_id: context.orgId,
      p_branch_ids: branchIds,
      p_academic_year_id: selectedYear || null,
      p_as_of_date: asOfDate,
      p_limit: REPORT_PAGE_SIZE,
      p_offset: (currentPage - 1) * REPORT_PAGE_SIZE,
    })
    : { data: [], error: null };
  if (agingError) throw new Error(`Could not aggregate fee aging: ${agingError.message}`);

  const summary = agingRows?.[0];
  const accounts: AgingAccount[] = (agingRows ?? []).flatMap((row) => row.student_id && row.branch_id
    ? [{
      studentId: row.student_id,
      studentNumber: "",
      firstName: "",
      lastName: "",
      campusId: row.branch_id,
      charges: Number(row.outstanding_charges ?? 0),
      balance: Number(row.balance ?? 0),
      notDue: Number(row.not_due ?? 0),
      days1To30: Number(row.days_1_to_30 ?? 0),
      days31To60: Number(row.days_31_to_60 ?? 0),
      days61To90: Number(row.days_61_to_90 ?? 0),
      over90: Number(row.over_90 ?? 0),
    }]
    : []);
  const totalBalance = Number(summary?.total_balance ?? 0);
  const bucketTotals: Record<AgingBucket, number> = {
    notDue: Number(summary?.total_not_due ?? 0),
    days1To30: Number(summary?.total_days_1_to_30 ?? 0),
    days31To60: Number(summary?.total_days_31_to_60 ?? 0),
    days61To90: Number(summary?.total_days_61_to_90 ?? 0),
    over90: Number(summary?.total_over_90 ?? 0),
  };
  const totalCount = Number(summary?.total_count ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / REPORT_PAGE_SIZE));
  const queryForPage = (page: number) => {
    const next = new URLSearchParams();
    if (selectedBranch) next.set("branch", selectedBranch);
    if (selectedYear) next.set("year", selectedYear);
    if (page > 1) next.set("page", String(page));
    const query = next.toString();
    return `${getProductAppPath("think-education", "/finance/aging")}${query ? `?${query}` : ""}`;
  };
  if (currentPage > totalPages) redirect(queryForPage(totalPages));

  const studentsToLoad = accounts.map((account) => account.studentId);
  const accountByStudent = new Map(accounts.map((account) => [account.studentId, account]));
  for (let offset = 0; offset < studentsToLoad.length; offset += 200) {
    const { data, error } = await supabase.from("education_students")
      .select("id, student_number, first_name, last_name")
      .eq("org_id", context.orgId)
      .in("branch_id", branchIds)
      .in("id", studentsToLoad.slice(offset, offset + 200));
    if (error) throw new Error(`Could not load students for fee aging: ${error.message}`);
    for (const student of data ?? []) {
      const account = accountByStudent.get(student.id);
      if (account) {
        account.studentNumber = student.student_number;
        account.firstName = student.first_name;
        account.lastName = student.last_name;
      }
    }
  }

  const payableChargesByStudent = new Map<string, Array<{
    id: string;
    description: string;
    balance: number;
    studentId: string;
    studentName: string;
  }>>();
  if (canRecordPayment && !reportTooLarge && branchIds.length && studentsToLoad.length) {
    const chargeRows: Array<{ id: string; student_id: string; description: string; amount: number }> = [];
    for (let offset = 0; ; offset += 1000) {
      let chargeQuery = supabase.from("education_fee_charges")
        .select("id, student_id, description, amount")
        .eq("org_id", context.orgId)
        .in("branch_id", branchIds)
        .in("student_id", studentsToLoad)
        .eq("status", "open")
        .order("id")
        .range(offset, offset + 999);
      if (selectedYear) chargeQuery = chargeQuery.eq("academic_year_id", selectedYear);
      const { data, error } = await chargeQuery;
      if (error) throw new Error(`Could not load payable fee charges: ${error.message}`);
      const page = data ?? [];
      chargeRows.push(...page);
      if (page.length < 1000) break;
    }

    const paidByCharge = new Map<string, number>();
    for (let chargeOffset = 0; chargeOffset < chargeRows.length; chargeOffset += 500) {
      const chargeIds = chargeRows.slice(chargeOffset, chargeOffset + 500).map((charge) => charge.id);
      for (let paymentOffset = 0; ; paymentOffset += 1000) {
        const { data, error } = await supabase.from("education_fee_payments")
          .select("id, charge_id, amount")
          .eq("org_id", context.orgId)
          .in("charge_id", chargeIds)
          .order("id")
          .range(paymentOffset, paymentOffset + 999);
        if (error) throw new Error(`Could not load payments for outstanding fee charges: ${error.message}`);
        const page = data ?? [];
        for (const payment of page) {
          paidByCharge.set(payment.charge_id, (paidByCharge.get(payment.charge_id) ?? 0) + Number(payment.amount));
        }
        if (page.length < 1000) break;
        if (paymentOffset >= 100_000) {
          throw new Error("The number of fee payments exceeds the processing limit for outstanding balances.");
        }
      }
    }

    for (const charge of chargeRows) {
      const balance = Math.max(0, Number(charge.amount) - (paidByCharge.get(charge.id) ?? 0));
      const account = accountByStudent.get(charge.student_id);
      if (balance <= 0 || !account) continue;
      const studentName = [account.firstName, account.lastName].filter(Boolean).join(" ");
      const charges = payableChargesByStudent.get(account.studentId) ?? [];
      charges.push({
        id: charge.id,
        description: charge.description,
        balance,
        studentId: account.studentId,
        studentName,
      });
      payableChargesByStudent.set(account.studentId, charges);
    }
  }

  const visibleAccounts = accounts;
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const formatMoney = (amount: number) => formatCurrencyAmount(amount, currencyConfig);

  return <main className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-6">
    <header>
      <Link href={getProductAppPath("think-education", "/finance")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Fees & Finance
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Outstanding fees aging</h1>
          <p className="mt-1 text-sm text-slate-600">Open student balances grouped by days past due. Charges without due dates are listed as not due.</p>
        </div>
        {canExportAging && !reportTooLarge && <a href={exportHref} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
          <ArrowDownToLine className="h-4 w-4" /> Download aging CSV
        </a>}
      </div>
    </header>

    {params.paid === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Payment recorded. Outstanding balances have been refreshed.</p>}
    {paymentErrorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{paymentErrorMessage}</p>}

    <form method="get" action={getProductAppPath("think-education", "/finance/aging")} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_1fr_auto]">
      <label className="text-sm font-medium text-slate-700">Campus
        <select name="branch" defaultValue={selectedBranch} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
          <option value="">All assigned campuses</option>
          {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">Academic year
        <select name="year" defaultValue={selectedYear} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
          <option value="">All years</option>
          {academicYears.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
        </select>
      </label>
      <button type="submit" className="self-end rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">Apply filters</button>
    </form>

    {reportTooLarge ? <section role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
      This aging report covers {chargeCount.toLocaleString()} open charges, beyond the {MAX_CHARGES.toLocaleString()}-charge report limit. Filter by campus or academic year to narrow it.
    </section> : <>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { label: "Total outstanding", amount: totalBalance, Icon: Wallet },
          { label: "Not due / no due date", amount: bucketTotals.notDue, Icon: Clock3 },
          { label: "1–30 days overdue", amount: bucketTotals.days1To30, Icon: Clock3 },
          { label: "31–60 days overdue", amount: bucketTotals.days31To60, Icon: Clock3 },
          { label: "61–90 days overdue", amount: bucketTotals.days61To90, Icon: Clock3 },
          { label: "Over 90 days overdue", amount: bucketTotals.over90, Icon: Clock3 },
        ].map(({ label, amount, Icon }) => <article key={label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-xl font-bold text-slate-950">{formatMoney(amount)}</p></div>
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon className="h-5 w-5" /></span>
        </article>)}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <h2 className="font-semibold text-slate-950">Student balances</h2>
          <p className="mt-1 text-sm text-slate-500">{totalCount.toLocaleString()} students with an outstanding balance · {formatMoney(totalBalance)} total</p>
        </div>
        {visibleAccounts.length ? <div className="divide-y divide-slate-100">
          {visibleAccounts.map((account) => <article key={account.studentId} className="grid gap-3 p-4 md:grid-cols-[minmax(220px,1.5fr)_repeat(5,minmax(110px,1fr))] md:items-center">
            <div>
              <Link href={getProductAppPath("think-education", `/finance/students/${account.studentId}`)} className="font-semibold text-blue-800 hover:text-blue-950">
                {account.firstName} {account.lastName}
              </Link>
              <p className="mt-1 text-xs text-slate-500">{account.studentNumber} · {campusNameById.get(account.campusId) ?? "Campus"} · {account.charges} outstanding charge(s)</p>
            </div>
            {[
              ["Not due", account.notDue],
              ["1–30 days", account.days1To30],
              ["31–60 days", account.days31To60],
              ["61–90 days", account.days61To90],
              ["Over 90 days", account.over90],
            ].map(([label, amount]) => <div key={String(label)} className="flex justify-between gap-2 text-sm md:block">
              <span className="text-slate-500 md:text-xs">{String(label)}</span>
              <span className="font-medium text-slate-800">{formatMoney(Number(amount))}</span>
            </div>)}
            <div className="flex flex-wrap items-center justify-between gap-3 md:col-start-2 md:col-span-5">
              <p className="text-right text-sm font-bold text-slate-950">Total outstanding: {formatMoney(account.balance)}</p>
              {canRecordPayment && payableChargesByStudent.has(account.studentId) && <FeePaymentDialog
                charges={payableChargesByStudent.get(account.studentId)}
                studentId={account.studentId}
                studentName={`${account.firstName} ${account.lastName}`.trim()}
                currencyConfig={currencyConfig}
                returnToAging
                returnToAgingFilters={{ branch: selectedBranch, year: selectedYear, page: currentPage }}
              />}
            </div>
          </article>)}
        </div> : <p className="p-8 text-center text-sm text-slate-500">No outstanding student fees match these filters.</p>}

        {totalCount > REPORT_PAGE_SIZE && <nav aria-label="Fee aging pages" className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
          <p className="text-slate-500">Showing {Math.min(totalCount, (currentPage - 1) * REPORT_PAGE_SIZE + 1)}–{Math.min(totalCount, currentPage * REPORT_PAGE_SIZE)} of {totalCount} students</p>
          <div className="flex gap-2">
            {currentPage > 1 && <Link href={queryForPage(currentPage - 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">Previous</Link>}
            {currentPage < totalPages && <Link href={queryForPage(currentPage + 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">Next</Link>}
          </div>
        </nav>}
      </section>
    </>}
  </main>;
}
