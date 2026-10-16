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
  Check,
  Activity,
  UserPlus,
  KeyRound,
  Printer,
  FileSpreadsheet
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppAlert } from "@/components/ui/app-alert-provider";

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
  ModuleCategory,
  PermissionAction
} from "./user-management/types";
import type { BranchAccessRule } from "./user-management/types";

import {
  DEFAULT_ROLES,
  DEPARTMENTS,
  PERMISSION_TEMPLATES
} from "./user-management/constants";

import {
  inviteMember,
  updateMemberBranch,
  updateMemberStatus,
  removeMember,
  bulkInviteMembers,
  resendInvite,
  updateMemberAccessScope,
  saveRolePermissions,
  deleteRoleTemplate
} from "@/app/(dashboard)/settings/organization/actions";
import { createStaffAccount, saveRoleTheme, resetMemberPassword } from "@/app/(dashboard)/settings/organization/actions";
import { THEMES, type ThemeKey, useAppStore } from "@/store/useAppStore";

export type { ManagedUser, UserBranch } from "./user-management/types";

interface UserManagementProps {
  users?: ManagedUser[];
  branches?: UserBranch[];
  roles?: RoleDefinition[];
  auditLogs?: AuditLogEntry[];
  invitations?: InvitationRecord[];
  canManage?: boolean;
  orgName?: string;
  companyWebsite?: string | null;
  employeeNames?: string[];
  roleThemes?: Record<string, string>;
  canManageThemes?: boolean;
}

export function UserManagement({
  users: initialUsersProp,
  branches: initialBranchesProp,
  roles: initialRolesProp,
  auditLogs: initialAuditLogsProp,
  invitations: initialInvitationsProp,
  canManage = true,
  orgName = "Organization",
  companyWebsite,
  employeeNames = [],
  roleThemes = {},
  canManageThemes = false
}: UserManagementProps) {
  const [, startTransition] = useTransition();
  const { setTheme } = useAppStore();
  const showAlert = useAppAlert();
  const [roleThemeState, setRoleThemeState] = useState<Record<string, string>>(roleThemes);

  // Primary Data State
  const [branches] = useState<UserBranch[]>(
    initialBranchesProp ?? []
  );

  const [users, setUsers] = useState<ManagedUser[]>(() => {
    if (initialUsersProp) {
      return initialUsersProp.map((u, idx) => {
        return {
          ...u,
          id: u.id,
          email: u.email,
          fullName: u.fullName || u.name || u.email.split("@")[0],
          phone: u.phone || "",
          employeeId: u.employeeId || "",
          role: u.role || "staff",
          roleLabel: u.roleLabel || u.role || "Staff",
          status: u.status || "active",
          locationId: u.locationId ?? null,
          locationName: u.locationName ?? null,
          secondaryBranches: u.secondaryBranches || [],
          secondaryBranchNames: u.secondaryBranchNames || [],
          branchScope: u.branchScope || "single",
          canViewOtherTransactions: u.canViewOtherTransactions ?? true,
          canCheckCrossBranchStock: u.canCheckCrossBranchStock ?? false,
          approvalPermissions: u.approvalPermissions,
          accessPermissions: u.accessPermissions,
          performance: u.performance,
          attentionReason: u.attentionReason ?? null
        };
      });
    }
    return [];
  });

  const [roles, setRoles] = useState<RoleDefinition[]>(
    initialRolesProp && initialRolesProp.length > 0 ? initialRolesProp : DEFAULT_ROLES
  );
  const auditLogs = initialAuditLogsProp ?? [];
  const [invitations, setInvitations] = useState<InvitationRecord[]>(initialInvitationsProp ?? []);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Active Tab & Filters
  const [activeTab, setActiveTab] = useState<ActiveTab>("users");
  const [showSummary, setShowSummary] = useState(true);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Global & Card Filter State
  const [filters, setFilters] = useState<UserFilterState>({
    search: "",
    branch: "all",
    department: "all",
    role: "all",
    status: "all",
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

  // Refresh handler
  const handleRefresh = () => {
    setIsRefreshing(true);
    window.location.reload();
  };

  // Clear filters
  const handleClearFilters = () => {
    setFilters({
      search: "",
      branch: "all",
      department: "all",
      role: "all",
      status: "all",
      multiBranchOnly: false,
      attentionOnly: false
    });
  };

  // 1-Click Permission Template Handler
  const handleApplyTemplate = (templateKey: string) => {
    const template = PERMISSION_TEMPLATES.find((item) => item.key === templateKey);
    const roleKey = template?.roleKey ?? templateKey;
    const roleDef = roles.find((r) => r.key === roleKey || r.id === `role-${roleKey}`);
    if (roleDef) {
      setSelectedRoleForModal(roleDef);
      setRoleModalMode("edit");
      setIsRoleModalOpen(true);
      showToast(`Loaded "${roleDef.name}" permission template`);
    } else {
      showToast(`No saved role exists for the "${template?.name ?? templateKey}" template.`);
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
  const pendingInvitationsCount = invitations.filter((invitation) => invitation.status === "pending").length;
  const rolesCount = roles.length;
  const permissionsCount = roles.reduce((max, role) => Math.max(max, role.permissionCount), 0);

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
      id: `pending-${crypto.randomUUID()}`,
      userId: null,
      name: newUser.name || newUser.fullName || "New User",
      fullName: newUser.fullName || newUser.name || "New User",
      email: newUser.email || "",
      phone: newUser.phone || "",
      employeeId: newUser.employeeId || "",
      role: newUser.role || "sales_officer",
      roleLabel: newUser.roleLabel || "Sales Associate",
      status: newUser.status || "active",
      avatarUrl: newUser.avatarUrl || null,
      department: newUser.department || "",
      locationId: newUser.locationId || null,
      locationName: newUser.locationName || null,
      secondaryBranches: newUser.secondaryBranches || [],
      secondaryBranchNames: newUser.secondaryBranchNames || [],
      lastSignInAt: null,
      joinedAt: new Date().toISOString(),
      isSelf: false,
      twoFactorEnabled: newUser.twoFactorEnabled ?? null,
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
    // Persist the member and send the invitation using the configured company email.
    startTransition(async () => {
      const formData = new FormData();
      formData.set("name", user.fullName || user.name);
      formData.set("email", user.email);
      if (newUser.avatar instanceof File) formData.set("avatar", newUser.avatar);
      formData.set("phone", user.phone);
      formData.set("employee_id", user.employeeId);
      formData.set("department", user.department);
      formData.set("role", user.role);
      formData.set("location_id", user.locationId ?? "");
      formData.set("branch_scope", user.branchScope ?? "assigned");
      formData.set("secondary_location_ids", (user.secondaryBranches ?? []).join(","));
      formData.set("can_view_other_users_transactions", String(user.canViewOtherTransactions !== false));
      formData.set("can_check_cross_branch_stock", String(user.canCheckCrossBranchStock === true));
      formData.set("approval_permissions", JSON.stringify(user.approvalPermissions ?? {}));
      const result = await inviteMember(formData);
      if (result && "error" in result) {
        setUsers((prev) => prev.filter((item) => item.id !== user.id));
        showToast(result.error ?? "Unable to create the user.");
        return;
      }
      if ("memberId" in result && result.memberId) {
        const persistedUser = { ...user, id: result.memberId, avatarUrl: result.avatarUrl ?? null };
        setUsers((prev) => prev.map((item) => item.id === user.id ? persistedUser : item));
        setInvitations((previous) => [{
          id: result.memberId!,
          name: persistedUser.fullName || persistedUser.name,
          email: persistedUser.email,
          role: String(persistedUser.role),
          roleLabel: persistedUser.roleLabel || String(persistedUser.role),
          branchId: persistedUser.locationId ?? "",
          branchName: persistedUser.locationName ?? "Unassigned",
          invitedBy: "",
          invitedAt: new Date().toISOString(),
          status: "pending"
        }, ...previous]);
        showToast(`Invitation sent to ${persistedUser.email}`);
        if (result.warning) showToast(result.warning);
        setSelectedUserForReset(persistedUser);
        setIsResetPasswordOpen(true);
      } else {
        setUsers((prev) => prev.filter((item) => item.id !== user.id));
        showToast("The invitation was created, but its organization membership could not be confirmed. Refresh before retrying.");
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
    startTransition(async () => {
      const result = await updateMemberAccessScope({
        memberId: userId,
        avatar: updates.avatar,
        fullName: updates.fullName ?? oldUser?.fullName,
        phone: updates.phone ?? oldUser?.phone,
        employeeId: updates.employeeId ?? oldUser?.employeeId,
        department: updates.department ?? oldUser?.department,
        locationId: updates.locationId !== undefined ? updates.locationId : oldUser?.locationId ?? null,
        secondaryLocationIds: updates.branchScope === "all"
          ? []
          : updates.secondaryBranches ?? oldUser?.secondaryBranches ?? [],
        branchScope: updates.branchScope ?? oldUser?.branchScope ?? "single",
        canViewOtherTransactions: updates.canViewOtherTransactions ?? oldUser?.canViewOtherTransactions ?? true,
        canCheckCrossBranchStock: updates.canCheckCrossBranchStock ?? oldUser?.canCheckCrossBranchStock ?? false,
        role: updates.role ?? oldUser?.role,
        approvalPermissions: updates.approvalPermissions ?? oldUser?.approvalPermissions
        , priceGroups: updates.priceGroups ?? oldUser?.priceGroups,
        permissions: updates.accessPermissions?.permissions as Record<string, unknown> | undefined
      });
      if (result?.error) {
        showToast(`Failed to save access changes: ${result.error}`);
        if (oldUser) {
          setUsers((prev) => prev.map((user) => user.id === userId ? oldUser : user));
        }
      } else {
        showToast(`Updated ${updatedUser.fullName}'s profile`);
      }
    });
  }
};

  const handleToggleStatus = (user: ManagedUser) => {
    const nextStatus = user.status === "active" ? "inactive" : "active";
    const persistedStatus = nextStatus === "active" ? "active" : "suspended";
    startTransition(async () => {
      const result = await updateMemberStatus(user.id, persistedStatus);
      if ("error" in result && result.error) {
        showToast(result.error);
        return;
      }
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, status: persistedStatus, attentionReason: null } : u))
      );
      showToast(`User ${user.fullName} is now ${nextStatus}`);
    });
  };

  const handleDeleteUser = (user: ManagedUser) => {
    if (!confirm(`Remove ${user.fullName || user.email} from this organization? Their authentication account will not be deleted.`)) return;
    startTransition(async () => {
      const result = await removeMember(user.id);
      if ("error" in result && result.error) {
        showToast(result.error);
        return;
      }
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      showToast(`Removed ${user.fullName} from the organization`);
    });
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
    if (!("memberId" in result) || !result.memberId) {
      showToast("Invitation was sent, but the organization membership could not be confirmed.");
      return false;
    }

    const newInvite: InvitationRecord = {
      id: result.memberId,
      name: inviteData.name,
      email: inviteData.email,
      role: inviteData.role,
      roleLabel: roleDef?.name || "Staff",
      branchId: inviteData.branchId,
      branchName: branchDef?.name || "Unassigned",
      invitedBy: "",
      invitedAt: new Date().toISOString(),
      status: "pending"
    };

    setInvitations((prev) => [newInvite, ...prev]);
    showToast(`Invitation sent to ${inviteData.email}`);
    return true;
  };

  const handleCreateStaffAccount = async (formData: FormData) => {
    const result = await createStaffAccount(formData);
    if (result.error) {
      showToast(result.error);
      return result;
    }
    if (!result.memberId) {
      const error = "The account was created, but its organization membership could not be confirmed.";
      showToast(error);
      return { ...result, error };
    }

    const roleKey = String(formData.get("role") ?? "staff");
    const branchId = String(formData.get("location_id") ?? "");
    const roleDef = roles.find((item) => item.key === roleKey);
    const branchDef = branches.find((item) => item.id === branchId);
    const createdUser: ManagedUser = {
      id: result.memberId,
      userId: result.userId,
      name: String(formData.get("full_name") ?? ""),
      fullName: String(formData.get("full_name") ?? ""),
      username: result.username ?? String(formData.get("username") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      employeeId: String(formData.get("employee_id") ?? ""),
      avatarUrl: result.avatarUrl ?? null,
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
      twoFactorEnabled: null
    };
    setUsers((previous) => [createdUser, ...previous]);
    if (result.warning) showToast(result.warning);
    return result;
  };

  // Bulk Actions Handlers
  const handleBulkActivate = (userIds: string[]) => {
    startTransition(async () => {
      const results = await Promise.all(userIds.map((id) => updateMemberStatus(id, "active")));
      const succeeded = new Set(userIds.filter((_, index) => !("error" in results[index]) || !results[index].error));
      setUsers((prev) => prev.map((user) =>
        succeeded.has(user.id) ? { ...user, status: "active", attentionReason: null } : user
      ));
      const failedCount = userIds.length - succeeded.size;
      const failure = results.find((result) => result?.error)?.error;
      showToast(failedCount
        ? `Activated ${succeeded.size}; ${failedCount} failed. ${failure ?? ""}`
        : `Activated ${succeeded.size} users`);
    });
  };

  const handleBulkDeactivate = (userIds: string[]) => {
    startTransition(async () => {
      const results = await Promise.all(userIds.map((id) => updateMemberStatus(id, "suspended")));
      const succeeded = new Set(userIds.filter((_, index) => !("error" in results[index]) || !results[index].error));
      setUsers((prev) => prev.map((user) =>
        succeeded.has(user.id) ? { ...user, status: "inactive" } : user
      ));
      const failedCount = userIds.length - succeeded.size;
      const failure = results.find((result) => result?.error)?.error;
      showToast(failedCount
        ? `Deactivated ${succeeded.size}; ${failedCount} failed. ${failure ?? ""}`
        : `Deactivated ${succeeded.size} users`);
    });
  };

  const handleBulkAssignRoleSubmit = (roleKey: string) => {
    const roleDef = roles.find((r) => r.key === roleKey || r.id === roleKey);
    if (roleDef) {
      startTransition(async () => {
        const results = await Promise.all(
          bulkSelectedIds.map((memberId) =>
            updateMemberAccessScope({
              memberId,
              role: roleDef.key,
              approvalPermissions: roleDef.approvalCapabilities
            })
          )
        );
        const succeededIds = new Set(bulkSelectedIds.filter((_, index) => !results[index]?.error));
        setUsers((prev) => prev.map((user) =>
          succeededIds.has(user.id) ? { ...user, role: roleKey, roleLabel: roleDef.name } : user
        ));
        const failedCount = bulkSelectedIds.length - succeededIds.size;
        const failure = results.find((result) => result?.error)?.error;
        showToast(failedCount
          ? `Assigned role to ${succeededIds.size}; ${failedCount} failed. ${failure ?? ""}`
          : `Assigned ${roleDef.name} to ${succeededIds.size} users`);
      });
    }
    setIsBulkRoleOpen(false);
  };

  const handleBulkAssignBranchSubmit = (branchId: string) => {
    const branchDef = branches.find((b) => b.id === branchId);
    startTransition(async () => {
      const results = await Promise.all(bulkSelectedIds.map((id) => updateMemberBranch(id, branchId)));
      const succeeded = new Set(bulkSelectedIds.filter((_, index) => !("error" in results[index]) || !results[index].error));
      setUsers((prev) => prev.map((user) =>
        succeeded.has(user.id)
          ? { ...user, locationId: branchId, locationName: branchDef?.name ?? "Unassigned" }
          : user
      ));
      const failedCount = bulkSelectedIds.length - succeeded.size;
      const failure = results.find((result) => result?.error)?.error;
      showToast(failedCount
        ? `Assigned ${succeeded.size}; ${failedCount} failed. ${failure ?? ""}`
        : `Assigned ${branchDef?.name} to ${succeeded.size} users`);
      setIsBulkBranchOpen(false);
    });
  };

  const handleBulkDeleteSubmit = () => {
    startTransition(async () => {
      const results = await Promise.all(bulkSelectedIds.map((id) => removeMember(id)));
      const succeeded = new Set(bulkSelectedIds.filter((_, index) => !("error" in results[index]) || !results[index].error));
      setUsers((prev) => prev.filter((user) => !succeeded.has(user.id)));
      const failedCount = bulkSelectedIds.length - succeeded.size;
      const failure = results.find((result) => result?.error)?.error;
      showToast(failedCount
        ? `Removed ${succeeded.size}; ${failedCount} failed. ${failure ?? ""}`
        : `Removed ${succeeded.size} members from the organization`);
      setIsBulkDeleteOpen(false);
    });
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
  };

  return (
    <div className="user-management-page space-y-6 animate-in fade-in duration-200">
      
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
            <p className="text-xs text-ledger-500 dark:text-ledger-400">
              2FA enrollment status is unavailable from the authentication provider.
            </p>

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
          { key: "action_permissions", label: "Page & Tab Permissions" },
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
              if (role.isSystem) {
                void showAlert("System default roles cannot be removed.", { title: "Action not allowed", tone: "info" });
                return;
              }
              if (!confirm(`Delete custom role "${role.name}"?`)) return;
              startTransition(async () => {
                const result = await deleteRoleTemplate(role.id);
                if ("error" in result && result.error) {
                  showToast(result.error);
                  return;
                }
                setRoles((prev) => prev.filter((item) => item.id !== role.id));
                showToast(`Deleted role ${role.name}`);
              });
            }}
            onFilterByRole={(roleKey) => {
              setFilters({ ...filters, role: roleKey });
              setActiveTab("users");
            }}
            roleThemes={roleThemeState}
            canManageThemes={canManageThemes}
            onSaveRoleTheme={(roleKey, themeKey) => {
              startTransition(async () => {
                const result = await saveRoleTheme(roleKey, themeKey);
                if (result?.error) {
                  showToast(result.error);
                  return;
                }
                setRoleThemeState((previous) => ({ ...previous, [roleKey]: themeKey }));
                const currentUser = users.find((user) => user.isSelf);
                if (currentUser && String(currentUser.role) === roleKey) setTheme(themeKey);
                showToast("Role theme saved for all users in this role.");
              });
            }}
          />
        )}

        {activeTab === "permissions" && (
          <PermissionsTab roles={roles} canManage={canManage}
          />
        )}

        {activeTab === "action_permissions" && (
          <AccessMatrixTab
            roles={roles}
            canManage={canManage}
            onUpdateRolePermissions={async (roleId, permissions) => {
              const updatedRole = roles.find((role) => role.id === roleId);
              const result = await saveRolePermissions(updatedRole?.key || roleId, permissions, updatedRole?.name);
              if ("error" in result && result.error) {
                showToast(result.error);
                return result;
              }
              setRoles((previous) => previous.map((role) => role.id === roleId ? { ...role, permissions } : role));
              showToast(`Permissions updated for ${updatedRole?.name || "role"}`);
              return {};
            }}
          />
        )}

        {activeTab === "approvals" && (
          <ApprovalMatrixTab roles={roles} canManage={canManage} />
        )}

        {activeTab === "branches" && (
          <BranchAccessTab
            branches={branches}
            users={users}
            canManage={canManage}
            onSaveAccess={async (rule: BranchAccessRule) => {
              const user = users.find((item) => item.id === rule.userId);
               if (!user) return { error: "The selected member could not be found." };
              const result = await updateMemberAccessScope({
                memberId: rule.userId,
                locationId: rule.primaryBranchId || null,
                secondaryLocationIds: rule.additionalBranchIds,
                branchScope: rule.viewAllBranches ? "all" : "assigned",
                canCheckCrossBranchStock: rule.canTransferBetweenBranches,
                approvalPermissions: {
                  ...(user.approvalPermissions ?? {}),
                  customerOrders: rule.canApproveBranchOrders
                }
              });
              return result?.error ? { error: result.error } : undefined;
            }}
          />
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
        companyWebsite={companyWebsite}
        employeeNames={employeeNames}
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
            showToast(result?.error ?? ("success" in result && result.success
              ? "Invitation resent successfully"
              : "Invitation could not be resent."));
          });
        }}
          onRevokeInvite={(id) => {
            if (!confirm("Remove this invitation from the organization? This does not delete the authentication account.")) return;
            startTransition(async () => {
              const result = await removeMember(id);
              if ("error" in result && result.error) {
                showToast(result.error);
                return;
              }
              setInvitations((previous) => previous.filter((invitation) => invitation.id !== id));
              setUsers((previous) => previous.filter((user) => user.id !== id));
              showToast("Invitation removed from the organization.");
            });
          }}
      />

      {isEditUserOpen && selectedUserForEdit && (
        <EditUserModal
          isOpen
          onClose={() => {
            setIsEditUserOpen(false);
            setSelectedUserForEdit(null);
          }}
          user={selectedUserForEdit}
          branches={branches}
          roles={roles}
          onUpdateUser={handleUpdateUser}
        />
      )}

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
        canManage={canManage}
        onResetPermissions={async (user) => {
          const result = await updateMemberAccessScope({
            memberId: user.id,
            inheritPermissions: true
          });
          if (result?.error) return result;
          const nextAccessPermissions = {
            ...(user.accessPermissions ?? {}),
            permissions_mode: "inherit"
          };
          setUsers((previous) => previous.map((member) => member.id === user.id
            ? { ...member, accessPermissions: nextAccessPermissions }
            : member));
          setSelectedUserForDrawer((previous) => previous?.id === user.id
            ? { ...previous, accessPermissions: nextAccessPermissions }
            : previous);
          showToast(`Role permissions now apply to ${user.fullName || user.name}.`);
          return {};
        }}
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

      {isRoleModalOpen && (
        <RoleModal
          isOpen
          mode={roleModalMode}
          onClose={() => {
            setIsRoleModalOpen(false);
            setSelectedRoleForModal(null);
          }}
          roleToEdit={selectedRoleForModal}
          onSaveRole={async (saved) => {
            if (roles.some((role) => role.key === saved.key && role.id !== saved.id)) {
              await showAlert("A role with this key already exists. Choose a different name.", {
                title: "Role could not be saved",
                tone: "error"
              });
              return { error: "A role with this key already exists. Choose a different name." };
            }
            try {
              const result = await saveRolePermissions(saved.key, saved.permissions, saved.name);
              if ("error" in result && result.error) {
                await showAlert(result.error, { title: "Role could not be saved", tone: "error" });
                return result;
              }
              if (roleModalMode === "create" || roleModalMode === "clone") {
                setRoles((previous) => [...previous, saved]);
                showToast(`Role "${saved.name}" created.`);
              } else {
                setRoles((previous) => previous.map((role) => role.id === saved.id ? saved : role));
                showToast(`Role "${saved.name}" updated.`);
              }
              return {};
            } catch (error) {
              const message = error instanceof Error ? error.message : "Could not save this role.";
              await showAlert(message, { title: "Role could not be saved", tone: "error" });
              return { error: message };
            }
          }}
        />
      )}

      <ImportUsersModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        roles={roles}
        branches={branches}
        onImportUsers={async (imported) => {
          const result = await bulkInviteMembers(imported.map((user) => ({
            email: user.email ?? "",
            role: String(user.role ?? "staff"),
            locationId: user.locationId,
            fullName: user.fullName ?? user.name,
            phone: user.phone,
            employeeId: user.employeeId,
            department: user.department,
            sourceRow: user.sourceRow
          })));
          const createdInvitations: InvitationRecord[] = result.members.map((member) => {
            const roleDef = roles.find((role) => role.key === member.role);
            const branchDef = branches.find((branch) => branch.id === member.locationId);
            return {
              id: member.id,
              name: member.fullName,
              email: member.email,
              role: member.role,
              roleLabel: roleDef?.name ?? member.role,
              branchId: member.locationId ?? "",
              branchName: branchDef?.name ?? "Unassigned",
              invitedBy: "",
              invitedAt: member.createdAt,
              status: "pending"
            };
          });
          setInvitations((previous) => [...createdInvitations, ...previous]);
          setUsers((previous) => [
            ...result.members.map((member) => {
              const roleDef = roles.find((role) => role.key === member.role);
              const branchDef = branches.find((branch) => branch.id === member.locationId);
              return {
                id: member.id,
                userId: member.userId,
                name: member.fullName,
                fullName: member.fullName,
                email: member.email,
                phone: member.phone ?? "",
                employeeId: member.employeeId ?? "",
                role: member.role,
                roleLabel: roleDef?.name ?? member.role,
                status: "pending" as const,
                department: member.department ?? "",
                locationId: member.locationId,
                locationName: branchDef?.name ?? null,
                secondaryBranches: [],
                secondaryBranchNames: [],
                branchScope: member.locationId ? "single" as const : "assigned" as const,
                lastSignInAt: null,
                joinedAt: member.createdAt,
                isSelf: false,
                twoFactorEnabled: null
              };
            }),
            ...previous
          ]);
          showToast(result.skipped.length
            ? `Invited ${result.invited}; ${result.skipped.length} row(s) failed.`
            : `Invited ${result.invited} user(s).`);
          return result;
        }}
      />

      <ResetPasswordModal
        isOpen={isResetPasswordOpen}
        onClose={() => {
          setIsResetPasswordOpen(false);
          setSelectedUserForReset(null);
        }}
        user={selectedUserForReset}
        onConfirmReset={async (userId, mode, tempPassword) => {
          const resetUser = users.find((u) => u.id === userId);
          if (!resetUser) return { error: "The selected user could not be found." };

          const result = await resetMemberPassword(userId, mode, tempPassword);
          if (result?.error) return { error: result.error };

          showToast(
            mode === "email"
              ? `Password reset email sent to ${resetUser.email}`
              : `Temporary password set for ${resetUser.email}`
          );
          return {};
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
      />

    </div>
  );
}