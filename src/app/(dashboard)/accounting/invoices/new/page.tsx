import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createInvoice } from "@/app/(dashboard)/accounting/invoices/actions";

export default function NewInvoicePage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link href="/accounting/invoices" className="inline-flex items-center gap-1 text-sm text-ledger-500 hover:text-ink-900 dark:hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to invoices
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink-900 dark:text-white">New invoice</h1>
      </div>

      <form action={createInvoice} className="space-y-4 rounded-card border border-ledger-100 bg-white p-6 shadow-card dark:border-ledger-700 dark:bg-ink-900">
        {searchParams.error && <p className="rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{searchParams.error}</p>}

        <div className="space-y-1.5">
          <label htmlFor="customer_name" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Customer name
          </label>
          <Input id="customer_name" name="customer_name" required placeholder="Who owes this?" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="amount" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
              Amount
            </label>
            <Input id="amount" name="amount" type="number" step="0.01" min="0.01" required />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="due_date" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
              Due date
            </label>
            <Input id="due_date" name="due_date" type="date" required />
          </div>
        </div>

        <p className="text-xs text-ledger-400">
          New invoices are created as <span className="font-medium">Sent</span> — mark it Paid once the customer settles it.
        </p>

        <div className="flex justify-end pt-2">
          <Button type="submit">Create invoice</Button>
        </div>
      </form>
    </div>
  );
}