import type { PermissionAction } from "@/lib/rbac";

export interface RestaurantRolePreset {
  key: string;
  name: string;
  description: string;
  permissions: Record<string, PermissionAction[]>;
}

const view: PermissionAction[] = ["view"];
const orderActions: PermissionAction[] = ["view", "create", "edit", "print"];
const managerActions: PermissionAction[] = ["view", "create", "edit", "delete", "approve", "export", "print"];

export const RESTAURANT_ROLE_PRESETS: RestaurantRolePreset[] = [
  {
    key: "restaurant_manager",
    name: "Restaurant Manager",
    description: "Oversees restaurant operations, staff workflows, menu, reporting, and approvals.",
    permissions: {
      restaurant: managerActions,
      "restaurant.operations.orders": managerActions,
      "restaurant.operations.kitchen": managerActions,
      "restaurant.operations.menu": managerActions,
      "restaurant.operations.tables": managerActions,
      "restaurant.operations.reservations": managerActions,
      "restaurant.operations.reports": managerActions,
      "restaurant.operations.ingredients": managerActions,
      user_management: view,
    },
  },
  {
    key: "restaurant_cashier",
    name: "Restaurant Cashier",
    description: "Takes restaurant payments and manages customer orders at the POS.",
    permissions: {
      restaurant: ["view", "create", "edit", "print"],
      "restaurant.operations.orders": orderActions,
      "restaurant.operations.tables": view,
    },
  },
  {
    key: "restaurant_server",
    name: "Waiter / Server",
    description: "Creates and updates guest orders, tables, and reservations.",
    permissions: {
      restaurant: ["view", "create", "edit", "print"],
      "restaurant.operations.orders": orderActions,
      "restaurant.operations.kitchen": view,
      "restaurant.operations.menu": view,
      "restaurant.operations.tables": ["view", "edit"],
      "restaurant.operations.reservations": ["view", "create", "edit"],
    },
  },
  {
    key: "restaurant_kitchen",
    name: "Kitchen Staff",
    description: "Views and updates kitchen tickets and checks ingredient availability.",
    permissions: {
      restaurant: ["view", "edit"],
      "restaurant.operations.orders": view,
      "restaurant.operations.kitchen": ["view", "edit"],
      "restaurant.operations.ingredients": view,
    },
  },
  {
    key: "restaurant_inventory",
    name: "Restaurant Inventory & Purchasing",
    description: "Maintains restaurant ingredients, recipes, and stock records.",
    permissions: {
      restaurant: ["view", "create", "edit", "print"],
      "restaurant.operations.menu": view,
      "restaurant.operations.ingredients": ["view", "create", "edit", "approve", "export", "print"],
    },
  },
];

export function isRestaurantRoleKey(roleKey: string): boolean {
  return RESTAURANT_ROLE_PRESETS.some((role) => role.key === roleKey.toLowerCase());
}

export function hasRestaurantModuleAccess(enabledModules: readonly string[]): boolean {
  return enabledModules.includes("Restaurant")
    || enabledModules.some((module) => module.startsWith("Restaurant:"));
}

export function isRestaurantOnlyOrganizationModuleSet(enabledModules: readonly string[]): boolean {
  const nonBusinessModules = new Set(["Dashboard", "Approval Center", "Settings", "Users"]);
  const businessModules = new Set(
    enabledModules
      .filter((module) => !module.startsWith("__children:"))
      .map((module) => module.split(":")[0])
      .filter((module) => !nonBusinessModules.has(module))
  );
  return businessModules.size === 1 && businessModules.has("Restaurant");
}
