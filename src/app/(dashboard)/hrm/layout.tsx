import { HrmTabNavigation } from "@/components/hrm/hrm-tab-navigation";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { isTabVisible, loadPermissionMatrix } from "@/lib/rbac/permissions";

const HRM_TAB_KEYS: Record<string, string> = {
  "/hrm/employees": "employees",
  "/hrm/attendance": "attendance",
  "/hrm/leave": "leave_management",
  "/hrm/payroll": "payroll",
  "/hrm/payslips": "payslips",
  "/hrm/performance-reviews": "performance_reviews",
  "/hrm/departments": "departments",
  "/hrm/recruitment": "recruitment",
  "/hrm/training": "training",
  "/hrm/asset-assignment": "asset_assignment",
  "/hrm/discipline": "discipline",
  "/hrm/organization-chart": "organization_chart",
  "/hrm/reports": "reports"
};

export default async function HrmLayout({ children }: { children: React.ReactNode }) {
  const context = await getCurrentOrgContext();
  const matrix = context
    ? await loadPermissionMatrix(context.orgId, context.role, context.accessPermissions)
    : {};
  const visibleTabs = Object.entries(HRM_TAB_KEYS)
    .filter(([, tab]) => context?.role === "owner" || isTabVisible(matrix, "hrm_payroll", "hrm", tab))
    .map(([href]) => href);

  return (
    <div className="hrm-page space-y-1">
      <HrmTabNavigation visibleTabs={visibleTabs} />
      {children}
    </div>
  );
}
