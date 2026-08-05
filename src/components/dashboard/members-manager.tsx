"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inviteMember, updateMemberRole, removeMember } from "@/app/(dashboard)/settings/organization/actions";
import type { MemberRole } from "@/lib/rbac";

const ROLES: MemberRole[] = ["admin", "manager", "staff", "viewer"];

export interface MemberRow {
  id: string;
  email: string;
  role: MemberRole;
  status: string;
  isSelf: boolean;
}

export function MembersManager({ members, canManage }: { members: MemberRow[]; canManage: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleInvite(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await inviteMember(formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="space-y-6">
      {canManage && (
        <form action={handleInvite} className="flex flex-wrap items-end gap-3 rounded-card border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <div className="flex-1 space-y-1.5">
            <label className="text-sm font-medium text-ledger-700 dark:text-ledger-200">Invite by email</label>
            <Input name="email" type="email" required placeholder="teammate@company.com" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ledger-700 dark:text-ledger-200">Role</label>
            <select
              name="role"
              defaultValue="staff"
              className="h-10 rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Sending…" : "Send invite"}
          </Button>
        </form>
      )}

      {error && <p className="rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p>}

      <div className="overflow-hidden rounded-card border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
        <table className="w-full text-sm">
          <thead className="border-b border-ledger-100 text-left text-xs font-medium uppercase tracking-wide text-ledger-400 dark:border-ledger-700">
            <tr>
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              {canManage && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-b border-ledger-50 last:border-0 dark:border-ledger-700/50">
                <td className="px-4 py-3 text-ledger-900 dark:text-white">
                  {member.email} {member.isSelf && <span className="text-ledger-400">(you)</span>}
                </td>
                <td className="px-4 py-3">
                  {canManage && !member.isSelf ? (
                    <select
                      defaultValue={member.role}
                      onChange={(e) =>
                        startTransition(() => {
                          updateMemberRole(member.id, e.target.value as MemberRole);
                        })
                      }
                      className="rounded-md border border-ledger-200 bg-white px-2 py-1 text-sm capitalize dark:border-ledger-700 dark:bg-ink-900"
                    >
                      {["owner", ...ROLES].map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="capitalize text-ledger-700 dark:text-ledger-200">{member.role}</span>
                  )}
                </td>
                <td className="px-4 py-3 capitalize text-ledger-500 dark:text-ledger-400">{member.status}</td>
                {canManage && (
                  <td className="px-4 py-3 text-right">
                    {!member.isSelf && (
                      <button
                        onClick={() =>
                          startTransition(() => {
                            removeMember(member.id);
                          })
                        }
                        className="text-xs font-medium text-alert hover:underline"
                      >
                        Remove
                      </button>
                    )}
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
