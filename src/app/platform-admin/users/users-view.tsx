"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { invitePlatformAdmin, updatePlatformAdmin, type AssignablePlatformRole } from "./actions";
import { ALL_PLATFORM_ADMIN_PAGES, normalizePlatformAdminPages, PLATFORM_ADMIN_PAGES, type PlatformAdminPage } from "@/lib/platform-admin-pages";

export interface PlatformAdminUserRow {
  id: string;
  authUserId: string;
  email: string;
  displayName: string;
  role: AssignablePlatformRole | "platform_owner";
  isActive: boolean;
  pagePermissions: PlatformAdminPage[];
  mfaRequired: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

const roleLabels: Record<PlatformAdminUserRow["role"], string> = {
  platform_owner: "Platform Owner",
  platform_administrator: "Platform Administrator",
  support_administrator: "Support Administrator",
  billing_administrator: "Billing Administrator",
  technical_administrator: "Technical Administrator",
};

const assignableRoles: AssignablePlatformRole[] = [
  "platform_administrator",
  "support_administrator",
  "billing_administrator",
  "technical_administrator",
];

function formatDate(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

export default function PlatformAdminUsersView({
  initialUsers,
  currentAdminId,
  currentUserId,
}: {
  initialUsers: PlatformAdminUserRow[];
  currentAdminId: string;
  currentUserId: string;
}) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [newRole, setNewRole] = useState<AssignablePlatformRole>("platform_administrator");
  const [newPagePermissions, setNewPagePermissions] = useState<PlatformAdminPage[]>([...ALL_PLATFORM_ADMIN_PAGES]);
  const [notice, setNotice] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    startTransition(async () => {
      const result = await invitePlatformAdmin({ email, displayName, role: newRole, pagePermissions: newPagePermissions });
      if (!result.ok) {
        setNotice({ type: "error", text: result.error ?? "Could not send the invitation." });
        return;
      }
      setEmail("");
      setDisplayName("");
      setNewPagePermissions([...ALL_PLATFORM_ADMIN_PAGES]);
      setNotice({
        type: "success",
        text: result.warning ?? "Invitation sent. The administrator must use the email link to set a password before signing in.",
      });
      router.refresh();
    });
  }

  function saveUser(user: PlatformAdminUserRow) {
    const role = user.role;
    if (role === "platform_owner") return;
    setNotice(null);
    startTransition(async () => {
      const result = await updatePlatformAdmin({ id: user.id, role, isActive: user.isActive, pagePermissions: user.pagePermissions });
      if (!result.ok) {
        setNotice({ type: "error", text: result.error ?? "Could not update the administrator." });
        router.refresh();
        return;
      }
      setNotice({
        type: "success",
        text: result.warning ?? `${user.displayName || user.email} was updated.`,
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {notice && (
        <p role="status" className={`rounded-lg border p-3 text-sm ${notice.type === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          {notice.text}
        </p>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-bold text-slate-950">Invite platform administrator</h2>
        <p className="mt-1 text-sm text-slate-500">An invitation email will let them set a password for the separate Platform Admin account. Only a Platform Owner can invite or change administrator access.</p>
        <form onSubmit={invite} className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Full name
            <input
              required
              maxLength={120}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              autoComplete="name"
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <fieldset className="md:col-span-2">
            <legend className="text-sm font-medium text-slate-700">Page access</legend>
            <p className="mb-2 text-xs text-slate-500">Select which Platform Admin sections this account can open. Their role still controls which actions they can perform.</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {PLATFORM_ADMIN_PAGES.map((page) => (
                <label key={page.key} className="flex items-center gap-2 rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={newPagePermissions.includes(page.key)}
                    onChange={(event) => setNewPagePermissions((current) => event.target.checked
                      ? [...current, page.key]
                      : current.filter((key) => key !== page.key))}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600"
                  />
                  {page.label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="text-sm font-medium text-slate-700">
            Email address
            <input
              required
              type="email"
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Platform role
            <select
              value={newRole}
              onChange={(event) => setNewRole(event.target.value as AssignablePlatformRole)}
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              {assignableRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={isPending}
              className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Sending invitation…" : "Send invitation"}
            </button>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-bold text-slate-950">Platform accounts</h2>
          <p className="mt-1 text-sm text-slate-500">Set page access for each account. Platform Owner accounts are protected from changes here. Multi-factor sign-in is not currently enforced by the Platform Admin login.</p>
        </div>
        {users.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No platform administrator accounts found.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {users.map((user) => {
              const isOwner = user.role === "platform_owner";
              const isCurrentAdmin = user.id === currentAdminId || user.authUserId === currentUserId;
              const pagePermissions = normalizePlatformAdminPages(user.pagePermissions);
              return (
                <article key={user.id} className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_220px_140px_auto] lg:items-center">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{user.displayName || "Unnamed administrator"}</p>
                    <p className="truncate text-sm text-slate-500">{user.email}</p>
                    <p className="mt-1 text-xs text-slate-400">Last sign-in: {formatDate(user.lastLoginAt)}</p>
                  </div>
                  {isOwner ? (
                    <p className="text-sm font-medium text-slate-700">{roleLabels[user.role]}</p>
                  ) : (
                    <label className="text-xs font-medium text-slate-600">
                      Role
                      <select
                        value={user.role}
                        onChange={(event) => setUsers((current) => current.map((item) => item.id === user.id ? { ...item, role: event.target.value as AssignablePlatformRole } : item))}
                        className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800"
                      >
                        {assignableRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
                      </select>
                    </label>
                  )}
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={user.isActive}
                      disabled={isOwner || isCurrentAdmin}
                      onChange={(event) => setUsers((current) => current.map((item) => item.id === user.id ? { ...item, isActive: event.target.checked } : item))}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    {user.isActive ? "Active" : "Inactive"}
                  </label>
                  <button
                    type="button"
                    disabled={isPending || isOwner}
                    onClick={() => saveUser(user)}
                    className="h-9 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Save access
                  </button>
                  {!isOwner && (
                    <details className="lg:col-span-4">
                      <summary className="cursor-pointer text-xs font-semibold text-blue-700">
                        Page access ({pagePermissions.length} of {PLATFORM_ADMIN_PAGES.length})
                      </summary>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {PLATFORM_ADMIN_PAGES.map((page) => (
                          <label key={page.key} className="flex items-center gap-2 rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-700">
                            <input
                              type="checkbox"
                              checked={pagePermissions.includes(page.key)}
                              disabled={isPending}
                              onChange={(event) => setUsers((current) => current.map((item) => item.id === user.id
                                ? { ...item, pagePermissions: event.target.checked
                                  ? [...pagePermissions, page.key]
                                  : pagePermissions.filter((key) => key !== page.key) }
                                : item))}
                              className="h-4 w-4 rounded border-slate-300 text-blue-600"
                            />
                            {page.label}
                          </label>
                        ))}
                      </div>
                    </details>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
