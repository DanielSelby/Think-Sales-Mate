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
  | "orders"
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

export type SessionStatus = "active" | "expired" | "logged_out" | "timed_out";

export interface LoginSession {
  id: string;
  sessionId: string;
  userId: string;
  userName: string;
  userEmail: string;
  userAvatar?: string | null;
  role: string;
  branch: string;
  loginTime: string;
  lastActivity: string;
  logoutTime?: string | null;
  durationMinutes: number;
  device: string;
  browser: string;
  os: string;
  ipAddress: string;
  location: string;
  status: SessionStatus;
  isCurrent: boolean;
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
  customerOrders?: boolean;
  maxExpenseAmount?: number;
  maxPurchaseAmount?: number;
}

export interface UserPerformanceMetrics {
  salesCreated: number;
  ordersApproved: number;
  ordersProcessed: number;
  transfersApproved: number;
  inventoryAdjustments: number;
  expensesApproved: number;
  totalSalesVolumeGHS: number;
  activityScore: number; // 0 - 100
  lastLogin: string;
  monthlyTrend: { month: string; sales: number; activities: number }[];
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
  performance?: UserPerformanceMetrics;
  attentionReason?: "stale" | "failed_logins" | "locked" | "disabled" | "pending_invitation" | null;
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
    customerOrders?: boolean;
  };
}

export interface ModulePermissionConfig {
  key: ModuleCategory;
  name: string;
  description: string;
  iconName: string;
  supportedActions: PermissionAction[];
}

export interface FieldChangeDiff {
  field: string;
  label: string;
  oldValue: string | number | boolean | null;
  newValue: string | number | boolean | null;
}

export interface AuditLogEntry {
  id: string;
  logId?: string;
  timestamp: string;
  userId: string;
  userName: string;
  userEmail: string;
  userAvatar?: string | null;
  role?: string;
  branch: string;
  module: string;
  page?: string;
  action: string;
  recordType?: string;
  recordId?: string;
  oldValue?: string | null;
  newValue?: string | null;
  changesDiff?: FieldChangeDiff[];
  device: string;
  browser?: string;
  os?: string;
  ipAddress: string;
  sessionId?: string;
  status: "success" | "warning" | "failed";
  details?: string;
}

export interface ApprovalRule {
  id: string;
  roleKey: string;
  roleName: string;
  moduleKey: "purchases" | "expenses" | "stock_transfers" | "stock_adjustments" | "price_changes" | "customer_orders";
  moduleName: string;
  canApprove: boolean;
  approvalLimitGHS: number | "unlimited";
  requiresHigherApproval: boolean;
  higherApproverRole?: string;
  notes?: string;
}

export interface BranchAccessRule {
  userId: string;
  userName: string;
  userEmail: string;
  role: string;
  primaryBranchId: string;
  primaryBranchName: string;
  additionalBranchIds: string[];
  additionalBranchNames: string[];
  viewAllBranches: boolean;
  canTransferBetweenBranches: boolean;
  canApproveBranchOrders: boolean;
}

export interface InvitationRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  branchId: string;
  branchName: string;
  invitedBy: string;
  invitedAt: string;
  expiresAt: string;
  status: "pending" | "accepted" | "expired";
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
  attentionOnly?: boolean;
}

export type ActiveTab = 
  | "users" 
  | "roles" 
  | "permissions" 
  | "matrix" 
  | "approvals" 
  | "branches" 
  | "audit" 
  | "sessions";
