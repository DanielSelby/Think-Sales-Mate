import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft, Plus } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { InvoicesTable, type InvoiceRow } from "@/components/accounting/invoices-table";
import { formatCurrency } from "@/lib/sales/format";

export default async function InvoicesPage({ searchParams }: { searchParams?: { tab?: string } }) {
  const activeOrgId = await (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("invoices")
    .select("id, invoice_number, customer_name, amount, status, due_date")
    .eq("org_id", context.orgId)
    .order("created_at", { ascending: false });

  if (searchParams?.tab === "credit-notes") {
    const { data: returnedSales } = await supabase
      .from("sales")
      .select("id, sale_number, customer_name, sale_date, total, created_at, sold_by")
      .eq("org_id", context.orgId)
      .eq("status", "returned")
      .order("created_at", { ascending: false });
    const soldByIds = Array.from(new Set((returnedSales ?? []).map((sale) => sale.sold_by).filter(Boolean)));
    const { data: profiles } = soldByIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", soldByIds)
      : { data: [] as { id: string; full_name: string | null }[] };
    const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name ?? "Unknown"]));

    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <Link href="/sales" className="inline-flex items-center gap-1 text-sm text-ledger-500 hover:text-ink-900 dark:hover:text-white">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to sales
          </Link>
          <h1 className="mt-2 font-display text-2xl font-semibold text-ink-900 dark:text-white">Credit Notes</h1>
          <p className="text-sm text-ledger-500 dark:text-ledger-400">Returned sales and the credit amounts issued to customers.</p>
        </div>
        <div className="overflow-hidden rounded-card border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <table className="w-full text-sm">
            <thead className="border-b border-ledger-100 text-left text-xs font-medium uppercase tracking-wide text-ledger-400 dark:border-ledger-700">
              <tr><th className="px-4 py-3">Credit Note</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Created By</th><th className="px-4 py-3 text-right">Amount</th></tr>
            </thead>
            <tbody>
              {(returnedSales ?? []).map((sale) => (
                <tr key={sale.id} className="border-b border-ledger-50 last:border-0 dark:border-ledger-700/50">
                  <td className="px-4 py-3 font-medium text-signal">CN-{String(sale.sale_number).padStart(4, "0")}</td>
                  <td className="px-4 py-3 text-ledger-600 dark:text-ledger-300">{sale.customer_name ?? "Walk-in Customer"}</td>
                  <td className="px-4 py-3 text-ledger-500 dark:text-ledger-400">{new Date(sale.sale_date).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-ledger-600 dark:text-ledger-300">{names.get(sale.sold_by) ?? "Unknown"}</td>
                  <td className="px-4 py-3 text-right font-medium text-ink-900 dark:text-white">{formatCurrency(sale.total, context.currency)}</td>
                </tr>
              ))}
              {!returnedSales?.length && <tr><td colSpan={5} className="px-4 py-14 text-center text-ledger-400">No credit notes found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const invoices: InvoiceRow[] = (rows ?? []).map((i) => ({
    id: i.id,
    invoiceNumber: i.invoice_number,
    customerName: i.customer_name,
    amount: i.amount,
    status: i.status,
    dueDate: i.due_date
  }));

  const canManage = can(context.role, "accounting.manage");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/accounting" className="inline-flex items-center gap-1 text-sm text-ledger-500 hover:text-ink-900 dark:hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to accounting
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">Invoices</h1>
          {canManage && (
            <Link href="/accounting/invoices/new">
              <Button>
                <Plus className="h-4 w-4" />
                New invoice
              </Button>
            </Link>
          )}
        </div>
      </div>

      <InvoicesTable invoices={invoices} canManage={canManage} currency={context.currency} />
    </div>
  );
}