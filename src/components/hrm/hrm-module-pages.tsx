import { HrmModuleView, type HrmModuleRow } from "./hrm-module-view";

const columns: [string, keyof HrmModuleRow][] = [
  ["Name", "name"], ["Details", "detail"], ["Status", "status"], ["Updated", "meta"],
];

const modules: Record<string, { title: string; description: string; actionLabel: string; rows: HrmModuleRow[] }> = {
  "performance-reviews": {
    title: "Performance Reviews", description: "Plan review cycles and track employee goals and outcomes.", actionLabel: "Start review cycle",
    rows: [{ id: "review-1", name: "Annual review cycle", detail: "All departments", status: "Planned", meta: "Next quarter" }],
  },
  departments: {
    title: "Departments", description: "Organize teams, managers, and headcount across your company.", actionLabel: "Add department",
    rows: [{ id: "dept-1", name: "Operations", detail: "General operations", status: "Active", meta: "Current" }, { id: "dept-2", name: "Finance", detail: "Finance & accounting", status: "Active", meta: "Current" }],
  },
  recruitment: {
    title: "Recruitment", description: "Track open roles and candidates through your hiring pipeline.", actionLabel: "Create vacancy",
    rows: [{ id: "job-1", name: "Open positions", detail: "Candidate pipeline", status: "Open", meta: "Manage applicants" }],
  },
  training: {
    title: "Training & Development", description: "Manage learning plans and employee development activities.", actionLabel: "Add training",
    rows: [{ id: "training-1", name: "Employee development plan", detail: "Skills and compliance", status: "Planned", meta: "This year" }],
  },
  "asset-assignment": {
    title: "Asset Assignment", description: "Keep track of equipment and other assets assigned to employees.", actionLabel: "Assign asset",
    rows: [{ id: "asset-1", name: "Assigned assets", detail: "Equipment register", status: "Active", meta: "Review assignments" }],
  },
  discipline: {
    title: "Discipline & Incidents", description: "Record incidents and follow up on corrective actions securely.", actionLabel: "Log incident",
    rows: [{ id: "incident-1", name: "Incident register", detail: "Confidential HR records", status: "Ready", meta: "No open incidents" }],
  },
  "organization-chart": {
    title: "Organization Chart", description: "View reporting lines and the structure of your organization.", actionLabel: "Add position",
    rows: [{ id: "org-1", name: "Organization structure", detail: "Reporting relationships", status: "Active", meta: "View chart" }],
  },
  reports: {
    title: "Reports & Analytics", description: "Explore workforce, attendance, leave, and payroll insights.", actionLabel: "Create report",
    rows: [{ id: "report-1", name: "Workforce overview", detail: "Headcount and payroll", status: "Available", meta: "Run report" }, { id: "report-2", name: "Attendance summary", detail: "Attendance trends", status: "Available", meta: "Run report" }],
  },
};

export function HrmModulePage({ module }: { module: keyof typeof modules }) {
  const config = modules[module];
  return <HrmModuleView {...config} columns={columns} />;
}
