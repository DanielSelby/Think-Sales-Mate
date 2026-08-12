import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft, Plus } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { InvoicesTable, type InvoiceRow } from "@/components/accounting/invoices-table";

export default async function InvoicesPage() {
  const activeOrgId = await cookies().get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("invoices")
    .select("id, invoice_number, customer_name, amount, status, due_date")
    .eq("org_id", context.orgId)
    .order("created_at", { ascending: false });

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

      <InvoicesTable invoices={invoices} canManage={canManage} />
    </div>
  );
}