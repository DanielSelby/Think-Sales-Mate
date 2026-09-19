import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { approveCashClosingFromForm, calculateExpectedCash, createCashClosing, rejectCashClosingFromForm, requestCashClosingExplanationFromForm } from "./actions";
import { CashClosingReport } from "./report";
import { Banknote, CalendarDays, ChevronDown, ClipboardCheck, Clock3, Coins, Download, FileText, Landmark, Printer, Receipt, Settings2, ShieldAlert, WalletCards } from "lucide-react";
import { DenominationInputs } from "./denomination-inputs";
import { BranchSelector } from "./branch-selector";
import { getCurrencyConfigFromSettings, type CurrencyConfig, formatCurrencyAmount } from "@/lib/currency";
import { CashClosingAnalytics } from "./analytics";

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
  page?: string;
  closing_id?: string;
};

export default async function CashClosingPage({ searchParams }: { searchParams?: Promise<CashClosingSearchParams> }) {
  const ctx = await getCurrentOrgContext();
  if (!ctx) return null;
  const params = (await searchParams) ?? {};
  const db = await createClient() as any;
  const today = new Date().toISOString().slice(0, 10);
  const requestedLocationId = params.location_id || null;
  const dateFrom = params.date_from || "";
  const dateTo = params.date_to || "";
  const requestedShift = params.shift || "";
  const requestedClassification = params.classification || "";
  const pageNumber = Math.max(1, Number(params.page || 1) || 1);
  const pageSize = 25;
  const selectedLocationId = requestedLocationId && (!ctx.isBranchScoped || ctx.allowedLocationIds.includes(requestedLocationId)) ? requestedLocationId : null;
  const [closingResult, { data: locations }, { data: currencyRow }, { data: currencySettings }, { data: companyProfile }, summary] = await Promise.all([
    db.from("cash_closings").select("id, location_id, closing_date, shift, opening_cash, cash_sales, cash_receipts, cash_refunds, cash_expenses, deposits, withdrawals, actual_cash, expected_cash, variance, classification, status, approval_required, variance_reason, created_at", { count: "exact" }).eq("org_id", ctx.orgId).gte("closing_date", dateFrom || "1900-01-01").lte("closing_date", dateTo || "2999-12-31").order("created_at", { ascending: false }).range((pageNumber - 1) * pageSize, pageNumber * pageSize - 1),
    db.from("business_locations").select("id, name").eq("org_id", ctx.orgId).eq("is_active", true).order("name"),
    db.from("currencies").select("*").eq("org_id", ctx.orgId).or("is_base.eq.true,is_default.eq.true").order("is_base", { ascending: false }).limit(1).maybeSingle(),
    db.from("currency_settings").select("*").eq("org_id", ctx.orgId).maybeSingle(),
    db.from("company_profile").select("company_name, logo_url").eq("org_id", ctx.orgId).maybeSingle(),
    calculateExpectedCash(today, selectedLocationId).catch(() => ({ opening: 0, sales: 0, receipts: 0, refunds: 0, expenses: 0, deposits: 0, withdrawals: 0, expected: 0 })),
  ]);
  const closings = closingResult.error
    ? (await db.from("cash_closings").select("id, location_id, closing_date, opening_cash, cash_sales, cash_refunds, cash_expenses, deposits, withdrawals, actual_cash, expected_cash, variance, classification, status, variance_reason, created_at").eq("org_id", ctx.orgId).order("created_at", { ascending: false }).range((pageNumber - 1) * pageSize, pageNumber * pageSize - 1)).data
    : closingResult.data;
  const accessibleClosings = (closings ?? []).filter((row: { location_id?: string | null; shift?: string; classification?: string }) => {
    if (selectedLocationId) return row.location_id === selectedLocationId;
    return !ctx.isBranchScoped || !row.location_id || ctx.allowedLocationIds.includes(row.location_id);
  }).filter((row: { shift?: string; classification?: string }) => (!requestedShift || row.shift === requestedShift) && (!requestedClassification || row.classification === requestedClassification));
  const totalPages = Math.max(1, Math.ceil(Number(closingResult.count ?? accessibleClosings.length) / pageSize));
  const selectedClosing = params.closing_id ? accessibleClosings.find((row: { id: string }) => row.id === params.closing_id) : null;
  const { data: selectedLines } = selectedClosing ? await db.from("cash_closing_lines").select("denomination, quantity").eq("closing_id", selectedClosing.id).eq("org_id", ctx.orgId).order("denomination") : { data: [] };
  const currencyConfig: CurrencyConfig = getCurrencyConfigFromSettings({ code: currencyRow?.code ?? ctx.currency, name: currencyRow?.name, symbol: currencyRow?.symbol, ...currencySettings });
  const tab = params.tab ?? "today";
  const todayClosings = accessibleClosings.filter((r: { closing_date: string }) => r.closing_date === today);
  const variance = todayClosings.reduce((sum: number, row: { variance: number }) => sum + Number(row.variance ?? 0), 0);
  const filteredClosings = accessibleClosings.filter((r: { closing_date: string; status: string; approval_required?: boolean; variance: number }) => tab === "today" ? r.closing_date === today : tab === "variance" ? Number(r.variance) !== 0 : tab === "approval" ? r.status === "pending_approval" || r.approval_required : true);
  const cards = [
    ["Opening Cash", summary.opening, "bg-emerald-50 text-emerald-600", WalletCards],
    ["Total Cash Sales", summary.sales, "bg-blue-50 text-blue-600", Receipt],
    ["Cash Receipts", summary.receipts, "bg-violet-50 text-violet-600", Coins],
    ["Cash Expenses", summary.expenses, "bg-orange-50 text-orange-600", Banknote],
    ["Deposits / Withdrawals", summary.deposits + summary.withdrawals, "bg-teal-50 text-teal-600", Landmark],
  ] as const;
  return (
    <div className="min-h-full bg-[#f4f8fc] px-4 py-5 dark:bg-ink-950 md:px-6">
      <div className="mx-auto max-w-[1440px] space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><div className="mb-2 flex items-center gap-2 text-xs text-[#3975ae]"><span>Accounting</span><span>/</span><span className="text-ledger-500">End Of Day Accounts</span></div><div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#3d9bf4] to-[#1670d2] text-white shadow-md"><WalletCards className="h-6 w-6" /></div><div><h1 className="text-2xl font-bold tracking-tight text-[#12345a] dark:text-white">End Of Day Accounts</h1><p className="text-xs text-ledger-500">Reconcile your cash, compare with system records and close your day.</p></div></div></div>
          <div className="flex gap-2"><BranchSelector selectedLocationId={selectedLocationId} locations={(locations ?? []).map((location: { id: string; name: string }) => ({ id: location.id, name: location.name }))} /><label className="flex h-10 items-center gap-2 rounded-lg border border-[#d5e2ef] bg-white px-3 text-xs font-medium text-[#31577c] shadow-sm dark:border-ledger-700 dark:bg-ink-900"><CalendarDays className="h-4 w-4 text-[#2087e5]" />{new Date(today).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}<ChevronDown className="h-3 w-3" /></label></div>
        </div>
        {params.error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{params.error}</div>}
        {params.saved && <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">Cash closing saved successfully.</div>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{cards.map(([label, value, tone, Icon]) => <div key={label} className="rounded-xl border border-[#dce8f2] bg-white p-4 shadow-sm dark:border-ledger-700 dark:bg-ink-900"><div className={`mb-3 flex h-8 w-8 items-center justify-center rounded-full ${tone}`}><Icon className="h-4 w-4" /></div><p className="text-[11px] font-medium text-ledger-500">{label}</p><p className="mt-1 text-lg font-bold text-[#17385d] dark:text-white">{formatCurrencyAmount(Number(value), currencyConfig)}</p></div>)}</div>
        <nav className="flex flex-wrap gap-2 border-b border-ledger-200 pb-2 text-sm dark:border-ledger-700">{[["today", "Today's Closings"], ["history", "Closing History"], ["variance", "Variance Reports"], ["approval", "Approval Queue"], ["analytics", "Analytics"]].map(([key, label]) => <a key={key} href={`/banking/cash-closing?tab=${key}#cash-closing-report`} className={`rounded-md px-3 py-2 ${tab === key ? "bg-[#1478dd] text-white" : "text-ledger-600 hover:bg-ledger-100 dark:text-ledger-300"}`}>{label}</a>)}</nav>
        {(tab === "history" || tab === "variance" || tab === "approval") && (
          <section className="overflow-hidden rounded-xl border border-[#dce8f2] bg-white shadow-sm dark:border-ledger-700 dark:bg-ink-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5edf5] p-4">
              <div><h2 className="font-bold text-[#17385d] dark:text-white">{tab === "history" ? "Closing History" : tab === "variance" ? "Variance Reports" : "Approval Queue"}</h2><p className="text-xs text-ledger-500">Showing records from your authorized organization and branches.</p></div>
              <form className="flex flex-wrap items-end gap-2" method="get">
                <input type="hidden" name="tab" value={tab} />
                <label className="text-[10px] text-ledger-500">From<input name="date_from" type="date" defaultValue={dateFrom} className="mt-1 block h-8 rounded border px-2 text-xs" /></label>
                <label className="text-[10px] text-ledger-500">To<input name="date_to" type="date" defaultValue={dateTo} className="mt-1 block h-8 rounded border px-2 text-xs" /></label>
                <select name="shift" defaultValue={requestedShift} className="h-8 rounded border px-2 text-xs"><option value="">All shifts</option><option value="full_day">Full day</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="night">Night</option></select>
                <select name="classification" defaultValue={requestedClassification} className="h-8 rounded border px-2 text-xs"><option value="">All variance types</option><option value="balanced">Balanced</option><option value="shortage">Shortage</option><option value="excess">Excess</option></select>
                <button className="h-8 rounded bg-[#1478dd] px-3 text-xs font-semibold text-white" type="submit">Filter</button>
              </form>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="bg-[#f5f9fc] text-[11px] uppercase tracking-wide text-ledger-500 dark:bg-white/[0.03]">
                  <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Branch</th><th className="px-4 py-3">Shift</th><th className="px-4 py-3">Expected</th><th className="px-4 py-3">Actual</th><th className="px-4 py-3">Variance</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Action</th></tr>
                </thead>
                <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700">
                  {filteredClosings.length ? filteredClosings.map((row: { id: string; location_id?: string | null; closing_date: string; shift?: string; expected_cash: number; actual_cash: number; variance: number; status: string }) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3">{row.closing_date}</td>
                      <td className="px-4 py-3">{(locations ?? []).find((location: { id: string }) => location.id === row.location_id)?.name ?? "All branches"}</td>
                      <td className="px-4 py-3 capitalize">{(row.shift ?? "full_day").replace("_", " ")}</td>
                      <td className="px-4 py-3">{formatCurrencyAmount(Number(row.expected_cash), currencyConfig)}</td>
                      <td className="px-4 py-3">{formatCurrencyAmount(Number(row.actual_cash), currencyConfig)}</td>
                      <td className={`px-4 py-3 font-semibold ${Number(row.variance) < 0 ? "text-red-500" : Number(row.variance) > 0 ? "text-amber-600" : "text-emerald-600"}`}>{formatCurrencyAmount(Number(row.variance), currencyConfig)}</td>
                      <td className="px-4 py-3 capitalize">{row.status.replace("_", " ")}</td>
                      <td className="px-4 py-3">{tab === "approval" && row.status === "pending_approval" ? <div className="flex flex-wrap gap-1"><form action={approveCashClosingFromForm}><input type="hidden" name="id" value={row.id} /><button className="rounded-md bg-[#1478dd] px-2.5 py-1.5 text-[11px] font-semibold text-white" type="submit">Approve</button></form><form action={rejectCashClosingFromForm}><input type="hidden" name="id" value={row.id} /><input type="hidden" name="reason" value="Rejected during approval review" /><button className="rounded-md border border-red-200 px-2.5 py-1.5 text-[11px] font-semibold text-red-600" type="submit">Reject</button></form><form action={requestCashClosingExplanationFromForm}><input type="hidden" name="id" value={row.id} /><input type="hidden" name="message" value="Please provide more information about this variance." /><button className="rounded-md border px-2.5 py-1.5 text-[11px] font-semibold text-ledger-600" type="submit">Request explanation</button></form></div> : <a className="text-[#1675d1] underline" href={`?tab=${tab}&closing_id=${row.id}#cash-closing-report`}>View</a>}</td>
                    </tr>
                  )) : <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-ledger-500">No closing records match this view.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t p-3 text-xs text-ledger-500">
              <span>Page {pageNumber} of {totalPages}</span>
              <div className="flex gap-2">
                {pageNumber > 1 && <a className="rounded border px-3 py-1.5" href={`?tab=${tab}&page=${pageNumber - 1}&date_from=${dateFrom}&date_to=${dateTo}&shift=${requestedShift}&classification=${requestedClassification}`}>Previous</a>}
                {pageNumber < totalPages && <a className="rounded border px-3 py-1.5" href={`?tab=${tab}&page=${pageNumber + 1}&date_from=${dateFrom}&date_to=${dateTo}&shift=${requestedShift}&classification=${requestedClassification}`}>Next</a>}
              </div>
            </div>
          </section>
        )}
        {selectedClosing && <section className="rounded-xl border border-[#dce8f2] bg-white p-5 shadow-sm dark:border-ledger-700 dark:bg-ink-900">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold text-[#17385d] dark:text-white">Closing Details</h2><p className="text-xs text-ledger-500">{selectedClosing.closing_date} · {(selectedClosing.shift ?? "full_day").replace("_", " ")}</p></div><a className="text-xs text-[#1675d1] underline" href={`?tab=${tab}`}>Close</a></div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6 text-xs">
            {([["Expected", selectedClosing.expected_cash], ["Actual", selectedClosing.actual_cash], ["Variance", selectedClosing.variance], ["Cash sales", selectedClosing.cash_sales], ["Expenses", selectedClosing.cash_expenses], ["Refunds", selectedClosing.cash_refunds]] as const).map(([label, value]) => <div key={label} className="rounded-lg bg-[#f5f9fc] p-3"><p className="text-ledger-500">{label}</p><strong className="mt-1 block text-[#17385d]">{formatCurrencyAmount(Number(value ?? 0), currencyConfig)}</strong></div>)}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2"><div><h3 className="mb-2 text-sm font-semibold text-[#17385d]">Variance reason</h3><p className="rounded-lg border p-3 text-xs">{selectedClosing.variance_reason || "No reason recorded."}</p></div><div><h3 className="mb-2 text-sm font-semibold text-[#17385d]">Cash count lines</h3><p className="rounded-lg border p-3 text-xs">{selectedLines?.length ? selectedLines.map((line: { denomination: number; quantity: number }) => `${line.denomination} × ${line.quantity}`).join(" · ") : "No denomination lines recorded."}</p></div></div>
        </section>}
        {tab === "today" && <>
        <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr_1fr_260px]">
          <section className="rounded-xl border border-[#dce8f2] bg-white shadow-sm dark:border-ledger-700 dark:bg-ink-900"><div className="border-b border-[#e5edf5] p-4"><h2 className="font-bold text-[#17385d] dark:text-white">Cash Summary</h2></div><div className="divide-y divide-[#edf2f7] px-4">{[["Opening Cash", summary.opening], ["Cash Sales", summary.sales], ["Customer Payments (Cash)", summary.receipts], ["Cash Receipts", summary.receipts], ["Refunds", -summary.refunds], ["Cash Expenses", -summary.expenses], ["Cash Withdrawals", -summary.withdrawals], ["Cash Deposits", -summary.deposits]].map(([label, value]) => <div key={String(label)} className="flex items-center justify-between py-3 text-xs"><span className="text-ledger-600">{label}</span><strong className={Number(value) < 0 ? "text-red-500" : "text-[#244e75] dark:text-white"}>{Number(value) < 0 ? "- " : ""}{formatCurrencyAmount(Math.abs(Number(value)), currencyConfig)}</strong></div>)}</div><div className="m-4 flex items-center justify-between rounded-lg bg-[#edf7ff] px-3 py-4"><span className="text-sm font-bold text-[#31577c]">Expected Closing Cash</span><strong className="text-lg text-[#1675d1]">{formatCurrencyAmount(summary.expected, currencyConfig)}</strong></div></section>
          <section className="rounded-xl border border-[#dce8f2] bg-white p-4 shadow-sm dark:border-ledger-700 dark:bg-ink-900"><div className="mb-3 flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-[#1675d1]" /><h2 className="font-bold text-[#17385d] dark:text-white">Declare Your Cash</h2></div><p className="mb-5 rounded-lg bg-[#f0f7fd] p-3 text-xs leading-5 text-ledger-600">Count your physical cash and enter the total amount below. The system will compare it with the expected cash.</p><form action={createCashClosing} className="space-y-3"><label className="text-xs">Closing date<input name="closing_date" type="date" defaultValue={today} className="mt-1 h-10 w-full rounded-md border border-ledger-200 px-3 dark:border-ledger-700 dark:bg-ink-950" required /></label><label className="text-xs">Branch<select name="location_id" className="mt-1 h-10 w-full rounded-md border border-ledger-200 px-3 dark:border-ledger-700 dark:bg-ink-950"><option value="">All accessible branches</option>{(locations ?? []).filter((l: { id: string }) => !ctx.isBranchScoped || ctx.allowedLocationIds.includes(l.id)).map((l: { id: string; name: string }) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label><label className="text-xs">Shift<select name="shift" defaultValue="full_day" className="mt-1 h-10 w-full rounded-md border border-ledger-200 px-3 dark:border-ledger-700 dark:bg-ink-950"><option value="full_day">Full day</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="night">Night</option></select></label><label className="text-xs">Total Physical Cash<input name="actual_cash" type="number" min="0" step="0.01" className="mt-1 h-10 w-full rounded-md border border-ledger-200 px-3 dark:border-ledger-700 dark:bg-ink-950" required /></label><div className="border-t border-ledger-100 pt-3"><p className="mb-2 text-xs font-bold text-[#31577c]">Cash Count Details</p><div className="grid grid-cols-2 gap-2"><label className="text-xs">Notes<input name="notes_count" type="number" min="0" step="0.01" defaultValue="0" className="mt-1 h-9 w-full rounded-md border border-ledger-200 px-2 dark:border-ledger-700 dark:bg-ink-950" /></label><label className="text-xs">Coins<input name="coin_count" type="number" min="0" step="0.01" defaultValue="0" className="mt-1 h-9 w-full rounded-md border border-ledger-200 px-2 dark:border-ledger-700 dark:bg-ink-950" /></label></div></div><DenominationInputs /><label className="text-xs">Reason for Variance<textarea name="variance_reason" rows={2} className="mt-1 w-full rounded-md border border-ledger-200 p-2 dark:border-ledger-700 dark:bg-ink-950" /></label><label className="text-xs">Comments<textarea name="notes" rows={2} className="mt-1 w-full rounded-md border border-ledger-200 p-2 dark:border-ledger-700 dark:bg-ink-950" /></label><button className="h-10 w-full rounded-md bg-[#1478dd] px-4 text-sm font-semibold text-white hover:bg-[#0f65bd]" type="submit">Complete Closing</button></form></section>
          <section className={`rounded-xl border p-4 shadow-sm ${variance < 0 ? "border-red-200 bg-red-50/50" : variance > 0 ? "border-amber-200 bg-amber-50/50" : "border-emerald-200 bg-emerald-50/50"}`}><div className="mb-3 flex items-center gap-2"><ShieldAlert className={`h-5 w-5 ${variance < 0 ? "text-red-500" : "text-emerald-500"}`} /><h2 className="font-bold text-[#17385d]">Cash {variance < 0 ? "Shortage" : variance > 0 ? "Excess" : "Status"}</h2></div><div className="rounded-lg bg-white/80 p-4 text-xl font-bold text-red-500">{formatCurrencyAmount(Math.abs(variance), currencyConfig)}</div><div className="mt-4 space-y-2 text-xs"><div className="flex justify-between"><span>Expected Cash</span><strong>{formatCurrencyAmount(summary.expected, currencyConfig)}</strong></div><div className="flex justify-between"><span>Closings Today</span><strong>{todayClosings.length}</strong></div></div><p className="mt-4 rounded-lg bg-white/70 p-3 text-xs text-ledger-600">A variance requires a reason before completing the day.</p></section>
          <aside className="space-y-4"><section className="rounded-xl border border-[#dce8f2] bg-white p-4 shadow-sm dark:border-ledger-700 dark:bg-ink-900"><div className="mb-3 flex items-center justify-between"><h2 className="font-bold text-[#17385d] dark:text-white">Today&apos;s Closing Status</h2><Clock3 className="h-4 w-4 text-ledger-400" /></div><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-[7px] border-[#dceaf7] text-center text-xs font-bold text-[#31577c]">{todayClosings.length} / 1</div><p className="mt-3 text-center text-xs font-semibold text-ledger-600">{todayClosings.length ? "Closed" : "Not Closed"}</p><a href="#cash-closing-report" className="mt-3 block rounded-md bg-[#1478dd] py-2 text-center text-xs font-semibold text-white">Close Day</a></section><section className="rounded-xl border border-[#dce8f2] bg-white p-4 shadow-sm dark:border-ledger-700 dark:bg-ink-900"><h2 className="mb-3 font-bold text-[#17385d] dark:text-white">Recent Closings</h2>{(closings ?? []).slice(0, 5).map((r: { id: string; closing_date: string; shift?: string; classification: string }) => <div key={r.id} className="flex items-center justify-between border-t border-ledger-100 py-2 text-[10px]"><span>{r.closing_date} · {(r.shift ?? "full_day").replace("_", " ")}</span><span className={`rounded-full px-2 py-1 ${r.classification === "shortage" ? "bg-red-100 text-red-600" : r.classification === "excess" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-600"}`}>{r.classification}</span></div>)}</section><section className="rounded-xl border border-[#dce8f2] bg-white p-4 shadow-sm dark:border-ledger-700 dark:bg-ink-900"><h2 className="mb-3 font-bold text-[#17385d] dark:text-white">Quick Actions</h2><div className="grid grid-cols-2 gap-2"><a href="#cash-closing-report" className="rounded-lg border p-3 text-center text-[10px]"><FileText className="mx-auto mb-1 h-4 w-4 text-[#1675d1]" />View Reports</a><a href="#cash-closing-report" className="rounded-lg border p-3 text-center text-[10px]"><Download className="mx-auto mb-1 h-4 w-4 text-[#1675d1]" />Export Report</a><a href="#cash-closing-report" className="rounded-lg border p-3 text-center text-[10px]"><Printer className="mx-auto mb-1 h-4 w-4 text-[#1675d1]" />Print Report</a><a href="/banking/cash-closing?tab=settings" className="rounded-lg border p-3 text-center text-[10px]"><Settings2 className="mx-auto mb-1 h-4 w-4 text-[#1675d1]" />Settings</a></div></section></aside>
        </div>
        <CashClosingReport closings={filteredClosings} currency={currencyConfig} organizationName={companyProfile?.company_name ?? ctx.orgName} logoUrl={companyProfile?.logo_url ?? null} />
        </>}
        {tab === "analytics" && <div>
        <CashClosingAnalytics
          closings={accessibleClosings}
          locations={(locations ?? []).map((location: { id: string; name: string }) => ({ id: location.id, name: location.name }))}
          currency={currencyConfig}
        />
        </div>}
      </div>
    </div>
  );
}
