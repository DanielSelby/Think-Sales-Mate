export const PLATFORM_MODULES = [
  { key: "Dashboard", label: "Dashboard", href: "/dashboard" },
  { key: "POS", label: "POS", href: "/pos" },
  { key: "Sales", label: "Sales", href: "/sales" },
  { key: "Orders", label: "Orders", href: "/orders" },
  { key: "CRM", label: "CRM", href: "/crm" },
  { key: "Inventory", label: "Inventory", href: "/inventory" },
  { key: "Purchases", label: "Purchases", href: "/purchases" },
  { key: "Accounting", label: "Accounting", href: "/accounting" },
  { key: "Banking", label: "Banking", href: "/banking" },
  { key: "Assets", label: "Assets", href: "/assets" },
  { key: "Projects", label: "Projects", href: "/projects" },
  { key: "Communication", label: "Communication", href: "/communication" },
  { key: "HRM & Payroll", label: "HRM & Payroll", href: "/hrm" },
  { key: "Reports", label: "Reports", href: "/reports" },
  { key: "AI Assistant", label: "AI Assistant", href: "/ai" },
] as const;

export type PlatformModuleKey = (typeof PLATFORM_MODULES)[number]["key"];
