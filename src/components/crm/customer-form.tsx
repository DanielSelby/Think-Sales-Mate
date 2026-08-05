"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface CustomerFormValues {
  name?: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  notes?: string | null;
}

export function CustomerForm({
  action,
  initialValues,
  error,
  submitLabel
}: {
  action: (formData: FormData) => void;
  initialValues?: CustomerFormValues;
  error?: string;
  submitLabel: string;
}) {
  return (
    <form action={action} className="space-y-4 rounded-card border border-ledger-100 bg-white p-6 shadow-card dark:border-ledger-700 dark:bg-ink-900">
      {error && <p className="rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p>}

      <div className="space-y-1.5">
        <label htmlFor="name" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
          Name
        </label>
        <Input id="name" name="name" required defaultValue={initialValues?.name} placeholder="Ama Boateng" />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="company" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
          Company <span className="font-normal text-ledger-400">(optional)</span>
        </label>
        <Input id="company" name="company" defaultValue={initialValues?.company ?? ""} placeholder="Boateng Traders Ltd." />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Email <span className="font-normal text-ledger-400">(optional)</span>
          </label>
          <Input id="email" name="email" type="email" defaultValue={initialValues?.email ?? ""} placeholder="ama@company.com" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="phone" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Phone <span className="font-normal text-ledger-400">(optional)</span>
          </label>
          <Input id="phone" name="phone" type="tel" defaultValue={initialValues?.phone ?? ""} placeholder="024 000 0000" />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="notes" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
          Notes <span className="font-normal text-ledger-400">(optional)</span>
        </label>
        <Input id="notes" name="notes" defaultValue={initialValues?.notes ?? ""} placeholder="Anything worth remembering" />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}