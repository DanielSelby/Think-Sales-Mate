"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import {
  Users,
  UserCheck,
  UserX,
  ShieldCheck,
  Search,
  MoreVertical,
  Pencil,
  Trash2,
  Mail,
  UserPlus,
  Upload,
  Download,
  Printer,
  Sparkles,
  X,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MemberRole, MemberStatus } from "@/types/database";
import {
  inviteMember,
  updateMemberRole,
  updateMemberBranch,
  updateMemberStatus,
  resendInvite,
  removeMember,
  bulkInviteMembers
} from "@/app/(dashboard)/settings/organization/actions";

export interface ManagedUser {
  id: string;
  email: string;
  role: MemberRole;
  status: MemberStatus;
  locationId: string | null;
  locationName: string | null;
  lastSignInAt: string | null;
  joinedAt: string;
  isSelf: boolean;
}

export interface UserBranch {
  id: string;
  name: string;
}

const ROLES: MemberRole[] = ["owner", "admin", "manager", "staff", "viewer"];
const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  staff: "Staff",
  viewer: "Viewer"
};
const ROLE_COLORS: Record<MemberRole, string> = {
  owner: "#7c3aed",
  admin: "#2563eb",
  manager: "#0d9488",
  staff: "#d97706",
  viewer: "#94a3b8"
};
const PAGE_SIZE = 8;

function initials(email: string) {
  const name = email.split("@")[0] ?? "?";
  return name.slice(0, 2).toUpperCase();
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

function csvEscape(value: string) {
  if (value.includes(",") || value.includes('"')) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function UserManagement({
  users,
  branches,
  canManage,
  orgName
}: {
  users: ManagedUser[];
  branches: UserBranch[];
  canManage: boolean;
  orgName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState<"all" | MemberRole>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | MemberStatus>("all");
  const [tab, setTab] = useState<"all" | "active" | "invited" | "suspended">("all");
  const [page, setPage] = useState(1);

  const [showInvite, setShowInvite] = useState(false);
  const inviteFormRef = useRef<HTMLFormElement>(null);

  const branchById = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches]);

  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.status === "active").length;
  const invitedUsers = users.filter((u) => u.status === "invited").length;
  const suspendedUsers = users.filter((u) => u.status === "suspended").length;
  const adminUsers = users.filter((u) => u.role === "owner" || u.role === "admin").length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (tab !== "all" && u.status !== tab) return false;
      if (q && !u.email.toLowerCase().includes(q)) return false;
      if (branchFilter !== "all" && u.locationId !== branchFilter) return false;
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      return true;
    });
  }, [users, search, branchFilter, roleFilter, statusFilter, tab]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const roleBreakdown = useMemo(() => {
    const map = new Map<MemberRole, number>();
    for (const u of users) map.set(u.role, (map.get(u.role) ?? 0) + 1);
    return ROLES.map((r) => ({ role: r, count: map.get(r) ?? 0 })).filter((r) => r.count > 0);
  }, [users]);

  const branchBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of users) {
      const key = u.locationName ?? "Unassigned";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([name, count]) => ({ name, count, pct: totalUsers > 0 ? Math.round((count / totalUsers) * 100) : 0 }))
      .sort((a, b) => b.count - a.count);
  }, [users, totalUsers]);

  const insights = useMemo(() => {
    const items: string[] = [];
    const staleCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const staleCount = users.filter((u) => u.status === "active" && (!u.lastSignInAt || new Date(u.lastSignInAt).getTime() < staleCutoff)).length;
    if (staleCount > 0) {
      items.push(`${staleCount} user${staleCount === 1 ? " hasn't" : "s haven't"} logged in for more than 30 days.`);
    }
    if (roleBreakdown.length > 0) {
      const avg = totalUsers / roleBreakdown.length;
      const top = [...roleBreakdown].sort((a, b) => b.count - a.count)[0];
      if (top && avg > 0 && top.count > avg * 1.5) {
        items.push(`${ROLE_LABELS[top.role]} is assigned to ${top.count} user${top.count === 1 ? "" : "s"}, higher than average.`);
      }
    }
    const recentJoins = users.filter((u) => Date.now() - new Date(u.joinedAt).getTime() < 30 * 24 * 60 * 60 * 1000).length;
    if (recentJoins > 0) {
      items.push(`${recentJoins} new user${recentJoins === 1 ? "" : "s"} joined in the last 30 days.`);
    }
    return items;
  }, [users, roleBreakdown, totalUsers]);

  function handleInvite(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await inviteMember(formData);
      if (result?.error) {
        setError(result.error);
      } else {
        inviteFormRef.current?.reset();
        setShowInvite(false);
        setMessage("Invitation sent.");
      }
    });
  }

  function handleRoleChange(user: ManagedUser, role: MemberRole) {
    startTransition(async () => {
      const result = await updateMemberRole(user.id, role);
      if (result?.error) setError(result.error);
    });
  }

  function handleBranchChange(user: ManagedUser, locationId: string) {
    startTransition(async () => {
      const result = await updateMemberBranch(user.id, locationId || null);
      if (result?.error) setError(result.error);
    });
  }

  function handleToggleStatus(user: ManagedUser) {
    const next = user.status === "active" ? "suspended" : "active";
    startTransition(async () => {
      const result = await updateMemberStatus(user.id, next);
      if (result?.error) setError(result.error);
    });
  }

  function handleResend(user: ManagedUser) {
    startTransition(async () => {
      const result = await resendInvite(user.id);
      setMessage(result?.error ? null : "Invite resent.");
      if (result?.error) setError(result.error);
    });
  }

  function handleRemove(user: ManagedUser) {
    if (!confirm(`Remove ${user.email} from ${orgName}?`)) return;
    startTransition(async () => {
      const result = await removeMember(user.id);
      if (result?.error) setError(result.error);
    });
  }

  function handleExport() {
    const headers = ["Email", "Role", "Branch", "Status", "Last login"];
    const rows = filtered.map((u) =>
      [
        u.email,
        ROLE_LABELS[u.role],
        u.locationName ?? "Unassigned",
        u.status,
        u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString() : "Never"
      ]
        .map(csvEscape)
        .join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "users-export.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handlePrint() {
    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) return;
    const rows = filtered
      .map(
        (u) => `<tr><td>${u.email}</td><td>${ROLE_LABELS[u.role]}</td><td>${u.locationName ?? "Unassigned"}</td><td>${u.status}</td></tr>`
      )
      .join("");
    win.document.write(`
      <html><head><title>User list</title>
      <style>body{font-family:sans-serif;padding:16px}table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #ddd;padding:6px 10px;text-align:left;font-size:13px}</style></head>
      <body><h2>${orgName} — Users</h2>
      <table><thead><tr><th>Email</th><th>Role</th><th>Branch</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody></table></body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
  }

  function handleImportFile(file: File) {
    setError(null);
    setMessage(null);
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCsv(String(reader.result ?? ""));
      if (rows.length === 0) {
        setError("Couldn't find any data rows in that CSV. Expected a header row plus at least one user.");
        return;
      }
      const payload = rows.map((r) => ({
        email: r.email ?? "",
        role: (ROLES.includes(r.role as MemberRole) ? r.role : "staff") as MemberRole,
        locationId: r.branch ? branches.find((b) => b.name.toLowerCase() === r.branch.toLowerCase())?.id : undefined
      }));
      startTransition(async () => {
        const result = await bulkInviteMembers(payload);
        setMessage(
          `Invited ${result.invited} of ${payload.length} users.` +
            (result.skipped.length > 0 ? ` ${result.skipped.length} row(s) skipped — see console.` : "")
        );
        if (result.skipped.length > 0) console.warn("Import skipped rows:", result.skipped);
      });
    };
    reader.readAsText(file);
  }

  return (
    <div className="space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImportFile(file);
          e.target.value = "";
        }}
      />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">User management</h1>
          <p className="text-sm text-ledger-500 dark:text-ledger-400">Manage who has access to {orgName} and what they can do.</p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isPending}>
              <Upload className="h-3.5 w-3.5" />
              Import users
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="h-3.5 w-3.5" />
              Print
            </Button>
            <Button onClick={() => setShowInvite((s) => !s)}>
              <UserPlus className="h-3.5 w-3.5" />
              Add new user
            </Button>
          </div>
        )}
      </div>

      {error && (
        <p className="flex items-center justify-between rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">
          {error}
          <button onClick={() => setError(null)} aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </button>
        </p>
      )}
      {message && (
        <p className="flex items-center justify-between rounded-md bg-signal-soft px-3 py-2 text-sm text-signal">
          {message}
          <button onClick={() => setMessage(null)} aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </button>
        </p>
      )}

      {showInvite && (
        <form
          ref={inviteFormRef}
          action={handleInvite}
          className="space-y-3 rounded-card border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900"
        >
          <h3 className="text-sm font-semibold text-ink-900 dark:text-white">Invite a new user</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input name="email" type="email" required placeholder="name@company.com" />
            <select
              name="role"
              defaultValue="staff"
              className="h-10 rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
            >
              {ROLES.filter((r) => r !== "owner").map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <select
              name="location_id"
              defaultValue=""
              className="h-10 rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
            >
              <option value="">No branch</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Sending…" : "Send invite"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowInvite(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: "Total users", value: totalUsers, icon: Users, color: "text-signal", bg: "bg-signal-soft" },
          { label: "Active users", value: activeUsers, icon: UserCheck, color: "text-signal", bg: "bg-signal-soft" },
          { label: "Pending invites", value: invitedUsers, icon: Mail, color: "text-amber", bg: "bg-amber-soft" },
          { label: "Suspended", value: suspendedUsers, icon: UserX, color: "text-alert", bg: "bg-alert-soft" },
          { label: "Admins", value: adminUsers, icon: ShieldCheck, color: "text-ledger-500", bg: "bg-ledger-100 dark:bg-white/[0.06]" }
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-card border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <div className="flex items-center gap-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${kpi.bg} ${kpi.color}`}>
                <kpi.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="figure text-lg font-semibold text-ink-900 dark:text-white">{kpi.value}</p>
                <p className="text-xs text-ledger-400">{kpi.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-4 lg:col-span-2">
          {/* Toolbar */}
          <div className="space-y-3 rounded-card border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ledger-400" />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by email…"
                className="h-10 w-full rounded-md border border-ledger-200 bg-white pl-9 pr-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <select
                value={branchFilter}
                onChange={(e) => {
                  setBranchFilter(e.target.value);
                  setPage(1);
                }}
                className="h-9 rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
              >
                <option value="all">All branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <select
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value as "all" | MemberRole);
                  setPage(1);
                }}
                className="h-9 rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
              >
                <option value="all">All roles</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as "all" | MemberStatus);
                  setPage(1);
                }}
                className="h-9 rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="invited">Pending</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-ledger-100 dark:border-ledger-700">
            {[
              { key: "all", label: `All Users ${totalUsers}` },
              { key: "active", label: `Active ${activeUsers}` },
              { key: "invited", label: `Pending ${invitedUsers}` },
              { key: "suspended", label: `Suspended ${suspendedUsers}` }
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  setTab(t.key as typeof tab);
                  setPage(1);
                }}
                className={`border-b-2 px-3 pb-2.5 text-sm font-medium transition-colors ${
                  tab === t.key
                    ? "border-signal text-ink-900 dark:text-white"
                    : "border-transparent text-ledger-500 hover:text-ink-900 dark:text-ledger-400 dark:hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Table */}
          {pageItems.length === 0 ? (
            <div className="rounded-card border border-dashed border-ledger-200 bg-white p-10 text-center dark:border-ledger-700 dark:bg-ink-900">
              <p className="text-sm text-ledger-500 dark:text-ledger-400">No users match these filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-card border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
              <table className="w-full text-sm">
                <thead className="border-b border-ledger-100 text-left text-xs font-medium uppercase tracking-wide text-ledger-400 dark:border-ledger-700">
                  <tr>
                    <th className="px-4 py-3">User</th>
                    <th className="px-2 py-3">Role</th>
                    <th className="px-2 py-3">Branch</th>
                    <th className="px-2 py-3">Status</th>
                    <th className="px-2 py-3">Last login</th>
                    {canManage && <th className="w-10 px-2 py-3" />}
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((u) => (
                    <tr key={u.id} className="border-b border-ledger-50 last:border-0 dark:border-ledger-700/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ledger-100 text-xs font-semibold text-ledger-500 dark:bg-white/[0.06]">
                            {initials(u.email)}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink-900 dark:text-white">
                              {u.email}
                              {u.isSelf && <span className="ml-1 text-xs text-ledger-400">(you)</span>}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        {canManage && !u.isSelf ? (
                          <select
                            value={u.role}
                            onChange={(e) => handleRoleChange(u, e.target.value as MemberRole)}
                            className="h-8 rounded-md border border-ledger-200 bg-white px-2 text-xs dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="rounded-full bg-ledger-100 px-2 py-0.5 text-xs font-semibold text-ledger-600 dark:bg-white/[0.06] dark:text-ledger-300">
                            {ROLE_LABELS[u.role]}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-3">
                        {canManage ? (
                          <select
                            value={u.locationId ?? ""}
                            onChange={(e) => handleBranchChange(u, e.target.value)}
                            className="h-8 rounded-md border border-ledger-200 bg-white px-2 text-xs dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                          >
                            <option value="">Unassigned</option>
                            {branches.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-ledger-500 dark:text-ledger-400">{u.locationName ?? "Unassigned"}</span>
                        )}
                      </td>
                      <td className="px-2 py-3">
                        {u.status === "active" ? (
                          <span className="rounded-full bg-signal-soft px-2 py-0.5 text-xs font-semibold text-signal">Active</span>
                        ) : u.status === "invited" ? (
                          <span className="rounded-full bg-amber-soft px-2 py-0.5 text-xs font-semibold text-amber">Pending</span>
                        ) : (
                          <span className="rounded-full bg-alert-soft px-2 py-0.5 text-xs font-semibold text-alert">Suspended</span>
                        )}
                      </td>
                      <td className="px-2 py-3 text-xs text-ledger-500 dark:text-ledger-400">
                        {u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleDateString() : "Never"}
                      </td>
                      {canManage && (
                        <td className="px-2 py-3">
                          {!u.isSelf && (
                            <div className="flex items-center justify-end gap-2">
                              {u.status === "invited" && (
                                <button
                                  onClick={() => handleResend(u)}
                                  className="text-ledger-400 hover:text-ink-900 dark:hover:text-white"
                                  aria-label="Resend invite"
                                >
                                  <Mail className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {u.status !== "invited" && (
                                <button
                                  onClick={() => handleToggleStatus(u)}
                                  className="text-ledger-400 hover:text-ink-900 dark:hover:text-white"
                                  aria-label={u.status === "active" ? "Suspend" : "Reactivate"}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => handleRemove(u)}
                                className="text-ledger-400 hover:text-alert"
                                aria-label="Remove user"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-ledger-200 text-ledger-500 disabled:opacity-30 dark:border-ledger-700"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm text-ledger-500 dark:text-ledger-400">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-ledger-200 text-ledger-500 disabled:opacity-30 dark:border-ledger-700"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {roleBreakdown.length > 0 && (
            <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
              <h3 className="text-sm font-semibold text-ink-900 dark:text-white">Users by role</h3>
              <div className="mt-3 flex items-center gap-4">
                <div className="h-28 w-28 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={roleBreakdown} dataKey="count" nameKey="role" innerRadius={30} outerRadius={50} paddingAngle={2}>
                        {roleBreakdown.map((r) => (
                          <Cell key={r.role} fill={ROLE_COLORS[r.role]} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="flex-1 space-y-1.5">
                  {roleBreakdown.map((r) => (
                    <li key={r.role} className="flex items-center gap-2 text-xs">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: ROLE_COLORS[r.role] }} />
                      <span className="flex-1 truncate text-ledger-600 dark:text-ledger-300">{ROLE_LABELS[r.role]}</span>
                      <span className="figure text-ledger-400">{r.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {branchBreakdown.length > 0 && (
            <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
              <h3 className="text-sm font-semibold text-ink-900 dark:text-white">Users by branch</h3>
              <ul className="mt-3 space-y-2.5">
                {branchBreakdown.map((b) => (
                  <li key={b.name}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ledger-600 dark:text-ledger-300">{b.name}</span>
                      <span className="text-ledger-400">
                        {b.count} ({b.pct}%)
                      </span>
                    </div>
                    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-ledger-100 dark:bg-white/[0.06]">
                      <div className="h-full bg-signal" style={{ width: `${b.pct}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-card border border-ledger-100 bg-signal-soft/40 p-5 shadow-card dark:border-ledger-700">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink-900 dark:text-white">
              <Sparkles className="h-3.5 w-3.5 text-signal" /> Insights
            </h3>
            <ul className="mt-3 space-y-2">
              {insights.map((text, i) => (
                <li key={i} className="text-xs text-ledger-600 dark:text-ledger-300">
                  {text}
                </li>
              ))}
              {insights.length === 0 && <p className="text-xs text-ledger-400">Nothing unusual to report.</p>}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}