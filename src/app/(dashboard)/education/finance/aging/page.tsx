import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Clock3, Wallet } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";

const QUERY_PAGE_SIZE = 500;
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

  const [canViewCharges, canViewPayments, canViewStudents, canViewAcademicYears] = await Promise.all([
    canTabPermission("education_finance", "finance", "charges", "view"),
    canTabPermission("education_finance", "finance", "payments", "view"),
    canTabPermission("education_students", "students", "list", "view"),
    canTabPermission("education_academics", "academics", "calendar", "view"),
  ]);
  if (!canViewCharges || !canViewPayments || !canViewStudents || !canViewAcademicYears) {
    redirect("/dashboard?accessDenied=think-education.finance.aging");
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
      .select("id, name")
      .eq("org_id", context.orgId)
      .order("starts_on", { ascending: false }),
    supabase.from("organizations")
      .select("currency")
      .eq("id", context.orgId)
      .single(),
  ]);
  if (yearsError) throw new Error(`Could not load academic years for fee aging: ${yearsError.message}`);
  if (organizationError) throw new Error(`Could not load organization currency for fee aging: ${organizationError.message}`);
  const academicYears = years ?? [];
  const selectedYear = academicYears.some((year) => year.id === requestedYear) ? requestedYear : "";

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

  const chargeRows: Array<{
    id: string;
    branch_id: string;
    student_id: string;
    amount: number;
    due_on: string | null;
  }> = [];
  if (!reportTooLarge) {
    for (let offset = 0; offset < chargeCount; offset += QUERY_PAGE_SIZE) {
      let query = supabase.from("education_fee_charges")
        .select("id, branch_id, student_id, amount, due_on")
        .eq("org_id", context.orgId)
        .in("branch_id", branchIds)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, Math.min(offset + QUERY_PAGE_SIZE - 1, chargeCount - 1));
      if (selectedYear) query = query.eq("academic_year_id", selectedYear);
      const { data, error } = await query;
      if (error) throw new Error(`Could not load fee charges for aging: ${error.message}`);
      chargeRows.push(...(data ?? []));
    }
  }

  const paidByCharge = new Map<string, number>();
  const chargeIds = chargeRows.map((charge) => charge.id);
  for (let offset = 0; offset < chargeIds.length; offset += 200) {
    const batch = chargeIds.slice(offset, offset + 200);
    for (let paymentOffset = 0; ; paymentOffset += QUERY_PAGE_SIZE) {
      const { data, error } = await supabase.from("education_fee_payments")
        .select("charge_id, amount")
        .eq("org_id", context.orgId)
        .in("charge_id", batch)
        .order("charge_id")
        .order("id")
        .range(paymentOffset, paymentOffset + QUERY_PAGE_SIZE - 1);
      if (error) throw new Error(`Could not load fee payments for aging: ${error.message}`);
      for (const payment of data ?? []) {
        paidByCharge.set(payment.charge_id, (paidByCharge.get(payment.charge_id) ?? 0) + payment.amount);
      }
      if ((data ?? []).length < QUERY_PAGE_SIZE) break;
    }
  }

  const accountByStudent = new Map<string, AgingAccount>();
  const bucketTotals: Record<AgingBucket, number> = {
    notDue: 0,
    days1To30: 0,
    days31To60: 0,
    days61To90: 0,
    over90: 0,
  };
  const localToday = new Date();
  const today = Date.UTC(localToday.getFullYear(), localToday.getMonth(), localToday.getDate());
  for (const charge of chargeRows) {
    const balance = Math.max(0, charge.amount - (paidByCharge.get(charge.id) ?? 0));
    if (balance <= 0) continue;

    let bucket: AgingBucket = "notDue";
    if (charge.due_on) {
      const [year, month, day] = charge.due_on.split("-").map(Number);
      const dueDate = Date.UTC(year, month - 1, day);
      const daysPastDue = Math.floor((today - dueDate) / 86_400_000);
      if (daysPastDue > 90) bucket = "over90";
      else if (daysPastDue > 60) bucket = "days61To90";
      else if (daysPastDue > 30) bucket = "days31To60";
      else if (daysPastDue > 0) bucket = "days1To30";
    }

    const account = accountByStudent.get(charge.student_id) ?? {
      studentId: charge.student_id,
      studentNumber: "",
      firstName: "",
      lastName: "",
      campusId: charge.branch_id,
      charges: 0,
      balance: 0,
      notDue: 0,
      days1To30: 0,
      days31To60: 0,
      days61To90: 0,
      over90: 0,
    };
    account.charges += 1;
    account.balance += balance;
    account[bucket] += balance;
    bucketTotals[bucket] += balance;
    accountByStudent.set(charge.student_id, account);
  }

  const accounts = Array.from(accountByStudent.values());
  const totalBalance = accounts.reduce((sum, account) => sum + account.balance, 0);
  const totalPages = Math.max(1, Math.ceil(accounts.length / REPORT_PAGE_SIZE));
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

  accounts.sort((a, b) => b.balance - a.balance || a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
  const visibleAccounts = accounts.slice((currentPage - 1) * REPORT_PAGE_SIZE, currentPage * REPORT_PAGE_SIZE);
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const formatMoney = (amount: number) => `${organization.currency} ${amount.toFixed(2)}`;

  return <main className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-6">
    <header>
      <Link href={getProductAppPath("think-education", "/finance")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Fees & Finance
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-950">Outstanding fees aging</h1>
      <p className="mt-1 text-sm text-slate-600">Open student balances grouped by days past due. Charges without due dates are listed as not due.</p>
    </header>

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
          <p className="mt-1 text-sm text-slate-500">{accounts.length.toLocaleString()} students with an outstanding balance · {formatMoney(totalBalance)} total</p>
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
            <p className="text-right text-sm font-bold text-slate-950 md:col-start-2 md:col-span-5">Total outstanding: {formatMoney(account.balance)}</p>
          </article>)}
        </div> : <p className="p-8 text-center text-sm text-slate-500">No outstanding student fees match these filters.</p>}

        {accounts.length > REPORT_PAGE_SIZE && <nav aria-label="Fee aging pages" className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
          <p className="text-slate-500">Showing {Math.min(accounts.length, (currentPage - 1) * REPORT_PAGE_SIZE + 1)}–{Math.min(accounts.length, currentPage * REPORT_PAGE_SIZE)} of {accounts.length} students</p>
          <div className="flex gap-2">
            {currentPage > 1 && <Link href={queryForPage(currentPage - 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">Previous</Link>}
            {currentPage < totalPages && <Link href={queryForPage(currentPage + 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">Next</Link>}
          </div>
        </nav>}
      </section>
    </>}
  </main>;
}
