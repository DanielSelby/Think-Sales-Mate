"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { deleteCustomer } from "@/app/(dashboard)/crm/actions";

export interface CustomerRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
}

export function CustomersTable({ customers, canManage }: { customers: CustomerRow[]; canManage: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete(id: string, name: string) {
    if (!confirm(`Remove "${name}" from your customer list? This can't be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteCustomer(id);
      if (result?.error) setError(result.error);
    });
  }

  if (customers.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-ledger-200 bg-white p-10 text-center dark:border-ledger-700 dark:bg-ink-900">
        <p className="text-sm text-ledger-500 dark:text-ledger-400">No customers yet — add your first one.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p>}

      <div className="overflow-hidden rounded-card border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
        <table className="w-full text-sm">
          <thead className="border-b border-ledger-100 text-left text-xs font-medium uppercase tracking-wide text-ledger-400 dark:border-ledger-700">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Phone</th>
              {canManage && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id} className="border-b border-ledger-50 last:border-0 dark:border-ledger-700/50">
                <td className="px-4 py-3 text-ink-900 dark:text-white">{customer.name}</td>
                <td className="px-4 py-3 text-ledger-500 dark:text-ledger-400">{customer.company ?? "—"}</td>
                <td className="px-4 py-3 text-ledger-500 dark:text-ledger-400">{customer.email ?? "—"}</td>
                <td className="px-4 py-3 text-ledger-500 dark:text-ledger-400">{customer.phone ?? "—"}</td>
                {canManage && (
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`/crm/${customer.id}/edit`}
                        className="text-ledger-400 hover:text-ink-900 dark:hover:text-white"
                        aria-label={`Edit ${customer.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Link>
                      <button
                        onClick={() => handleDelete(customer.id, customer.name)}
                        disabled={isPending}
                        className="text-ledger-400 hover:text-alert disabled:opacity-40"
                        aria-label={`Remove ${customer.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}