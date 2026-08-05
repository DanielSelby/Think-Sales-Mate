import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CustomerForm } from "@/components/crm/customer-form";
import { createCustomer } from "@/app/(dashboard)/crm/actions";

export default function NewCustomerPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/crm" className="inline-flex items-center gap-1 text-sm text-ledger-500 hover:text-ink-900 dark:hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to customers
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink-900 dark:text-white">Add customer</h1>
      </div>

      <CustomerForm action={createCustomer} error={searchParams.error} submitLabel="Add customer" />
    </div>
  );
}