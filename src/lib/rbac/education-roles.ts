import type { PermissionMatrix } from "./permission-matrix";

export interface EducationRolePreset {
  key: string;
  name: string;
  description: string;
  permissions: PermissionMatrix;
}

export const EDUCATION_ROLE_PRESETS: EducationRolePreset[] = [
  {
    key: "education_admin",
    name: "Education Administrator",
    description: "Manage education operations, workflows, settings, and campus access within assigned scope.",
    permissions: {
      education_dashboard: ["view", "export"],
      education_organization: ["view", "create", "edit", "export"],
      education_students: ["view", "create", "edit", "export", "import"],
      education_guardians: ["view", "create", "edit", "export", "import"],
      education_staff: ["view", "create", "edit", "approve", "export", "import"],
      education_reports: ["view", "export"],
      education_admissions: ["view", "create", "edit", "approve", "export"],
      education_academics: ["view", "create", "edit", "approve", "export"],
      education_attendance: ["view", "create", "edit", "export"],
      education_timetables: ["view", "create", "edit", "export"],
      education_examinations: ["view", "create", "edit", "publish", "export"],
      education_results: ["view", "create", "edit", "approve", "publish", "export", "print"],
      education_promotion: ["view", "create", "edit", "approve", "export"],
      education_transfers: ["view", "create", "edit", "approve", "export"],
      education_user_management: ["view", "edit", "manage_users"],
      education_settings: ["view", "create", "edit", "manage_settings"],
      education_finance: ["view", "create", "edit", "approve", "export", "print"],
      education_expenses: ["view", "create", "edit", "approve", "export"],
      education_library: ["view", "create", "edit", "approve", "export"],
      education_transport: ["view", "create", "edit", "export"],
      education_inventory_assets: ["view", "create", "edit", "export"],
      education_communication: ["view", "create", "edit", "publish", "export"],
      education_documents: ["view", "create", "edit", "delete", "export"],
      education_notifications: ["view", "edit"],
      education_audit: ["view_audit", "export"],
    },
  },
  {
    key: "education_teacher",
    name: "Teacher",
    description: "Manage class attendance and grades while viewing assigned student and academic records.",
    permissions: {
      education_dashboard: ["view"],
      education_students: ["view"],
      education_attendance: ["view", "create", "edit"],
      "education_attendance.attendance.staff": [],
      education_academics: ["view"],
      education_timetables: ["view"],
      education_examinations: ["view"],
      education_results: ["view", "create", "edit"],
      "education_reports.reports.outcomes": ["view"],
      education_communication: ["view"],
      education_notifications: ["view", "edit"],
      education_documents: ["view"],
    },
  },
  {
    key: "education_registrar",
    name: "Registrar",
    description: "Process admissions, maintain student records, and manage academic enrollment.",
    permissions: {
      education_dashboard: ["view"],
      education_students: ["view", "create", "edit", "export"],
      education_guardians: ["view", "create", "edit"],
      education_admissions: ["view", "create", "edit", "approve", "export"],
      education_academics: ["view"],
      education_attendance: ["view"],
      education_reports: ["view"],
      education_documents: ["view", "create", "edit"],
      education_notifications: ["view", "edit"],
    },
  },
  {
    key: "education_accountant",
    name: "Education Accountant",
    description: "Manage campus fee collection, receipts, expense records, and finance reports.",
    permissions: {
      education_dashboard: ["view"],
      education_students: ["view"],
      education_guardians: ["view"],
      education_finance: ["view", "create", "edit", "export", "print"],
      education_expenses: ["view", "create", "edit", "export"],
      education_reports: ["view", "export"],
      education_audit: ["view_audit"],
    },
  },
  {
    key: "education_librarian",
    name: "Librarian",
    description: "Manage the library catalog and circulation while viewing student records.",
    permissions: {
      education_dashboard: ["view"],
      education_students: ["view"],
      education_library: ["view", "create", "edit", "approve", "export"],
      education_inventory_assets: ["view"],
      education_notifications: ["view", "edit"],
    },
  },
];

export function getEducationRolePreset(roleKey: string): EducationRolePreset | undefined {
  return EDUCATION_ROLE_PRESETS.find((preset) => preset.key === roleKey);
}
