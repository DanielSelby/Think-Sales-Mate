import type { PlatformRole } from "@/types/platform-database";

export const PLATFORM_ADMIN_PAGES = [
  { key: "Overview", label: "Overview" },
  { key: "Organizations", label: "Organizations" },
  { key: "Subscription Plans", label: "Subscription Plans" },
  { key: "Feature Access", label: "Feature Access" },
  { key: "Organization Builder", label: "Organization Builder" },
  { key: "Usage & Analytics", label: "Usage & Analytics" },
  { key: "Activity Logs", label: "Activity Logs" },
  { key: "Impersonation", label: "Impersonation" },
  { key: "Billing & Subscriptions", label: "Billing & Subscriptions" },
  { key: "Complaints & Support", label: "Complaints & Support" },
  { key: "API & Integrations", label: "API & Integrations" },
  { key: "Security Center", label: "Security Center" },
  { key: "System Settings", label: "System Settings" },
  { key: "Feature Flags", label: "Feature Flags" },
  { key: "Audit Logs", label: "Audit Logs" },
  { key: "Login Experience", label: "Login Experience" },
  { key: "registrations", label: "Registration Approvals" },
  { key: "communication", label: "Communication Management" },
] as const;

export type PlatformAdminPage = (typeof PLATFORM_ADMIN_PAGES)[number]["key"];

export const ALL_PLATFORM_ADMIN_PAGES: PlatformAdminPage[] = PLATFORM_ADMIN_PAGES.map(({ key }) => key);

export function normalizePlatformAdminPages(value: unknown): PlatformAdminPage[] {
  if (!Array.isArray(value)) return [...ALL_PLATFORM_ADMIN_PAGES];
  const allowed = new Set<string>(ALL_PLATFORM_ADMIN_PAGES);
  return [...new Set(value.filter((page): page is PlatformAdminPage =>
    typeof page === "string" && allowed.has(page)
  ))];
}

export function platformRoleCanAccessPage(role: PlatformRole, permissions: unknown, page: PlatformAdminPage): boolean {
  if (role === "platform_owner") return true;
  return normalizePlatformAdminPages(permissions).includes(page);
}
