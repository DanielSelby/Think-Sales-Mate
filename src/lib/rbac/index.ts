export type MemberRole = "owner" | "admin" | "manager" | "staff" | "viewer";

const ROLE_RANK: Record<MemberRole, number> = {
  owner: 4,
  admin: 3,
  manager: 2,
  staff: 1,
  viewer: 0
};

/** True if `role` meets or exceeds `minRole` in the hierarchy. */
export function meetsRole(role: MemberRole, minRole: MemberRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

/**
 * Per-module capability map. Extend this as each module (POS, Accounting,
 * HRM, ...) is built, rather than scattering role checks through the UI.
 */
export const CAPABILITIES = {
  "org.manage_members": "admin",
  "org.manage_billing": "owner",
  "dashboard.view": "viewer",
  "settings.view": "viewer",
  "settings.edit": "admin",
  "locations.view": "viewer",
  "locations.manage": "manager",
  "inventory.view": "viewer",
  "inventory.manage":"manager",
  "inventory.stock_request.view": "viewer",
  "inventory.stock_request.create": "staff",
  "inventory.stock_request.edit": "staff",
  "inventory.stock_request.submit": "staff",
  "inventory.stock_request.approve": "manager",
  "inventory.stock_request.reject": "manager",
  "inventory.stock_request.fulfill": "manager",
  "sales.view": "viewer",
  "sales.create": "staff",
  "accounting.view": "viewer",
  "accounting.manage": "manager",
  "crm.create": "staff",
  "crm.view": "viewer",
  "crm.manage": "manager",
  "hrm.view": "manager",
  "hrm.manage": "manager",
  "banking.view": "manager",
  "banking.manage": "manager",
  "assets.view": "viewer",
  "assets.manage": "manager",
  "projects.create": "staff",
  "projects.manage": "manager",
  "reports.view": "viewer",
  "ai.view": "viewer",
  "ai.generate": "manager",
  "orders.view_all": "admin",
  "orders.view_branch": "staff",
  "orders.assign_branch": "manager",
  "orders.approve": "manager",
  "orders.reject": "manager",
  "orders.edit": "staff",
  "orders.convert_to_sale": "staff",
} as const satisfies Record<string, MemberRole>;

export type Capability = keyof typeof CAPABILITIES;

export function can(role: MemberRole, capability: Capability): boolean {
  return meetsRole(role, CAPABILITIES[capability]);
}
