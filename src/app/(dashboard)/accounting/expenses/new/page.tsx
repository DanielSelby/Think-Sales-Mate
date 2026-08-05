import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createExpense } from "@/app/(dashboard)/accounting/expenses/actions";

export default function NewExpensePage({ searchParams }: { searchParams: { error?: string } }) {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link href="/accounting/expenses" className="inline-flex items-center gap-1 text-sm text-ledger-500 hover:text-ink-900 dark:hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to expenses
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink-900 dark:text-white">Record an expense</h1>
      </div>

      <form action={createExpense} className="space-y-4 rounded-card border border-ledger-100 bg-white p-6 shadow-card dark:border-ledger-700 dark:bg-ink-900">
        {searchParams.error && <p className="rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{searchParams.error}</p>}

        <div className="space-y-1.5">
          <label htmlFor="category" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Category
          </label>
          <Input id="category" name="category" required placeholder="Rent, utilities, supplies…" />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="vendor" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Vendor <span className="font-normal text-ledger-400">(optional)</span>
          </label>
          <Input id="vendor" name="vendor" placeholder="Who was paid" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="amount" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
              Amount
            </label>
            <Input id="amount" name="amount" type="number" step="0.01" min="0.01" required />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="expense_date" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
              Date
            </label>
            <Input id="expense_date" name="expense_date" type="date" defaultValue={today} required />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="description" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Note <span className="font-normal text-ledger-400">(optional)</span>
          </label>
          <Input id="description" name="description" placeholder="Anything worth remembering about this" />
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit">Record expense</Button>
        </div>
      </form>
    </div>
  );
}