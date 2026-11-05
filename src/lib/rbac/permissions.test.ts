import { describe, expect, it } from "vitest";
import {
  defaultPermissionMatrixForRole,
  normalizePermissionMatrix,
  resolveMemberPermissionMatrix,
  resolveTabPermissionActions
} from "./permission-matrix";
import { hasRestaurantModuleAccess, isRestaurantOnlyOrganizationModuleSet, isRestaurantRoleKey } from "./restaurant-roles";
import { getOrganizationPermissionConfigs } from "@/components/dashboard/user-management/constants";

describe("role permission inheritance", () => {
  it("uses the saved role template instead of an old unmarked member snapshot", () => {
    const result = resolveMemberPermissionMatrix(
      { permissions: { expenses: ["create"] } },
      { sales: ["view", "create"] },
      true,
      "cashier"
    );

    expect(result).toEqual({ sales: ["view", "create"] });
  });

  it("uses a custom member override when it is explicitly marked", () => {
    const result = resolveMemberPermissionMatrix(
      {
        permissions_mode: "custom",
        permissions: { expenses: ["view"] }
      },
      { expenses: ["view", "create"] },
      true,
      "cashier"
    );

    expect(result).toEqual({ expenses: ["view"] });
  });

  it("allows an explicit empty custom matrix to deny all module actions", () => {
    const result = resolveMemberPermissionMatrix(
      { permissions_mode: "custom", permissions: {} },
      { expenses: ["view", "create"] },
      true,
      "cashier"
    );

    expect(result).toEqual({});
  });

  it("uses built-in role permissions when an organization has no saved template", () => {
    expect(
      resolveMemberPermissionMatrix({}, undefined, false, "cashier")
    ).toEqual(defaultPermissionMatrixForRole("cashier"));
    expect(defaultPermissionMatrixForRole("sales_officer").sales).toContain("create");
  });

  it("includes service appointment access in the built-in branch manager permissions", () => {
    const manager = defaultPermissionMatrixForRole("manager");

    expect(manager.service_appointments).toEqual(["view", "create", "edit"]);
    expect(manager.service_jobs).toContain("edit");
  });

  it("uses the compatibility fallback only when no role template exists", () => {
    const accessPermissions = {
      permissions_mode: "inherit",
      role_defaults_fallback: { expenses: ["create"] }
    };

    expect(
      resolveMemberPermissionMatrix(accessPermissions, undefined, false, "cashier")
    ).toEqual({ expenses: ["create"] });
    expect(
      resolveMemberPermissionMatrix(accessPermissions, { expenses: ["view"] }, true, "cashier")
    ).toEqual({ expenses: ["view"] });
  });

  it("respects an explicitly saved empty role template", () => {
    expect(
      resolveMemberPermissionMatrix({}, {}, true, "cashier")
    ).toEqual({});
  });

  it("preserves tab permission entries, including an explicit deny-all override", () => {
    const matrix = normalizePermissionMatrix({
      sales: ["view", "create"],
      "sales.sales.new_sales": []
    });

    expect(matrix["sales.sales.new_sales"]).toEqual([]);
    expect(resolveTabPermissionActions(matrix, "sales", "sales", "new_sales")).toEqual([]);
    expect(resolveTabPermissionActions(matrix, "sales", "sales", "sales_history")).toEqual(["view", "create"]);
  });

  it("uses restaurant-specific permission presets without granting unrelated ERP access", () => {
    const cashier = defaultPermissionMatrixForRole("restaurant_cashier");

    expect(cashier.restaurant).toContain("create");
    expect(cashier["restaurant.operations.orders"]).toContain("create");
    expect(cashier.accounting).toBeUndefined();
    expect(cashier.inventory).toBeUndefined();
    expect(cashier.user_management).toBeUndefined();
  });

  it("recognizes restaurant-only organizations and restaurant role keys", () => {
    expect(isRestaurantOnlyOrganizationModuleSet([
      "Restaurant",
      "Restaurant:Restaurant POS",
      "__children:Restaurant",
      "Dashboard",
      "Settings",
      "Users"
    ])).toBe(true);
    expect(isRestaurantOnlyOrganizationModuleSet(["Restaurant", "Inventory", "Dashboard"])).toBe(false);
    expect(hasRestaurantModuleAccess(["__children:Restaurant", "Restaurant:Restaurant POS"])).toBe(true);
    expect(isRestaurantRoleKey("restaurant_server")).toBe(true);
    expect(isRestaurantRoleKey("accountant")).toBe(false);
  });

  it("limits the user-management permission catalogs to enabled organization modules and features", () => {
    const { modules, pages } = getOrganizationPermissionConfigs([
      "Dashboard",
      "Restaurant",
      "__children:Restaurant",
      "Restaurant:Restaurant POS",
      "Users",
    ]);

    expect(modules.map((module) => module.key)).toEqual(["dashboard", "restaurant", "user_management"]);
    expect(pages.restaurant?.[0].tabs.map((tab) => tab.key)).toEqual(["pos"]);
    expect(pages.sales).toBeUndefined();
  });
});
