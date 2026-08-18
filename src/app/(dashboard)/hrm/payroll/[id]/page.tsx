import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { Card, CardContent } from "@/components/ui/card";

function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export default async function PayrollRunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context || !can(context.role, "hrm.view")) return null;

  const supabase = await createClient();
  const { data: run } = await supabase
    .from("payroll_runs")
    .select("id, period_label, total_amount, employee_count, created_at")
    .eq("id", id)
    .eq("org_id", context.orgId)
    .single();

  if (!run) notFound();

  const { data: items } = await supabase
    .from("payroll_run_items")
    .select("id, employee_name, amount")
    .eq("payroll_run_id", run.id)
    .order("employee_name");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/hrm/payroll" className="inline-flex items-center gap-1 text-sm text-ledger-500 hover:text-ink-900 dark:hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to payroll
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink-900 dark:text-white">{run.period_label}</h1>
        <p className="text-sm text-ledger-500 dark:text-ledger-400">
          Run on {new Date(run.created_at).toLocaleString()} · {run.employee_count} employee
          {run.employee_count === 1 ? "" : "s"}
        </p>
      </div>

      <Card>
        <CardContent className="pt-5">
          <table className="w-full text-sm">
            <thead className="border-b border-ledger-100 text-left text-xs font-medium uppercase tracking-wide text-ledger-400 dark:border-ledger-700">
              <tr>
                <th className="pb-2">Employee</th>
                <th className="pb-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(items ?? []).map((item) => (
                <tr key={item.id} className="border-b border-ledger-50 last:border-0 dark:border-ledger-700/50">
                  <td className="py-2 text-ink-900 dark:text-white">{item.employee_name}</td>
                  <td className="py-2 text-right figure">${formatMoney(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex items-center justify-between border-t border-ledger-100 pt-4 dark:border-ledger-700">
            <span className="text-sm font-medium text-ledger-500 dark:text-ledger-400">Total</span>
            <span className="figure text-xl font-semibold text-alert">${formatMoney(run.total_amount)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
