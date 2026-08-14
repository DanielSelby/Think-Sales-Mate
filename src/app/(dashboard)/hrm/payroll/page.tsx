import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { runPayroll } from "@/app/(dashboard)/hrm/payroll/actions";

function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export default async function PayrollPage({ searchParams }: { searchParams: { error?: string } }) {
  const activeOrgId = await (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  if (!can(context.role, "hrm.view")) {
    return (
      <div className="mx-auto max-w-2xl rounded-card border border-dashed border-ledger-200 bg-white p-10 text-center dark:border-ledger-700 dark:bg-ink-900">
        <p className="text-sm text-ledger-500 dark:text-ledger-400">Payroll data is restricted to managers and above.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: runs } = await supabase
    .from("payroll_runs")
    .select("id, period_label, total_amount, employee_count, created_at")
    .eq("org_id", context.orgId)
    .order("period_month", { ascending: false });

  const canManage = can(context.role, "hrm.manage");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/hrm" className="inline-flex items-center gap-1 text-sm text-ledger-500 hover:text-ink-900 dark:hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to employees
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">Payroll</h1>
            <p className="text-sm text-ledger-500 dark:text-ledger-400">
              Running payroll pays every active employee and logs it as an expense automatically.
            </p>
          </div>
          {canManage && (
            <form action={runPayroll}>
              <Button type="submit">Run payroll</Button>
            </form>
          )}
        </div>
      </div>

      {searchParams.error && <p className="rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{searchParams.error}</p>}

      {!runs || runs.length === 0 ? (
        <div className="rounded-card border border-dashed border-ledger-200 bg-white p-10 text-center dark:border-ledger-700 dark:bg-ink-900">
          <p className="text-sm text-ledger-500 dark:text-ledger-400">No payroll runs yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <table className="w-full text-sm">
            <thead className="border-b border-ledger-100 text-left text-xs font-medium uppercase tracking-wide text-ledger-400 dark:border-ledger-700">
              <tr>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Employees</th>
                <th className="px-4 py-3">Run on</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-b border-ledger-50 last:border-0 dark:border-ledger-700/50">
                  <td className="px-4 py-3">
                    <Link href={`/hrm/payroll/${run.id}`} className="font-medium text-ink-900 hover:underline dark:text-white">
                      {run.period_label}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ledger-500 dark:text-ledger-400">{run.employee_count}</td>
                  <td className="px-4 py-3 text-ledger-500 dark:text-ledger-400">
                    {new Date(run.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right figure text-alert">${formatMoney(run.total_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}