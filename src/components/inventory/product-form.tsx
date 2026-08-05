"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface ProductFormValues {
  sku?: string;
  name?: string;
  description?: string | null;
  category?: string | null;
  brand?: string | null;
  supplier?: string | null;
  barcode?: string | null;
  location_id?: string | null;
  unit_price?: number;
  cost_price?: number | null;
  stock_quantity?: number;
  low_stock_threshold?: number;
}

export interface ProductFormLocation {
  id: string;
  name: string;
}

export function ProductForm({
  action,
  initialValues,
  locations,
  error,
  submitLabel
}: {
  action: (formData: FormData) => void;
  initialValues?: ProductFormValues;
  locations: ProductFormLocation[];
  error?: string;
  submitLabel: string;
}) {
  return (
    <form action={action} className="space-y-4 rounded-card border border-ledger-100 bg-white p-6 shadow-card dark:border-ledger-700 dark:bg-ink-900">
      {error && <p className="rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p>}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="name" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Product name
          </label>
          <Input id="name" name="name" required defaultValue={initialValues?.name} placeholder="Bag of rice, 25kg" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="sku" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            SKU
          </label>
          <Input id="sku" name="sku" required defaultValue={initialValues?.sku} placeholder="RICE-25KG" />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="description" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
          Description <span className="font-normal text-ledger-400">(optional)</span>
        </label>
        <Input id="description" name="description" defaultValue={initialValues?.description ?? ""} placeholder="Short note for your team" />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="space-y-1.5">
          <label htmlFor="category" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Category <span className="font-normal text-ledger-400">(optional)</span>
          </label>
          <Input id="category" name="category" defaultValue={initialValues?.category ?? ""} placeholder="Electronics" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="brand" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Brand <span className="font-normal text-ledger-400">(optional)</span>
          </label>
          <Input id="brand" name="brand" defaultValue={initialValues?.brand ?? ""} placeholder="Samsung" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="supplier" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Supplier <span className="font-normal text-ledger-400">(optional)</span>
          </label>
          <Input id="supplier" name="supplier" defaultValue={initialValues?.supplier ?? ""} placeholder="Acme Distributors" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="barcode" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Barcode <span className="font-normal text-ledger-400">(optional)</span>
          </label>
          <Input id="barcode" name="barcode" defaultValue={initialValues?.barcode ?? ""} placeholder="1234567890123" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="unit_price" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Selling price
          </label>
          <Input
            id="unit_price"
            name="unit_price"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={initialValues?.unit_price}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="cost_price" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Cost price <span className="font-normal text-ledger-400">(optional, for profit tracking)</span>
          </label>
          <Input
            id="cost_price"
            name="cost_price"
            type="number"
            step="0.01"
            min="0"
            defaultValue={initialValues?.cost_price ?? ""}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <label htmlFor="stock_quantity" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Current stock
          </label>
          <Input
            id="stock_quantity"
            name="stock_quantity"
            type="number"
            min="0"
            required
            defaultValue={initialValues?.stock_quantity ?? 0}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="low_stock_threshold" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Low-stock alert below
          </label>
          <Input
            id="low_stock_threshold"
            name="low_stock_threshold"
            type="number"
            min="0"
            required
            defaultValue={initialValues?.low_stock_threshold ?? 5}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="location_id" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
            Warehouse <span className="font-normal text-ledger-400">(optional)</span>
          </label>
          <select
            id="location_id"
            name="location_id"
            defaultValue={initialValues?.location_id ?? ""}
            className="h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
          >
            <option value="">No specific warehouse</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}