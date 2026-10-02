import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { listRegisterClosures } from "@/app/(dashboard)/pos/actions";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { requirePermission } from "@/lib/rbac/permissions";
import { formatMoney } from "@/lib/currency";

export const metadata = { title: "Register History · ThinkSales Pro" };

export default async function RegisterHistoryPage() {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  await requirePermission("pos", "view");
  const closures = await listRegisterClosures(null, 100);

  return (
    <div className="mx-auto max-w-6xl space-y-5 py-3">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"><FileText className="h-5 w-5" /></span>
          <div>
            <h1 className="text-xl font-bold text-ink-900 dark:text-white">Register History</h1>
            <p className="text-sm text-ledger-500 dark:text-ledger-400">Saved register close-outs available to your account.</p>
          </div>
        </div>
        <Link href="/pos" className="inline-flex h-9 items-center gap-2 rounded-lg border border-ledger-200 px-3 text-sm font-semibold text-ledger-700 hover:bg-ledger-50 dark:border-ledger-700 dark:text-ledger-200 dark:hover:bg-white/[0.05]"><ArrowLeft className="h-4 w-4" /> POS</Link>
      </header>

      <div className="overflow-x-auto rounded-xl border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead className="border-b border-ledger-100 bg-ledger-50/70 text-xs font-semibold text-ledger-500 dark:border-ledger-700 dark:bg-white/[0.03] dark:text-ledger-400">
            <tr>
              <th className="px-4 py-3">Closed</th><th className="px-4 py-3">Branch</th><th className="px-4 py-3">Cashier / Scope</th>
              <th className="px-4 py-3 text-right">Opening</th><th className="px-4 py-3 text-right">Expected</th><th className="px-4 py-3 text-right">Actual</th>
              <th className="px-4 py-3 text-right">Variance</th><th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {closures.map((closure) => (
              <tr key={closure.id} className="border-b border-ledger-50 last:border-0 dark:border-ledger-800">
                <td className="px-4 py-3 text-xs text-ledger-600 dark:text-ledger-300">{new Date(closure.closedAt).toLocaleString()}</td>
                <td className="px-4 py-3 text-ink-900 dark:text-white">{closure.locationName ?? "—"}</td>
                <td className="px-4 py-3 text-ledger-700 dark:text-ledger-200">{closure.scope === "all" ? "All cashiers" : closure.cashierName ?? "Cashier"}</td>
                <td className="px-4 py-3 text-right font-mono">{formatMoney(closure.openingCash, context.currency)}</td>
                <td className="px-4 py-3 text-right font-mono">{formatMoney(Math.max(0, closure.openingCash + closure.cashTotal + closure.cashIn - closure.cashOut - closure.expensesTotal), context.currency)}</td>
                <td className="px-4 py-3 text-right font-mono">{closure.actualCash == null ? "—" : formatMoney(closure.actualCash, context.currency)}</td>
                <td className={`px-4 py-3 text-right font-mono ${(closure.variance ?? 0) < 0 ? "text-alert" : (closure.variance ?? 0) > 0 ? "text-signal" : "text-ledger-500"}`}>{closure.variance == null ? "—" : formatMoney(closure.variance, context.currency)}</td>
                <td className="px-4 py-3"><span className="rounded-full bg-ledger-100 px-2.5 py-1 text-xs font-semibold capitalize text-ledger-700 dark:bg-white/[0.06] dark:text-ledger-200">{closure.status.replaceAll("_", " ")}</span></td>
              </tr>
            ))}
            {closures.length === 0 && <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-ledger-400">No register closures have been recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
