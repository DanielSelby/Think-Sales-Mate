"use client";

import { useState, useMemo, useEffect } from "react";
import {
  MoreVertical,
  Eye,
  Pencil,
  KeyRound,
  Shield,
  UserCheck,
  UserX,
  Trash2,
  Building2,
  Phone,
  Mail,
  ChevronLeft,
  ChevronRight,
  Download,
  CheckSquare,
  Square,
  Sparkles,
  Lock,
  Layers,
  ArrowUpDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ManagedUser, RoleDefinition, UserBranch, UserStatus } from "../types";

interface UsersTabProps {
  users: ManagedUser[];
  roles: RoleDefinition[];
  branches: UserBranch[];
  canManage: boolean;
  onViewUser: (user: ManagedUser) => void;
  onEditUser: (user: ManagedUser) => void;
  onResetPassword: (user: ManagedUser) => void;
  onChangeRole: (user: ManagedUser) => void;
  onToggleStatus: (user: ManagedUser) => void;
  onDeleteUser: (user: ManagedUser) => void;
  onBulkActivate: (userIds: string[]) => void;
  onBulkDeactivate: (userIds: string[]) => void;
  onBulkAssignRole: (userIds: string[]) => void;
  onBulkAssignBranch: (userIds: string[]) => void;
  onBulkResetPassword: (userIds: string[]) => void;
  onBulkExport: (userIds: string[]) => void;
  onBulkDelete: (userIds: string[]) => void;
}

export function UsersTab({
  users,
  roles,
  branches,
  canManage,
  onViewUser,
  onEditUser,
  onResetPassword,
  onChangeRole,
  onToggleStatus,
  onDeleteUser,
  onBulkActivate,
  onBulkDeactivate,
  onBulkAssignRole,
  onBulkAssignBranch,
  onBulkResetPassword,
  onBulkExport,
  onBulkDelete
}: UsersTabProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState<"name" | "role" | "branch" | "status" | "lastActive" | "dateCreated">("name");
  const [sortAsc, setSortAsc] = useState(true);

  // Close row menu on document click
  useEffect(() => {
    const handleClick = () => setActiveMenuId(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      let valA: any = "";
      let valB: any = "";

      if (sortField === "name") {
        valA = a.fullName || a.name || a.email;
        valB = b.fullName || b.name || b.email;
      } else if (sortField === "role") {
        valA = a.roleLabel || a.role;
        valB = b.roleLabel || b.role;
      } else if (sortField === "branch") {
        valA = a.locationName || "";
        valB = b.locationName || "";
      } else if (sortField === "status") {
        valA = a.status;
        valB = b.status;
      } else if (sortField === "lastActive") {
        valA = a.lastSignInAt ? new Date(a.lastSignInAt).getTime() : 0;
        valB = b.lastSignInAt ? new Date(b.lastSignInAt).getTime() : 0;
      } else if (sortField === "dateCreated") {
        valA = new Date(a.joinedAt).getTime();
        valB = new Date(b.joinedAt).getTime();
      }

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [users, sortField, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(sortedUsers.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = sortedUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const isAllSelected = pageItems.length > 0 && pageItems.every((u) => selectedIds.includes(u.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds([]);
    } else {
      const pageIds = pageItems.map((u) => u.id);
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const toggleSelectRow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const getRoleBadge = (roleKey: string, roleLabel?: string) => {
    const key = roleKey.toLowerCase();
    let colorClass = "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
    if (key.includes("admin")) {
      colorClass = "bg-purple-100 text-purple-700 border border-purple-200 dark:bg-purple-950/70 dark:text-purple-300 dark:border-purple-800";
    } else if (key.includes("manager")) {
      colorClass = "bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-950/70 dark:text-blue-300 dark:border-blue-800";
    } else if (key.includes("sales")) {
      colorClass = "bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800";
    } else if (key.includes("cashier")) {
      colorClass = "bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800";
    } else if (key.includes("inventory")) {
      colorClass = "bg-cyan-100 text-cyan-700 border border-cyan-200 dark:bg-cyan-950/70 dark:text-cyan-300 dark:border-cyan-800";
    } else if (key.includes("hr")) {
      colorClass = "bg-indigo-100 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/70 dark:text-indigo-300 dark:border-indigo-800";
    } else if (key.includes("accountant")) {
      colorClass = "bg-teal-100 text-teal-700 border border-teal-200 dark:bg-teal-950/70 dark:text-teal-300 dark:border-teal-800";
    }

    return (
      <span className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold ${colorClass}`}>
        {roleLabel || roleKey}
      </span>
    );
  };

  const getStatusBadge = (status: UserStatus | string) => {
    if (status === "active") {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Active
        </span>
      );
    }
    if (status === "pending" || status === "invited") {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          Pending
        </span>
      );
    }
    if (status === "suspended") {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          Suspended
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
        <span className="h-2 w-2 rounded-full bg-slate-400" />
        Inactive
      </span>
    );
  };

  const formatLastActive = (dateString: string | null) => {
    if (!dateString) return "Never";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  return (
    <div className="space-y-4">
      
      {/* Table Container */}
      <div className="relative rounded-2xl border border-ledger-200 bg-white shadow-sm dark:border-ledger-800 dark:bg-slate-900 overflow-hidden">
        
        {/* Table Head Info Bar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-ledger-100 bg-slate-50/50 dark:border-ledger-800 dark:bg-slate-800/40">
          <p className="text-xs font-semibold text-ledger-500 dark:text-ledger-400">
            Showing <span className="font-bold text-ink-900 dark:text-white">{(currentPage - 1) * pageSize + 1}</span> to{" "}
            <span className="font-bold text-ink-900 dark:text-white">{Math.min(currentPage * pageSize, sortedUsers.length)}</span> of{" "}
            <span className="font-bold text-ink-900 dark:text-white">{sortedUsers.length}</span> users
          </p>

          {selectedIds.length > 0 && (
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
              {selectedIds.length} row(s) selected
            </span>
          )}
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-ledger-100 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-ledger-400 dark:border-ledger-800 dark:bg-slate-800/60">
              <tr>
                <th className="w-10 px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-ledger-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="px-4 py-3 cursor-pointer select-none" onClick={() => handleSort("name")}>
                  <div className="flex items-center gap-1.5">
                    <span>User</span>
                    <ArrowUpDown className="h-3 w-3 opacity-50" />
                  </div>
                </th>
                <th className="px-3 py-3 cursor-pointer select-none" onClick={() => handleSort("role")}>
                  <div className="flex items-center gap-1.5">
                    <span>Role</span>
                    <ArrowUpDown className="h-3 w-3 opacity-50" />
                  </div>
                </th>
                <th className="px-3 py-3 cursor-pointer select-none" onClick={() => handleSort("branch")}>
                  <div className="flex items-center gap-1.5">
                    <span>Branch / Warehouse</span>
                    <ArrowUpDown className="h-3 w-3 opacity-50" />
                  </div>
                </th>
                <th className="px-3 py-3 cursor-pointer select-none" onClick={() => handleSort("status")}>
                  <div className="flex items-center gap-1.5">
                    <span>Status</span>
                    <ArrowUpDown className="h-3 w-3 opacity-50" />
                  </div>
                </th>
                <th className="px-3 py-3 cursor-pointer select-none" onClick={() => handleSort("lastActive")}>
                  <div className="flex items-center gap-1.5">
                    <span>Last Active</span>
                    <ArrowUpDown className="h-3 w-3 opacity-50" />
                  </div>
                </th>
                <th className="w-12 px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-ledger-100 dark:divide-ledger-800">
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-ledger-400">
                    No users found matching your active filter criteria.
                  </td>
                </tr>
              ) : (
                pageItems.map((u) => {
                  const isSelected = selectedIds.includes(u.id);
                  const initials = (u.fullName || u.name || u.email)
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();

                  return (
                    <tr
                      key={u.id}
                      onClick={() => onViewUser(u)}
                      className={`group cursor-pointer transition-colors hover:bg-blue-50/40 dark:hover:bg-slate-800/50 ${
                        isSelected ? "bg-blue-50/60 dark:bg-blue-950/30" : ""
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => toggleSelectRow(u.id, e as any)}
                          className="h-4 w-4 rounded border-ledger-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>

                      {/* User Avatar + Name + Email */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            {initials}
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-white dark:border-slate-900 ${
                                u.status === "active" ? "bg-emerald-500" : u.status === "pending" ? "bg-amber-500" : "bg-red-500"
                              }`}
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-ink-900 dark:text-white truncate">
                                {u.fullName || u.name}
                              </p>
                              {u.isSelf && (
                                <span className="rounded-full bg-blue-100 px-1.5 py-0.2 text-[10px] font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                                  You
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-ledger-400 truncate">{u.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td className="px-3 py-3">
                        {getRoleBadge(String(u.role), u.roleLabel)}
                      </td>

                      {/* Branch & Multi-branch indicator */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-ink-900 dark:text-white truncate">
                            {u.locationName || "Head Office"}
                          </span>
                          {u.secondaryBranches && u.secondaryBranches.length > 0 && (
                            <span
                              title={`Also assigned to: ${u.secondaryBranchNames?.join(", ")}`}
                              className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                            >
                              +{u.secondaryBranches.length}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-3 py-3">
                        {getStatusBadge(u.status)}
                      </td>

                      {/* Last Active */}
                      <td className="px-3 py-3 text-ledger-500 dark:text-ledger-400 font-mono text-[11px]">
                        {formatLastActive(u.lastSignInAt)}
                      </td>

                      {/* Actions Menu */}
                      <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="relative inline-block text-left">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(activeMenuId === u.id ? null : u.id);
                            }}
                            className="rounded-lg p-1 text-ledger-400 hover:bg-slate-100 hover:text-ink-900 dark:hover:bg-slate-800 dark:hover:text-white transition-colors"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>

                          {activeMenuId === u.id && (
                            <div className="absolute right-0 top-8 z-30 w-44 rounded-xl border border-ledger-200 bg-white p-1 shadow-xl dark:border-ledger-700 dark:bg-slate-900 animate-in fade-in zoom-in-95 duration-100">
                              <button
                                onClick={() => { setActiveMenuId(null); onViewUser(u); }}
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-left font-medium text-ink-900 hover:bg-slate-100 dark:text-white dark:hover:bg-slate-800"
                              >
                                <Eye className="h-3.5 w-3.5 text-blue-600" /> View Profile
                              </button>

                              {canManage && (
                                <>
                                  <button
                                    onClick={() => { setActiveMenuId(null); onEditUser(u); }}
                                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-left font-medium text-ink-900 hover:bg-slate-100 dark:text-white dark:hover:bg-slate-800"
                                  >
                                    <Pencil className="h-3.5 w-3.5 text-ledger-500" /> Edit Details
                                  </button>

                                  <button
                                    onClick={() => { setActiveMenuId(null); onResetPassword(u); }}
                                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-left font-medium text-ink-900 hover:bg-slate-100 dark:text-white dark:hover:bg-slate-800"
                                  >
                                    <KeyRound className="h-3.5 w-3.5 text-amber-600" /> Reset Password
                                  </button>

                                  <button
                                    onClick={() => { setActiveMenuId(null); onChangeRole(u); }}
                                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-left font-medium text-ink-900 hover:bg-slate-100 dark:text-white dark:hover:bg-slate-800"
                                  >
                                    <Shield className="h-3.5 w-3.5 text-purple-600" /> Change Role
                                  </button>

                                  <button
                                    onClick={() => { setActiveMenuId(null); onToggleStatus(u); }}
                                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-left font-medium text-ink-900 hover:bg-slate-100 dark:text-white dark:hover:bg-slate-800"
                                  >
                                    {u.status === "active" ? (
                                      <>
                                        <UserX className="h-3.5 w-3.5 text-red-500" /> Deactivate
                                      </>
                                    ) : (
                                      <>
                                        <UserCheck className="h-3.5 w-3.5 text-emerald-600" /> Activate
                                      </>
                                    )}
                                  </button>

                                  {!u.isSelf && (
                                    <>
                                      <div className="my-1 border-t border-ledger-100 dark:border-ledger-800" />
                                      <button
                                        onClick={() => { setActiveMenuId(null); onDeleteUser(u); }}
                                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-left font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" /> Delete User
                                      </button>
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer with Rows per Page & Pagination */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t border-ledger-100 bg-white dark:border-ledger-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <p className="text-xs text-ledger-400">
              Showing <span className="font-bold text-ink-900 dark:text-white">{(currentPage - 1) * pageSize + 1}</span> to{" "}
              <span className="font-bold text-ink-900 dark:text-white">{Math.min(currentPage * pageSize, sortedUsers.length)}</span> of{" "}
              <span className="font-bold text-ink-900 dark:text-white">{sortedUsers.length}</span> users
            </p>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-ledger-400">Rows:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="h-8 rounded-lg border border-ledger-200 bg-white px-2 text-xs font-semibold dark:border-ledger-700 dark:bg-slate-800 dark:text-white"
              >
                <option value={5}>5 per page</option>
                <option value={10}>10 per page</option>
                <option value={20}>20 per page</option>
                <option value={50}>50 per page</option>
              </select>
            </div>
          </div>

          {/* Page Buttons */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-bold transition-all ${
                  currentPage === p
                    ? "bg-blue-600 text-white shadow-sm"
                    : "border border-ledger-200 text-ledger-600 hover:bg-slate-50 dark:border-ledger-700 dark:text-ledger-300 dark:hover:bg-slate-800"
                }`}
              >
                {p}
              </button>
            ))}

            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

      </div>

      {/* Floating Bulk Actions Bar */}
      {selectedIds.length > 0 && canManage && (
        <div className="sticky bottom-6 z-40 flex items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-900/95 p-3 px-5 text-white shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-5 duration-200 dark:border-blue-800">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500 font-bold text-xs">
              {selectedIds.length}
            </span>
            <span className="text-xs font-semibold">
              {selectedIds.length} users selected
            </span>
            <button
              onClick={() => setSelectedIds([])}
              className="text-xs text-blue-200 hover:text-white underline ml-1"
            >
              Deselect
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onBulkActivate(selectedIds)}
              className="h-8 text-xs bg-emerald-600 text-white hover:bg-emerald-700 border-none"
            >
              <UserCheck className="h-3.5 w-3.5 mr-1" /> Activate
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => onBulkDeactivate(selectedIds)}
              className="h-8 text-xs bg-slate-700 text-white hover:bg-slate-600 border-none"
            >
              <UserX className="h-3.5 w-3.5 mr-1" /> Deactivate
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => onBulkAssignRole(selectedIds)}
              className="h-8 text-xs bg-purple-600 text-white hover:bg-purple-700 border-none"
            >
              <Shield className="h-3.5 w-3.5 mr-1" /> Assign Role
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => onBulkAssignBranch(selectedIds)}
              className="h-8 text-xs bg-blue-600 text-white hover:bg-blue-700 border-none"
            >
              <Building2 className="h-3.5 w-3.5 mr-1" /> Assign Branch
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => onBulkResetPassword(selectedIds)}
              className="h-8 text-xs bg-amber-600 text-white hover:bg-amber-700 border-none"
            >
              <KeyRound className="h-3.5 w-3.5 mr-1" /> Reset Password
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => onBulkExport(selectedIds)}
              className="h-8 text-xs bg-slate-800 text-white hover:bg-slate-700 border-none"
            >
              <Download className="h-3.5 w-3.5 mr-1" /> Export
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => onBulkDelete(selectedIds)}
              className="h-8 text-xs bg-red-600 text-white hover:bg-red-700 border-none"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
            </Button>
          </div>
        </div>
      )}

    </div>
  );
}
