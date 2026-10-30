export interface TabRouteAccess {
  module: string;
  page: string;
  tab: string;
}

const ACCOUNTING_TAB_KEYS: Record<string, string> = {
  overview: "overview",
  coa: "coa",
  journal: "journal",
  reconciliation: "reconciliation",
  receivables: "receivables",
  payables: "payables",
  fixed_assets: "fixed_assets",
  reports: "reports",
  tax: "tax",
  settings: "settings"
};

const HRM_ROUTE_TABS: Record<string, string> = {
  "/hrm": "employees",
  "/hrm/employees": "employees",
  "/hrm/attendance": "attendance",
  "/hrm/leave": "leave_management",
  "/hrm/payroll": "payroll",
  "/hrm/payslips": "payslips",
  "/hrm/my-payslips": "payslips",
  "/hrm/performance-reviews": "performance_reviews",
  "/hrm/departments": "departments",
  "/hrm/recruitment": "recruitment",
  "/hrm/training": "training",
  "/hrm/asset-assignment": "asset_assignment",
  "/hrm/discipline": "discipline",
  "/hrm/organization-chart": "organization_chart",
  "/hrm/reports": "reports"
};

function isPathOrChild(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function resolveTabRouteAccess(
  pathname: string,
  searchParams: URLSearchParams
): TabRouteAccess | null {
  if (isPathOrChild(pathname, "/restaurant")) {
    const selected = searchParams.get("view") ?? "orders";
    const tabByView: Record<string, string> = {
      orders: "orders",
      kitchen: "kitchen",
      menu: "menu",
      "online-ordering": "menu",
      tables: "tables",
      reservations: "reservations",
      catering: "orders",
      reports: "reports",
      ingredients: "ingredients",
    };
    const tab = tabByView[selected];
    return tab ? { module: "restaurant", page: "operations", tab } : null;
  }
  if (pathname === "/reports/sales") return { module: "sales", page: "sales", tab: "reports" };
  if (isPathOrChild(pathname, "/sales")) {
    if (pathname === "/sales/new") return { module: "sales", page: "sales", tab: "new_sales" };
    if (pathname === "/sales/company") return { module: "sales", page: "sales", tab: "settings" };
    if (pathname === "/sales/returns") return { module: "sales", page: "sales", tab: "returns" };
    if (pathname === "/sales/reports") return { module: "sales", page: "sales", tab: "reports" };
    return { module: "sales", page: "sales", tab: "sales_history" };
  }

  if (isPathOrChild(pathname, "/inventory")) {
    if (isPathOrChild(pathname, "/inventory/transfers")) {
      return pathname === "/inventory/transfers/new"
        ? { module: "inventory", page: "stock_transfer", tab: "create_transfer" }
        : { module: "inventory", page: "stock_transfer", tab: "transfer_history" };
    }
    if (pathname === "/inventory/categories") return { module: "inventory", page: "products", tab: "product_categories" };
    if (pathname === "/inventory/prices") return { module: "inventory", page: "products", tab: "price_management" };
    if (pathname === "/inventory/import") return { module: "inventory", page: "products", tab: "import_products" };
    if (pathname === "/inventory/intelligence") {
      if (!searchParams.has("view")) return null;
      const selected = searchParams.get("view") ?? "dashboard";
      const tabByView: Record<string, string> = {
        dashboard: "dashboard",
        dead_stock: "dead_stock",
        slow_moving_stock: "slow_moving_stock",
        forecasting: "forecasting"
      };
      const tab = tabByView[selected];
      return tab ? { module: "inventory", page: "inventory_intelligence", tab } : null;
    }
    if (pathname === "/inventory/new") return { module: "inventory", page: "products", tab: "add_product" };
    return { module: "inventory", page: "products", tab: "product_list" };
  }

  if (isPathOrChild(pathname, "/hrm")) {
    let route = HRM_ROUTE_TABS[pathname];
    if (!route && isPathOrChild(pathname, "/hrm/payroll")) route = "payroll";
    if (!route && isPathOrChild(pathname, "/hrm/payslips")) route = "payslips";
    if (!route && /^\/hrm\/[^/]+(?:\/edit)?$/.test(pathname)) route = "employees";
    if (route) return { module: "hrm_payroll", page: "hrm", tab: route };
  }

  if (isPathOrChild(pathname, "/purchases")) {
    if (pathname === "/purchases/new") return { module: "purchases", page: "purchases", tab: "new_purchase" };
    if (isPathOrChild(pathname, "/purchases/returns")) return { module: "purchases", page: "purchases", tab: "returns" };
    if (pathname === "/purchases/reports") return { module: "purchases", page: "purchases", tab: "reports" };
    return { module: "purchases", page: "purchases", tab: "purchase_history" };
  }

  if (isPathOrChild(pathname, "/accounting/expenses")) {
    return { module: "accounting", page: "accounting", tab: "payables" };
  }

  if (pathname === "/accounting" || isPathOrChild(pathname, "/accounting")) {
    const selected = searchParams.get("tab") ?? "overview";
    return {
      module: "accounting",
      page: "accounting",
      tab: ACCOUNTING_TAB_KEYS[selected] ?? "overview"
    };
  }

  if (isPathOrChild(pathname, "/crm")) {
    if (pathname === "/crm" && !searchParams.has("tab")) return null;
    const tabByView: Record<string, string> = {
      Customers: "customers",
      Leads: "leads",
      Activities: "activities",
      Reports: "reports"
    };
    const tab = tabByView[searchParams.get("tab") ?? ""];
    return tab ? { module: "crm", page: "crm", tab } : null;
  }

  if (isPathOrChild(pathname, "/banking")) {
    if (pathname === "/banking" && !searchParams.has("tab")) return null;
    if (pathname === "/banking/new") return { module: "banking", page: "banking", tab: "accounts" };
    if (pathname !== "/banking") {
      if (isPathOrChild(pathname, "/banking/cash-closing")) {
        return { module: "banking", page: "banking", tab: "reconciliation" };
      }
      return searchParams.get("view") === "statement"
        ? { module: "banking", page: "banking", tab: "reconciliation" }
        : { module: "banking", page: "banking", tab: "transactions" };
    }
    const selected = searchParams.get("tab") ?? "accounts";
    const tab = ["accounts", "transactions", "reconciliation"].includes(selected) ? selected : null;
    return tab ? { module: "banking", page: "banking", tab } : null;
  }

  return null;
}
