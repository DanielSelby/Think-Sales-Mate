import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft, Plus } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { ExpensesTable, type ExpenseRow } from "@/components/accounting/expenses-table";

export default async function ExpensesPage() {
  const activeOrgId = await (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("expenses")
    .select("id, category, vendor, description, amount, expense_date")
    .eq("org_id", context.orgId)
    .order("expense_date", { ascending: false });

  const expenses: ExpenseRow[] = (rows ?? []).map((e) => ({
    id: e.id,
    category: e.category,
    vendor: e.vendor,
    description: e.description,
    amount: e.amount,
    expenseDate: e.expense_date
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
          <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">Expenses</h1>
          {canManage && (
            <Link href="/accounting/expenses/new">
              <Button>
                <Plus className="h-4 w-4" />
                Record expense
              </Button>
            </Link>
          )}
        </div>
      </div>

      <ExpensesTable expenses={expenses} canManage={canManage} />
    </div>
  );
}