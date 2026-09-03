"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, ShoppingCart, Boxes, Users, Contact,
  Wallet, Landmark, Receipt, Package, FolderKanban,
  BarChart3, Settings, Sparkles, Lock,
  ChevronLeft, ChevronRight, ChevronDown,
  Truck, ClipboardEdit, Users2, FileText, Tag,
  PlusCircle, List, ShoppingBag, LayoutGrid, CalendarClock, Layers, Upload,Clock3,
  Inbox, Headphones,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore, THEMES } from "@/store/useAppStore";

export interface NavChild {
  label: string;
  href:  string;
  icon?: React.ComponentType<{ className?: string }>;
}

export interface NavItem {
  label:     string;
  href:      string;
  icon:      React.ComponentType<{ className?: string }>;
  status:    "live" | "soon";
  children?: NavChild[];
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href:  "/dashboard",
    icon:  LayoutDashboard,
    status: "live",
  },
  {
    label: "POS",
    href:  "/pos",
    icon:  ShoppingCart,
    status: "live",
  },

  // ── Sales group ───────────────────────────────────────────
  {
    label: "Sales",
    href:  "/sales",
    icon:  Receipt,
    status: "live",
    children: [
      { label: "All Sales",                href: "/sales",               icon: List        },
      { label: "New Sale",                 href: "/sales/new",           icon: PlusCircle  },
      { label: "Drafts & Quotations List", href: "/sales/drafts",        icon: Clock3     },
      { label: "Inv.list",                 href: "/accounting/invoices", icon: FileText   },
      
    ],
  },

  {
    label: "Orders",
    href:  "/orders",
    icon:  Inbox,
    status: "live",
    children: [
      { label: "Order Tracker",          href: "/orders",                          icon: List        },
      { label: "Order List",             href: "/orders?tab=all",                  icon: List        },
      { label: "Customer Order Settings", href: "/settings/customer-ordering",     icon: Settings    },
    ],
  },

  // ── Purchases group ───────────────────────────────────────
  {
    label: "Purchases",
    href:  "/purchases",
    icon:  ShoppingBag,
    status: "live",
    children: [
      { label: "All Purchases", href: "/purchases",         icon: List       },
      { label: "Add Purchase",  href: "/purchases/new",     icon: PlusCircle },
      { label: "Suppliers",     href: "/purchases/suppliers", icon: Truck    },
      { label: "Purchase Returns", href: "/purchases/returns/new", icon: FileText },
    ],
  },

  // ── Inventory group ───────────────────────────────────────
  {
    label: "Inventory",
    href:  "/inventory",
    icon:  Boxes,
    status: "live",
    children: [
      { label: "All Products",           href: "/inventory",                icon: List         },
      { label: "Add Product",            href: "/inventory/new",             icon: PlusCircle   },
      { label: "Import Products",        href: "/inventory/import",          icon: Upload       },
      { label: "New Stock Transfer",     href: "/inventory/transfers/new",   icon: PlusCircle   },
      { label: "Stock Transfer Details", href: "/inventory/transfers",       icon: Truck        },
      { label: "Stock Adjustment",       href: "/inventory/adjustments",     icon: ClipboardEdit },
      { label: "Stock Taking",           href: "/inventory/stock-taking",    icon: Layers       },
      { label: "Adjustment History",      href: "/inventory/history",        icon: FileText     },
      { label: "Locations",             href: "/settings/locations",        icon: LayoutGrid   },
    ],
  },

  { label: "CRM",           href: "/crm",        icon: Contact,      status: "live" },
  {
    label: "Expenses",
    href: "/expenses",
    icon: Tag,
    status: "live",
    children: [
      { label: "All Expenses", href: "/expenses",     icon: List       },
      { label: "Add Expense",  href: "/expenses/new", icon: PlusCircle },
      { label: "Expense Categories", href: "/expenses/categories", icon: LayoutGrid },
    ],
  },
  {
    label: "HRM & Payroll",
    href: "/hrm",
    icon: Users,
    status: "live",
    children: [
      { label: "Dashboard", href: "/hrm", icon: LayoutDashboard },
      { label: "Employees", href: "/hrm/employees", icon: Users2 },
      { label: "Attendance", href: "/hrm/attendance", icon: CalendarClock },
      { label: "Leave Management", href: "/hrm/leave", icon: ClipboardEdit },
    ],
  },
  {
    label: "Accounting",
    href:  "/accounting",
    icon:  Wallet,
    status: "live",
    children: [
      { label: "Overview",            href: "/accounting?tab=overview",       icon: LayoutDashboard },
      { label: "Chart of Accounts",   href: "/accounting?tab=coa",            icon: List },
      { label: "Journal Entries",     href: "/accounting?tab=journal",        icon: FileText },
      { label: "Bank Reconciliation", href: "/accounting?tab=reconciliation", icon: Landmark },
      { label: "Accounts Receivable", href: "/accounting?tab=receivables",    icon: Receipt },
      { label: "Accounts Payable",    href: "/accounting?tab=payables",       icon: ShoppingBag },
      { label: "Reports",             href: "/accounting?tab=reports",        icon: BarChart3 },
    ],
  },
  { label: "Banking",       href: "/banking",    icon: Landmark,     status: "live" },
  { label: "Assets",        href: "/assets",     icon: Package,      status: "live" },
  { label: "Projects",      href: "/projects",   icon: FolderKanban, status: "live" },
  { label: "Reports",       href: "/reports",    icon: BarChart3,    status: "live" },
  { label: "AI Assistant",  href: "/ai",         icon: Sparkles,     status: "live" },
  { label: "User Management", href: "/settings/organization", icon: Users2, status: "live" },
];

const SETTINGS_CHILDREN: NavChild[] = [
  { label: "Overview",      href: "/settings"              },
  { label: "Company",       href: "/settings/company"      },
  { label: "Users",         href: "/settings/organization" },
  { label: "Team",          href: "/settings/team"         },
  { label: "Locations",     href: "/settings/locations"    },
  { label: "Currencies",    href: "/settings/currencies"   },
  { label: "Customer Ordering", href: "/settings/customer-ordering" },
  { label: "Billing",       href: "/settings/billing"      },
  { label: "Members",       href: "/settings/members"      },
  { label: "Integrations", href: "/settings/integrations" },
];

// ── Reusable child list ───────────────────────────────────────

function ChildLinks({ items, sidebar }: {
  items:   NavChild[];
  sidebar: { text: string; textMuted: string; borderColor: string };
}) {
  const pathname = usePathname();
  return (
    <div className="ml-6 mt-0.5 mb-0.5 pl-3 space-y-0.5"
      style={{ borderLeft: `1px solid ${sidebar.borderColor}` }}>
      {items.map(child => {
        const Icon        = child.icon;
        const childActive = pathname === child.href;
        return (
          <Link
            key={child.href}
            href={child.href}
            className="flex items-center gap-2 rounded-lg py-1.5 px-2 text-[13px] transition-all"
            style={{ color: childActive ? sidebar.text : sidebar.textMuted, fontWeight: childActive ? 600 : 400 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = sidebar.text; }}
            onMouseLeave={e => { if (!childActive) (e.currentTarget as HTMLElement).style.color = sidebar.textMuted; }}
          >
            {Icon && <Icon className="h-3 w-3 shrink-0 opacity-70" />}
            {child.label}
          </Link>
        );
      })}
    </div>
  );
}

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const pathname  = usePathname();
  const { activeTheme, toggleSidebar } = useAppStore();
  const theme     = THEMES[activeTheme];
  const sidebar   = theme.sidebar;

  const [openGroup, setOpenGroup] = useState<string | null>(() => {
    // Auto-open the group containing the current path on first render
    const active = NAV_ITEMS.find(item =>
      item.children?.some(c => pathname.startsWith(c.href))
    );
    return active?.href ?? null;
  });

  const toggleGroup = (href: string) => {
    if (collapsed) return;
    setOpenGroup(prev => prev === href ? null : href);
  };

  const linkStyle = (isActive: boolean) => ({
    background:  isActive ? sidebar.activeBackground : "transparent",
    color:       isActive ? sidebar.activeText : sidebar.textMuted,
    borderLeft:  isActive && !collapsed ? `3px solid ${sidebar.activeText}` : "3px solid transparent",
  });

  const hoverOn  = (e: React.MouseEvent, isActive: boolean) => {
    if (!isActive) {
      (e.currentTarget as HTMLElement).style.background = sidebar.hoverBackground;
      (e.currentTarget as HTMLElement).style.color      = sidebar.text;
    }
  };
  const hoverOff = (e: React.MouseEvent, isActive: boolean) => {
    if (!isActive) {
      (e.currentTarget as HTMLElement).style.background = "transparent";
      (e.currentTarget as HTMLElement).style.color      = sidebar.textMuted;
    }
  };

  return (
    <aside
      className={cn(
        "relative flex h-screen flex-col transition-[width] duration-200 shrink-0",
        collapsed ? "w-16" : "w-60"
      )}
      style={{ background: sidebar.background, borderRight: `1px solid ${sidebar.borderColor}` }}
    >

     {/* Top collapse toggle — floating pill on the sidebar's edge */}
  <button
    title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
    onClick={toggleSidebar}
    className="absolute -right-2.5 top-7 z-20 flex h-6 w-5 items-center justify-center rounded-md border shadow-card"
    style={{
      background: theme.colors.surface,
      borderColor: sidebar.borderColor,
      color: sidebar.textMuted,
    }}
    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = theme.colors.text; }}
    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = sidebar.textMuted; }}
  >
    {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
  </button>

      {/* ── Logo ── */}
      <div className="flex h-14 items-center gap-3 px-4 shrink-0"
        style={{ borderBottom: `1px solid ${sidebar.borderColor}` }}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-bold text-sm bg-blue-600 text-white shadow-sm">
          S
        </div>
        {!collapsed && (
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-bold tracking-tight text-white">ThinkSales</span>
            <span className="rounded bg-blue-600 px-1 py-0.2 text-[10px] font-bold text-white tracking-wide">Pro</span>
          </div>
        )}
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {NAV_ITEMS.map(item => {
          const Icon     = item.icon;
          const isSoon   = item.status === "soon";
          const isActive = !item.children && (pathname === item.href || pathname.startsWith(item.href + "/"));
          const isGroupActive = !!item.children && (pathname === item.href || item.children.some(c => pathname.startsWith(c.href)));
          const isOpen   = !collapsed && openGroup === item.href;

          // ── Collapsible group ──
          if (item.children) {
            return (
              <div key={item.href}>
                <button
                  type="button"
                  onClick={() => toggleGroup(item.href)}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl py-2.5 text-sm font-medium transition-all duration-150",
                    collapsed ? "justify-center px-2" : "px-3"
                  )}
                  style={linkStyle(isGroupActive)}
                  onMouseEnter={e => hoverOn(e, isGroupActive)}
                  onMouseLeave={e => hoverOff(e, isGroupActive)}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 truncate text-left">{item.label}</span>
                      <ChevronDown className={cn(
                        "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
                        isOpen && "rotate-180"
                      )} />
                    </>
                  )}
                </button>
                {isOpen && (
                  <ChildLinks items={item.children} sidebar={sidebar} />
                )}
              </div>
            );
          }

          // ── Regular link ──
          return (
            <Link
              key={item.href}
              href={isSoon ? "#" : item.href}
              onClick={e => isSoon && e.preventDefault()}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl py-2.5 text-sm font-medium transition-all duration-150",
                collapsed ? "justify-center px-2" : "px-3",
                isSoon && "opacity-40 cursor-default"
              )}
              style={linkStyle(isActive)}
              onMouseEnter={e => { if (!isSoon) hoverOn(e, isActive); }}
              onMouseLeave={e => { if (!isSoon) hoverOff(e, isActive); }}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
              {!collapsed && isSoon && <Lock className="h-3 w-3 shrink-0 opacity-60" />}
            </Link>
          );
        })}
      </nav>

      {/* ── Bottom: Settings + Collapse ── */}
      <div className="px-2 py-2 space-y-0.5 shrink-0"
        style={{ borderTop: `1px solid ${sidebar.borderColor}` }}>

        {/* Settings collapsible */}
        <div>
          <button
            onClick={() => toggleGroup("settings")}
            title={collapsed ? "Settings" : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl py-2.5 text-sm font-medium transition-all",
              collapsed ? "justify-center px-2" : "px-3"
            )}
            style={linkStyle(pathname.startsWith("/settings"))}
            onMouseEnter={e => hoverOn(e, pathname.startsWith("/settings"))}
            onMouseLeave={e => hoverOff(e, pathname.startsWith("/settings"))}
          >
            <Settings className="h-4 w-4 shrink-0" />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">Settings</span>
                <ChevronDown className={cn(
                  "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
                  openGroup === "settings" && "rotate-180"
                )} />
              </>
            )}
          </button>
          {!collapsed && openGroup === "settings" && (
            <ChildLinks items={SETTINGS_CHILDREN} sidebar={sidebar} />
          )}
        </div>

        {/* Need Help / Support */}
        {!collapsed && (
          <div className="px-3 py-2">
            <div className="flex items-center gap-2.5 rounded-xl bg-white/5 p-2.5 text-xs text-white/80 transition-colors hover:bg-white/10 cursor-pointer">
              <Headphones className="h-4 w-4 shrink-0 text-blue-400" />
              <div>
                <p className="font-semibold text-white">Need Help?</p>
                <p className="text-[11px] text-white/60">Contact support</p>
              </div>
            </div>
          </div>
        )}

        {/* Collapse toggle */}
        <button
          onClick={toggleSidebar}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl py-2.5 text-sm font-medium transition-all",
            collapsed ? "justify-center px-2" : "px-3"
          )}
          style={{ color: sidebar.textMuted }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = sidebar.hoverBackground; (e.currentTarget as HTMLElement).style.color = sidebar.text; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = sidebar.textMuted; }}
        >
          {collapsed
            ? <ChevronRight className="h-4 w-4" />
            : <><ChevronLeft className="h-4 w-4" /><span className="flex-1 text-left">Collapse</span></>
          }
        </button>
      </div>
    </aside>
  );
}