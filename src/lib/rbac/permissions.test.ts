import { describe, expect, it } from "vitest";
import {
  defaultPermissionMatrixForRole,
  normalizePermissionMatrix,
  resolveMemberPermissionMatrix,
  resolveTabPermissionActions
} from "./permission-matrix";

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
});
