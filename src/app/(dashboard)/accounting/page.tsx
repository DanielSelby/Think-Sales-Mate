import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowRight } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { getFinancialSummary } from "@/lib/accounting/metrics";
import { Card, CardHeader, CardTitle, CardValue, CardContent } from "@/components/ui/card";

function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export default async function AccountingPage() {
  const activeOrgId = cookies().get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const summary = await getFinancialSummary(context.orgId);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">Accounting</h1>
        <p className="text-sm text-ledger-500 dark:text-ledger-400">Profit &amp; loss for the last 30 days.</p>
      </div>

      <div className="rounded-card border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
        <div className="divide-y divide-ledger-50 dark:divide-ledger-700/50">
          <div className="flex items-center justify-between px-6 py-4">
            <span className="text-sm text-ledger-500 dark:text-ledger-400">Revenue</span>
            <span className="figure text-sm font-medium text-ink-900 dark:text-white">${formatMoney(summary.revenue30d)}</span>
          </div>
          <div className="flex items-center justify-between px-6 py-4">
            <span className="text-sm text-ledger-500 dark:text-ledger-400">
              Cost of goods sold {!summary.hasCostData && <span className="text-xs">(add cost prices in Inventory)</span>}
            </span>
            <span className="figure text-sm font-medium text-alert">−${formatMoney(summary.cogs30d)}</span>
          </div>
          <div className="flex items-center justify-between px-6 py-4">
            <span className="text-sm font-medium text-ledger-700 dark:text-ledger-200">Gross profit</span>
            <span className="figure text-sm font-semibold text-ink-900 dark:text-white">${formatMoney(summary.grossProfit30d)}</span>
          </div>
          <div className="flex items-center justify-between px-6 py-4">
            <span className="text-sm text-ledger-500 dark:text-ledger-400">Expenses</span>
            <span className="figure text-sm font-medium text-alert">−${formatMoney(summary.expenses30d)}</span>
          </div>
          <div className="flex items-center justify-between px-6 py-4">
            <span className="font-medium text-ink-900 dark:text-white">Net profit</span>
            <span
              className={`figure text-lg font-semibold ${summary.netProfit30d >= 0 ? "text-signal" : "text-alert"}`}
            >
              ${formatMoney(summary.netProfit30d)}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Link href="/accounting/expenses">
          <Card className="cursor-pointer" accent="alert">
            <CardHeader>
              <CardTitle>Expenses</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <CardValue className="figure">${formatMoney(summary.expenses30d)}</CardValue>
              <ArrowRight className="h-4 w-4 text-ledger-300" />
            </CardContent>
          </Card>
        </Link>

        <Link href="/accounting/invoices">
          <Card className="cursor-pointer" accent="amber">
            <CardHeader>
              <CardTitle>Outstanding invoices</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <div>
                <CardValue className="figure">${formatMoney(summary.outstandingInvoicesTotal)}</CardValue>
                <p className="mt-1 text-xs text-ledger-400">{summary.outstandingInvoicesCount} unpaid</p>
              </div>
              <ArrowRight className="h-4 w-4 text-ledger-300" />
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}