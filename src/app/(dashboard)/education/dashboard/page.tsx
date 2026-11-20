import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BookOpen, Building2, CalendarCheck, ClipboardCheck, FileText, GraduationCap, TrendingUp, Users, Wallet } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { formatCurrencyAmount } from "@/lib/currency";
import { getOrganizationCurrencyConfig } from "@/lib/currency/settings";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission, canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { grantOwnEducationOrganizationScope } from "../actions";
import { DashboardFilters } from "./dashboard-filters";

type Metric = { label: string; value: number | string | null; icon: typeof Users; tint: string };
type DashboardParams = Record<string, string | string[] | undefined>;

const DASHBOARD_PAGE_SIZE = 500;

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

export default async function ThinkEducationDashboardPage({
  searchParams,
}: {
  searchParams: Promise<DashboardParams>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_dashboard", "dashboard", "overview", "view")) {
    redirect("/dashboard?accessDenied=think-education");
  }

  const params = await searchParams;
  const supabase = await createClient();
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const today = new Date().toISOString().slice(0, 10);
  const defaultFrom = `${today.slice(0, 7)}-01`;
  const requestedFrom = typeof params.from === "string" ? params.from : "";
  const requestedTo = typeof params.to === "string" ? params.to : "";
  let from = isValidDate(requestedFrom) ? requestedFrom : defaultFrom;
  let to = isValidDate(requestedTo) ? requestedTo : today;
  if (from > to) {
    from = defaultFrom;
    to = today;
  }
  const requestedBranch = typeof params.branch === "string" ? params.branch : "";
  const selectedBranch = campuses.some((campus) => campus.id === requestedBranch) ? requestedBranch : "";
  const selectedCampuses = selectedBranch ? campuses.filter((campus) => campus.id === selectedBranch) : campuses;
  const branchIds = selectedCampuses.map((campus) => campus.id);
  const fromTimestamp = `${from}T00:00:00.000Z`;
  const toExclusiveTimestamp = `${shiftDate(to, 1)}T00:00:00.000Z`;
  const [
    canReadStudents,
    canReadStaff,
    canReadAdmissions,
    canReadAttendance,
    canReadAcademics,
    canReadExaminations,
    canReadResults,
    canReadTimetables,
    canReadPromotion,
    canViewExpenseRecords,
    canReadFeePayments,
    canReadFeeCharges,
  ] = await Promise.all([
    canPermission("education_students", "view"),
    canPermission("education_staff", "view"),
    canPermission("education_admissions", "view"),
    canPermission("education_attendance", "view"),
    canPermission("education_academics", "view"),
    canPermission("education_examinations", "view"),
    canPermission("education_results", "view"),
    canPermission("education_timetables", "view"),
    canPermission("education_promotion", "view"),
    canTabPermission("education_expenses", "expenses", "records", "view"),
    canTabPermission("education_finance", "finance", "payments", "view"),
    canTabPermission("education_finance", "finance", "charges", "view"),
  ]);
  const zeroCount = Promise.resolve({ count: 0, error: null });
  const [
    { count: studentCount, error: studentsError },
    { count: staffCount, error: staffError },
    { count: totalAdmissionCount, error: admissionsError },
    { count: presentCount, error: presentError },
    { count: attendanceCount, error: attendanceError },
  ] = await Promise.all([
    canReadStudents && branchIds.length
      ? supabase.from("education_students").select("id", { count: "exact", head: true })
        .eq("org_id", context.orgId).in("branch_id", branchIds).eq("status", "active")
      : zeroCount,
    canReadStaff && branchIds.length
      ? supabase.from("education_staff").select("id", { count: "exact", head: true })
        .eq("org_id", context.orgId).in("branch_id", branchIds).eq("status", "active")
      : zeroCount,
    canReadAdmissions && branchIds.length
      ? supabase.from("education_admissions").select("id", { count: "exact", head: true })
        .eq("org_id", context.orgId).in("branch_id", branchIds)
        .gte("applied_at", fromTimestamp).lt("applied_at", toExclusiveTimestamp)
      : zeroCount,
    canReadAttendance && branchIds.length
      ? supabase.from("education_attendance").select("id", { count: "exact", head: true })
        .eq("org_id", context.orgId).in("branch_id", branchIds).eq("attendance_date", today).eq("status", "present")
      : zeroCount,
    canReadAttendance && branchIds.length
      ? supabase.from("education_attendance").select("id", { count: "exact", head: true })
        .eq("org_id", context.orgId).in("branch_id", branchIds).eq("attendance_date", today)
      : zeroCount,
  ]);
  const queryError = studentsError ?? staffError ?? admissionsError ?? presentError ?? attendanceError;
  if (queryError) throw new Error(`Could not load Think Education dashboard: ${queryError.message}`);

  const feeStatsByCampus = new Map(branchIds.map((branchId) => [branchId, {
    paidInRange: 0,
    billedInRange: 0,
    paidAgainstRangeCharges: 0,
    outstanding: 0,
  }]));
  let totalFeePaid = 0;
  if (canReadFeePayments && canReadFeeCharges && branchIds.length) {
    const { count: paymentCount, error: paymentCountError } = await supabase.from("education_fee_payments")
      .select("id", { count: "exact", head: true })
      .eq("org_id", context.orgId)
      .gte("created_at", fromTimestamp)
      .lt("created_at", toExclusiveTimestamp);
    if (paymentCountError) throw new Error(`Could not count Think Education fee payments: ${paymentCountError.message}`);

    for (let offset = 0; offset < (paymentCount ?? 0); offset += DASHBOARD_PAGE_SIZE) {
      const { data: payments, error: paymentsError } = await supabase.from("education_fee_payments")
        .select("charge_id, amount")
        .eq("org_id", context.orgId)
        .gte("created_at", fromTimestamp)
        .lt("created_at", toExclusiveTimestamp)
        .order("created_at").order("id")
        .range(offset, offset + DASHBOARD_PAGE_SIZE - 1);
      if (paymentsError) throw new Error(`Could not load Think Education fee payments: ${paymentsError.message}`);
      const chargeIds = Array.from(new Set((payments ?? []).map((payment) => payment.charge_id)));
      if (!chargeIds.length) continue;
      const { data: charges, error: chargesError } = await supabase.from("education_fee_charges")
        .select("id, branch_id")
        .eq("org_id", context.orgId)
        .in("branch_id", branchIds)
        .in("id", chargeIds);
      if (chargesError) throw new Error(`Could not scope Think Education fee payments: ${chargesError.message}`);
      const campusByChargeId = new Map((charges ?? []).map((charge) => [charge.id, charge.branch_id]));
      for (const payment of payments ?? []) {
        const branchId = campusByChargeId.get(payment.charge_id);
        const campusStats = branchId ? feeStatsByCampus.get(branchId) : undefined;
        if (!campusStats) continue;
        const amount = Number(payment.amount);
        campusStats.paidInRange += amount;
        totalFeePaid += amount;
      }
    }

    const { count: chargeCount, error: chargeCountError } = await supabase.from("education_fee_charges")
      .select("id", { count: "exact", head: true })
      .eq("org_id", context.orgId)
      .in("branch_id", branchIds)
      .eq("status", "open");
    if (chargeCountError) throw new Error(`Could not count outstanding Think Education fees: ${chargeCountError.message}`);

    for (let offset = 0; offset < (chargeCount ?? 0); offset += DASHBOARD_PAGE_SIZE) {
      const { data: charges, error: chargesError } = await supabase.from("education_fee_charges")
        .select("id, branch_id, amount, created_at")
        .eq("org_id", context.orgId)
        .in("branch_id", branchIds)
        .eq("status", "open")
        .order("created_at").order("id")
        .range(offset, offset + DASHBOARD_PAGE_SIZE - 1);
      if (chargesError) throw new Error(`Could not load outstanding Think Education fees: ${chargesError.message}`);
      const chargeRows = charges ?? [];
      if (!chargeRows.length) continue;
      const paidByChargeId = new Map<string, number>();
      let paymentOffset = 0;
      while (true) {
        const { data: payments, error: paymentsError } = await supabase.from("education_fee_payments")
          .select("charge_id, amount")
          .eq("org_id", context.orgId)
          .in("charge_id", chargeRows.map((charge) => charge.id))
          .order("id")
          .range(paymentOffset, paymentOffset + DASHBOARD_PAGE_SIZE - 1);
        if (paymentsError) throw new Error(`Could not calculate outstanding Think Education fees: ${paymentsError.message}`);
        const paymentRows = payments ?? [];
        for (const payment of paymentRows) {
          paidByChargeId.set(
            payment.charge_id,
            (paidByChargeId.get(payment.charge_id) ?? 0) + Number(payment.amount),
          );
        }
        if (paymentRows.length < DASHBOARD_PAGE_SIZE) break;
        paymentOffset += paymentRows.length;
      }

      for (const charge of chargeRows) {
        const campusStats = feeStatsByCampus.get(charge.branch_id);
        if (!campusStats) continue;
        const amount = Number(charge.amount);
        const paid = paidByChargeId.get(charge.id) ?? 0;
        campusStats.outstanding += Math.max(0, amount - paid);
        if (charge.created_at >= fromTimestamp && charge.created_at < toExclusiveTimestamp) {
          campusStats.billedInRange += amount;
          campusStats.paidAgainstRangeCharges += paid;
        }
      }
    }
  }

  let totalExpenses = 0;
  if (canViewExpenseRecords && branchIds.length) {
    let offset = 0;
    while (true) {
      const { data: expenses, error: expensesError } = await supabase.from("education_expenses")
        .select("amount")
        .eq("org_id", context.orgId)
        .in("branch_id", branchIds)
        .eq("status", "approved")
        .gte("expense_date", from)
        .lte("expense_date", to)
        .order("expense_date").order("id")
        .range(offset, offset + DASHBOARD_PAGE_SIZE - 1);
      if (expensesError) throw new Error(`Could not load approved Think Education expenses: ${expensesError.message}`);
      const expenseRows = expenses ?? [];
      totalExpenses += expenseRows.reduce((total, expense) => total + Number(expense.amount), 0);
      if (expenseRows.length < DASHBOARD_PAGE_SIZE) break;
      offset += expenseRows.length;
    }
  }

  const currencyConfig = await getOrganizationCurrencyConfig();
  const formatMoney = (amount: number) => formatCurrencyAmount(amount, currencyConfig);
  const totalOutstandingFees = Array.from(feeStatsByCampus.values())
    .reduce((total, stats) => total + stats.outstanding, 0);
  const attendanceTrendDates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${today}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - (6 - index));
    return date.toISOString().slice(0, 10);
  });
  const attendanceTrend = canReadAttendance && branchIds.length
    ? await Promise.all(attendanceTrendDates.map(async (date) => {
      const [totalResult, presentResult] = await Promise.all([
        supabase.from("education_attendance").select("id", { count: "exact", head: true })
          .eq("org_id", context.orgId).in("branch_id", branchIds).eq("attendance_date", date),
        supabase.from("education_attendance").select("id", { count: "exact", head: true })
          .eq("org_id", context.orgId).in("branch_id", branchIds).eq("attendance_date", date).eq("status", "present"),
      ]);
      if (totalResult.error) throw new Error(`Could not load attendance trend for ${date}: ${totalResult.error.message}`);
      if (presentResult.error) throw new Error(`Could not load present attendance for ${date}: ${presentResult.error.message}`);
      const total = totalResult.count ?? 0;
      const present = presentResult.count ?? 0;
      return { date, total, present, rate: total ? Math.round((present / total) * 100) : null };
    }))
    : [];
  const studentDistribution = canReadStudents
    ? await Promise.all(selectedCampuses.map(async (campus) => {
      const { count, error } = await supabase.from("education_students")
        .select("id", { count: "exact", head: true })
        .eq("org_id", context.orgId).eq("branch_id", campus.id).eq("status", "active");
      if (error) throw new Error(`Could not load student count for ${campus.name}: ${error.message}`);
      return { campus, count: count ?? 0 };
    }))
    : [];
  const attendanceRate = attendanceCount
    ? Math.round(((presentCount ?? 0) / attendanceCount) * 1000) / 10
    : null;
  const metrics: Metric[] = [
    { label: "Active students", value: canReadStudents ? studentCount ?? 0 : "Restricted", icon: GraduationCap, tint: "bg-blue-50 text-blue-700" },
    { label: "Active staff", value: canReadStaff ? staffCount ?? 0 : "Restricted", icon: Users, tint: "bg-violet-50 text-violet-700" },
    { label: "Campuses in your access", value: campuses.length, icon: Building2, tint: "bg-emerald-50 text-emerald-700" },
    { label: "Attendance today", value: !canReadAttendance ? "Restricted" : attendanceRate, icon: CalendarCheck, tint: "bg-amber-50 text-amber-700" },
    { label: "Total fee paid", value: !canReadFeePayments || !canReadFeeCharges ? "Restricted" : formatMoney(totalFeePaid), icon: Wallet, tint: "bg-emerald-50 text-emerald-700" },
    { label: "Outstanding fees", value: !canReadFeePayments || !canReadFeeCharges ? "Restricted" : formatMoney(totalOutstandingFees), icon: Wallet, tint: "bg-amber-50 text-amber-700" },
    { label: "Approved expenses", value: !canViewExpenseRecords ? "Restricted" : formatMoney(totalExpenses), icon: ClipboardCheck, tint: "bg-rose-50 text-rose-700" },
    { label: "Total admissions", value: !canReadAdmissions ? "Restricted" : totalAdmissionCount ?? 0, icon: Users, tint: "bg-blue-50 text-blue-700" },
  ];
  const campusFeeRows = selectedCampuses.map((campus) => {
    const stats = feeStatsByCampus.get(campus.id);
    const collectionRate = stats && stats.billedInRange > 0
      ? Math.round((stats.paidAgainstRangeCharges / stats.billedInRange) * 1000) / 10
      : null;
    return { campus, stats, collectionRate };
  });

  return <main className="mx-auto max-w-[1500px] space-y-4 p-3 md:p-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--theme-primary, #2563eb)" }}>Think Education</p>
        <h1 className="mt-1 text-2xl font-bold" style={{ color: "var(--theme-text, #111827)" }}>Welcome to Think Education</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--theme-text-muted, #4b5563)" }}>{context.orgName} · organization overview for campuses you are authorized to access.</p>
      </div>
      <Link href={getProductAppPath("think-education", "/organization")} className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95" style={{ backgroundColor: "var(--theme-primary, #2563eb)" }}>
        Organization &amp; campuses <ArrowRight className="h-4 w-4" />
      </Link>
    </header>

    <DashboardFilters
      key={`${from}:${to}:${selectedBranch}`}
      action={getProductAppPath("think-education", "/dashboard")}
      from={from}
      to={to}
      branch={selectedBranch}
      campuses={campuses}
    />

    {branchIds.length === 0 && <section className="rounded-xl border p-5" style={{ borderColor: "rgba(37,99,235,0.22)", backgroundColor: "var(--theme-primary-pale, #eff6ff)" }}>
      <h2 className="font-semibold" style={{ color: "var(--theme-primary, #1d4ed8)" }}>Campus access has not been configured</h2>
      <p className="mt-1 max-w-3xl text-sm" style={{ color: "var(--theme-primary, #1d4ed8)" }}>
        No organization-wide or branch-specific Think Education access is assigned to your account. Access is deliberately not inferred from your role.
      </p>
      {context.role === "owner" && <form action={grantOwnEducationOrganizationScope} className="mt-4">
        <button type="submit" className="rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-95" style={{ backgroundColor: "var(--theme-primary, #2563eb)" }}>
          Grant me access to all campuses
        </button>
      </form>}
    </section>}

    <section aria-label="Education overview metrics" data-education-metrics data-education-dashboard-metrics className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(({ label, value, icon: Icon, tint }) => {
        const iconTone = tint.includes("bg-violet") ? "violet"
          : tint.includes("bg-emerald") ? "emerald"
            : tint.includes("bg-amber") ? "amber"
              : tint.includes("bg-rose") ? "rose"
                : "blue";
        const iconBackground = iconTone === "violet" ? "rgba(139,92,246,0.10)"
          : iconTone === "emerald" ? "rgba(16,185,129,0.10)"
            : iconTone === "amber" ? "rgba(245,158,11,0.12)"
              : iconTone === "rose" ? "rgba(244,63,94,0.10)"
                : "rgba(59,130,246,0.10)";
        return <article key={label} className="rounded-xl border p-4 shadow-sm" style={{ borderColor: "var(--theme-header-border-light, #dbeafe)", backgroundColor: "var(--theme-surface, #fff)" }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm" style={{ color: "var(--theme-text-muted, #4b5563)" }}>{label}</p>
              <p className="mt-2 text-2xl font-bold" style={{ color: "var(--theme-text, #111827)" }}>
                {value === null ? "—" : label === "Attendance today" && typeof value === "number" ? `${value}%` : typeof value === "number" ? value.toLocaleString() : value}
              </p>
            </div>
            <span
              data-education-metric-icon
              data-icon-tone={iconTone}
              className="grid h-11 w-11 place-items-center rounded-xl"
              style={{ backgroundColor: iconBackground, color: "var(--theme-primary, #2563eb)" }}
            >
              <Icon className="h-5 w-5" />
            </span>
          </div>
        </article>;
      })}
    </section>

    {canReadFeePayments && canReadFeeCharges &&     <section aria-label="Campus-by-campus fee breakdown" data-education-fee-breakdown data-education-dashboard-card className="overflow-hidden rounded-xl border p-5 shadow-sm" style={{ borderColor: "var(--theme-header-border-light, #dbeafe)", backgroundColor: "var(--theme-surface, #fff)" }}>
      <div>
        <h2 className="text-lg font-bold" style={{ color: "var(--theme-text, #111827)" }}>Campus-by-campus fee breakdown</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--theme-text-muted, #4b5563)" }}>
          Payments show receipts in the selected date range. Collection rate shows payments to date against fees charged in that range; outstanding is the current balance of all open fees.
        </p>
      </div>
      {campusFeeRows.length === 0 ? <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No assigned campuses are available for this breakdown.</p>
        : <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3 font-semibold">Campus</th>
                <th className="px-3 py-3 text-right font-semibold">Fees billed</th>
                <th className="px-3 py-3 text-right font-semibold">Fee paid in range</th>
                <th className="px-3 py-3 text-right font-semibold">Current outstanding</th>
                <th className="px-3 py-3 text-right font-semibold">Collection rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {campusFeeRows.map(({ campus, stats, collectionRate }) => <tr key={campus.id}>
                <td className="px-3 py-3 font-semibold text-slate-900">{campus.name}</td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-700">{formatMoney(stats?.billedInRange ?? 0)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-700">{formatMoney(stats?.paidInRange ?? 0)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-700">{formatMoney(stats?.outstanding ?? 0)}</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-900">{collectionRate === null ? "—" : `${collectionRate}%`}</td>
              </tr>)}
            </tbody>
          </table>
        </div>}
    </section>}

    <section data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Attendance trend</h2>
          <p className="mt-1 text-sm text-slate-500">Daily present rate across your selected campuses for the last seven days.</p>
        </div>
        <Link href={getProductAppPath("think-education", "/attendance")} className="text-sm font-semibold text-blue-700">Open attendance</Link>
      </div>
      {!canReadAttendance ? <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Your role does not include attendance reporting access.</p>
        : branchIds.length === 0 ? <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Assign campus access to see attendance trends.</p>
          : attendanceTrend.every((day) => day.total === 0) ? <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No attendance has been recorded in the last seven days.</p>
            : <div className="mt-5 grid grid-cols-7 gap-2 sm:gap-4">
              {attendanceTrend.map((day) => <div key={day.date} className="flex min-w-0 flex-col items-center gap-2">
                <span className="text-xs font-semibold tabular-nums text-slate-700">{day.rate === null ? "—" : `${day.rate}%`}</span>
                <div className="flex h-32 w-full items-end justify-center rounded-lg bg-slate-50 p-2" role="img" aria-label={`${day.date}: ${day.present} present out of ${day.total} marked`}>
                  <span className="w-full rounded-t-md bg-blue-600" style={{ height: `${day.rate ?? 0}%`, minHeight: day.rate === null ? 0 : "0.375rem" }} />
                </div>
                <span className="text-center text-[11px] text-slate-500">{new Date(`${day.date}T12:00:00.000Z`).toLocaleDateString(undefined, { weekday: "short" })}</span>
              </div>)}
            </div>}
    </section>

    <section className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
      <article data-education-dashboard-card data-education-student-distribution className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Student distribution by campus</h2>
            <p className="mt-1 text-sm text-slate-500">Active students in the selected campus scope.</p>
          </div>
          <Link href={getProductAppPath("think-education", "/students")} className="shrink-0 text-sm font-semibold text-blue-700">View students</Link>
        </div>
        {!canReadStudents ? <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Your role does not include student reporting access.</p>
          : campuses.length === 0 ? <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Assign campus access to see student distribution.</p>
            : <ul className="mt-4 divide-y divide-slate-100">
              {studentDistribution.map(({ campus, count }) => <li key={campus.id} className="flex items-center justify-between gap-3 py-3">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700"><Building2 className="h-4 w-4" /></span>
                  <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-900">{campus.name}</span>
                    <span className="text-xs text-slate-500">{[campus.code, campus.city, campus.region].filter(Boolean).join(" · ") || "Campus"}</span>
                    <span className="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-full rounded-full bg-blue-600" style={{ width: `${studentCount ? Math.round((count / studentCount) * 100) : 0}%` }} />
                    </span>
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {count.toLocaleString()} students
                </span>
              </li>)}
            </ul>}
      </article>

      <article data-education-dashboard-card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">Quick actions</h2>
        <p className="mt-1 text-sm text-slate-500">Open the education workflows available to your role.</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {[
            { label: "Approvals & attention", href: "/approvals", icon: ClipboardCheck, allowed: true },
            { label: "Manage campuses", href: "/organization", icon: Building2, allowed: true },
            { label: "Student records", href: "/students", icon: GraduationCap, allowed: canReadStudents },
            { label: "Staff directory", href: "/staff", icon: Users, allowed: canReadStaff },
            { label: "Admissions", href: "/admissions", icon: Users, allowed: canReadAdmissions },
            { label: "Academic setup", href: "/academics", icon: BookOpen, allowed: canReadAcademics },
            { label: "View attendance", href: "/attendance", icon: CalendarCheck, allowed: canReadAttendance },
            { label: "Timetables", href: "/timetables", icon: CalendarCheck, allowed: canReadTimetables },
            { label: "Examinations", href: "/examinations", icon: CalendarCheck, allowed: canReadExaminations },
            { label: "Results", href: "/results", icon: FileText, allowed: canReadResults },
            { label: "Campus comparison", href: "/reports/campus-comparison", icon: TrendingUp, allowed: branchIds.length > 0 },
            { label: "Promotion & graduation", href: "/promotion", icon: TrendingUp, allowed: canReadPromotion },
          ].filter((item) => item.allowed).map(({ label, href, icon: Icon }) => <Link key={href} href={getProductAppPath("think-education", href)} className="rounded-xl border border-slate-200 p-3 transition hover:border-blue-300 hover:bg-blue-50">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-50 text-blue-700"><Icon className="h-4 w-4" /></span>
            <span className="mt-2 block text-sm font-semibold text-slate-800">{label}</span>
          </Link>)}
        </div>
      </article>
    </section>
  </main>;
}
