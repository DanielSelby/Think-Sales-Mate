"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface ProjectFormValues {
  name?: string;
  customer_id?: string | null;
  status?: "planning" | "active" | "on_hold" | "completed" | "cancelled";
  start_date?: string | null;
  end_date?: string | null;
  budget?: number | null;
  description?: string | null;
}

export interface CustomerOption {
  id: string;
  name: string;
}

export function ProjectForm({
  action,
  initialValues,
  customers,
  error,
  submitLabel
}: {
  action: (formData: FormData) => void;
  initialValues?: ProjectFormValues;
  customers: CustomerOption[];
  error?: string;
  submitLabel: string;
}) {
  return (
    <form action={action} className="space-y-4 rounded-card border border-ledger-100 bg-white p-6 shadow-card dark:border-ledger-700 dark:bg-ink-900">
      {error && <p className="rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p>}

      <div className="space-y-1.5">
        <label htmlFor="name" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
          Project name
        </label>
        <Input id="name" name="name" required defaultValue={initialValues?.name} placeholder="Warehouse fit-out, Website redesign…" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="customer_id" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Customer <span className="font-normal text-ledger-400">(optional)</span>
          </label>
          <select
            id="customer_id"
            name="customer_id"
            defaultValue={initialValues?.customer_id ?? ""}
            className="h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
          >
            <option value="">No customer linked</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="status" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={initialValues?.status ?? "planning"}
            className="h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
          >
            <option value="planning">Planning</option>
            <option value="active">Active</option>
            <option value="on_hold">On hold</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="start_date" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Start date <span className="font-normal text-ledger-400">(optional)</span>
          </label>
          <Input id="start_date" name="start_date" type="date" defaultValue={initialValues?.start_date ?? ""} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="end_date" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Due date <span className="font-normal text-ledger-400">(optional)</span>
          </label>
          <Input id="end_date" name="end_date" type="date" defaultValue={initialValues?.end_date ?? ""} />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="budget" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
          Budget <span className="font-normal text-ledger-400">(optional)</span>
        </label>
        <Input id="budget" name="budget" type="number" step="0.01" min="0" defaultValue={initialValues?.budget ?? ""} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="description" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
          Description <span className="font-normal text-ledger-400">(optional)</span>
        </label>
        <Input id="description" name="description" defaultValue={initialValues?.description ?? ""} placeholder="Short note about scope" />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}