"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { PlatformProductSlug } from "@/types/platform-database";

type ProductOption = {
  slug: PlatformProductSlug;
  name: string;
  description: string;
};

function SubmitWorkspaceButton({ canSubmit }: { canSubmit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || !canSubmit} aria-live="polite" className="w-full disabled:cursor-wait disabled:opacity-70">
      {pending ? "Submitting registration..." : "Submit for review"}
    </Button>
  );
}

export function OrganizationRegistrationForm({
  action,
  error,
  products,
}: {
  action: (formData: FormData) => void | Promise<void>;
  error?: string;
  products: ProductOption[];
}) {
  const [selectedProducts, setSelectedProducts] = useState<Set<PlatformProductSlug>>(() => new Set());

  return (
    <form action={action} className="space-y-4 rounded-card border border-ledger-100 bg-white p-6 shadow-card dark:border-ledger-700 dark:bg-ink-900">
      {error && <p role="alert" className="rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p>}
      <div className="space-y-1.5">
        <label htmlFor="name" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
          Business name
        </label>
        <Input id="name" name="name" required maxLength={120} placeholder="Boateng Traders Ltd." />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ledger-700 dark:text-ledger-200">Products to request</legend>
        {products.map((product) => (
        <label
          key={product.slug}
          className="flex cursor-pointer gap-3 rounded-lg border border-ledger-100 p-3 dark:border-ledger-700"
        >
          <input
            type="checkbox"
            name="productSlugs"
            value={product.slug}
            checked={selectedProducts.has(product.slug)}
            onChange={(event) => {
              setSelectedProducts((current) => {
                const next = new Set(current);
                if (event.target.checked) next.add(product.slug);
                else next.delete(product.slug);
                return next;
              });
            }}
            className="mt-1 accent-emerald-700"
          />
          <span>
            <span className="block text-sm font-medium text-ledger-900 dark:text-white">{product.name}</span>
            {product.description && (
              <span className="mt-0.5 block text-xs text-ledger-500 dark:text-ledger-400">{product.description}</span>
            )}
          </span>
        </label>
        ))}
        {products.length === 0 && (
        <p role="alert" className="rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">
          No products are currently available for registration.
        </p>
        )}
        <p className="text-xs text-ledger-500 dark:text-ledger-400">
          Select at least one product. This records a request only; it does not activate a subscription or start billing.
        </p>
      </fieldset>
      <p className="text-xs text-ledger-500 dark:text-ledger-400">
        After submission, your organization will be reviewed before workspace access is enabled.
      </p>
      <SubmitWorkspaceButton canSubmit={selectedProducts.size > 0 && products.length > 0} />
      <p className="min-h-5 text-center text-xs text-ledger-500 dark:text-ledger-400" aria-live="polite">
        Submitting disables the button until the registration is received.
      </p>
    </form>
  );
}
