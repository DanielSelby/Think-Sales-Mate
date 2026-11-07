"use client";

import { useState, useTransition } from "react";
import { Check, PackageCheck, Save } from "lucide-react";
import type { ManagedUser } from "../types";
import { setOrganizationProductAssignments } from "@/app/(dashboard)/settings/organization/actions";

interface ProductOption {
  slug: string;
  name: string;
}

interface ProductAccessTabProps {
  users: ManagedUser[];
  products: ProductOption[];
  assignments: Record<string, string[]>;
}

function isOrganizationAdmin(user: ManagedUser) {
  const permissions = user.accessPermissions ?? {};
  const roleKey = typeof permissions.role_key === "string" ? permissions.role_key.toLowerCase() : "";
  return user.role.toLowerCase() === "owner" || roleKey === "owner" || roleKey === "super_admin";
}

export function ProductAccessTab({ users, products, assignments }: ProductAccessTabProps) {
  const [selectedProducts, setSelectedProducts] = useState(assignments);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ userId: string; text: string; error: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();
  const managedUsers = users.filter((user) => user.userId && user.status === "active" && !isOrganizationAdmin(user));

  function toggleProduct(userId: string, slug: string) {
    setSelectedProducts((previous) => {
      const current = new Set(previous[userId] ?? []);
      if (current.has(slug)) current.delete(slug);
      else current.add(slug);
      return { ...previous, [userId]: Array.from(current) };
    });
    setMessage(null);
  }

  function saveAssignments(userId: string) {
    setSavingUserId(userId);
    setMessage(null);
    startTransition(async () => {
      const result = await setOrganizationProductAssignments(userId, selectedProducts[userId] ?? []);
      if ("error" in result && result.error) {
        setMessage({ userId, text: result.error, error: true });
      } else {
        setMessage({ userId, text: "Product access updated.", error: false });
      }
      setSavingUserId(null);
    });
  }

  if (!products.length) {
    return <p className="rounded-xl border border-dashed p-6 text-sm text-ledger-500">There are no published products to assign.</p>;
  }

  if (!managedUsers.length) {
    return <p className="rounded-xl border border-dashed p-6 text-sm text-ledger-500">There are no active non-administrator users to manage.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-900">
        Organization owners and super administrators automatically have access to every active product. Assign products below to control employee access.
      </div>
      <div className="overflow-x-auto rounded-xl border border-ledger-200 bg-white dark:border-ledger-800 dark:bg-slate-900">
        <table className="w-full min-w-[660px] border-collapse text-left">
          <thead>
            <tr className="border-b border-ledger-200 text-xs uppercase tracking-wide text-ledger-500 dark:border-ledger-800">
              <th className="px-4 py-3 font-semibold">Team member</th>
              {products.map((product) => (
                <th key={product.slug} className="px-4 py-3 text-center font-semibold">{product.name}</th>
              ))}
              <th className="px-4 py-3 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {managedUsers.map((user) => {
              const isSaving = isPending && savingUserId === user.userId;
              const rowMessage = message && message.userId === user.userId ? message : null;
              return (
                <tr key={user.id} className="border-b border-ledger-100 last:border-0 dark:border-ledger-800">
                  <td className="px-4 py-4">
                    <p className="text-sm font-semibold text-ink-900 dark:text-white">{user.fullName || user.name}</p>
                    <p className="mt-0.5 text-xs text-ledger-500">{user.email}</p>
                  </td>
                  {products.map((product) => {
                    const checked = (selectedProducts[user.userId!] ?? []).includes(product.slug);
                    return (
                      <td key={product.slug} className="px-4 py-4 text-center">
                        <label className="inline-flex cursor-pointer items-center justify-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleProduct(user.userId!, product.slug)}
                            aria-label={`${checked ? "Revoke" : "Assign"} ${product.name} for ${user.fullName || user.name}`}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                        </label>
                      </td>
                    );
                  })}
                  <td className="px-4 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => saveAssignments(user.userId!)}
                      disabled={isPending}
                      className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {rowMessage && !rowMessage.error
                        ? <Check className="h-4 w-4" />
                        : isSaving ? <PackageCheck className="h-4 w-4 animate-pulse" /> : <Save className="h-4 w-4" />}
                      {isSaving ? "Saving" : "Save"}
                    </button>
                    {rowMessage && (
                      <p className={`mt-1 text-[11px] ${rowMessage.error ? "text-red-600" : "text-emerald-700"}`} role={rowMessage.error ? "alert" : "status"}>
                        {rowMessage.text}
                      </p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
