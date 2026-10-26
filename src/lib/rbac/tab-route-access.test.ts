import { describe, expect, it } from "vitest";
import { resolveTabRouteAccess } from "./tab-route-access";

describe("configured tab route access", () => {
  it("maps restaurant sections to their configured tabs", () => {
    expect(resolveTabRouteAccess("/restaurant", new URLSearchParams())).toEqual({
      module: "restaurant",
      page: "operations",
      tab: "orders"
    });
    expect(resolveTabRouteAccess("/restaurant", new URLSearchParams("view=menu"))).toEqual({
      module: "restaurant",
      page: "operations",
      tab: "menu"
    });
    expect(resolveTabRouteAccess("/restaurant", new URLSearchParams("view=tables"))).toEqual({
      module: "restaurant",
      page: "operations",
      tab: "tables"
    });
    expect(resolveTabRouteAccess("/restaurant", new URLSearchParams("view=unknown"))).toBeNull();
  });

  it("maps sales and inventory routes to their configured tabs", () => {
    expect(resolveTabRouteAccess("/sales/new", new URLSearchParams())).toEqual({
      module: "sales",
      page: "sales",
      tab: "new_sales"
    });
    expect(resolveTabRouteAccess("/inventory/transfers/new", new URLSearchParams())).toEqual({
      module: "inventory",
      page: "stock_transfer",
      tab: "create_transfer"
    });
    expect(resolveTabRouteAccess("/inventory/categories", new URLSearchParams())).toEqual({
      module: "inventory",
      page: "products",
      tab: "product_categories"
    });
    expect(resolveTabRouteAccess("/reports/sales", new URLSearchParams())).toEqual({
      module: "sales",
      page: "sales",
      tab: "reports"
    });
    expect(resolveTabRouteAccess("/inventory/intelligence", new URLSearchParams("view=dead_stock"))).toEqual({
      module: "inventory",
      page: "inventory_intelligence",
      tab: "dead_stock"
    });
    expect(resolveTabRouteAccess("/inventory/intelligence", new URLSearchParams("view=slow_moving_stock"))).toEqual({
      module: "inventory",
      page: "inventory_intelligence",
      tab: "slow_moving_stock"
    });
    expect(resolveTabRouteAccess("/inventory/intelligence", new URLSearchParams("view=forecasting"))).toEqual({
      module: "inventory",
      page: "inventory_intelligence",
      tab: "forecasting"
    });
  });

  it("maps configured HRM routes and dynamic employee pages", () => {
    expect(resolveTabRouteAccess("/hrm/payroll", new URLSearchParams())).toEqual({
      module: "hrm_payroll",
      page: "hrm",
      tab: "payroll"
    });
    expect(resolveTabRouteAccess("/hrm/employee-id/edit", new URLSearchParams())).toEqual({
      module: "hrm_payroll",
      page: "hrm",
      tab: "employees"
    });
  });

  it("resolves selected accounting and CRM tabs from their URL state", () => {
    expect(resolveTabRouteAccess("/accounting", new URLSearchParams("tab=coa"))).toEqual({
      module: "accounting",
      page: "accounting",
      tab: "coa"
    });
    expect(resolveTabRouteAccess("/crm", new URLSearchParams("tab=Activities"))).toEqual({
      module: "crm",
      page: "crm",
      tab: "activities"
    });
    expect(resolveTabRouteAccess("/crm", new URLSearchParams())).toBeNull();
    expect(resolveTabRouteAccess("/crm", new URLSearchParams("tab=Other"))).toBeNull();
    expect(resolveTabRouteAccess("/accounting/expenses", new URLSearchParams())).toEqual({
      module: "accounting",
      page: "accounting",
      tab: "payables"
    });
  });

  it("maps Banking account statements separately from transaction history", () => {
    expect(resolveTabRouteAccess("/banking", new URLSearchParams())).toBeNull();
    expect(resolveTabRouteAccess("/banking", new URLSearchParams("tab=transactions"))).toEqual({
      module: "banking",
      page: "banking",
      tab: "transactions"
    });
    expect(resolveTabRouteAccess("/banking/new", new URLSearchParams())).toEqual({
      module: "banking",
      page: "banking",
      tab: "accounts"
    });

    expect(resolveTabRouteAccess("/banking/account-id", new URLSearchParams("view=statement"))).toEqual({
      module: "banking",
      page: "banking",
      tab: "reconciliation"
    });
    expect(resolveTabRouteAccess("/banking/account-id", new URLSearchParams())).toEqual({
      module: "banking",
      page: "banking",
      tab: "transactions"
    });
    expect(resolveTabRouteAccess("/banking/cash-closing", new URLSearchParams())).toEqual({
      module: "banking",
      page: "banking",
      tab: "reconciliation"
    });
  });

  it("leaves Inventory Intelligence's unselected route to choose the user's first allowed view", () => {
    expect(resolveTabRouteAccess("/inventory/intelligence", new URLSearchParams())).toBeNull();
    expect(resolveTabRouteAccess("/inventory/intelligence", new URLSearchParams("view=unknown"))).toBeNull();
    expect(resolveTabRouteAccess("/banking", new URLSearchParams("tab=unknown"))).toBeNull();
  });

  it("does not apply tab routing rules to unrelated pages", () => {
    expect(resolveTabRouteAccess("/dashboard", new URLSearchParams())).toBeNull();
  });
});
