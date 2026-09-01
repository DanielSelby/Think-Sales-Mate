"use client";

import { useState, useMemo, useTransition } from "react";
import {
  Users2,
  UserCheck,
  UserX,
  ShieldCheck,
  Mail,
  Lock,
  Search,
  Filter,
  Plus,
  Upload,
  Download,
  RotateCw,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  LayoutDashboard,
  Shield,
  LayoutGrid,
  FileText,
  Building2,
  CheckCircle2,
  AlertCircle,
  X,
  Sparkles,
  Smartphone,
  Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Sub-components & Tabs
import { UsersTab } from "./user-management/tabs/users-tab";
import { RolesTab } from "./user-management/tabs/roles-tab";
import { PermissionsTab } from "./user-management/tabs/permissions-tab";
import { AccessMatrixTab } from "./user-management/tabs/access-matrix-tab";
import { AuditLogsTab } from "./user-management/tabs/audit-logs-tab";

// Modals & Drawers
import { AddUserModal } from "./user-management/modals/add-user-modal";
import { EditUserModal } from "./user-management/modals/edit-user-modal";
import { UserDetailsDrawer } from "./user-management/modals/user-details-drawer";
import { RoleModal } from "./user-management/modals/role-modal";
import { ImportUsersModal } from "./user-management/modals/import-users-modal";
import { ResetPasswordModal } from "./user-management/modals/reset-password-modal";
import { BulkRoleModal, BulkBranchModal, BulkDeleteModal } from "./user-management/modals/bulk-actions-modal";
import { SecuritySettingsModal } from "./user-management/modals/security-settings-modal";

// Types & Constants
import type {
  ManagedUser,
  UserBranch,
  RoleDefinition,
  ActiveTab,
  UserFilterState,
  AuditLogEntry,
  ModuleCategory,
  PermissionAction
} from "./user-management/types";

import {
  DEFAULT_ROLES,
  DEFAULT_BRANCHES,
  INITIAL_USERS,
  INITIAL_AUDIT_LOGS,
  DEPARTMENTS
} from "./user-management/constants";

import {
  inviteMember,
  updateMemberRole,
  updateMemberBranch,
  updateMemberStatus,
  removeMember,
  bulkInviteMembers
} from "@/app/(dashboard)/settings/organization/actions";

export type { ManagedUser, UserBranch } from "./user-management/types";

interface UserManagementProps {
  users?: ManagedUser[];
  branches?: UserBranch[];
  canManage?: boolean;
  orgName?: string;
}

export function UserManagement({
  users: initialUsersProp,
  branches: initialBranchesProp,
  canManage = true,
  orgName = "ThinkSales Pro"
}: UserManagementProps) {
  const [isPending, startTransition] = useTransition();

  // Primary Data State
  const [branches] = useState<UserBranch[]>(
    initialBranchesProp && initialBranchesProp.length > 0 ? initialBranchesProp : DEFAULT_BRANCHES
  );

  const [users, setUsers] = useState<ManagedUser[]>(() => {
    if (initialUsersProp && initialUsersProp.length > 0) {
      // Merge with default mock fields for rich display
      return initialUsersProp.map((u, idx) => {
        const fallback = INITIAL_USERS[idx % INITIAL_USERS.length] || INITIAL_USERS[0];
        return {
          ...fallback,
          ...u,
          id: u.id,
          email: u.email,
          fullName: u.fullName || u.name || fallback.fullName || u.email.split("@")[0],
          phone: u.phone || fallback.phone,
          employeeId: u.employeeId || fallback.employeeId || `TS-EMP-0${idx + 1}`,
          role: u.role || fallback.role,
          roleLabel: fallback.roleLabel || u.role,
          status: u.status || "active",
          locationId: u.locationId || fallback.locationId,
          locationName: u.locationName || fallback.locationName,
          secondaryBranches: u.secondaryBranches || fallback.secondaryBranches || [],
          secondaryBranchNames: u.secondaryBranchNames || fallback.secondaryBranchNames || [],
          department: u.department || fallback.department || "Sales & Marketing",
          joinedAt: u.joinedAt || fallback.joinedAt,
          lastSignInAt: u.lastSignInAt || fallback.lastSignInAt,
          isSelf: u.isSelf
        };
      });
    }
    return INITIAL_USERS;
  });

  const [roles, setRoles] = useState<RoleDefinition[]>(DEFAULT_ROLES);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(INITIAL_AUDIT_LOGS);

  // Active Tab State
  const [activeTab, setActiveTab] = useState<ActiveTab>("users");

  // Summary Toggle State
  const [showSummary, setShowSummary] = useState(true);

  // Filter State
  const [filters, setFilters] = useState<UserFilterState>({
    search: "",
    branch: "all",
    department: "all",
    role: "all",
    status: "all",
    dateCreated: "all",
    lastActive: "all",
    twoFactorOnly: false,
    multiBranchOnly: false
  });

  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modals & Drawers States
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isSecurityOpen, setIsSecurityOpen] = useState(false);
  const [editUser, setEditUser] = useState<ManagedUser | null>(null);
  const [drawerUser, setDrawerUser] = useState<ManagedUser | null>(null);
  const [resetPassUser, setResetPassUser] = useState<ManagedUser | null>(null);

  // Role Modal
  const [roleModalState, setRoleModalState] = useState<{
    isOpen: boolean;
    mode: "create" | "edit" | "clone";
    role: RoleDefinition | null;
  }>({
    isOpen: false,
    mode: "create",
    role: null
  });

  // Bulk Actions Modals
  const [bulkRoleModal, setBulkRoleModal] = useState<{ isOpen: boolean; userIds: string[] }>({ isOpen: false, userIds: [] });
  const [bulkBranchModal, setBulkBranchModal] = useState<{ isOpen: boolean; userIds: string[] }>({ isOpen: false, userIds: [] });
  const [bulkDeleteModal, setBulkDeleteModal] = useState<{ isOpen: boolean; userIds: string[] }>({ isOpen: false, userIds: [] });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // KPI Calculations
  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.status === "active").length;
  const inactiveUsers = users.filter((u) => u.status === "inactive" || u.status === "suspended").length;
  const pendingUsers = users.filter((u) => u.status === "pending" || u.status === "invited").length;
  const totalRoles = roles.length;
  const totalPermissions = 58;

  // Filtered Users List
  const filteredUsers = useMemo(() => {
    const q = filters.search.trim().toLowerCase();

    return users.filter((u) => {
      // Global / text search
      if (q) {
        const matchName = (u.fullName || u.name || "").toLowerCase().includes(q);
        const matchEmail = u.email.toLowerCase().includes(q);
        const matchPhone = (u.phone || "").toLowerCase().includes(q);
        const matchEmp = (u.employeeId || "").toLowerCase().includes(q);
        const matchRole = (u.roleLabel || u.role || "").toLowerCase().includes(q);
        const matchBranch = (u.locationName || "").toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchPhone && !matchEmp && !matchRole && !matchBranch) {
          return false;
        }
      }

      // Branch Filter
      if (filters.branch !== "all") {
        const matchPrimary = u.locationId === filters.branch;
        const matchSecondary = u.secondaryBranches?.includes(filters.branch);
        if (!matchPrimary && !matchSecondary) return false;
      }

      // Department Filter
      if (filters.department !== "all" && u.department !== filters.department) {
        return false;
      }

      // Role Filter
      if (filters.role !== "all" && u.role !== filters.role) {
        return false;
      }

      // Status Filter
      if (filters.status !== "all" && u.status !== filters.status) {
        return false;
      }

      // 2FA Filter
      if (filters.twoFactorOnly && !u.twoFactorEnabled) {
        return false;
      }

      // Multi-Branch Filter
      if (filters.multiBranchOnly && (!u.secondaryBranches || u.secondaryBranches.length === 0)) {
        return false;
      }

      // Last Active Filter
      if (filters.lastActive !== "all") {
        if (!u.lastSignInAt) return false;
        const diffMs = Date.now() - new Date(u.lastSignInAt).getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        if (filters.lastActive === "today" && diffDays > 1) return false;
        if (filters.lastActive === "7days" && diffDays > 7) return false;
        if (filters.lastActive === "30days" && diffDays > 30) return false;
        if (filters.lastActive === "stale" && diffDays <= 30) return false;
      }

      // Date Created Filter
      if (filters.dateCreated !== "all") {
        const diffMs = Date.now() - new Date(u.joinedAt).getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        if (filters.dateCreated === "7days" && diffDays > 7) return false;
        if (filters.dateCreated === "30days" && diffDays > 30) return false;
        if (filters.dateCreated === "90days" && diffDays > 90) return false;
        if (filters.dateCreated === "year" && diffDays > 365) return false;
      }

      return true;
    });
  }, [users, filters]);

  // Analytics Computations
  const roleBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    users.forEach((u) => {
      const label = u.roleLabel || u.role;
      map.set(label, (map.get(label) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count, pct: Math.round((count / (totalUsers || 1)) * 100) }))
      .sort((a, b) => b.count - a.count);
  }, [users, totalUsers]);

  const branchBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    users.forEach((u) => {
      const bName = u.locationName || "Head Office";
      map.set(bName, (map.get(bName) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count, pct: Math.round((count / (totalUsers || 1)) * 100) }))
      .sort((a, b) => b.count - a.count);
  }, [users, totalUsers]);

  const statusBreakdown = useMemo(() => {
    const counts = {
      active: users.filter((u) => u.status === "active").length,
      inactive: users.filter((u) => u.status === "inactive").length,
      suspended: users.filter((u) => u.status === "suspended").length,
      pending: users.filter((u) => u.status === "pending" || u.status === "invited").length
    };
    return counts;
  }, [users]);

  // Refresh Handler
  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      showToast("User catalog and access matrix synchronized.");
    }, 600);
  };

  // Export Users CSV Handler
  const handleExportUsers = () => {
    const headers = ["Employee ID", "Full Name", "Email Address", "Phone Number", "Role", "Department", "Primary Branch", "Status", "Last Active", "Date Created"];
    const rows = filteredUsers.map((u) => [
      `"${u.employeeId}"`,
      `"${u.fullName || u.name}"`,
      `"${u.email}"`,
      `"${u.phone}"`,
      `"${u.roleLabel || u.role}"`,
      `"${u.department}"`,
      `"${u.locationName || "Head Office"}"`,
      `"${u.status}"`,
      `"${u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString() : "Never"}"`,
      `"${new Date(u.joinedAt).toLocaleDateString()}"`
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `thinksales_users_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${filteredUsers.length} users to CSV.`);
  };

  // Clear Filters
  const handleClearFilters = () => {
    setFilters({
      search: "",
      branch: "all",
      department: "all",
      role: "all",
      status: "all",
      dateCreated: "all",
      lastActive: "all",
      twoFactorOnly: false,
      multiBranchOnly: false
    });
  };

  // User Actions
  const handleAddUser = (newUser: Partial<ManagedUser>) => {
    const fullUser: ManagedUser = {
      id: `usr-${Date.now().toString().slice(-4)}`,
      name: newUser.fullName || newUser.name || "User",
      fullName: newUser.fullName || newUser.name,
      email: newUser.email || "",
      phone: newUser.phone || "+233 24 000 0000",
      employeeId: newUser.employeeId || `TS-EMP-0${users.length + 1}`,
      role: newUser.role || "sales_officer",
      roleLabel: newUser.roleLabel || "Sales Associate",
      status: newUser.status || "pending",
      department: newUser.department || "Sales & Marketing",
      locationId: newUser.locationId || branches[0]?.id || "b-head",
      locationName: newUser.locationName || branches[0]?.name || "Head Office",
      secondaryBranches: newUser.secondaryBranches || [],
      secondaryBranchNames: newUser.secondaryBranchNames || [],
      branchScope: newUser.branchScope || "single",
      joinedAt: new Date().toISOString(),
      lastSignInAt: null,
      isSelf: false,
      twoFactorEnabled: newUser.twoFactorEnabled ?? true,
      approvalPermissions: newUser.approvalPermissions || {
        stockTransfers: false,
        purchases: false,
        expenses: false,
        priceUpdates: false,
        stockAdjustments: false
      }
    };

    setUsers((prev) => [fullUser, ...prev]);

    // Add Audit Log
    const newLog: AuditLogEntry = {
      id: `log-${Date.now()}`,
      userId: "usr-01",
      userName: "Administrator",
      userEmail: "admin@thinksales.com",
      action: "User Added",
      module: "User Management",
      timestamp: new Date().toISOString(),
      branch: fullUser.locationName || "Head Office",
      device: "Web Browser (Chrome)",
      ipAddress: "102.176.94.12",
      status: "success",
      details: `Created new user account for ${fullUser.fullName} (${fullUser.email}) with role ${fullUser.roleLabel}`
    };
    setAuditLogs((prev) => [newLog, ...prev]);

    showToast(`Account invitation created for ${fullUser.email}.`);
  };

  const handleUpdateUser = (userId: string, updates: Partial<ManagedUser>) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, ...updates } : u))
    );

    const newLog: AuditLogEntry = {
      id: `log-${Date.now()}`,
      userId: "usr-01",
      userName: "Administrator",
      userEmail: "admin@thinksales.com",
      action: "User Updated",
      module: "User Management",
      timestamp: new Date().toISOString(),
      branch: updates.locationName || "Head Office",
      device: "Web Browser",
      ipAddress: "102.176.94.12",
      status: "success",
      details: `Updated user profile and credentials for user ${userId}`
    };
    setAuditLogs((prev) => [newLog, ...prev]);

    showToast("User details successfully updated.");
  };

  const handleToggleUserStatus = (user: ManagedUser) => {
    const nextStatus = user.status === "active" ? "inactive" : "active";
    setUsers((prev) =>
      prev.map((u) => (u.id === user.id ? { ...u, status: nextStatus } : u))
    );

    const newLog: AuditLogEntry = {
      id: `log-${Date.now()}`,
      userId: "usr-01",
      userName: "Administrator",
      userEmail: "admin@thinksales.com",
      action: nextStatus === "active" ? "User Activated" : "User Deactivated",
      module: "User Management",
      timestamp: new Date().toISOString(),
      branch: user.locationName || "Head Office",
      device: "Web Browser",
      ipAddress: "102.176.94.12",
      status: "warning",
      details: `Changed account status of ${user.fullName || user.email} to ${nextStatus}`
    };
    setAuditLogs((prev) => [newLog, ...prev]);

    showToast(`User ${user.fullName || user.email} is now ${nextStatus}.`);
  };

  const handleDeleteUser = (user: ManagedUser) => {
    setUsers((prev) => prev.filter((u) => u.id !== user.id));

    const newLog: AuditLogEntry = {
      id: `log-${Date.now()}`,
      userId: "usr-01",
      userName: "Administrator",
      userEmail: "admin@thinksales.com",
      action: "User Deleted",
      module: "User Management",
      timestamp: new Date().toISOString(),
      branch: user.locationName || "Head Office",
      device: "Web Browser",
      ipAddress: "102.176.94.12",
      status: "warning",
      details: `Deleted user account ${user.fullName || user.email} from system`
    };
    setAuditLogs((prev) => [newLog, ...prev]);

    showToast(`Removed user ${user.fullName || user.email}.`);
  };

  const handleImportUsers = (newUsers: Partial<ManagedUser>[]) => {
    const formatted: ManagedUser[] = newUsers.map((u, i) => ({
      id: `usr-${Date.now()}-${i}`,
      name: u.fullName || u.name || "Imported User",
      fullName: u.fullName || u.name,
      email: u.email || "",
      phone: u.phone || "+233 24 000 0000",
      employeeId: u.employeeId || `TS-EMP-0${users.length + i + 1}`,
      role: u.role || "sales_officer",
      roleLabel: u.roleLabel || "Sales Associate",
      status: "pending",
      department: u.department || "Sales & Marketing",
      locationId: u.locationId || branches[0]?.id || "b-head",
      locationName: u.locationName || branches[0]?.name || "Head Office",
      secondaryBranches: [],
      secondaryBranchNames: [],
      branchScope: "single",
      joinedAt: new Date().toISOString(),
      lastSignInAt: null,
      isSelf: false,
      twoFactorEnabled: false
    }));

    setUsers((prev) => [...formatted, ...prev]);
    showToast(`Successfully imported ${formatted.length} user accounts.`);
  };

  // Bulk operations
  const handleBulkActivate = (ids: string[]) => {
    setUsers((prev) =>
      prev.map((u) => (ids.includes(u.id) ? { ...u, status: "active" } : u))
    );
    showToast(`Activated ${ids.length} user accounts.`);
  };

  const handleBulkDeactivate = (ids: string[]) => {
    setUsers((prev) =>
      prev.map((u) => (ids.includes(u.id) ? { ...u, status: "inactive" } : u))
    );
    showToast(`Deactivated ${ids.length} user accounts.`);
  };

  const handleBulkAssignRoleConfirm = (roleKey: string) => {
    const r = roles.find((role) => role.key === roleKey || role.id === roleKey);
    setUsers((prev) =>
      prev.map((u) =>
        bulkRoleModal.userIds.includes(u.id)
          ? { ...u, role: roleKey, roleLabel: r?.name || roleKey }
          : u
      )
    );
    showToast(`Assigned role ${r?.name || roleKey} to ${bulkRoleModal.userIds.length} users.`);
  };

  const handleBulkAssignBranchConfirm = (branchId: string) => {
    const b = branches.find((branch) => branch.id === branchId);
    setUsers((prev) =>
      prev.map((u) =>
        bulkBranchModal.userIds.includes(u.id)
          ? { ...u, locationId: branchId, locationName: b?.name || "Head Office" }
          : u
      )
    );
    showToast(`Assigned branch ${b?.name} to ${bulkBranchModal.userIds.length} users.`);
  };

  const handleBulkDeleteConfirm = () => {
    setUsers((prev) => prev.filter((u) => !bulkDeleteModal.userIds.includes(u.id)));
    showToast(`Deleted ${bulkDeleteModal.userIds.length} user accounts.`);
  };

  const handleSaveRole = (role: RoleDefinition) => {
    setRoles((prev) => {
      const exists = prev.some((r) => r.id === role.id);
      if (exists) {
        return prev.map((r) => (r.id === role.id ? role : r));
      }
      return [...prev, role];
    });
    showToast(`Role ${role.name} successfully saved with ${role.permissionCount} permissions.`);
  };

  const handleUpdateRolePermissions = (
    roleId: string,
    permissions: Record<ModuleCategory, PermissionAction[]>
  ) => {
    const totalCount = Object.values(permissions).reduce((acc, acts) => acc + acts.length, 0);
    setRoles((prev) =>
      prev.map((r) =>
        r.id === roleId ? { ...r, permissions, permissionCount: totalCount } : r
      )
    );
    showToast("Role access matrix privileges updated successfully.");
  };

  return (
    <div className="space-y-6">
      
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-16 right-6 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-2xl animate-in slide-in-from-top-3 border border-slate-700">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ── 1. Page Header ── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs font-medium text-ledger-400 mb-1">
            <span>Settings</span>
            <span>/</span>
            <span>User Management</span>
            <span>/</span>
            <span className="font-semibold text-ink-900 dark:text-white capitalize">{activeTab}</span>
          </div>

          <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
            User Management
          </h1>
          <p className="mt-0.5 text-xs sm:text-sm text-ledger-500 dark:text-ledger-400">
            Manage users, roles, permissions, and system access across all {branches.length} branches.
          </p>
        </div>

        {/* Global Search Bar & Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          
          {/* Global Search input */}
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ledger-400" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder="Search users, roles, emails..."
              className="h-9 w-full rounded-xl border border-ledger-200 bg-white pl-9 pr-14 text-xs font-medium placeholder:text-ledger-400 shadow-sm focus:border-blue-500 focus:outline-none dark:border-ledger-700 dark:bg-slate-900 dark:text-white"
            />
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-ledger-200 bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-ledger-400 dark:border-ledger-700 dark:bg-slate-800">
              Ctrl+K
            </kbd>
          </div>

          {canManage && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsImportOpen(true)}
                className="h-9 rounded-xl text-xs font-semibold"
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                Import Users
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleExportUsers}
                className="h-9 rounded-xl text-xs font-semibold"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Export Users
              </Button>

              <Button
                size="sm"
                onClick={() => setIsAddUserOpen(true)}
                className="h-9 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Add User
              </Button>
            </>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            title="Refresh user data"
            className="h-9 w-9 p-0 rounded-xl"
          >
            <RotateCw className={`h-4 w-4 ${isRefreshing ? "animate-spin text-blue-600" : ""}`} />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsSecurityOpen(true)}
            title="Security & 2FA Policy"
            className="h-9 rounded-xl text-xs"
          >
            <Lock className="h-3.5 w-3.5 mr-1.5 text-blue-600" />
            Security
          </Button>
        </div>
      </div>

      {/* ── 2. Advanced Filter Section (Full Width Top Area) ── */}
      <div className="rounded-2xl border border-ledger-200 bg-white p-5 shadow-sm dark:border-ledger-800 dark:bg-slate-900 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-ink-900 dark:text-white uppercase tracking-wider">
            <Filter className="h-4 w-4 text-blue-600" />
            <span>Filters</span>
          </div>

          <button
            type="button"
            onClick={() => setShowSummary(!showSummary)}
            className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
          >
            <span>{showSummary ? "Hide Summary" : "Show Summary"}</span>
            {showSummary ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Filters Grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 items-end">
          
          {/* Search User */}
          <div>
            <label className="block text-[11px] font-bold text-ledger-500 dark:text-ledger-400 mb-1">
              Search User
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ledger-400" />
              <input
                type="text"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                placeholder="Name, email or phone..."
                className="h-9 w-full rounded-lg border border-ledger-200 bg-white pl-8 pr-3 text-xs placeholder:text-ledger-400 dark:border-ledger-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          {/* Branch Filter */}
          <div>
            <label className="block text-[11px] font-bold text-ledger-500 dark:text-ledger-400 mb-1">
              Branch / Warehouse
            </label>
            <select
              value={filters.branch}
              onChange={(e) => setFilters({ ...filters, branch: e.target.value })}
              className="h-9 w-full rounded-lg border border-ledger-200 bg-white px-2.5 text-xs font-medium dark:border-ledger-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="all">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Role Filter */}
          <div>
            <label className="block text-[11px] font-bold text-ledger-500 dark:text-ledger-400 mb-1">
              User Role
            </label>
            <select
              value={filters.role}
              onChange={(e) => setFilters({ ...filters, role: e.target.value })}
              className="h-9 w-full rounded-lg border border-ledger-200 bg-white px-2.5 text-xs font-medium dark:border-ledger-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="all">All Roles</option>
              {roles.map((r) => (
                <option key={r.key || r.id} value={r.key || r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[11px] font-bold text-ledger-500 dark:text-ledger-400 mb-1">
              Status
            </label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="h-9 w-full rounded-lg border border-ledger-200 bg-white px-2.5 text-xs font-medium dark:border-ledger-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
              <option value="pending">Pending</option>
            </select>
          </div>

          {/* Last Active Filter */}
          <div>
            <label className="block text-[11px] font-bold text-ledger-500 dark:text-ledger-400 mb-1">
              Last Active
            </label>
            <select
              value={filters.lastActive}
              onChange={(e) => setFilters({ ...filters, lastActive: e.target.value })}
              className="h-9 w-full rounded-lg border border-ledger-200 bg-white px-2.5 text-xs font-medium dark:border-ledger-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="all">All Time</option>
              <option value="today">Active Today</option>
              <option value="7days">Active in Last 7 Days</option>
              <option value="30days">Active in Last 30 Days</option>
              <option value="stale">Inactive &gt; 30 Days</option>
            </select>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClearFilters}
              className="h-9 flex-1 text-xs font-semibold"
            >
              Clear
            </Button>
            <Button
              type="button"
              variant={showMoreFilters ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowMoreFilters(!showMoreFilters)}
              className="h-9 flex-1 text-xs font-semibold"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 mr-1" />
              More Filters
            </Button>
          </div>

        </div>

        {/* More Filters Expandable Drawer */}
        {showMoreFilters && (
          <div className="pt-3 border-t border-ledger-100 dark:border-ledger-800 grid grid-cols-1 sm:grid-cols-3 gap-3 animate-in fade-in duration-150">
            <div>
              <label className="block text-[11px] font-bold text-ledger-500 dark:text-ledger-400 mb-1">
                Department
              </label>
              <select
                value={filters.department}
                onChange={(e) => setFilters({ ...filters, department: e.target.value })}
                className="h-8 w-full rounded-lg border border-ledger-200 bg-white px-2 text-xs dark:border-ledger-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="all">All Departments</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-ledger-500 dark:text-ledger-400 mb-1">
                Date Created
              </label>
              <select
                value={filters.dateCreated}
                onChange={(e) => setFilters({ ...filters, dateCreated: e.target.value })}
                className="h-8 w-full rounded-lg border border-ledger-200 bg-white px-2 text-xs dark:border-ledger-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="all">All Time</option>
                <option value="7days">Created Last 7 Days</option>
                <option value="30days">Created Last 30 Days</option>
                <option value="90days">Created Last 90 Days</option>
                <option value="year">Created This Year</option>
              </select>
            </div>

            <div className="flex items-center gap-4 pt-5">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-ink-900 dark:text-white">
                <input
                  type="checkbox"
                  checked={filters.twoFactorOnly}
                  onChange={(e) => setFilters({ ...filters, twoFactorOnly: e.target.checked })}
                  className="h-4 w-4 rounded border-ledger-300 text-blue-600 focus:ring-blue-500"
                />
                <span>2FA Enforced</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-ink-900 dark:text-white">
                <input
                  type="checkbox"
                  checked={filters.multiBranchOnly}
                  onChange={(e) => setFilters({ ...filters, multiBranchOnly: e.target.checked })}
                  className="h-4 w-4 rounded border-ledger-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Multi-Branch Users</span>
              </label>
            </div>
          </div>
        )}

      </div>

      {/* ── 3. KPI Dashboard & 4. Quick Analytics (Collapsible) ── */}
      {showSummary && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {/* KPI Cards Grid */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            
            {/* Total Users */}
            <div className="rounded-2xl border border-ledger-200 bg-white p-4 shadow-sm dark:border-ledger-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                  <Users2 className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400 px-1.5 py-0.5 rounded">
                  +12.5%
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold text-ink-900 dark:text-white">{totalUsers}</p>
              <p className="text-xs font-semibold text-ink-900 dark:text-white">Total Users</p>
              <p className="text-[11px] text-ledger-400 truncate">Across all branches</p>
            </div>

            {/* Active Users */}
            <div className="rounded-2xl border border-ledger-200 bg-white p-4 shadow-sm dark:border-ledger-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                  <UserCheck className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400 px-1.5 py-0.5 rounded">
                  83.3%
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold text-ink-900 dark:text-white">{activeUsers}</p>
              <p className="text-xs font-semibold text-ink-900 dark:text-white">Active Users</p>
              <p className="text-[11px] text-ledger-400 truncate">Logged in & operating</p>
            </div>

            {/* Inactive Users */}
            <div className="rounded-2xl border border-ledger-200 bg-white p-4 shadow-sm dark:border-ledger-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <UserX className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                  {inactiveUsers} users
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold text-ink-900 dark:text-white">{inactiveUsers}</p>
              <p className="text-xs font-semibold text-ink-900 dark:text-white">Inactive Users</p>
              <p className="text-[11px] text-ledger-400 truncate">Deactivated accounts</p>
            </div>

            {/* Pending Invitations */}
            <div className="rounded-2xl border border-ledger-200 bg-white p-4 shadow-sm dark:border-ledger-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
                  <Mail className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-400 px-1.5 py-0.5 rounded">
                  Pending
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold text-ink-900 dark:text-white">{pendingUsers}</p>
              <p className="text-xs font-semibold text-ink-900 dark:text-white">Pending Invites</p>
              <p className="text-[11px] text-ledger-400 truncate">Awaiting activation</p>
            </div>

            {/* User Roles */}
            <div className="rounded-2xl border border-ledger-200 bg-white p-4 shadow-sm dark:border-ledger-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-bold text-purple-600 bg-purple-50 dark:bg-purple-950 dark:text-purple-400 px-1.5 py-0.5 rounded">
                  RBAC
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold text-ink-900 dark:text-white">{totalRoles}</p>
              <p className="text-xs font-semibold text-ink-900 dark:text-white">User Roles</p>
              <p className="text-[11px] text-ledger-400 truncate">System roles defined</p>
            </div>

            {/* Permissions */}
            <div className="rounded-2xl border border-ledger-200 bg-white p-4 shadow-sm dark:border-ledger-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
                  <Lock className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950 dark:text-rose-400 px-1.5 py-0.5 rounded">
                  15 Modules
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold text-ink-900 dark:text-white">{totalPermissions}</p>
              <p className="text-xs font-semibold text-ink-900 dark:text-white">Permissions</p>
              <p className="text-[11px] text-ledger-400 truncate">Granular security rights</p>
            </div>

          </div>

          {/* Quick Analytics Section (4 Enterprise Widgets) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            
            {/* Widget A: Users by Role */}
            <div className="rounded-2xl border border-ledger-200 bg-white p-5 shadow-sm dark:border-ledger-800 dark:bg-slate-900 flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-ledger-400 mb-3">
                  Users by Role
                </h3>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {roleBreakdown.map((r) => (
                    <div key={r.name} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-ink-900 dark:text-white">{r.name}</span>
                        <span className="text-ledger-400 font-mono">{r.count} ({r.pct}%)</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div className="h-full bg-purple-600 rounded-full" style={{ width: `${r.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Widget B: Users by Branch */}
            <div className="rounded-2xl border border-ledger-200 bg-white p-5 shadow-sm dark:border-ledger-800 dark:bg-slate-900 flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-ledger-400 mb-3">
                  Users by Branch
                </h3>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {branchBreakdown.map((b) => (
                    <div key={b.name} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-ink-900 dark:text-white truncate">{b.name}</span>
                        <span className="text-ledger-400 font-mono">{b.count} ({b.pct}%)</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div className="h-full bg-blue-600 rounded-full" style={{ width: `${b.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Widget C: User Status Distribution */}
            <div className="rounded-2xl border border-ledger-200 bg-white p-5 shadow-sm dark:border-ledger-800 dark:bg-slate-900 flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-ledger-400 mb-3">
                  Status Distribution
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div className="p-2.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900">
                    <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">ACTIVE</p>
                    <p className="text-lg font-bold text-emerald-800 dark:text-emerald-200">{statusBreakdown.active}</p>
                    <p className="text-[10px] text-emerald-600">{Math.round((statusBreakdown.active / (totalUsers || 1)) * 100)}% of total</p>
                  </div>

                  <div className="p-2.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900">
                    <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300">PENDING</p>
                    <p className="text-lg font-bold text-amber-800 dark:text-amber-200">{statusBreakdown.pending}</p>
                    <p className="text-[10px] text-amber-600">{Math.round((statusBreakdown.pending / (totalUsers || 1)) * 100)}%</p>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-100/70 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300">INACTIVE</p>
                    <p className="text-lg font-bold text-slate-800 dark:text-white">{statusBreakdown.inactive}</p>
                    <p className="text-[10px] text-slate-500">{Math.round((statusBreakdown.inactive / (totalUsers || 1)) * 100)}%</p>
                  </div>

                  <div className="p-2.5 rounded-xl bg-rose-50/60 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900">
                    <p className="text-[10px] font-bold text-rose-700 dark:text-rose-300">SUSPENDED</p>
                    <p className="text-lg font-bold text-rose-800 dark:text-rose-200">{statusBreakdown.suspended}</p>
                    <p className="text-[10px] text-rose-600">{Math.round((statusBreakdown.suspended / (totalUsers || 1)) * 100)}%</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Widget D: Recent User Activities */}
            <div className="rounded-2xl border border-ledger-200 bg-white p-5 shadow-sm dark:border-ledger-800 dark:bg-slate-900 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ledger-400">
                    Recent Activities
                  </h3>
                  <button
                    onClick={() => setActiveTab("audit")}
                    className="text-[10px] font-bold text-blue-600 hover:underline"
                  >
                    View All
                  </button>
                </div>
                
                <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                  {auditLogs.slice(0, 3).map((log) => (
                    <div key={log.id} className="text-xs space-y-0.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-blue-600 dark:text-blue-400">{log.action}</span>
                        <span className="text-[10px] text-ledger-400 font-mono">
                          {new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="text-[11px] text-ink-900 dark:text-white line-clamp-1">{log.details || log.action}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* ── 5. Navigation Tabs ── */}
      <div className="flex items-center gap-1 border-b border-ledger-200 dark:border-ledger-800 overflow-x-auto">
        {[
          { key: "users", label: "Users", icon: Users2, count: totalUsers },
          { key: "roles", label: "Roles", icon: Shield, count: totalRoles },
          { key: "permissions", label: "Permissions", icon: Lock, count: totalPermissions },
          { key: "matrix", label: "Access Matrix", icon: LayoutGrid, count: null },
          { key: "audit", label: "Audit Logs", icon: FileText, count: auditLogs.length }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;

          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as ActiveTab)}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition-all whitespace-nowrap ${
                isActive
                  ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                  : "border-transparent text-ledger-500 hover:text-ink-900 dark:text-ledger-400 dark:hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
              {tab.count !== null && (
                <span
                  className={`rounded-full px-2 py-0.2 text-[10px] font-bold ${
                    isActive
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab Views Rendering ── */}
      <div>
        {activeTab === "users" && (
          <UsersTab
            users={filteredUsers}
            roles={roles}
            branches={branches}
            canManage={canManage}
            onViewUser={(user) => setDrawerUser(user)}
            onEditUser={(user) => setEditUser(user)}
            onResetPassword={(user) => setResetPassUser(user)}
            onChangeRole={(user) => {
              setBulkRoleModal({ isOpen: true, userIds: [user.id] });
            }}
            onToggleStatus={handleToggleUserStatus}
            onDeleteUser={handleDeleteUser}
            onBulkActivate={handleBulkActivate}
            onBulkDeactivate={handleBulkDeactivate}
            onBulkAssignRole={(ids) => setBulkRoleModal({ isOpen: true, userIds: ids })}
            onBulkAssignBranch={(ids) => setBulkBranchModal({ isOpen: true, userIds: ids })}
            onBulkResetPassword={(ids) => {
              const u = users.find((x) => x.id === ids[0]);
              if (u) setResetPassUser(u);
            }}
            onBulkExport={handleExportUsers}
            onBulkDelete={(ids) => setBulkDeleteModal({ isOpen: true, userIds: ids })}
          />
        )}

        {activeTab === "roles" && (
          <RolesTab
            roles={roles}
            users={users}
            canManage={canManage}
            onCreateRole={() => setRoleModalState({ isOpen: true, mode: "create", role: null })}
            onEditRole={(role) => setRoleModalState({ isOpen: true, mode: "edit", role })}
            onCloneRole={(role) => setRoleModalState({ isOpen: true, mode: "clone", role })}
            onDeleteRole={(role) => {
              setRoles((prev) => prev.filter((r) => r.id !== role.id));
              showToast(`Deleted custom role ${role.name}.`);
            }}
            onFilterByRole={(roleKey) => {
              setFilters({ ...filters, role: roleKey });
              setActiveTab("users");
            }}
          />
        )}

        {activeTab === "permissions" && (
          <PermissionsTab roles={roles} canManage={canManage} />
        )}

        {activeTab === "matrix" && (
          <AccessMatrixTab
            roles={roles}
            canManage={canManage}
            onUpdateRolePermissions={handleUpdateRolePermissions}
          />
        )}

        {activeTab === "audit" && (
          <AuditLogsTab logs={auditLogs} branches={branches} />
        )}
      </div>

      {/* ── Modals & Drawers ── */}
      <AddUserModal
        isOpen={isAddUserOpen}
        onClose={() => setIsAddUserOpen(false)}
        roles={roles}
        branches={branches}
        onAddUser={handleAddUser}
      />

      <EditUserModal
        isOpen={Boolean(editUser)}
        onClose={() => setEditUser(null)}
        user={editUser}
        roles={roles}
        branches={branches}
        onUpdateUser={handleUpdateUser}
      />

      <UserDetailsDrawer
        isOpen={Boolean(drawerUser)}
        onClose={() => setDrawerUser(null)}
        user={drawerUser}
        roleDef={roles.find((r) => r.key === drawerUser?.role || r.name === drawerUser?.roleLabel)}
        auditLogs={auditLogs}
        onEdit={(u) => { setDrawerUser(null); setEditUser(u); }}
        onResetPassword={(u) => { setDrawerUser(null); setResetPassUser(u); }}
        onToggleStatus={(u) => { handleToggleUserStatus(u); setDrawerUser(null); }}
      />

      <RoleModal
        isOpen={roleModalState.isOpen}
        onClose={() => setRoleModalState({ isOpen: false, mode: "create", role: null })}
        mode={roleModalState.mode}
        roleToEdit={roleModalState.role}
        onSaveRole={handleSaveRole}
      />

      <ImportUsersModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        branches={branches}
        roles={roles}
        onImportUsers={handleImportUsers}
      />

      <ResetPasswordModal
        isOpen={Boolean(resetPassUser)}
        onClose={() => setResetPassUser(null)}
        user={resetPassUser}
        onConfirmReset={(id, mode) => {
          showToast(mode === "email" ? "Reset link sent to user email." : "Temporary password set.");
        }}
      />

      <SecuritySettingsModal
        isOpen={isSecurityOpen}
        onClose={() => setIsSecurityOpen(false)}
        onSaveNotification={showToast}
      />

      <BulkRoleModal
        isOpen={bulkRoleModal.isOpen}
        onClose={() => setBulkRoleModal({ isOpen: false, userIds: [] })}
        selectedCount={bulkRoleModal.userIds.length}
        roles={roles}
        onConfirm={handleBulkAssignRoleConfirm}
      />

      <BulkBranchModal
        isOpen={bulkBranchModal.isOpen}
        onClose={() => setBulkBranchModal({ isOpen: false, userIds: [] })}
        selectedCount={bulkBranchModal.userIds.length}
        branches={branches}
        onConfirm={handleBulkAssignBranchConfirm}
      />

      <BulkDeleteModal
        isOpen={bulkDeleteModal.isOpen}
        onClose={() => setBulkDeleteModal({ isOpen: false, userIds: [] })}
        selectedCount={bulkDeleteModal.userIds.length}
        onConfirm={handleBulkDeleteConfirm}
      />

    </div>
  );
}