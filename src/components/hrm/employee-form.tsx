"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface EmployeeFormValues {
  full_name?: string;
  email?: string | null;
  phone?: string | null;
  job_title?: string | null;
  department?: string | null;
  monthly_salary?: number;
  hire_date?: string;
  status?: "active" | "inactive";
}

export function EmployeeForm({
  action,
  initialValues,
  error,
  submitLabel
}: {
  action: (formData: FormData) => void;
  initialValues?: EmployeeFormValues;
  error?: string;
  submitLabel: string;
}) {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={action} className="space-y-4 rounded-card border border-ledger-100 bg-white p-6 shadow-card dark:border-ledger-700 dark:bg-ink-900">
      {error && <p className="rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p>}

      <div className="space-y-1.5">
        <label htmlFor="full_name" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
          Full name
        </label>
        <Input id="full_name" name="full_name" required defaultValue={initialValues?.full_name} placeholder="Kwame Mensah" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="job_title" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Job title <span className="font-normal text-ledger-400">(optional)</span>
          </label>
          <Input id="job_title" name="job_title" defaultValue={initialValues?.job_title ?? ""} placeholder="Sales associate" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="department" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Department <span className="font-normal text-ledger-400">(optional)</span>
          </label>
          <Input id="department" name="department" defaultValue={initialValues?.department ?? ""} placeholder="Sales" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Email <span className="font-normal text-ledger-400">(optional)</span>
          </label>
          <Input id="email" name="email" type="email" defaultValue={initialValues?.email ?? ""} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="phone" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Phone <span className="font-normal text-ledger-400">(optional)</span>
          </label>
          <Input id="phone" name="phone" type="tel" defaultValue={initialValues?.phone ?? ""} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="monthly_salary" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Monthly salary
          </label>
          <Input
            id="monthly_salary"
            name="monthly_salary"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={initialValues?.monthly_salary}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="hire_date" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Hire date
          </label>
          <Input id="hire_date" name="hire_date" type="date" defaultValue={initialValues?.hire_date ?? today} required />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="status" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
          Status
        </label>
        <select
          id="status"
          name="status"
          defaultValue={initialValues?.status ?? "active"}
          className="h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <p className="text-xs text-ledger-400">Only active employees are included when you run payroll.</p>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}