import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { calculateExpectedCash, createCashClosing } from "./actions";
import { CashClosingReport } from "./report";

export const metadata = { title: "Cash Closing · SalesMate ERP" };

export default async function CashClosingPage({ searchParams }: { searchParams?: { error?: string; saved?: string; tab?: string } }) {
  const ctx = await getCurrentOrgContext();
  if (!ctx) return null;
  const db = await createClient() as any;
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: closings }, { data: locations }, summary] = await Promise.all([
    db.from("cash_closings").select("id, closing_date, shift, actual_cash, expected_cash, variance, classification, status, approval_required, variance_reason, created_at").eq("org_id", ctx.orgId).order("closing_date", { ascending: false }).limit(100),
    db.from("business_locations").select("id, name").eq("org_id", ctx.orgId).eq("is_active", true).order("name"),
    calculateExpectedCash(today),
  ]);
  const tab = searchParams?.tab ?? "today";
  const filteredClosings = (closings ?? []).filter((closing: { closing_date: string; status: string; approval_required?: boolean; variance: number }) => {
    if (tab === "today") return closing.closing_date === today;
    if (tab === "variance") return Number(closing.variance) !== 0;
    if (tab === "approval") return closing.status === "pending_approval" || closing.approval_required;
    return true;
  });
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">Cash Closing</h1>
        <p className="text-sm text-ledger-500 dark:text-ledger-400">Reconcile physical cash against recorded sales, refunds, expenses and banking movements.</p>
      </div>
      {searchParams?.error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{searchParams.error}</div>}
      {searchParams?.saved && <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">Cash closing saved and queued for approval.</div>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Opening Cash", summary.opening], ["Cash Sales", summary.sales], ["Cash Expenses", -summary.expenses], ["Expected Closing", summary.expected],
        ].map(([label, value]) => <div key={String(label)} className="rounded-card border border-ledger-200 bg-white p-4 shadow-sm dark:border-ledger-700 dark:bg-ink-900"><p className="text-xs text-ledger-500">{label}</p><p className="mt-2 text-xl font-semibold text-ink-900 dark:text-white">{Number(value).toFixed(2)} {ctx.currency}</p></div>)}
      </div>
      <nav className="flex flex-wrap gap-2 border-b border-ledger-200 pb-2 text-sm dark:border-ledger-700">
        {[["today", "Today's Closings"], ["history", "Closing History"], ["variance", "Variance Reports"], ["approval", "Approval Queue"]].map(([key, label]) => <a key={key} href={`/banking/cash-closing?tab=${key}#cash-closing-report`} className={`rounded-md px-3 py-2 ${searchParams?.tab === key ? "bg-ink-900 text-white dark:bg-white dark:text-ink-900" : "text-ledger-600 hover:bg-ledger-100 dark:text-ledger-300 dark:hover:bg-ink-800"}`}>{label}</a>)}
      </nav>
      <section className="rounded-card border border-ledger-200 bg-white p-5 shadow-sm dark:border-ledger-700 dark:bg-ink-900">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-semibold text-ink-900 dark:text-white">New closing</h2><p className="text-xs text-ledger-500">Expected cash today: <strong>{summary.expected.toFixed(2)}</strong></p></div>
          <a href="#cash-closing-report" className="text-sm font-medium text-signal hover:underline">View report</a>
        </div>
        <form action={createCashClosing} className="grid gap-4 md:grid-cols-2">
          <label className="text-sm">Closing date<input name="closing_date" type="date" defaultValue={today} className="mt-1 h-10 w-full rounded-md border border-ledger-200 px-3 dark:border-ledger-700 dark:bg-ink-950" required /></label>
          <label className="text-sm">Branch (optional)<select name="location_id" className="mt-1 h-10 w-full rounded-md border border-ledger-200 px-3 dark:border-ledger-700 dark:bg-ink-950"><option value="">All accessible branches</option>{(locations ?? []).filter((l: { id: string }) => !ctx.isBranchScoped || ctx.allowedLocationIds.includes(l.id)).map((l: { id: string; name: string }) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          <label className="text-sm">Shift<select name="shift" defaultValue="full_day" className="mt-1 h-10 w-full rounded-md border border-ledger-200 px-3 dark:border-ledger-700 dark:bg-ink-950"><option value="full_day">Full day</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="night">Night</option></select></label>
          <label className="text-sm">Actual cash counted<input name="actual_cash" type="number" min="0" step="0.01" className="mt-1 h-10 w-full rounded-md border border-ledger-200 px-3 dark:border-ledger-700 dark:bg-ink-950" required /></label>
          <label className="text-sm">Notes count<input name="notes_count" type="number" min="0" step="0.01" defaultValue="0" className="mt-1 h-10 w-full rounded-md border border-ledger-200 px-3 dark:border-ledger-700 dark:bg-ink-950" /></label>
          <label className="text-sm">Coins count<input name="coin_count" type="number" min="0" step="0.01" defaultValue="0" className="mt-1 h-10 w-full rounded-md border border-ledger-200 px-3 dark:border-ledger-700 dark:bg-ink-950" /></label>
          <fieldset className="rounded-lg border border-ledger-200 p-3 md:col-span-2 dark:border-ledger-700"><legend className="px-1 text-xs font-medium text-ledger-500">Denomination quantities (optional)</legend><div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">{[1, 2, 5, 10, 20, 50, 100].map((denomination) => <label key={denomination} className="text-xs">{denomination}<input name={`denomination_${denomination}`} type="number" min="0" step="1" defaultValue="0" className="mt-1 h-9 w-full rounded-md border border-ledger-200 px-2 dark:border-ledger-700 dark:bg-ink-950" /></label>)}</div></fieldset>
          <label className="text-sm md:col-span-2">Variance reason (required when not balanced)<input name="variance_reason" className="mt-1 h-10 w-full rounded-md border border-ledger-200 px-3 dark:border-ledger-700 dark:bg-ink-950" placeholder="Counting error, unrecorded sale, loss, or other" /></label>
          <label className="text-sm md:col-span-2">Notes<textarea name="notes" rows={2} className="mt-1 w-full rounded-md border border-ledger-200 p-3 dark:border-ledger-700 dark:bg-ink-950" /></label>
          <button className="h-10 rounded-md bg-ink-900 px-4 text-sm font-medium text-white hover:bg-ink-950 md:col-span-2 dark:bg-white dark:text-ink-900" type="submit">Save cash closing</button>
        </form>
      </section>
      <CashClosingReport closings={filteredClosings} currency={ctx.currency} />
    </div>
  );
}
