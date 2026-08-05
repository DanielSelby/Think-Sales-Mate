import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EmployeeForm } from "@/components/hrm/employee-form";
import { createEmployee } from "@/app/(dashboard)/hrm/actions";

export default function NewEmployeePage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/hrm" className="inline-flex items-center gap-1 text-sm text-ledger-500 hover:text-ink-900 dark:hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to employees
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink-900 dark:text-white">Add employee</h1>
      </div>

      <EmployeeForm action={createEmployee} error={searchParams.error} submitLabel="Add employee" />
    </div>
  );
}