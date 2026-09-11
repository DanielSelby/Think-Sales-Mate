import {
  LayoutDashboard, ShoppingCart, Boxes, Users, Contact,
  Wallet, Landmark, Receipt, Package, FolderKanban,
  BarChart3, Settings, Sparkles,
  ChevronLeft, ChevronRight, ChevronDown,
  Truck, ClipboardEdit, Users2, FileText, Tag,
  PlusCircle, List, ShoppingBag, LayoutGrid, CalendarClock, Layers, Upload, Clock3,
  Inbox, MessageSquare, DollarSign, GitMerge, ClipboardCheck, ShieldCheck, ShieldAlert,
} from "lucide-react";

export interface NavChild {
  label: string;
  href: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  status: "live" | "soon";
  children?: NavChild[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, status: "live" },
  { label: "Approval Center", href: "/approvals", icon: ClipboardCheck, status: "live" },
  { label: "POS", href: "/pos", icon: ShoppingCart, status: "live" },
  {
    label: "Sales", href: "/sales", icon: Receipt, status: "live",
    children: [
      { label: "All Sales", href: "/sales", icon: List },
      { label: "New Sale", href: "/sales/new", icon: PlusCircle },
      { label: "Drafts & Quotations List", href: "/sales/drafts", icon: Clock3 },
    ],
  },
  {
    label: "Orders", href: "/orders", icon: Inbox, status: "live",
    children: [
      { label: "Order Tracker", href: "/orders?view=tracker", icon: List },
      { label: "Order List", href: "/orders?view=list", icon: List },
      { label: "Customer Order Settings", href: "/settings/customer-ordering", icon: Settings },
    ],
  },
  {
    label: "Purchases", href: "/purchases", icon: ShoppingBag, status: "live",
    children: [
      { label: "All Purchases", href: "/purchases", icon: List },
      { label: "Add Purchase", href: "/purchases/new", icon: PlusCircle },
      { label: "Suppliers", href: "/purchases/suppliers", icon: Truck },
      { label: "Purchase Returns", href: "/purchases/returns/new", icon: FileText },
    ],
  },
  {
    label: "Inventory", href: "/inventory", icon: Boxes, status: "live",
    children: [
      { label: "All Products", href: "/inventory", icon: List },
      { label: "Add Product", href: "/inventory/new", icon: PlusCircle },
      { label: "Import Products", href: "/inventory/import", icon: Upload },
      { label: "Price Management", href: "/inventory/prices", icon: DollarSign },
      { label: "Merge Products", href: "/inventory/merge", icon: GitMerge },
      { label: "Duplicate Review Center", href: "/inventory/duplicates", icon: ClipboardCheck },
    ],
  },
  {
    label: "Stock Transfer", href: "/inventory/transfers", icon: Truck, status: "live",
    children: [
      { label: "New Stock Transfer", href: "/inventory/transfers/new", icon: PlusCircle },
      { label: "Stock Transfer Details", href: "/inventory/transfers", icon: List },
      { label: "Branch Stock Request", href: "/inventory/stock-requests", icon: ClipboardEdit },
      { label: "Request History", href: "/inventory/stock-requests/history", icon: FileText },
    ],
  },
  {
    label: "Stock Adjustment", href: "/inventory/adjustments?mode=adjustment", icon: ClipboardEdit, status: "live",
    children: [
      { label: "Stock Adjustment", href: "/inventory/adjustments?mode=adjustment", icon: ClipboardEdit },
      { label: "Stock Taking", href: "/inventory/stock-taking", icon: Layers },
      { label: "Adjustment History", href: "/inventory/history", icon: FileText },
    ],
  },
  { label: "CRM", href: "/crm", icon: Contact, status: "live" },
  {
    label: "Expenses", href: "/expenses", icon: Tag, status: "live",
    children: [
      { label: "All Expenses", href: "/expenses", icon: List },
      { label: "Add Expense", href: "/expenses/new", icon: PlusCircle },
      { label: "Expense Categories", href: "/expenses/categories", icon: LayoutGrid },
    ],
  },
  {
    label: "HRM & Payroll", href: "/hrm", icon: Users, status: "live",
    children: [
      { label: "Dashboard", href: "/hrm", icon: LayoutDashboard },
      { label: "Employees", href: "/hrm/employees", icon: Users2 },
      { label: "Attendance", href: "/hrm/attendance", icon: CalendarClock },
      { label: "Leave Management", href: "/hrm/leave", icon: ClipboardEdit },
    ],
  },
  {
    label: "Accounting", href: "/accounting", icon: Wallet, status: "live",
    children: [
      { label: "Overview", href: "/accounting?tab=overview", icon: LayoutDashboard },
      { label: "Chart of Accounts", href: "/accounting?tab=coa", icon: List },
      { label: "Journal Entries", href: "/accounting?tab=journal", icon: FileText },
      { label: "Bank Reconciliation", href: "/accounting?tab=reconciliation", icon: Landmark },
      { label: "Customer Credit Management", href: "/accounting?tab=receivables", icon: Receipt },
      { label: "Accounts Payable", href: "/accounting?tab=payables", icon: ShoppingBag },
      { label: "Reports", href: "/accounting?tab=reports", icon: BarChart3 },
    ],
  },
  { label: "Banking", href: "/banking", icon: Landmark, status: "live" },
  { label: "Assets", href: "/assets", icon: Package, status: "live" },
  { label: "Projects", href: "/projects", icon: FolderKanban, status: "live" },
  {
    label: "Reports", href: "/reports", icon: BarChart3, status: "live",
    children: [
      { label: "Reports Overview", href: "/reports", icon: BarChart3 },
      { label: "Branch Performance", href: "/reports/branch-performance", icon: BarChart3 },
    ],
  },
  { label: "Audit Center", href: "/audit", icon: ShieldCheck, status: "live" },
  { label: "Fraud & Anomaly Detection", href: "/fraud", icon: ShieldAlert, status: "live" },
  { label: "AI Assistant", href: "/ai", icon: Sparkles, status: "live" },
  { label: "Communication", href: "/communication", icon: MessageSquare, status: "live" },
  { label: "User Management", href: "/settings/organization", icon: Users2, status: "live" },
];

export const SETTINGS_CHILDREN: NavChild[] = [
  { label: "Overview", href: "/settings" },
  { label: "Company", href: "/settings/company" },
  { label: "Users", href: "/settings/organization" },
  { label: "Team", href: "/settings/team" },
  { label: "Locations", href: "/settings/locations" },
  { label: "Currencies", href: "/settings/currencies" },
  { label: "Customer Ordering", href: "/settings/customer-ordering" },
  { label: "Billing", href: "/settings/billing" },
  { label: "Members", href: "/settings/members" },
  { label: "Integrations", href: "/settings/integrations" },
  { label: "Duplicate Product Control", href: "/settings/products/duplicates", icon: ShieldCheck },
];

export { ChevronLeft, ChevronRight, ChevronDown };
