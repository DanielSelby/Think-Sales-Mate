import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { approveCashClosingFromForm, approveCashClosingReopenFromForm, calculateExpectedCash, createCashClosing, rejectCashClosingFromForm, requestCashClosingExplanationFromForm, requestCashClosingReopenFromForm } from "./actions";
import { CashClosingReport } from "./report";
import { Banknote, CalendarDays, ChevronDown, ClipboardCheck, Clock3, Coins, Download, FileText, Landmark, Printer, Receipt, Settings2, ShieldAlert, WalletCards } from "lucide-react";
import { DenominationInputs } from "./denomination-inputs";
import { BranchSelector } from "./branch-selector";
import { UserSelector } from "./user-selector";
import { getCurrencyConfigFromSettings, type CurrencyConfig, formatCurrencyAmount } from "@/lib/currency";
import { CashClosingAnalytics } from "./analytics";
import { canPermission } from "@/lib/rbac/permissions";

export const metadata = { title: "Cash Closing · SalesMate ERP" };

type CashClosingSearchParams = {
  error?: string;
  saved?: string;
  tab?: string;
  location_id?: string;
  date_from?: string;
  date_to?: string;
  shift?: string;
  classification?: string;
  user_id?: string;
  status?: string;
  search?: string;
  page?: string;
  closing_id?: string;
};

export default async function CashClosingPage({ searchParams }: { searchParams?: Promise<CashClosingSearchParams> }) {
  const ctx = await getCurrentOrgContext();
  if (!ctx) return null;
  const canAccessEndOfDay =
    await canPermission("cash_closing", "view") ||
    await canPermission("cash_closing", "create");
  if (!canAccessEndOfDay) redirect("/dashboard");
  const [canCreateClosing, canApproveClosing, canEditClosing, canExportClosings, canPrintClosings] = await Promise.all([
    canPermission("cash_closing", "create"),
    canPermission("cash_closing", "approve"),
    canPermission("cash_closing", "edit"),
    canPermission("cash_closing", "export"),
    canPermission("cash_closing", "print"),
  ]);
  const params = (await searchParams) ?? {};
  const tab = params.tab ?? "today";
  const db = await createClient() as any;
  const today = new Date().toISOString().slice(0, 10);
  const requestedLocationId = params.location_id || null;
  const dateFrom = params.date_from || "";
  const dateTo = params.date_to || "";
  const requestedShift = params.shift || "";
  const requestedClassification = params.classification || "";
  const requestedUserId = params.user_id || "";
  const effectiveUserId = ctx.canViewOtherTransactions ? requestedUserId : ctx.userId;
  const statusFilter = params.status || "";
  const searchText = params.search?.trim() || "";
  const pageNumber = Math.max(1, Number(params.page || 1) || 1);
  const pageSize = 25;
  type AnalyticsClosingRow = {
    id: string;
    location_id: string | null;
    closing_date: string;
    shift: string | null;
    expected_cash: number | string | null;
    actual_cash: number | string | null;
    variance: number | string | null;
    classification: string;
    status: string;
    approval_required: boolean;
    variance_reason: string | null;
    created_by: string;
  };
  const selectedLocationId = requestedLocationId && (!ctx.isBranchScoped || ctx.allowedLocationIds.includes(requestedLocationId)) ? requestedLocationId : null;
  const scopedLocations = (locations: Array<{ id: string; name: string }> | null | undefined) =>
    (locations ?? []).filter((location) => !ctx.isBranchScoped || ctx.allowedLocationIds.includes(location.id));
  const [{ data: locations }, { data: currencyRow }, { data: currencySettings }, { data: companyProfile }, { data: members }, summaryResult] = await Promise.all([
    db.from("business_locations").select("id, name").eq("org_id", ctx.orgId).eq("is_active", true).order("name"),
    db.from("currencies").select("*").eq("org_id", ctx.orgId).or("is_base.eq.true,is_default.eq.true").order("is_base", { ascending: false }).limit(1).maybeSingle(),
    db.from("currency_settings").select("*").eq("org_id", ctx.orgId).maybeSingle(),
    db.from("company_profile").select("company_name, logo_url").eq("org_id", ctx.orgId).maybeSingle(),
    db.from("organization_members").select("user_id, branch_scope, location_id, secondary_location_ids, profiles(full_name)").eq("org_id", ctx.orgId).eq("status", "active"),
    calculateExpectedCash(today, selectedLocationId, "full_day", effectiveUserId || null)
      .then((data) => ({ data, error: "" }))
      .catch((error: unknown) => ({ data: null, error: error instanceof Error ? error.message : "Unable to calculate expected cash." })),
  ]);
  const summary = summaryResult.data ?? { opening: 0, sales: 0, discounts: 0, debt: 0, customerPayments: 0, electronic: 0, refunds: 0, expenses: 0, deposits: 0, withdrawals: 0, posCashIn: 0, posCashOut: 0, posRegisterSessionCount: 0, expected: 0 };
  const userOptions = (members ?? [])
    .filter((member: { branch_scope?: string | null; location_id?: string | null; secondary_location_ids?: string[] | null }) => {
      const assignedLocationIds = [
        member.location_id,
        ...(Array.isArray(member.secondary_location_ids) ? member.secondary_location_ids : []),
      ].filter((locationId): locationId is string => Boolean(locationId));
      if (selectedLocationId) {
        return member.branch_scope === "all" || assignedLocationIds.includes(selectedLocationId);
      }
      if (ctx.isBranchScoped) {
        return member.branch_scope === "all" || assignedLocationIds.some((locationId) => ctx.allowedLocationIds.includes(locationId));
      }
      return true;
    })
    .filter((member: { user_id?: string | null }) => member.user_id)
    .map((member: { user_id: string; profiles?: { full_name?: string | null } | { full_name?: string | null }[] | null }) => {
      const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
      return { id: member.user_id, name: profile?.full_name ?? member.user_id };
    });
  const listDateFrom = tab === "today" ? today : dateFrom || "1900-01-01";
  const listDateTo = tab === "today" ? today : dateTo || "2999-12-31";
  const listQuery = (() => {
    let query = db.from("cash_closings").select("id, location_id, closing_date, shift, opening_cash, cash_sales, cash_receipts, cash_customer_payments, cash_e_cash, cash_refunds, cash_expenses, deposits, withdrawals, pos_cash_in, pos_cash_out, pos_register_session_count, actual_cash, expected_cash, variance, classification, status, approval_required, variance_reason, created_at, created_by, submitted_at, closed_at, approved_by, approved_at, approval_decision, approval_comments, notes, reopen_status", { count: "exact" })
      .eq("org_id", ctx.orgId)
      .gte("closing_date", listDateFrom)
      .lte("closing_date", listDateTo);
    if (ctx.isBranchScoped) query = query.in("location_id", ctx.allowedLocationIds);
    if (selectedLocationId) query = query.eq("location_id", selectedLocationId);
    if (effectiveUserId) query = query.eq("created_by", effectiveUserId);
    if (requestedShift) query = query.eq("shift", requestedShift);
    if (requestedClassification) query = query.eq("classification", requestedClassification);
    if (statusFilter) query = query.eq("status", statusFilter);
    if (tab === "approval") query = query.or("status.eq.pending_approval,and(status.eq.approved,reopen_status.eq.requested)");
    if (searchText) {
      const matchingBranchIds = scopedLocations(locations).filter((location: { name: string }) => location.name.toLowerCase().includes(searchText.toLowerCase())).map((location: { id: string }) => location.id);
      const matchingUserIds = userOptions.filter((user: { name: string }) => user.name.toLowerCase().includes(searchText.toLowerCase())).map((user: { id: string }) => user.id);
      const filters: string[] = [];
      if (/^[0-9a-f-]{36}$/i.test(searchText)) filters.push(`id.eq.${searchText}`, `created_by.eq.${searchText}`);
      if (matchingBranchIds.length) filters.push(`location_id.in.(${matchingBranchIds.join(",")})`);
      if (matchingUserIds.length) filters.push(`created_by.in.(${matchingUserIds.join(",")})`);
      if (!filters.length) query = query.eq("id", "00000000-0000-0000-0000-000000000000");
      else query = query.or(filters.join(","));
    }
    if (tab === "variance") query = query.neq("classification", "balanced");
    return query.order("created_at", { ascending: false }).range((pageNumber - 1) * pageSize, pageNumber * pageSize - 1);
  })();
  const [closingResult, analyticsResult] = await Promise.all([
    listQuery,
    (async () => {
      let query = db.from("cash_closings").select("id, location_id, closing_date, shift, expected_cash, actual_cash, variance, classification, status, approval_required, variance_reason, created_by")
        .eq("org_id", ctx.orgId);
      if (ctx.isBranchScoped) query = query.in("location_id", ctx.allowedLocationIds);
      if (selectedLocationId) query = query.eq("location_id", selectedLocationId);
      if (effectiveUserId) query = query.eq("created_by", effectiveUserId);
      if (dateFrom) query = query.gte("closing_date", dateFrom);
      if (dateTo) query = query.lte("closing_date", dateTo);
      const rows: AnalyticsClosingRow[] = [];
      const batchSize = 1000;
      const orderedQuery = query.order("closing_date", { ascending: false });
      for (let offset = 0; ; offset += batchSize) {
        const { data, error } = await orderedQuery.range(offset, offset + batchSize - 1);
        if (error) return { data: null, error };
        rows.push(...(data ?? []));
        if (!data || data.length < batchSize) break;
      }
      return { data: rows, error: null };
    })(),
  ]);
  const accessibleClosings = (closingResult.data ?? []).filter((row: { location_id?: string | null }) =>
    !ctx.isBranchScoped || Boolean(row.location_id && ctx.allowedLocationIds.includes(row.location_id)));
  const analyticsClosings = (analyticsResult.data ?? []).filter((row: { location_id?: string | null }) =>
    !ctx.isBranchScoped || Boolean(row.location_id && ctx.allowedLocationIds.includes(row.location_id)));
  const totalPages = Math.max(1, Math.ceil(Number(closingResult.count ?? accessibleClosings.length) / pageSize));
  const selectedClosing = params.closing_id
    ? accessibleClosings.find((row: { id: string }) => row.id === params.closing_id)
      ?? (await db.from("cash_closings").select("id, location_id, closing_date, shift, opening_cash, cash_sales, cash_receipts, cash_customer_payments, cash_e_cash, cash_refunds, cash_expenses, deposits, withdrawals, pos_cash_in, pos_cash_out, pos_register_session_count, actual_cash, expected_cash, variance, classification, status, approval_required, variance_reason, created_at, created_by, submitted_at, closed_at, approved_by, approved_at, approval_decision, approval_comments, notes, reopen_status")
        .eq("id", params.closing_id).eq("org_id", ctx.orgId).maybeSingle()).data
    : null;
  const visibleSelectedClosing = selectedClosing && (!ctx.isBranchScoped || Boolean(selectedClosing.location_id && ctx.allowedLocationIds.includes(selectedClosing.location_id)))
    && (ctx.canViewOtherTransactions || selectedClosing.created_by === ctx.userId) ? selectedClosing : null;
  const { data: selectedLines } = visibleSelectedClosing ? await db.from("cash_closing_lines").select("denomination, quantity").eq("closing_id", visibleSelectedClosing.id).eq("org_id", ctx.orgId).order("denomination") : { data: [] };
  const { data: selectedAudit } = visibleSelectedClosing
    ? await db.from("cash_closing_audit").select("action, actor_id, metadata, created_at").eq("closing_id", visibleSelectedClosing.id).eq("org_id", ctx.orgId).order("created_at", { ascending: false })
    : { data: [] };
  const currencyConfig: CurrencyConfig = getCurrencyConfigFromSettings({ code: currencyRow?.code ?? ctx.currency, name: currencyRow?.name, symbol: currencyRow?.symbol, ...currencySettings });
  const todayClosings = accessibleClosings.filter((r: { closing_date: string }) => r.closing_date === today);
  const variance = todayClosings.reduce((sum: number, row: { variance: number }) => sum + Number(row.variance ?? 0), 0);
  const filteredClosings = accessibleClosings;
  const closingIds = filteredClosings.map((row: { id: string }) => row.id);
  const { data: reportLines } = closingIds.length
    ? await db.from("cash_closing_lines").select("closing_id, denomination, quantity, amount").eq("org_id", ctx.orgId).in("closing_id", closingIds).order("denomination")
    : { data: [] };
  const reportClosings = filteredClosings.map((row: { id: string }) => ({
    ...row,
    denomination_lines: (reportLines ?? []).filter((line: { closing_id: string }) => line.closing_id === row.id),
  }));
  const paginationUrl = (page: number) => {
    const query = new URLSearchParams();
    query.set("tab", tab);
    query.set("page", String(page));
    if (dateFrom) query.set("date_from", dateFrom);
    if (dateTo) query.set("date_to", dateTo);
    if (selectedLocationId) query.set("location_id", selectedLocationId);
    if (requestedUserId) query.set("user_id", requestedUserId);
    if (requestedShift) query.set("shift", requestedShift);
    if (requestedClassification) query.set("classification", requestedClassification);
    if (statusFilter) query.set("status", statusFilter);
    if (searchText) query.set("search", searchText);
    return `?${query.toString()}`;
  };
  const cards = [
    ["Opening Cash", summary.opening, "bg-emerald-50 text-emerald-600", WalletCards],
    ["Cash Sales", summary.sales, "bg-blue-50 text-blue-600", Receipt],
    ["MoMo / E-Cash Sales", summary.electronic, "bg-accentTeal-soft text-accentTeal", Coins],
    ["Total Sales", summary.sales + summary.electronic, "bg-signal-soft text-signal", Receipt],
    ["Customer Payment (Cash)", summary.customerPayments, "bg-violet-50 text-violet-600", Coins],
    ["Customer Debt", summary.debt, "bg-amber-50 text-amber-600", Coins],
    ["Cash Expenses", summary.expenses, "bg-orange-50 text-orange-600", Banknote],
    ["Deposits / Withdrawals", summary.deposits + summary.withdrawals, "bg-teal-50 text-teal-600", Landmark],
    ["POS Drawer Cash In", summary.posCashIn, "bg-emerald-50 text-emerald-700", WalletCards],
    ["POS Drawer Cash Out", summary.posCashOut, "bg-rose-50 text-rose-600", WalletCards],
  ] as const;
  return (
    <div className="end-of-day-page min-h-full bg-[#f4f8fc] px-4 py-5 dark:bg-ink-950 md:px-6">
      <div className="mx-auto max-w-[1680px] space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><div className="mb-2 flex items-center gap-2 text-xs text-[#3975ae]"><span>Accounting</span><span>/</span><span className="text-ledger-500">End Of Day Accounts</span></div><div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#3d9bf4] to-[#1670d2] text-white shadow-md"><WalletCards className="h-6 w-6" /></div><div><h1 className="text-2xl font-bold tracking-tight text-[#12345a] dark:text-white">End Of Day Accounts</h1><p className="text-xs text-ledger-500">Reconcile your cash, compare with system records and close your day.</p></div></div></div>
          <div className="flex flex-wrap items-end justify-end gap-2">
            <BranchSelector selectedLocationId={selectedLocationId} locations={scopedLocations(locations)} isBranchScoped={ctx.isBranchScoped} selectedUserId={effectiveUserId} />
            {ctx.canViewOtherTransactions && <UserSelector selectedUserId={requestedUserId} selectedLocationId={selectedLocationId} users={userOptions} />}
            <form method="get" className="flex flex-wrap items-end gap-2 rounded-lg border border-[#d5e2ef] bg-white p-2 shadow-sm dark:border-ledger-700 dark:bg-ink-900">
              <input type="hidden" name="tab" value={tab} />
              {selectedLocationId && <input type="hidden" name="location_id" value={selectedLocationId} />}
              {requestedUserId && <input type="hidden" name="user_id" value={requestedUserId} />}
              <label className="text-[10px] font-medium text-ledger-500">From<input name="date_from" type="date" defaultValue={dateFrom} className="mt-1 block h-8 rounded border border-ledger-200 px-2 text-xs dark:border-ledger-700 dark:bg-ink-950" /></label>
              <label className="text-[10px] font-medium text-ledger-500">To<input name="date_to" type="date" defaultValue={dateTo} className="mt-1 block h-8 rounded border border-ledger-200 px-2 text-xs dark:border-ledger-700 dark:bg-ink-950" /></label>
              <button className="h-8 rounded bg-[#1478dd] px-3 text-xs font-semibold text-white" type="submit"><CalendarDays className="mr-1 inline h-3.5 w-3.5" />Apply</button>
            </form>
          </div>
        </div>
        {params.error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{params.error}</div>}
        {params.saved && <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">Cash closing saved successfully.</div>}
        {summaryResult.error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">Cash summary could not be calculated: {summaryResult.error}</div>}
        {closingResult.error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">Closing records could not be loaded: {closingResult.error.message}</div>}
        {analyticsResult.error && tab === "analytics" && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">Analytics could not be loaded: {analyticsResult.error.message}</div>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">{cards.map(([label, value, tone, Icon]) => <div key={label} className={`rounded-xl border border-[#dce8f2] p-4 shadow-sm dark:border-ledger-700 ${label === "Total Sales" ? "bg-signal-soft" : "bg-white dark:bg-ink-900"}`}><div className={`mb-3 flex h-8 w-8 items-center justify-center rounded-full ${tone}`}><Icon className="h-4 w-4" /></div><p className="text-[11px] font-medium text-ledger-500">{label}</p><p className={`mt-1 text-lg font-bold ${label === "Total Sales" ? "text-signal" : "text-[#17385d] dark:text-white"}`}>{formatCurrencyAmount(Number(value), currencyConfig)}</p></div>)}</div>
        <nav className="flex flex-wrap gap-2 border-b border-ledger-200 pb-2 text-sm dark:border-ledger-700">{[["today", "Today's Closings"], ["history", "Closing History"], ["variance", "Variance Reports"], ["approval", "Approval Queue"], ["analytics", "Analytics"]].map(([key, label]) => <a key={key} href={`/banking/cash-closing?tab=${key}#cash-closing-report`} className={`rounded-md px-3 py-2 ${tab === key ? "text-[var(--theme-primary)]" : "text-ledger-600 hover:bg-ledger-100 dark:text-ledger-300"}`} style={tab === key ? { background: "var(--theme-primary-pale)" } : undefined}>{label}</a>)}</nav>
        {(tab === "today" || tab === "history" || tab === "variance" || tab === "approval") && (
          <section className="overflow-hidden rounded-xl border border-[#dce8f2] bg-white shadow-sm dark:border-ledger-700 dark:bg-ink-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5edf5] p-4">
              <div><h2 className="font-bold text-[#17385d] dark:text-white">{tab === "today" ? "Today's Closings" : tab === "history" ? "Closing History" : tab === "variance" ? "Variance Reports" : "Approval Queue"}</h2><p className="text-xs text-ledger-500">Showing records from your authorized organization and branches.</p></div>
              <form className="flex flex-wrap items-end gap-2" method="get">
                <input type="hidden" name="tab" value={tab} />
                {dateFrom && <input type="hidden" name="date_from" value={dateFrom} />}
                {dateTo && <input type="hidden" name="date_to" value={dateTo} />}
                {selectedLocationId && <input type="hidden" name="location_id" value={selectedLocationId} />}
                {requestedUserId && <input type="hidden" name="user_id" value={requestedUserId} />}
                <input name="search" defaultValue={searchText} placeholder="Closing ID, user, branch" className="h-8 w-44 rounded border px-2 text-xs dark:border-ledger-700 dark:bg-ink-950" />
                <select name="shift" defaultValue={requestedShift} className="h-8 rounded border px-2 text-xs"><option value="">All shifts</option><option value="full_day">Full day</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="night">Night</option></select>
                <select name="classification" defaultValue={requestedClassification} className="h-8 rounded border px-2 text-xs"><option value="">All variance types</option><option value="balanced">Balanced</option><option value="shortage">Shortage</option><option value="excess">Excess</option></select>
                {tab !== "approval" && <select name="status" defaultValue={statusFilter} className="h-8 rounded border px-2 text-xs"><option value="">All statuses</option><option value="pending_approval">Pending approval</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="reopened">Reopened</option></select>}
                <button className="h-8 rounded bg-[#1478dd] px-3 text-xs font-semibold text-white" type="submit">Filter</button>
              </form>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="bg-[#f5f9fc] text-[11px] uppercase tracking-wide text-ledger-500 dark:bg-white/[0.03]">
                  <tr><th className="px-4 py-3">Date / Closing</th><th className="px-4 py-3">Branch</th><th className="px-4 py-3">User</th><th className="px-4 py-3">Shift</th><th className="px-4 py-3">Expected</th><th className="px-4 py-3">Actual</th><th className="px-4 py-3">Variance</th><th className="px-4 py-3">Status / Approval</th><th className="px-4 py-3">Closing Time</th><th className="px-4 py-3">Action</th></tr>
                </thead>
                <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700">
                  {filteredClosings.length ? filteredClosings.map((row: { id: string; location_id?: string | null; closing_date: string; shift?: string; expected_cash: number; actual_cash: number; variance: number; status: string; created_by: string; submitted_at?: string; closed_at?: string; approved_at?: string; approval_decision?: string; reopen_status?: string }) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3"><span className="block">{row.closing_date}</span><span className="text-[10px] text-ledger-500">{row.id.slice(0, 8)}</span></td>
                      <td className="px-4 py-3">{(locations ?? []).find((location: { id: string }) => location.id === row.location_id)?.name ?? "All branches"}</td>
                      <td className="px-4 py-3">{userOptions.find((user: { id: string }) => user.id === row.created_by)?.name ?? row.created_by.slice(0, 8)}</td>
                      <td className="px-4 py-3 capitalize">{(row.shift ?? "full_day").replace("_", " ")}</td>
                      <td className="px-4 py-3">{formatCurrencyAmount(Number(row.expected_cash), currencyConfig)}</td>
                      <td className="px-4 py-3">{formatCurrencyAmount(Number(row.actual_cash), currencyConfig)}</td>
                      <td className={`px-4 py-3 font-semibold ${Number(row.variance) < 0 ? "text-red-500" : Number(row.variance) > 0 ? "text-amber-600" : "text-emerald-600"}`}>{formatCurrencyAmount(Number(row.variance), currencyConfig)}</td>
                      <td className="px-4 py-3"><span className="block capitalize">{row.status.replace("_", " ")}</span><span className="text-[10px] text-ledger-500">{row.approval_decision ?? (row.status === "pending_approval" ? "Awaiting decision" : "—")}</span></td>
                      <td className="px-4 py-3 text-[10px]">{row.closed_at ? new Date(row.closed_at).toLocaleString() : "—"}</td>
                      <td className="space-y-2 px-4 py-3">
                        <a className="block text-[#1675d1] underline" href={`?tab=${tab}&closing_id=${row.id}#closing-details`}>{tab === "approval" ? "Review" : "View details"}</a>
                        {canApproveClosing && tab === "approval" && row.status === "pending_approval" && <div className="space-y-2">
                          <form action={approveCashClosingFromForm}><input type="hidden" name="id" value={row.id} /><button className="rounded-md bg-[#1478dd] px-2.5 py-1.5 text-[11px] font-semibold text-white" type="submit">Approve</button></form>
                          <form action={rejectCashClosingFromForm} className="space-y-1"><input type="hidden" name="id" value={row.id} /><input name="reason" required placeholder="Decision comments" className="h-8 w-40 rounded border px-2 text-[11px]" /><button className="rounded-md border border-red-200 px-2.5 py-1.5 text-[11px] font-semibold text-red-600" type="submit">Reject</button></form>
                          <form action={requestCashClosingExplanationFromForm} className="space-y-1"><input type="hidden" name="id" value={row.id} /><input name="message" required placeholder="Explanation request" className="h-8 w-40 rounded border px-2 text-[11px]" /><button className="rounded-md border px-2.5 py-1.5 text-[11px] font-semibold text-ledger-600" type="submit">Request explanation</button></form>
                        </div>}
                        {canApproveClosing && tab === "approval" && row.status === "approved" && row.reopen_status === "requested" && <form action={approveCashClosingReopenFromForm}><input type="hidden" name="id" value={row.id} /><button className="rounded-md border border-amber-300 px-2.5 py-1.5 text-[11px] font-semibold text-amber-700">Approve reopen</button></form>}
                      </td>
                    </tr>
                  )) : <tr><td colSpan={10} className="px-4 py-10 text-center text-sm text-ledger-500">No closing records match this view.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t p-3 text-xs text-ledger-500">
              <span>Page {pageNumber} of {totalPages} · {closingResult.count ?? filteredClosings.length} record(s)</span>
              <div className="flex gap-2">
                {pageNumber > 1 && <a className="rounded border px-3 py-1.5" href={paginationUrl(pageNumber - 1)}>Previous</a>}
                {pageNumber < totalPages && <a className="rounded border px-3 py-1.5" href={paginationUrl(pageNumber + 1)}>Next</a>}
              </div>
            </div>
          </section>
        )}
        {visibleSelectedClosing && <section id="closing-details" className="rounded-xl border border-[#dce8f2] bg-white p-5 shadow-sm dark:border-ledger-700 dark:bg-ink-900">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold text-[#17385d] dark:text-white">Closing Details · {visibleSelectedClosing.id}</h2><p className="text-xs text-ledger-500">{visibleSelectedClosing.closing_date} · {(visibleSelectedClosing.shift ?? "full_day").replace("_", " ")} · {(visibleSelectedClosing.status ?? "pending").replaceAll("_", " ")}</p></div><a className="text-xs text-[#1675d1] underline" href={`?tab=${tab}`}>Close</a></div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6 text-xs">
            {([["Opening cash", visibleSelectedClosing.opening_cash], ["Cash sales", visibleSelectedClosing.cash_sales], ["Customer debt", visibleSelectedClosing.cash_receipts], ["Customer cash payments", visibleSelectedClosing.cash_customer_payments], ["Electronic payments (excluded from drawer)", visibleSelectedClosing.cash_e_cash], ["Cash refunds", visibleSelectedClosing.cash_refunds], ["Cash expenses", visibleSelectedClosing.cash_expenses], ["Cash deposits", visibleSelectedClosing.deposits], ["Cash withdrawals", visibleSelectedClosing.withdrawals], ["POS cash in", visibleSelectedClosing.pos_cash_in], ["POS cash out / paid out", visibleSelectedClosing.pos_cash_out], ["POS register sessions", visibleSelectedClosing.pos_register_session_count], ["Expected cash", visibleSelectedClosing.expected_cash], ["Actual cash", visibleSelectedClosing.actual_cash], ["Variance", visibleSelectedClosing.variance]] as const).map(([label, value]) => <div key={label} className="rounded-lg bg-[#f5f9fc] p-3"><p className="text-ledger-500">{label}</p><strong className="mt-1 block text-[#17385d]">{label === "POS register sessions" ? Number(value ?? 0) : formatCurrencyAmount(Number(value ?? 0), currencyConfig)}</strong></div>)}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div><h3 className="mb-2 text-sm font-semibold text-[#17385d]">Variance reason and notes</h3><p className="rounded-lg border p-3 text-xs">{visibleSelectedClosing.variance_reason || "No reason recorded."}</p><p className="mt-2 rounded-lg border p-3 text-xs">{visibleSelectedClosing.notes || "No user notes recorded."}</p>{visibleSelectedClosing.approval_comments && <p className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs">Approval decision comments: {visibleSelectedClosing.approval_comments}</p>}</div>
            <div><h3 className="mb-2 text-sm font-semibold text-[#17385d]">Cash count lines</h3><p className="rounded-lg border p-3 text-xs">{selectedLines?.length ? selectedLines.map((line: { denomination: number; quantity: number }) => `${line.denomination} × ${line.quantity}`).join(" · ") : "No denomination lines recorded."}</p></div>
          </div>
          {canApproveClosing && visibleSelectedClosing.status === "pending_approval" && <div className="mt-4 flex flex-wrap items-end gap-2 border-t pt-4">
            <form action={approveCashClosingFromForm} className="flex items-end gap-2"><input type="hidden" name="id" value={visibleSelectedClosing.id} /><label className="text-xs">Approval comments<input name="comments" className="mt-1 h-9 rounded border px-2" /></label><button className="h-9 rounded bg-[#1478dd] px-4 text-xs font-semibold text-white">Approve closing</button></form>
            <form action={rejectCashClosingFromForm} className="flex items-end gap-2"><input type="hidden" name="id" value={visibleSelectedClosing.id} /><label className="text-xs">Rejection reason<input name="reason" required className="mt-1 h-9 rounded border px-2" /></label><button className="h-9 rounded border border-red-200 px-4 text-xs font-semibold text-red-600">Reject</button></form>
          </div>}
          {canEditClosing && visibleSelectedClosing.status === "approved" && visibleSelectedClosing.reopen_status === "none" && <form action={requestCashClosingReopenFromForm} className="mt-4 flex flex-wrap items-end gap-2 border-t pt-4"><input type="hidden" name="id" value={visibleSelectedClosing.id} /><label className="text-xs">Reason to reopen<input name="reason" required className="mt-1 h-9 rounded border px-2" /></label><button className="h-9 rounded border border-amber-300 px-4 text-xs font-semibold text-amber-700">Request controlled reopen</button></form>}
          <div className="mt-4 border-t pt-4"><h3 className="mb-2 text-sm font-semibold text-[#17385d]">Audit trail</h3>{selectedAudit?.length ? <ol className="space-y-2">{selectedAudit.map((event: { action: string; actor_id: string; metadata?: Record<string, unknown>; created_at: string }, index: number) => <li key={`${event.created_at}-${index}`} className="flex flex-wrap justify-between gap-2 rounded-md bg-[#f5f9fc] p-2 text-xs"><span><strong className="capitalize">{event.action.replaceAll("_", " ")}</strong> · {userOptions.find((user: { id: string }) => user.id === event.actor_id)?.name ?? event.actor_id.slice(0, 8)}{typeof event.metadata?.reason === "string" ? ` · ${event.metadata.reason}` : ""}</span><time>{new Date(event.created_at).toLocaleString()}</time></li>)}</ol> : <p className="text-xs text-ledger-500">No audit events are recorded.</p>}</div>
        </section>}
        {tab !== "today" && tab !== "analytics" && <CashClosingReport closings={reportClosings} currency={currencyConfig} organizationName={companyProfile?.company_name ?? ctx.orgName} logoUrl={companyProfile?.logo_url ?? null} canExport={canExportClosings} canPrint={canPrintClosings} />}
        {tab === "today" && <>
        <div className="grid gap-4 xl:grid-cols-[1.1fr_1.25fr_0.9fr_260px]">
          <section className="rounded-xl border border-[#dce8f2] bg-white shadow-sm dark:border-ledger-700 dark:bg-ink-900"><div className="border-b border-[#e5edf5] p-4"><h2 className="font-bold text-[#17385d] dark:text-white">Cash Summary</h2></div><div className="divide-y divide-[#edf2f7] px-4">{[["Opening Cash", summary.opening], ["Cash Sales", summary.sales], ["MoMo / E-Cash Sales", summary.electronic], ["Total Sales", summary.sales + summary.electronic], ["Discounts", -summary.discounts], ["Customer Debt", -summary.debt], ["Customer Payment (Cash)", summary.customerPayments], ["Refund / Return Sales", -summary.refunds], ["Cash Expenses", -summary.expenses], ["Cash Withdrawals", -summary.withdrawals], ["Cash Deposits", -summary.deposits], ["POS Drawer Cash In", summary.posCashIn], ["POS Drawer Cash Out / Paid Out", -summary.posCashOut]].map(([label, value]) => <div key={String(label)} className={`flex items-center justify-between py-3 text-xs ${label === "Total Sales" ? "bg-signal-soft px-2 text-signal" : ""}`}><span className={label === "Total Sales" ? "font-semibold text-signal" : label === "MoMo / E-Cash Sales" ? "font-medium text-accentTeal" : "text-ledger-600"}>{label}</span><strong className={Number(value) < 0 ? "text-red-500" : label === "Total Sales" ? "text-signal" : label === "MoMo / E-Cash Sales" ? "text-accentTeal" : "text-[#244e75] dark:text-white"}>{Number(value) < 0 ? "- " : ""}{formatCurrencyAmount(Math.abs(Number(value)), currencyConfig)}</strong></div>)}</div><div className="m-4 flex items-center justify-between rounded-lg bg-[#edf7ff] px-3 py-4"><span className="text-sm font-bold text-[#31577c]">Expected Closing Cash</span><strong className="text-lg text-[#1675d1]">{formatCurrencyAmount(summary.expected, currencyConfig)}</strong></div><p className="px-4 pb-4 text-xs text-ledger-500">Includes {summary.posRegisterSessionCount} POS register session(s) opened on this date.</p></section>
          {canCreateClosing && <section className="rounded-xl border border-[#dce8f2] bg-white p-5 shadow-sm dark:border-ledger-700 dark:bg-ink-900"><div className="mb-3 flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-[#1675d1]" /><h2 className="font-bold text-[#17385d] dark:text-white">Declare Your Cash</h2></div><p className="mb-5 rounded-lg bg-[#f0f7fd] p-3 text-xs leading-5 text-ledger-600">Count your physical cash and enter the total amount below. The system will compare it with the expected cash.</p><form action={createCashClosing} className="space-y-3"><label className="text-xs">Closing date<input name="closing_date" type="date" defaultValue={today} className="mt-1 h-10 w-full rounded-md border border-ledger-200 px-3 dark:border-ledger-700 dark:bg-ink-950" required /></label><label className="text-xs">Branch<select name="location_id" required={ctx.isBranchScoped} className="mt-1 h-10 w-full rounded-md border border-ledger-200 px-3 dark:border-ledger-700 dark:bg-ink-950"><option value="">{ctx.isBranchScoped ? "Select an assigned branch" : "All accessible branches"}</option>{scopedLocations(locations).map((l: { id: string; name: string }) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label><label className="text-xs">Shift<select name="shift" defaultValue="full_day" className="mt-1 h-10 w-full rounded-md border border-ledger-200 px-3 dark:border-ledger-700 dark:bg-ink-950"><option value="full_day">Full day</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="night">Night</option></select></label><div className="border-t border-ledger-100 pt-3"><p className="mb-2 text-xs font-bold text-[#31577c]">Cash Count Details</p><div className="grid grid-cols-2 gap-2"><label className="text-xs">Notes<input name="notes_count" type="number" min="0" step="0.01" defaultValue="0" className="mt-1 h-9 w-full rounded-md border border-ledger-200 px-2 dark:border-ledger-700 dark:bg-ink-950" /></label><label className="text-xs">Coins<input name="coin_count" type="number" min="0" step="0.01" defaultValue="0" className="mt-1 h-9 w-full rounded-md border border-ledger-200 px-2 dark:border-ledger-700 dark:bg-ink-950" /></label></div></div><DenominationInputs expectedCash={summary.expected} currency={currencyConfig} /><label className="text-xs">Reason for Variance<span className="mt-1 block text-[11px] text-ledger-500">Briefly explain why the physical cash differs from the expected amount.</span><textarea name="variance_reason" rows={2} className="mt-1 w-full rounded-md border border-ledger-200 p-2 dark:border-ledger-700 dark:bg-ink-950" /></label><label className="text-xs">Comments<textarea name="notes" rows={2} className="mt-1 w-full rounded-md border border-ledger-200 p-2 dark:border-ledger-700 dark:bg-ink-950" /></label><button className="h-10 w-full rounded-md bg-[#1478dd] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0f65bd]" type="submit">Complete Closing</button></form></section>}
          <section className={`rounded-xl border p-4 shadow-sm ${variance < 0 ? "border-red-200 bg-red-50/50" : variance > 0 ? "border-amber-200 bg-amber-50/50" : "border-emerald-200 bg-emerald-50/50"}`}><div className="mb-3 flex items-center gap-2"><ShieldAlert className={`h-5 w-5 ${variance < 0 ? "text-red-500" : "text-emerald-500"}`} /><h2 className="font-bold text-[#17385d]">Cash {variance < 0 ? "Shortage" : variance > 0 ? "Excess" : "Status"}</h2></div><div className="rounded-lg bg-white/80 p-4 text-xl font-bold text-red-500">{formatCurrencyAmount(Math.abs(variance), currencyConfig)}</div><div className="mt-4 space-y-2 text-xs"><div className="flex justify-between"><span>Expected Cash</span><strong>{formatCurrencyAmount(summary.expected, currencyConfig)}</strong></div><div className="flex justify-between"><span>Closings Today</span><strong>{todayClosings.length}</strong></div></div><p className="mt-4 rounded-lg bg-white/70 p-3 text-xs text-ledger-600">A variance requires a reason before completing the day.</p></section>
          <aside className="space-y-4"><section className="rounded-xl border border-[#dce8f2] bg-white p-4 shadow-sm dark:border-ledger-700 dark:bg-ink-900"><div className="mb-3 flex items-center justify-between"><h2 className="font-bold text-[#17385d] dark:text-white">Today&apos;s Closing Status</h2><Clock3 className="h-4 w-4 text-ledger-400" /></div><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-[7px] border-[#dceaf7] text-center text-xs font-bold text-[#31577c]">{todayClosings.length} closing(s)</div><p className="mt-3 text-center text-xs font-semibold text-ledger-600">{todayClosings.length ? "Closing records saved" : "No closings yet"}</p><a href="#cash-closing-report" className="mt-3 block rounded-md bg-[#1478dd] py-2 text-center text-xs font-semibold text-white">Close Day</a></section><section className="rounded-xl border border-[#dce8f2] bg-white p-4 shadow-sm dark:border-ledger-700 dark:bg-ink-900"><h2 className="mb-3 font-bold text-[#17385d] dark:text-white">Recent Closings</h2>{analyticsClosings.slice(0, 5).map((r) => <div key={r.id} className="flex items-center justify-between border-t border-ledger-100 py-2 text-[10px]"><span>{r.closing_date} · {(r.shift ?? "full_day").replace("_", " ")}</span><span className={`rounded-full px-2 py-1 ${r.classification === "shortage" ? "bg-red-100 text-red-600" : r.classification === "excess" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-600"}`}>{r.classification}</span></div>)}</section><section className="rounded-xl border border-[#dce8f2] bg-white p-4 shadow-sm dark:border-ledger-700 dark:bg-ink-900"><h2 className="mb-3 font-bold text-[#17385d] dark:text-white">Quick Actions</h2><div className="grid grid-cols-2 gap-2"><a href="#cash-closing-report" className="rounded-lg border p-3 text-center text-[10px]"><FileText className="mx-auto mb-1 h-4 w-4 text-[#1675d1]" />View Reports</a><a href="#cash-closing-report" className="rounded-lg border p-3 text-center text-[10px]"><Download className="mx-auto mb-1 h-4 w-4 text-[#1675d1]" />Export Report</a><a href="#cash-closing-report" className="rounded-lg border p-3 text-center text-[10px]"><Printer className="mx-auto mb-1 h-4 w-4 text-[#1675d1]" />Print Report</a><Link href="/banking/cash-closing?tab=settings" className="rounded-lg border p-3 text-center text-[10px]"><Settings2 className="mx-auto mb-1 h-4 w-4 text-[#1675d1]" />Settings</Link></div></section></aside>
        </div>
        <CashClosingReport closings={reportClosings} currency={currencyConfig} organizationName={companyProfile?.company_name ?? ctx.orgName} logoUrl={companyProfile?.logo_url ?? null} canExport={canExportClosings} canPrint={canPrintClosings} />
        </>}
        {tab === "analytics" && <div>
        <CashClosingAnalytics
          closings={analyticsClosings}
          locations={(locations ?? []).map((location: { id: string; name: string }) => ({ id: location.id, name: location.name }))}
          users={userOptions}
          currency={currencyConfig}
          organizationName={ctx.orgName}
        />
        </div>}
      </div>
    </div>
  );
}
