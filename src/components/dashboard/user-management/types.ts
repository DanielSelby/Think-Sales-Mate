import type { MemberRole as DbMemberRole, MemberStatus as DbMemberStatus } from "@/types/database";

export type RoleType = 
  | "administrator"
  | "manager"
  | "sales_officer"
  | "cashier"
  | "inventory_officer"
  | "hr_officer"
  | "accountant"
  | "viewer"
  | "custom";

export type UserStatus = "active" | "inactive" | "suspended" | "pending";

export type PermissionAction = 
  | "view" 
  | "create" 
  | "edit" 
  | "delete" 
  | "approve" 
  | "export" 
  | "print";

export type ModuleCategory =
  | "dashboard"
  | "sales"
  | "pos"
  | "products"
  | "inventory"
  | "transfers"
  | "purchases"
  | "expenses"
  | "customers"
  | "suppliers"
  | "accounting"
  | "hrm_payroll"
  | "reports"
  | "user_management"
  | "settings";

export interface UserBranch {
  id: string;
  name: string;
  code?: string;
  isMain?: boolean;
}

export interface UserSession {
  id: string;
  device: string;
  browser: string;
  os: string;
  ipAddress: string;
  location: string;
  lastActive: string;
  isCurrent: boolean;
}

export interface ApprovalPermission {
  stockTransfers: boolean;
  purchases: boolean;
  expenses: boolean;
  priceUpdates: boolean;
  stockAdjustments: boolean;
  maxExpenseAmount?: number;
  maxPurchaseAmount?: number;
}

export interface ManagedUser {
  id: string;
  userId?: string | null;
  name: string;
  fullName?: string;
  email: string;
  phone: string;
  employeeId: string;
  avatarUrl?: string | null;
  role: RoleType | DbMemberRole | string;
  roleLabel?: string;
  status: UserStatus | DbMemberStatus;
  department: string;
  locationId: string | null;
  locationName: string | null;
  secondaryBranches?: string[]; // branch IDs
  secondaryBranchNames?: string[];
  lastSignInAt: string | null;
  joinedAt: string;
  isSelf: boolean;
  twoFactorEnabled?: boolean;
  approvalPermissions?: ApprovalPermission;
  sessions?: UserSession[];
  branchScope?: "all" | "assigned" | "single";
}

export interface RoleDefinition {
  id: string;
  key: string;
  name: string;
  description: string;
  userCount: number;
  permissionCount: number;
  isSystem: boolean;
  scope: "all_branches" | "branch_specific";
  badgeColor: string;
  permissions: Record<ModuleCategory, PermissionAction[]>;
  approvalCapabilities: {
    stockTransfers: boolean;
    purchases: boolean;
    expenses: boolean;
    priceUpdates: boolean;
    stockAdjustments: boolean;
  };
}

export interface ModulePermissionConfig {
  key: ModuleCategory;
  name: string;
  description: string;
  iconName: string;
  supportedActions: PermissionAction[];
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userAvatar?: string | null;
  action: 
    | "User Added" 
    | "User Updated" 
    | "User Deactivated" 
    | "User Activated" 
    | "User Deleted" 
    | "Role Changed" 
    | "Permission Updated" 
    | "Password Reset" 
    | "Login Successful" 
    | "Failed Login Attempt" 
    | "2FA Enforced" 
    | "Branch Assigned" 
    | "Approval Granted";
  module: string;
  timestamp: string;
  branch: string;
  device: string;
  ipAddress: string;
  status: "success" | "warning" | "failed";
  details?: string;
}

export interface UserFilterState {
  search: string;
  branch: string;
  department: string;
  role: string;
  status: string;
  dateCreated: string;
  lastActive: string;
  twoFactorOnly?: boolean;
  multiBranchOnly?: boolean;
}

export type ActiveTab = "users" | "roles" | "permissions" | "matrix" | "audit";
