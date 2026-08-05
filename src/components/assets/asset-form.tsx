"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface AssetFormValues {
  name?: string;
  category?: string | null;
  purchase_date?: string;
  purchase_cost?: number;
  current_value?: number;
  status?: "in_use" | "under_repair" | "disposed";
  location?: string | null;
  notes?: string | null;
}

export function AssetForm({
  action,
  initialValues,
  error,
  submitLabel
}: {
  action: (formData: FormData) => void;
  initialValues?: AssetFormValues;
  error?: string;
  submitLabel: string;
}) {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={action} className="space-y-4 rounded-card border border-ledger-100 bg-white p-6 shadow-card dark:border-ledger-700 dark:bg-ink-900">
      {error && <p className="rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p>}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="name" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Asset name
          </label>
          <Input id="name" name="name" required defaultValue={initialValues?.name} placeholder="Delivery van, Freezer unit…" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="category" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Category <span className="font-normal text-ledger-400">(optional)</span>
          </label>
          <Input id="category" name="category" defaultValue={initialValues?.category ?? ""} placeholder="Vehicle, Equipment…" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="purchase_date" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Purchase date
          </label>
          <Input id="purchase_date" name="purchase_date" type="date" defaultValue={initialValues?.purchase_date ?? today} required />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="location" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Location <span className="font-normal text-ledger-400">(optional)</span>
          </label>
          <Input id="location" name="location" defaultValue={initialValues?.location ?? ""} placeholder="Main warehouse…" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="purchase_cost" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Purchase cost
          </label>
          <Input
            id="purchase_cost"
            name="purchase_cost"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={initialValues?.purchase_cost}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="current_value" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Current value
          </label>
          <Input
            id="current_value"
            name="current_value"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={initialValues?.current_value ?? initialValues?.purchase_cost ?? 0}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="status" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
          Status
        </label>
        <select
          id="status"
          name="status"
          defaultValue={initialValues?.status ?? "in_use"}
          className="h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
        >
          <option value="in_use">In use</option>
          <option value="under_repair">Under repair</option>
          <option value="disposed">Disposed</option>
        </select>
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