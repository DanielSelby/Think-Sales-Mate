import { describe, expect, it } from "vitest";
import {
  defaultPermissionMatrixForRole,
  normalizePermissionMatrix,
  resolveMemberPermissionMatrix,
  resolveTabPermissionActions
} from "./permission-matrix";
import { hasRestaurantModuleAccess, isRestaurantOnlyOrganizationModuleSet, isRestaurantRoleKey } from "./restaurant-roles";
import { EDUCATION_ROLE_PRESETS, getEducationRolePreset } from "./education-roles";
import {
  getOrganizationPermissionConfigs,
  MODULE_CONFIGS,
  PERMISSION_PAGE_CONFIGS,
} from "@/components/dashboard/user-management/constants";
import { filterPermissionMatrixForProduct } from "@/lib/product-entitlement-routes";

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

  it("preserves education workflow actions such as publishing and rejection", () => {
    expect(normalizePermissionMatrix({
      education_results: ["view", "edit", "approve", "publish"],
      education_admissions: ["view", "reject"],
    })).toEqual({
      education_results: ["view", "edit", "approve", "publish"],
      education_admissions: ["view", "reject"],
    });
  });

  it("exposes a separate publish permission for campus announcements", () => {
    const announcements = PERMISSION_PAGE_CONFIGS.education_communication
      .find((page) => page.key === "communication")
      ?.tabs.find((tab) => tab.key === "announcements");

    expect(announcements?.supportedActions).toContain("publish");
    expect(announcements?.supportedActions).toContain("create");
    expect(announcements?.supportedActions).toContain("edit");
  });

  it("defines independent view, create, and edit permissions for education documents", () => {
    const documents = PERMISSION_PAGE_CONFIGS.education_documents
      .find((page) => page.key === "documents")
      ?.tabs.find((tab) => tab.key === "library");

    expect(documents?.supportedActions).toEqual(expect.arrayContaining(["view", "create", "edit", "delete"]));
  });

  it("defines view and preference-edit permissions for education notifications", () => {
    const tabs = PERMISSION_PAGE_CONFIGS.education_notifications
      .find((page) => page.key === "notifications")?.tabs;

    expect(tabs?.find((tab) => tab.key === "inbox")?.supportedActions).toContain("view");
    expect(tabs?.find((tab) => tab.key === "preferences")?.supportedActions).toContain("edit");
  });

  it("defines a separate audit-view permission for education activity records", () => {
    const records = PERMISSION_PAGE_CONFIGS.education_audit
      .find((page) => page.key === "activity")
      ?.tabs.find((tab) => tab.key === "records");

    expect(records?.supportedActions).toContain("view_audit");
  });

  it("defines separate view and export permissions for education staff reports", () => {
    const staffReports = PERMISSION_PAGE_CONFIGS.education_reports
      .find((page) => page.key === "reports")
      ?.tabs.find((tab) => tab.key === "staff");
    const attendanceReport = PERMISSION_PAGE_CONFIGS.education_reports
      .find((page) => page.key === "reports")
      ?.tabs.find((tab) => tab.key === "attendance");
    const outcomesReport = PERMISSION_PAGE_CONFIGS.education_reports
      .find((page) => page.key === "reports")
      ?.tabs.find((tab) => tab.key === "outcomes");
    const enrollmentReport = PERMISSION_PAGE_CONFIGS.education_reports
      .find((page) => page.key === "reports")
      ?.tabs.find((tab) => tab.key === "enrollment");

    expect(staffReports?.supportedActions).toEqual(expect.arrayContaining(["view", "export"]));
    expect(attendanceReport?.supportedActions).toEqual(expect.arrayContaining(["view", "export"]));
    expect(outcomesReport?.supportedActions).toEqual(expect.arrayContaining(["view", "export"]));
    expect(enrollmentReport?.supportedActions).toEqual(expect.arrayContaining(["view", "export"]));
    expect(MODULE_CONFIGS.find((module) => module.key === "education_reports")?.supportedActions)
      .toEqual(["view", "export"]);
  });

  it("defines staff attendance permissions separately from the student register", () => {
    const tabs = PERMISSION_PAGE_CONFIGS.education_attendance
      .find((page) => page.key === "attendance")?.tabs;

    expect(tabs?.find((tab) => tab.key === "register")?.name).toBe("Student Register");
    expect(tabs?.find((tab) => tab.key === "staff")?.supportedActions).toEqual(
      expect.arrayContaining(["view", "create", "edit"]),
    );
  });

  it("defines separate staff leave request and approval permissions", () => {
    const leave = PERMISSION_PAGE_CONFIGS.education_staff
      .find((page) => page.key === "staff")
      ?.tabs.find((tab) => tab.key === "leave");

    expect(leave?.supportedActions).toEqual(expect.arrayContaining(["view", "create", "approve"]));
  });

  it("allows approval permissions for the education staff module", () => {
    const staffModule = MODULE_CONFIGS.find((module) => module.key === "education_staff");

    expect(staffModule?.supportedActions).toContain("approve");
  });

  it("defines staff transfer permissions for requests and approvals", () => {
    const transfers = PERMISSION_PAGE_CONFIGS.education_staff
      .find((page) => page.key === "staff")
      ?.tabs.find((tab) => tab.key === "transfers");

    expect(transfers?.supportedActions).toEqual(expect.arrayContaining(["view", "create", "approve", "edit"]));
  });

  it("defines academic calendar permissions for term creation and lifecycle changes", () => {
    const calendar = PERMISSION_PAGE_CONFIGS.education_academics
      .find((page) => page.key === "academics")
      ?.tabs.find((tab) => tab.key === "calendar");

    expect(calendar?.supportedActions).toEqual(expect.arrayContaining(["view", "create", "edit", "approve"]));
  });

  it("defines review and approval permissions for admissions lifecycle actions", () => {
    const applications = PERMISSION_PAGE_CONFIGS.education_admissions
      .find((page) => page.key === "admissions")
      ?.tabs.find((tab) => tab.key === "applications");

    expect(applications?.supportedActions).toEqual(expect.arrayContaining(["view", "create", "edit", "approve"]));
    expect(MODULE_CONFIGS.find((module) => module.key === "education_admissions")?.supportedActions)
      .toContain("approve");
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

  it("shows Think Education permissions only for enabled education features", () => {
    const { modules, pages } = getOrganizationPermissionConfigs([
      "Students",
      "Parent & Guardian Management",
      "Timetables",
      "User Management",
      "Settings",
      "Fees & Finance",
      "Expenses Management",
      "Think Education",
      "Dashboard",
    ]);

    expect(modules.map((module) => module.key)).toEqual(expect.arrayContaining([
      "education_dashboard",
      "education_students",
      "education_guardians",
      "education_timetables",
      "education_user_management",
      "education_settings",
      "education_finance",
      "education_expenses",
      "dashboard",
      "user_management",
    ]));
    expect(pages.education_students?.[0].tabs[0].key).toBe("list");
    expect(pages.education_guardians?.[0].tabs.map((tab) => tab.key)).toEqual(["directory", "relationships"]);
    expect(pages.education_timetables?.[0].tabs[0].key).toBe("schedule");
    expect(pages.education_user_management?.[0].tabs.map((tab) => tab.key)).toEqual(["directory", "branch_access"]);
    expect(pages.education_settings?.[0].tabs.map((tab) => tab.key)).toEqual(["institution", "terminology"]);
    expect(pages.education_finance?.[0].tabs.map((tab) => tab.key)).toEqual(["charges", "payments"]);
    expect(pages.education_expenses?.[0].tabs.map((tab) => tab.key)).toEqual(["records"]);
    expect(pages.education_staff).toBeUndefined();
  });

  it("keeps product role permissions isolated when saving Think Education roles", () => {
    const educationPermissions = filterPermissionMatrixForProduct({
      education_students: ["view", "create"],
      education_finance: ["view"],
      sales: ["view", "create"],
      restaurant: ["view"],
      user_management: ["view"],
    }, "think-education");

    expect(educationPermissions).toEqual({
      education_students: ["view", "create"],
      education_finance: ["view"],
    });
  });

  it("provides product-only education role presets with scoped workflow permissions", () => {
    expect(EDUCATION_ROLE_PRESETS.map((preset) => preset.key)).toEqual([
      "education_admin",
      "education_teacher",
      "education_registrar",
      "education_accountant",
      "education_librarian",
    ]);

    const teacher = getEducationRolePreset("education_teacher");
    expect(teacher?.permissions.education_attendance).toEqual(["view", "create", "edit"]);
    expect(teacher?.permissions.education_examinations).toEqual(["view"]);
    expect(teacher?.permissions["education_reports.reports.outcomes"]).toEqual(["view"]);
    expect(teacher?.permissions["education_attendance.attendance.staff"]).toEqual([]);
    expect(teacher?.permissions.education_finance).toBeUndefined();
    expect(filterPermissionMatrixForProduct(teacher?.permissions ?? {}, "think-education"))
      .toEqual(teacher?.permissions);
    expect(filterPermissionMatrixForProduct(
      getEducationRolePreset("education_accountant")?.permissions ?? {},
      "restaurant",
    )).toEqual({});
  });
});
