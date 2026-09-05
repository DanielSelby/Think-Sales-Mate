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
  AlertTriangle,
  X,
  Sparkles,
  Smartphone,
  Check,
  Laptop,
  Activity,
  UserPlus,
  KeyRound,
  Printer,
  FileSpreadsheet
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Sub-components & Tabs
import { UsersTab } from "./user-management/tabs/users-tab";
import { RolesTab } from "./user-management/tabs/roles-tab";
import { PermissionsTab } from "./user-management/tabs/permissions-tab";
import { AccessMatrixTab } from "./user-management/tabs/access-matrix-tab";
import { ApprovalMatrixTab } from "./user-management/tabs/approval-matrix-tab";
import { BranchAccessTab } from "./user-management/tabs/branch-access-tab";
import { AuditLogsTab } from "./user-management/tabs/audit-logs-tab";
import { LoginSessionsTab } from "./user-management/tabs/login-sessions-tab";

// Modals & Drawers
import { AddUserModal } from "./user-management/modals/add-user-modal";
import { EditUserModal } from "./user-management/modals/edit-user-modal";
import { UserDetailsDrawer } from "./user-management/modals/user-details-drawer";
import { RoleModal } from "./user-management/modals/role-modal";
import { ImportUsersModal } from "./user-management/modals/import-users-modal";
import { ResetPasswordModal } from "./user-management/modals/reset-password-modal";
import { BulkRoleModal, BulkBranchModal, BulkDeleteModal } from "./user-management/modals/bulk-actions-modal";
import { SecuritySettingsModal } from "./user-management/modals/security-settings-modal";
import { InviteUserModal } from "./user-management/modals/invite-user-modal";
import { CreateStaffAccountModal } from "./user-management/modals/create-staff-account-modal";

// Types & Constants
import type {
  ManagedUser,
  UserBranch,
  RoleDefinition,
  ActiveTab,
  UserFilterState,
  AuditLogEntry,
  InvitationRecord,
  LoginSession,
  ModuleCategory,
  PermissionAction
} from "./user-management/types";

import {
  DEFAULT_ROLES,
  DEFAULT_BRANCHES,
  INITIAL_USERS,
  INITIAL_AUDIT_LOGS,
  INITIAL_INVITATIONS,
  DEPARTMENTS
} from "./user-management/constants";

import {
  inviteMember,
  updateMemberRole,
  updateMemberBranch,
  updateMemberStatus,
  removeMember,
  bulkInviteMembers,
  resendInvite,
  updateMemberAccessScope
} from "@/app/(dashboard)/settings/organization/actions";
import { createStaffAccount, saveRoleTheme, resetMemberPassword } from "@/app/(dashboard)/settings/organization/actions";
import { THEMES, type ThemeKey } from "@/store/useAppStore";

export type { ManagedUser, UserBranch } from "./user-management/types";

interface UserManagementProps {
  users?: ManagedUser[];
  branches?: UserBranch[];
  canManage?: boolean;
  orgName?: string;
  roleThemes?: Record<string, string>;
  canManageThemes?: boolean;
}

export function UserManagement({
  users: initialUsersProp,
  branches: initialBranchesProp,
  canManage = true,
  orgName = "ThinkSales Pro"
  , roleThemes = {}, canManageThemes = false
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
          roleLabel: u.roleLabel || fallback.roleLabel || u.role,
          status: u.status || "active",
          locationId: u.locationId || fallback.locationId,
          locationName: u.locationName || fallback.locationName,
          secondaryBranches: u.secondaryBranches || fallback.secondaryBranches,
          secondaryBranchNames: u.secondaryBranchNames || fallback.secondaryBranchNames,
          branchScope: u.branchScope || fallback.branchScope || "single",
          canViewOtherTransactions: u.canViewOtherTransactions ?? fallback.canViewOtherTransactions ?? true,
          canCheckCrossBranchStock: u.canCheckCrossBranchStock ?? fallback.canCheckCrossBranchStock ?? false,
          approvalPermissions: u.approvalPermissions || fallback.approvalPermissions,
          accessPermissions: u.accessPermissions || fallback.accessPermissions,
          performance: fallback.performance,
          attentionReason: fallback.attentionReason
        };
      });
    }
    return INITIAL_USERS;
  });

  const [roles, setRoles] = useState<RoleDefinition[]>(DEFAULT_ROLES);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(INITIAL_AUDIT_LOGS);
  const [invitations, setInvitations] = useState<InvitationRecord[]>(INITIAL_INVITATIONS);

  // Active Tab & Filters
  const [activeTab, setActiveTab] = useState<ActiveTab>("users");
  const [showSummary, setShowSummary] = useState(true);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Global & Card Filter State
  const [filters, setFilters] = useState<UserFilterState>({
    search: "",
    branch: "all",
    department: "all",
    role: "all",
    status: "all",
    dateCreated: "all",
    lastActive: "all",
    twoFactorOnly: false,
    multiBranchOnly: false,
    attentionOnly: false
  });

  // Modals & Drawers States
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isCreateStaffOpen, setIsCreateStaffOpen] = useState(false);
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<ManagedUser | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedUserForDrawer, setSelectedUserForDrawer] = useState<ManagedUser | null>(null);

  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [roleModalMode, setRoleModalMode] = useState<"create" | "edit" | "clone">("create");
  const [selectedRoleForModal, setSelectedRoleForModal] = useState<RoleDefinition | null>(null);

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false);
  const [selectedUserForReset, setSelectedUserForReset] = useState<ManagedUser | null>(null);

  const [isBulkRoleOpen, setIsBulkRoleOpen] = useState(false);
  const [isBulkBranchOpen, setIsBulkBranchOpen] = useState(false);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([]);

  const [isSecuritySettingsOpen, setIsSecuritySettingsOpen] = useState(false);

  // Toast Notification Helper
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Add Log Entry Helper
  const recordAudit = (
    action: string,
    mod: string,
    details: string,
    opts?: { recordId?: string; oldValue?: string; newValue?: string }
  ) => {
    const newEntry: AuditLogEntry = {
      id: `log-${Date.now()}`,
      logId: `ACT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      timestamp: new Date().toISOString(),
      userId: "usr-01",
      userName: "John Doe (You)",
      userEmail: "john.doe@thinksales.com",
      role: "Administrator",
      branch: "Head Office",
      module: mod,
      page: `/settings/users`,
      action,
      recordType: mod,
      recordId: opts?.recordId,
      oldValue: opts?.oldValue,
      newValue: opts?.newValue,
      device: "Admin Workstation",
      ipAddress: "102.176.94.12",
      status: "success",
      details
    };
    setAuditLogs((prev) => [newEntry, ...prev]);
  };

  // Refresh handler
  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      showToast("User management data refreshed successfully");
    }, 600);
  };

  // Clear filters
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
      multiBranchOnly: false,
      attentionOnly: false
    });
  };

  // 1-Click Permission Template Handler
  const handleApplyTemplate = (templateKey: string) => {
    const roleDef = roles.find((r) => r.key === templateKey || r.id.includes(templateKey));
    if (roleDef) {
      setSelectedRoleForModal(roleDef);
      setRoleModalMode("edit");
      setIsRoleModalOpen(true);
      showToast(`Loaded "${roleDef.name}" permission template`);
    }
  };

  // Filtered Users List
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      // Attention filter
      if (filters.attentionOnly && !u.attentionReason) {
        return false;
      }

      // Search
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const nameMatch = (u.fullName || u.name || "").toLowerCase().includes(q);
        const emailMatch = u.email.toLowerCase().includes(q);
        const roleMatch = (u.roleLabel || u.role || "").toLowerCase().includes(q);
        const branchMatch = (u.locationName || "").toLowerCase().includes(q);
        const phoneMatch = (u.phone || "").toLowerCase().includes(q);
        const empMatch = (u.employeeId || "").toLowerCase().includes(q);
        const usernameMatch = (u.username || "").toLowerCase().includes(q);
        if (!nameMatch && !emailMatch && !roleMatch && !branchMatch && !phoneMatch && !empMatch && !usernameMatch) {
          return false;
        }
      }

      // Branch
      if (filters.branch !== "all" && u.locationId !== filters.branch && u.locationName !== filters.branch) {
        return false;
      }

      // Department
      if (filters.department !== "all" && u.department !== filters.department) {
        return false;
      }

      // Role
      if (filters.role !== "all" && u.role !== filters.role && u.roleLabel !== filters.role) {
        return false;
      }

      // Status
      if (filters.status !== "all" && u.status !== filters.status) {
        return false;
      }

      // 2FA
      if (filters.twoFactorOnly && !u.twoFactorEnabled) {
        return false;
      }

      // Multi-branch
      if (filters.multiBranchOnly && (!u.secondaryBranches || u.secondaryBranches.length === 0)) {
        return false;
      }

      return true;
    });
  }, [users, filters]);

  // KPI Metrics
  const totalUsersCount = users.length;
  const activeUsersCount = users.filter((u) => u.status === "active").length;
  const inactiveUsersCount = users.filter((u) => u.status === "inactive" || u.status === "suspended").length;
  const pendingInvitationsCount = users.filter((u) => u.status === "pending").length + invitations.filter((i) => i.status === "pending").length;
  const rolesCount = roles.length;
  const permissionsCount = 58;

  // Users Requiring Attention Breakdown
  const attentionUsers = useMemo(() => {
    return users.filter((u) => u.attentionReason || u.status === "suspended" || u.status === "pending");
  }, [users]);

  // Analytics Helpers
  const roleDistribution = useMemo(() => {
    const map = new Map<string, number>();
    users.forEach((u) => {
      const label = u.roleLabel || u.role;
      map.set(label, (map.get(label) || 0) + 1);
    });
    return Array.from(map.entries()).map(([label, count]) => ({
      label,
      count,
      percent: Math.round((count / (users.length || 1)) * 100)
    }));
  }, [users]);

  const branchDistribution = useMemo(() => {
    const map = new Map<string, number>();
    users.forEach((u) => {
      const name = u.locationName || "Head Office";
      map.set(name, (map.get(name) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, count]) => ({
      name,
      count,
      percent: Math.round((count / (users.length || 1)) * 100)
    }));
  }, [users]);

  // User Actions Handlers
  const handleCreateUser = (newUser: Partial<ManagedUser>) => {
    const user: ManagedUser = {
      id: `usr-${Date.now()}`,
      userId: `u-${Date.now()}`,
      name: newUser.name || newUser.fullName || "New User",
      fullName: newUser.fullName || newUser.name || "New User",
      email: newUser.email || "",
      phone: newUser.phone || "+233 24 000 0000",
      employeeId: newUser.employeeId || `TS-EMP-0${users.length + 1}`,
      role: newUser.role || "sales_officer",
      roleLabel: newUser.roleLabel || "Sales Associate",
      status: newUser.status || "active",
      department: newUser.department || "Sales & Marketing",
      locationId: newUser.locationId || "b-head",
      locationName: newUser.locationName || "Head Office",
      secondaryBranches: newUser.secondaryBranches || [],
      secondaryBranchNames: newUser.secondaryBranchNames || [],
      lastSignInAt: null,
      joinedAt: new Date().toISOString(),
      isSelf: false,
      twoFactorEnabled: newUser.twoFactorEnabled || false,
      approvalPermissions: newUser.approvalPermissions || {
        stockTransfers: false,
        purchases: false,
        expenses: false,
        priceUpdates: false,
        stockAdjustments: false,
        customerOrders: false
      }
    };

    setUsers((prev) => [user, ...prev]);
    recordAudit("User Created", "User Management", `Created user account for ${user.fullName} (${user.email})`, {
      recordId: user.id,
      newValue: `Role: ${user.roleLabel}, Branch: ${user.locationName}`
    });
    showToast(`User ${user.fullName} created successfully`);

    // Persist the member and send the invitation using the configured company email.
    startTransition(async () => {
      const formData = new FormData();
      formData.set("name", user.fullName || user.name);
      formData.set("email", user.email);
      formData.set("role", user.role);
      formData.set("location_id", user.locationId ?? "");
      formData.set("branch_scope", user.branchScope ?? "assigned");
      formData.set("secondary_location_ids", (user.secondaryBranches ?? []).join(","));
      formData.set("can_view_other_users_transactions", String(user.canViewOtherTransactions !== false));
      formData.set("can_check_cross_branch_stock", String(user.canCheckCrossBranchStock === true));
      const result = await inviteMember(formData);
      if (result && "error" in result) {
        setUsers((prev) => prev.filter((item) => item.id !== user.id));
        showToast(result.error ?? "Unable to create the user.");
        return;
      }
      if ("memberId" in result && result.memberId) {
        const persistedUser = { ...user, id: result.memberId };
        setUsers((prev) => prev.map((item) => item.id === user.id ? persistedUser : item));
        setSelectedUserForReset(persistedUser);
        setIsResetPasswordOpen(true);
      }
    });
  };

  const handleUpdateUser = (
  userId: string,
  updates: Partial<ManagedUser>
) => {
  const oldUser = users.find((u) => u.id === userId);

  const updatedUser = oldUser
    ? { ...oldUser, ...updates }
    : null;

  setUsers((prev) =>
    prev.map((u) =>
      u.id === userId
        ? { ...u, ...updates }
        : u
    )
  );

  if (updatedUser) {
    recordAudit(
      "User Updated",
      "User Management",
      `Updated profile & access settings for ${updatedUser.fullName}`,
      {
        recordId: updatedUser.id,
        oldValue: `Role: ${oldUser?.roleLabel}, Branch: ${oldUser?.locationName}`,
        newValue: `Role: ${updatedUser.roleLabel}, Branch: ${updatedUser.locationName}`
      }
    );

    showToast(`Updated ${updatedUser.fullName}'s profile`);

    startTransition(async () => {
      const result = await updateMemberAccessScope({
        memberId: userId,
        locationId: updates.locationId ?? oldUser?.locationId ?? null,
        secondaryLocationIds: updates.secondaryBranches ?? oldUser?.secondaryBranches ?? [],
        branchScope: updates.branchScope ?? oldUser?.branchScope ?? "single",
        canViewOtherTransactions: updates.canViewOtherTransactions ?? oldUser?.canViewOtherTransactions ?? true,
        canCheckCrossBranchStock: updates.canCheckCrossBranchStock ?? oldUser?.canCheckCrossBranchStock ?? false,
        role: updates.role ?? oldUser?.role,
        approvalPermissions: updates.approvalPermissions ?? oldUser?.approvalPermissions
      });
      if (result?.error) {
        showToast(`Failed to save access changes: ${result.error}`);
      }
    });
  }
};

  const handleToggleStatus = (user: ManagedUser) => {
    const nextStatus = user.status === "active" ? "inactive" : "active";
    const persistedStatus = nextStatus === "active" ? "active" : "suspended";
    setUsers((prev) =>
      prev.map((u) => (u.id === user.id ? { ...u, status: persistedStatus, attentionReason: null } : u))
    );
    recordAudit(
      nextStatus === "active" ? "User Activated" : "User Deactivated",
      "User Management",
      `Changed ${user.fullName}'s status from ${user.status} to ${nextStatus}`,
      { recordId: user.id, oldValue: user.status, newValue: nextStatus }
    );
    showToast(`User ${user.fullName} is now ${nextStatus}`);
    startTransition(async () => {
      const result = await updateMemberStatus(user.id, persistedStatus);
      if (result?.error) showToast(result.error);
    });
  };

  const handleDeleteUser = (user: ManagedUser) => {
    if (!confirm(`Are you sure you want to delete user ${user.fullName || user.email}?`)) return;
    setUsers((prev) => prev.filter((u) => u.id !== user.id));
    recordAudit("User Deleted", "User Management", `Deleted user account ${user.fullName} (${user.email})`, {
      recordId: user.id,
      oldValue: user.email,
      newValue: "Deleted"
    });
    showToast(`Deleted ${user.fullName}`);
  };

  // Send Invitation Handler
  const handleSendInvite = async (inviteData: { name: string; email: string; role: string; branchId: string }) => {
    const roleDef = roles.find((r) => r.key === inviteData.role || r.id === inviteData.role);
    const branchDef = branches.find((b) => b.id === inviteData.branchId);
    const formData = new FormData();
    formData.set("name", inviteData.name);
    formData.set("email", inviteData.email);
    formData.set("role", inviteData.role);
    formData.set("location_id", inviteData.branchId);
    const result = await inviteMember(formData);
    if ("error" in result && result.error) {
      showToast(result.error);
      return false;
    }

    const newInvite: InvitationRecord = {
      id: "memberId" in result && result.memberId ? result.memberId : `inv-${Date.now()}`,
      name: inviteData.name,
      email: inviteData.email,
      role: inviteData.role,
      roleLabel: roleDef?.name || "Staff",
      branchId: inviteData.branchId,
      branchName: branchDef?.name || "Head Office",
      invitedBy: "John Doe (You)",
      invitedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: "pending"
    };

    setInvitations((prev) => [newInvite, ...prev]);
    recordAudit("User Invited", "User Management", `Sent account invitation email to ${inviteData.email} as ${newInvite.roleLabel}`, {
      recordId: newInvite.id,
      newValue: `Role: ${newInvite.roleLabel}, Branch: ${newInvite.branchName}`
    });
    showToast(`Invitation sent to ${inviteData.email}`);
    return true;
  };

  const handleCreateStaffAccount = async (formData: FormData) => {
    const result = await createStaffAccount(formData);
    if (result.error) {
      showToast(result.error);
      return result;
    }

    const roleKey = String(formData.get("role") ?? "staff");
    const branchId = String(formData.get("location_id") ?? "");
    const roleDef = roles.find((item) => item.key === roleKey);
    const branchDef = branches.find((item) => item.id === branchId);
    const createdUser: ManagedUser = {
      id: result.memberId ?? `usr-${Date.now()}`,
      userId: result.userId,
      name: String(formData.get("full_name") ?? ""),
      fullName: String(formData.get("full_name") ?? ""),
      username: result.username ?? String(formData.get("username") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      employeeId: String(formData.get("employee_id") ?? ""),
      role: roleKey,
      roleLabel: roleDef?.name ?? roleKey,
      status: "active",
      department: String(formData.get("department") ?? ""),
      locationId: branchId || null,
      locationName: branchDef?.name ?? null,
      secondaryBranches: String(formData.get("secondary_location_ids") ?? "").split(",").filter(Boolean),
      secondaryBranchNames: [],
      branchScope: String(formData.get("branch_scope") ?? "assigned") as ManagedUser["branchScope"],
      lastSignInAt: null,
      joinedAt: new Date().toISOString(),
      isSelf: false,
      twoFactorEnabled: false
    };
    setUsers((previous) => [createdUser, ...previous]);
    recordAudit("Staff Account Created", "User Management", `Created staff account for ${createdUser.fullName} (${createdUser.username})`, {
      recordId: createdUser.id,
      newValue: `Role: ${createdUser.roleLabel}, Branch: ${createdUser.locationName ?? "Unassigned"}`
    });
    return result;
  };

  // Bulk Actions Handlers
  const handleBulkActivate = (userIds: string[]) => {
    setUsers((prev) =>
      prev.map((u) => (userIds.includes(u.id) ? { ...u, status: "active" as const, attentionReason: null } : u))
    );
    recordAudit("Bulk User Activated", "User Management", `Bulk activated ${userIds.length} user accounts.`);
    showToast(`Activated ${userIds.length} users`);
  };

  const handleBulkDeactivate = (userIds: string[]) => {
    setUsers((prev) =>
      prev.map((u) => (userIds.includes(u.id) ? { ...u, status: "inactive" as const } : u))
    );
    recordAudit("Bulk User Deactivated", "User Management", `Bulk deactivated ${userIds.length} user accounts.`);
    showToast(`Deactivated ${userIds.length} users`);
  };

  const handleBulkAssignRoleSubmit = (roleKey: string) => {
    const roleDef = roles.find((r) => r.key === roleKey || r.id === roleKey);
    setUsers((prev) =>
      prev.map((u) =>
        bulkSelectedIds.includes(u.id)
          ? { ...u, role: roleKey, roleLabel: roleDef?.name || roleKey }
          : u
      )
    );
    recordAudit("Bulk Role Assigned", "User Management", `Assigned role ${roleDef?.name} to ${bulkSelectedIds.length} users.`);
    showToast(`Assigned ${roleDef?.name} to ${bulkSelectedIds.length} users`);
    setIsBulkRoleOpen(false);
  };

  const handleBulkAssignBranchSubmit = (branchId: string) => {
    const branchDef = branches.find((b) => b.id === branchId);
    setUsers((prev) =>
      prev.map((u) =>
        bulkSelectedIds.includes(u.id)
          ? { ...u, locationId: branchId, locationName: branchDef?.name || "Head Office" }
          : u
      )
    );
    recordAudit("Bulk Branch Assigned", "User Management", `Assigned branch ${branchDef?.name} to ${bulkSelectedIds.length} users.`);
    showToast(`Assigned ${branchDef?.name} to ${bulkSelectedIds.length} users`);
    setIsBulkBranchOpen(false);
  };

  const handleBulkDeleteSubmit = () => {
    setUsers((prev) => prev.filter((u) => !bulkSelectedIds.includes(u.id)));
    recordAudit("Bulk User Deleted", "User Management", `Permanently deleted ${bulkSelectedIds.length} user accounts.`);
    showToast(`Deleted ${bulkSelectedIds.length} users`);
    setIsBulkDeleteOpen(false);
  };

  const handleExportUsersCsv = () => {
    const headers = ["Employee ID", "Full Name", "Email", "Phone", "Role", "Department", "Branch", "Status", "Joined Date", "Last Active"];
    const rows = filteredUsers.map((u) => [
      `"${u.employeeId}"`,
      `"${u.fullName || u.name}"`,
      `"${u.email}"`,
      `"${u.phone}"`,
      `"${u.roleLabel || u.role}"`,
      `"${u.department}"`,
      `"${u.locationName || ""}"`,
      `"${u.status}"`,
      `"${new Date(u.joinedAt).toLocaleDateString()}"`,
      `"${u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString() : "Never"}"`
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `thinksales_users_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    recordAudit("Users Exported", "User Management", `Exported ${filteredUsers.length} user records to CSV.`);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Toast Banner */}
      {toastMessage && (
        <div className="fixed top-16 right-6 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-2xl animate-in slide-in-from-top-3 border border-slate-700">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. Page Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs font-medium text-ledger-400 mb-1">
            <span>Settings</span>
            <span>/</span>
            <span>User Management</span>
            <span>/</span>
            <span className="font-semibold text-blue-600 dark:text-blue-400 capitalize">
              {activeTab === "audit" ? "Activity Logs" : activeTab.replace("_", " ")}
            </span>
          </div>

          <h1 className="text-xl font-bold tracking-tight text-ink-900 dark:text-white sm:text-2xl">
            User Management & Security Governance
          </h1>
          <p className="text-xs text-ledger-500 dark:text-ledger-400 mt-0.5">
            Manage enterprise users, granular RBAC permissions, branch access, transaction approvals, and audit trails
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <>
              <Button
                onClick={() => setIsAddUserOpen(true)}
                className="h-9 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm"
              >
                <Plus className="h-4 w-4 mr-1.5" /> Add User
              </Button>

              <Button
                onClick={() => setIsCreateStaffOpen(true)}
                variant="outline"
                className="h-9 border-emerald-200 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
              >
                <KeyRound className="mr-1.5 h-4 w-4" /> Create Staff Account
              </Button>

              <Button
                onClick={() => setIsInviteModalOpen(true)}
                variant="outline"
                className="h-9 text-xs font-semibold"
              >
                <UserPlus className="h-4 w-4 mr-1.5 text-blue-600" /> Invite User
              </Button>

              <Button
                onClick={() => setIsImportModalOpen(true)}
                variant="outline"
                className="h-9 text-xs font-semibold"
              >
                <Upload className="h-4 w-4 mr-1.5" /> Import
              </Button>
            </>
          )}

          <Button
            onClick={handleExportUsersCsv}
            variant="outline"
            className="h-9 text-xs font-semibold"
          >
            <Download className="h-4 w-4 mr-1.5" /> Export
          </Button>

          <Button
            onClick={() => setIsSecuritySettingsOpen(true)}
            variant="outline"
            className="h-9 text-xs font-semibold"
            title="Security Policies & 2FA"
          >
            <Lock className="h-4 w-4 mr-1.5 text-ledger-500" /> Security
          </Button>

          <Button
            onClick={handleRefresh}
            variant="outline"
            className="h-9 text-xs px-2.5"
            title="Refresh Data"
          >
            <RotateCw className={`h-4 w-4 ${isRefreshing ? "animate-spin text-blue-600" : ""}`} />
          </Button>
        </div>
      </div>

      {/* 2. Advanced Filters Card (Full Width Top Area) */}
      <div className="rounded-2xl border border-ledger-200 bg-white p-4 shadow-sm dark:border-ledger-800 dark:bg-slate-900 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-blue-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-ink-900 dark:text-white">
              Advanced Filter Matrix
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowSummary(!showSummary)}
            className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            <span>{showSummary ? "Hide Summary" : "Show Summary"}</span>
            {showSummary ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Filter Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ledger-400" />
            <Input
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder="Search user, username, role..."
              className="h-9 pl-8 text-xs bg-slate-50/50 dark:bg-slate-800/40"
            />
          </div>

          {/* Branch Filter */}
          <select
            value={filters.branch}
            onChange={(e) => setFilters({ ...filters, branch: e.target.value })}
            className="h-9 rounded-lg border border-ledger-200 bg-white px-2.5 text-xs font-semibold text-ink-900 dark:border-ledger-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="all">All Branches & Stores</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>

          {/* Department Filter */}
          <select
            value={filters.department}
            onChange={(e) => setFilters({ ...filters, department: e.target.value })}
            className="h-9 rounded-lg border border-ledger-200 bg-white px-2.5 text-xs font-semibold text-ink-900 dark:border-ledger-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="all">All Departments</option>
            {DEPARTMENTS.map((dept) => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>

          {/* Role Filter */}
          <select
            value={filters.role}
            onChange={(e) => setFilters({ ...filters, role: e.target.value })}
            className="h-9 rounded-lg border border-ledger-200 bg-white px-2.5 text-xs font-semibold text-ink-900 dark:border-ledger-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="all">All Roles</option>
            {roles.map((r) => (
              <option key={r.key} value={r.key}>{r.name}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="h-9 rounded-lg border border-ledger-200 bg-white px-2.5 text-xs font-semibold text-ink-900 dark:border-ledger-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
            <option value="pending">Pending Invitation</option>
          </select>

          {/* Actions */}
          <div className="flex items-center gap-1.5">
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
              More
            </Button>
          </div>
        </div>

        {/* More Filters Expandable */}
        {showMoreFilters && (
          <div className="pt-3 border-t border-ledger-100 dark:border-ledger-800 grid grid-cols-1 sm:grid-cols-3 gap-3 animate-in fade-in duration-150">
            <label className="flex items-center gap-2 text-xs font-semibold text-ink-900 dark:text-white cursor-pointer">
              <input
                type="checkbox"
                checked={filters.twoFactorOnly}
                onChange={(e) => setFilters({ ...filters, twoFactorOnly: e.target.checked })}
                className="h-4 w-4 rounded border-ledger-300 text-blue-600 focus:ring-blue-500"
              />
              <span>2FA Enforced Only</span>
            </label>

            <label className="flex items-center gap-2 text-xs font-semibold text-ink-900 dark:text-white cursor-pointer">
              <input
                type="checkbox"
                checked={filters.multiBranchOnly}
                onChange={(e) => setFilters({ ...filters, multiBranchOnly: e.target.checked })}
                className="h-4 w-4 rounded border-ledger-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Multi-Branch Users Only</span>
            </label>

            <label className="flex items-center gap-2 text-xs font-semibold text-red-600 dark:text-red-400 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.attentionOnly}
                onChange={(e) => setFilters({ ...filters, attentionOnly: e.target.checked })}
                className="h-4 w-4 rounded border-red-300 text-red-600 focus:ring-red-500"
              />
              <span>Users Requiring Attention Only</span>
            </label>
          </div>
        )}
      </div>

      {/* 3. Summary & KPI Dashboard Section */}
      {showSummary && (
        <div className="space-y-4 animate-in fade-in duration-200">
          
          {/* 6 KPI Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            
            {/* Total Users */}
            <div className="rounded-2xl border border-ledger-100 bg-white p-4 shadow-sm dark:border-ledger-800 dark:bg-slate-900">
              <div className="flex items-center justify-between text-ledger-400">
                <span className="text-[10px] font-bold uppercase tracking-wider">Total Users</span>
                <Users2 className="h-4 w-4 text-blue-600" />
              </div>
              <p className="mt-1.5 text-2xl font-bold text-ink-900 dark:text-white">{totalUsersCount}</p>
              <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">+12.5% vs last quarter</p>
            </div>

            {/* Active Users */}
            <div className="rounded-2xl border border-ledger-100 bg-white p-4 shadow-sm dark:border-ledger-800 dark:bg-slate-900">
              <div className="flex items-center justify-between text-ledger-400">
                <span className="text-[10px] font-bold uppercase tracking-wider">Active Users</span>
                <UserCheck className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="mt-1.5 text-2xl font-bold text-ink-900 dark:text-white">{activeUsersCount}</p>
              <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">83.3% active rate</p>
            </div>

            {/* Inactive Users */}
            <div className="rounded-2xl border border-ledger-100 bg-white p-4 shadow-sm dark:border-ledger-800 dark:bg-slate-900">
              <div className="flex items-center justify-between text-ledger-400">
                <span className="text-[10px] font-bold uppercase tracking-wider">Inactive Users</span>
                <UserX className="h-4 w-4 text-slate-500" />
              </div>
              <p className="mt-1.5 text-2xl font-bold text-ink-900 dark:text-white">{inactiveUsersCount}</p>
              <p className="text-[10px] text-ledger-400 mt-0.5">Deactivated accounts</p>
            </div>

            {/* Pending Invitations */}
            <div className="rounded-2xl border border-ledger-100 bg-white p-4 shadow-sm dark:border-ledger-800 dark:bg-slate-900">
              <div className="flex items-center justify-between text-ledger-400">
                <span className="text-[10px] font-bold uppercase tracking-wider">Pending Invites</span>
                <Mail className="h-4 w-4 text-amber-500" />
              </div>
              <p className="mt-1.5 text-2xl font-bold text-ink-900 dark:text-white">{pendingInvitationsCount}</p>
              <p className="text-[10px] text-amber-600 font-semibold mt-0.5">Awaiting activation</p>
            </div>

            {/* User Roles */}
            <div className="rounded-2xl border border-ledger-100 bg-white p-4 shadow-sm dark:border-ledger-800 dark:bg-slate-900">
              <div className="flex items-center justify-between text-ledger-400">
                <span className="text-[10px] font-bold uppercase tracking-wider">User Roles</span>
                <Shield className="h-4 w-4 text-purple-600" />
              </div>
              <p className="mt-1.5 text-2xl font-bold text-ink-900 dark:text-white">{rolesCount}</p>
              <p className="text-[10px] text-purple-600 font-semibold mt-0.5">System & custom</p>
            </div>

            {/* Total Permissions */}
            <div className="rounded-2xl border border-ledger-100 bg-white p-4 shadow-sm dark:border-ledger-800 dark:bg-slate-900">
              <div className="flex items-center justify-between text-ledger-400">
                <span className="text-[10px] font-bold uppercase tracking-wider">Permissions</span>
                <ShieldCheck className="h-4 w-4 text-cyan-600" />
              </div>
              <p className="mt-1.5 text-2xl font-bold text-ink-900 dark:text-white">{permissionsCount}</p>
              <p className="text-[10px] text-cyan-600 font-semibold mt-0.5">15 module categories</p>
            </div>

          </div>

          {/* Users Requiring Attention Widget */}
          {attentionUsers.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-amber-950 dark:text-amber-200 uppercase tracking-wider">
                    Users Requiring Administrator Attention ({attentionUsers.length})
                  </h3>
                  <p className="text-xs text-amber-900/80 dark:text-amber-300">
                    Accounts flagged for 30+ days inactivity, failed login lockouts, or pending invitations.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setFilters({ ...filters, attentionOnly: !filters.attentionOnly })}
                  className={`h-8 text-xs font-bold ${filters.attentionOnly ? "bg-amber-600 text-white" : "border-amber-300 dark:border-amber-800"}`}
                >
                  {filters.attentionOnly ? "Showing Flagged Users" : "Filter Attention Accounts"}
                </Button>
              </div>
            </div>
          )}

          {/* 4 Quick Analytics Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Users by Role */}
            <div className="rounded-2xl border border-ledger-100 bg-white p-4 shadow-sm dark:border-ledger-800 dark:bg-slate-900 space-y-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-ledger-400">Users by Role</span>
              <div className="space-y-1.5 text-xs">
                {roleDistribution.slice(0, 4).map((r) => (
                  <div key={r.label} className="space-y-0.5">
                    <div className="flex justify-between font-semibold text-ink-900 dark:text-white">
                      <span>{r.label}</span>
                      <span className="text-ledger-400 font-mono">{r.count}</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-600 rounded-full" style={{ width: `${r.percent}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Users by Branch */}
            <div className="rounded-2xl border border-ledger-100 bg-white p-4 shadow-sm dark:border-ledger-800 dark:bg-slate-900 space-y-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-ledger-400">Users by Branch</span>
              <div className="space-y-1.5 text-xs">
                {branchDistribution.slice(0, 4).map((b) => (
                  <div key={b.name} className="space-y-0.5">
                    <div className="flex justify-between font-semibold text-ink-900 dark:text-white">
                      <span>{b.name}</span>
                      <span className="text-ledger-400 font-mono">{b.count}</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-600 rounded-full" style={{ width: `${b.percent}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Status Distribution */}
            <div className="rounded-2xl border border-ledger-100 bg-white p-4 shadow-sm dark:border-ledger-800 dark:bg-slate-900 space-y-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-ledger-400">Status Distribution</span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900">
                  <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase">Active</span>
                  <p className="text-base font-bold text-emerald-900 dark:text-emerald-200 mt-0.5">{activeUsersCount}</p>
                </div>
                <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-ledger-100 dark:border-ledger-800">
                  <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase">Inactive</span>
                  <p className="text-base font-bold text-ink-900 dark:text-white mt-0.5">{inactiveUsersCount}</p>
                </div>
              </div>
            </div>

            {/* Recent Activities Feed */}
            <div className="rounded-2xl border border-ledger-100 bg-white p-4 shadow-sm dark:border-ledger-800 dark:bg-slate-900 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ledger-400">Recent Audit Activities</span>
                <button
                  type="button"
                  onClick={() => setActiveTab("audit")}
                  className="text-[10px] font-bold text-blue-600 hover:text-blue-700"
                >
                  View All
                </button>
              </div>
              <div className="space-y-1.5 text-xs">
                {auditLogs.slice(0, 3).map((log) => (
                  <div key={log.id} className="p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/40 truncate">
                    <p className="font-semibold text-ink-900 dark:text-white truncate">{log.action}</p>
                    <p className="text-[10px] text-ledger-400 truncate">{log.userName} • {log.module}</p>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>
      )}

      {/* 5. Navigation Tabs (8 Modern Tabs) */}
      <div className="flex border-b border-ledger-200 bg-white px-2 dark:border-ledger-800 dark:bg-slate-900 overflow-x-auto rounded-t-2xl shadow-sm">
        {[
          { key: "users", label: "Users", count: filteredUsers.length },
          { key: "roles", label: "Roles & Templates", count: roles.length },
          { key: "permissions", label: "Permissions", count: permissionsCount },
          { key: "matrix", label: "Access Matrix" },
          { key: "approvals", label: "Approval Matrix" },
          { key: "branches", label: "Branch Access" },
          { key: "audit", label: "Activity Logs", count: auditLogs.length },
          { key: "sessions", label: "Login Sessions", count: 6 },
          { key: "staff_accounts", label: "Create Staff Account" }
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setActiveTab(tab.key as ActiveTab);
              if (tab.key === "staff_accounts") setIsCreateStaffOpen(true);
            }}
            className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3.5 text-xs font-bold transition-all ${
              activeTab === tab.key
                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400 bg-blue-50/20 dark:bg-blue-950/20"
                : "border-transparent text-ledger-500 hover:text-ink-900 dark:text-ledger-400 dark:hover:text-white"
            }`}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`rounded-full px-2 py-0.2 text-[10px] font-bold ${
                  activeTab === tab.key
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 6. Active Tab Content Rendering */}
      <div className="min-h-[400px]">
        {activeTab === "users" && (
          <UsersTab
            users={filteredUsers}
            roles={roles}
            branches={branches}
            canManage={canManage}
            onViewUser={(user) => {
              setSelectedUserForDrawer(user);
              setIsDrawerOpen(true);
            }}
            onEditUser={(user) => {
              setSelectedUserForEdit(user);
              setIsEditUserOpen(true);
            }}
            onResetPassword={(user) => {
              setSelectedUserForReset(user);
              setIsResetPasswordOpen(true);
            }}
            onChangeRole={(user) => {
              setSelectedUserForEdit(user);
              setIsEditUserOpen(true);
            }}
            onToggleStatus={handleToggleStatus}
            onDeleteUser={handleDeleteUser}
            onBulkActivate={handleBulkActivate}
            onBulkDeactivate={handleBulkDeactivate}
            onBulkAssignRole={(ids) => {
              setBulkSelectedIds(ids);
              setIsBulkRoleOpen(true);
            }}
            onBulkAssignBranch={(ids) => {
              setBulkSelectedIds(ids);
              setIsBulkBranchOpen(true);
            }}
            onBulkResetPassword={(ids) => {
              showToast(`Password reset link dispatched to ${ids.length} selected users.`);
            }}
            onBulkExport={(ids) => {
              showToast(`Exported ${ids.length} user records.`);
            }}
            onBulkDelete={(ids) => {
              setBulkSelectedIds(ids);
              setIsBulkDeleteOpen(true);
            }}
          />
        )}

        {activeTab === "roles" && (
          <RolesTab
            roles={roles}
            users={users}
            canManage={canManage}
            onCreateRole={() => {
              setSelectedRoleForModal(null);
              setRoleModalMode("create");
              setIsRoleModalOpen(true);
            }}
            onApplyTemplate={handleApplyTemplate}
            onEditRole={(role) => {
              setSelectedRoleForModal(role);
              setRoleModalMode("edit");
              setIsRoleModalOpen(true);
            }}
            onCloneRole={(role) => {
              setSelectedRoleForModal(role);
              setRoleModalMode("clone");
              setIsRoleModalOpen(true);
            }}
            onDeleteRole={(role) => {
              if (role.isSystem) return alert("System default roles cannot be removed.");
              if (!confirm(`Delete custom role "${role.name}"?`)) return;
              setRoles((prev) => prev.filter((r) => r.id !== role.id));
              showToast(`Deleted role ${role.name}`);
            }}
            onFilterByRole={(roleKey) => {
              setFilters({ ...filters, role: roleKey });
              setActiveTab("users");
            }}
            roleThemes={roleThemes}
            canManageThemes={canManageThemes}
            onSaveRoleTheme={(roleKey, themeKey) => {
              startTransition(async () => {
                const result = await saveRoleTheme(roleKey, themeKey);
                if (result?.error) showToast(result.error);
                else showToast("Role theme saved for all users in this role.");
              });
            }}
          />
        )}

        {activeTab === "permissions" && (
          <PermissionsTab roles={roles} canManage={canManage}
          />
        )}

        {activeTab === "matrix" && (
          <AccessMatrixTab
          roles={roles}
          canManage={canManage}
          onUpdateRolePermissions={(roleId, permissions) => {
    setRoles((prev) =>
      prev.map((role) =>
        role.id === roleId
          ? { ...role, permissions }
          : role
      )
    );

    const updatedRole = roles.find((role) => role.id === roleId);

    recordAudit(
      "Role Permissions Updated",
      "User Management",
      `Updated access permissions for ${updatedRole?.name || roleId}`,
      {
        recordId: roleId
      }
    );

    showToast(
      `Permissions updated for ${updatedRole?.name || "role"}`
    );
  }}
/>
        )}

        {activeTab === "approvals" && (
          <ApprovalMatrixTab roles={roles} canManage={canManage} />
        )}

        {activeTab === "branches" && (
          <BranchAccessTab branches={branches} canManage={canManage} />
        )}

        {activeTab === "audit" && (
          <AuditLogsTab logs={auditLogs} branches={branches} />
        )}

        {activeTab === "sessions" && (
          <LoginSessionsTab canManage={canManage} />
        )}

        {activeTab === "staff_accounts" && (
          <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/40 p-8 text-center dark:border-emerald-900 dark:bg-emerald-950/20">
            <div>
              <h2 className="text-lg font-bold text-ink-900 dark:text-white">Create Staff Account</h2>
              <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">Create an instant username and password account for staff without email invitations.</p>
              <Button onClick={() => setIsCreateStaffOpen(true)} className="mt-4 bg-emerald-600 text-white hover:bg-emerald-700">
                <KeyRound className="mr-1.5 h-4 w-4" /> Open Staff Account Form
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Modals & Slide-out Drawers */}
      <AddUserModal
        isOpen={isAddUserOpen}
        onClose={() => setIsAddUserOpen(false)}
        branches={branches}
        roles={roles}
        onAddUser={handleCreateUser}
      />

      <CreateStaffAccountModal
        isOpen={isCreateStaffOpen}
        onClose={() => setIsCreateStaffOpen(false)}
        branches={branches}
        roles={roles}
        onCreateStaff={handleCreateStaffAccount}
      />

      <InviteUserModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        roles={roles}
        branches={branches}
        invitations={invitations}
        onSendInvite={handleSendInvite}
        onResendInvite={(id) => {
          startTransition(async () => {
            const result = await resendInvite(id);
            showToast(result?.error ?? "Invitation resent successfully");
          });
        }}
        onRevokeInvite={(id) => {
          setInvitations((prev) => prev.filter((i) => i.id !== id));
          showToast("Invitation revoked");
        }}
      />

      <EditUserModal
        isOpen={isEditUserOpen}
        onClose={() => {
          setIsEditUserOpen(false);
          setSelectedUserForEdit(null);
        }}
        user={selectedUserForEdit}
        branches={branches}
        roles={roles}
        onUpdateUser={handleUpdateUser}
      />

      <UserDetailsDrawer
        isOpen={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
          setSelectedUserForDrawer(null);
        }}
        user={selectedUserForDrawer}
        roleDef={roles.find(
          (r) => r.key === selectedUserForDrawer?.role || r.id === selectedUserForDrawer?.role
        )}
        auditLogs={auditLogs}
        onEdit={(u) => {
          setIsDrawerOpen(false);
          setSelectedUserForEdit(u);
          setIsEditUserOpen(true);
        }}
        onResetPassword={(u) => {
          setIsDrawerOpen(false);
          setSelectedUserForReset(u);
          setIsResetPasswordOpen(true);
        }}
        onToggleStatus={handleToggleStatus}
      />

      <RoleModal
        isOpen={isRoleModalOpen}
        mode={roleModalMode}
        onClose={() => {
          setIsRoleModalOpen(false);
          setSelectedRoleForModal(null);
        }}
        roleToEdit={selectedRoleForModal}
        onSaveRole={(saved) => {
          if (roleModalMode === "create" || roleModalMode === "clone") {
            setRoles((prev) => [...prev, saved]);
            showToast(`Role "${saved.name}" created.`);
          } else {
            setRoles((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
            showToast(`Role "${saved.name}" updated.`);
          }
          setIsRoleModalOpen(false);
        }}
      />

      <ImportUsersModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        roles={roles}
        branches={branches}
        onImportUsers={(imported) => {
         imported.forEach((importedUser) => {
         handleCreateUser(importedUser);
         });

               recordAudit(
                    "Users Imported",
            "User Management",
               `Imported ${imported.length} users from CSV.`
        );

                     showToast(`Successfully imported ${imported.length} users`);
                      }}
      />

      <ResetPasswordModal
        isOpen={isResetPasswordOpen}
        onClose={() => {
          setIsResetPasswordOpen(false);
          setSelectedUserForReset(null);
        }}
        user={selectedUserForReset}
        onConfirmReset={(userId, mode, tempPassword) => {
  const resetUser = users.find((u) => u.id === userId);

  if (!resetUser) return;

  startTransition(async () => {
    const result = await resetMemberPassword(userId, mode, tempPassword);
    if (result?.error) {
      showToast(result.error);
      return;
    }
  });

  recordAudit(
    "Password Reset Dispatched",
    "User Management",
    mode === "email"
      ? `Dispatched password reset email to ${resetUser.email}`
      : `Reset password using temporary password for ${resetUser.email}`,
    {
      recordId: userId,
      newValue: mode === "email"
        ? "Password reset email"
        : "Temporary password"
    }
  );

  showToast(
    mode === "email"
      ? `Reset email dispatched to ${resetUser.email}`
      : `Temporary password generated for ${resetUser.email}`
  );
}}
      />

      <BulkRoleModal
        isOpen={isBulkRoleOpen}
        onClose={() => setIsBulkRoleOpen(false)}
        selectedCount={bulkSelectedIds.length}
        roles={roles}
        onConfirm={handleBulkAssignRoleSubmit}
      />

      <BulkBranchModal
        isOpen={isBulkBranchOpen}
        onClose={() => setIsBulkBranchOpen(false)}
        selectedCount={bulkSelectedIds.length}
        branches={branches}
        onConfirm={handleBulkAssignBranchSubmit}
      />

      <BulkDeleteModal
        isOpen={isBulkDeleteOpen}
        onClose={() => setIsBulkDeleteOpen(false)}
        selectedCount={bulkSelectedIds.length}
        onConfirm={handleBulkDeleteSubmit}
      />

      <SecuritySettingsModal
        isOpen={isSecuritySettingsOpen}
        onClose={() => setIsSecuritySettingsOpen(false)}
        onSaveNotification={(msg) => showToast(msg)}
      />

    </div>
  );
}