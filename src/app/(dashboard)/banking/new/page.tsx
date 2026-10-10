import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createAccount } from "@/app/(dashboard)/banking/actions";

export default function NewAccountPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link href="/banking" className="inline-flex items-center gap-1 text-sm text-ledger-500 hover:text-ink-900 dark:hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to banking
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink-900 dark:text-white">Add Bank Account</h1>
        <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">Add a bank account, cash account, or mobile money wallet.</p>
      </div>

      <form action={createAccount} className="space-y-5 rounded-2xl border border-ledger-100 bg-white p-6 shadow-card dark:border-ledger-700 dark:bg-ink-900">
        {searchParams.error && <p className="rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{searchParams.error}</p>}

        <div className="space-y-1.5">
          <label htmlFor="name" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Account or provider name
          </label>
          <Input id="name" name="name" required maxLength={120} placeholder="Bank name, wallet provider, or till name" />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="account_type" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Account type
          </label>
          <select
            id="account_type"
            name="account_type"
            defaultValue="cash"
            className="h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
          >
            <option value="cash">Cash</option>
            <option value="checking">Current account</option>
            <option value="savings">Savings account</option>
            <option value="mobile_money">Mobile money</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="opening_balance" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Opening balance in your organization&apos;s base currency
          </label>
          <Input id="opening_balance" name="opening_balance" type="number" step="0.01" min="0" defaultValue={0} required />
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit">Add account</Button>
        </div>
      </form>
    </div>
  );
}