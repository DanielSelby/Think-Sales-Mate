import type {
  RoleDefinition,
  ModulePermissionConfig,
  ModuleCategory,
  PermissionAction,
  ManagedUser,
  UserBranch,
  AuditLogEntry,
  LoginSession,
  ApprovalRule,
  BranchAccessRule,
  InvitationRecord,
  PermissionPageConfig,
  PermissionTabConfig
} from "./types";

export const PERMISSION_ACTIONS: { key: PermissionAction; label: string; description: string }[] = [
  { key: "view", label: "View", description: "Can view records and lists" },
  { key: "create", label: "Create", description: "Can create new records" },
  { key: "edit", label: "Edit", description: "Can modify existing records" },
  { key: "delete", label: "Delete", description: "Can remove or archive records" },
  { key: "approve", label: "Approve", description: "Can authorize transactions, transfers, & budgets" },
  { key: "import", label: "Import", description: "Can import records from supported files" },
  { key: "export", label: "Export", description: "Can export datasets to CSV / Excel / PDF" },
  { key: "print", label: "Print", description: "Can print receipts, invoices, and audit slips" },
  { key: "view_audit", label: "View audit history", description: "Can review audit and activity records" }
];

const TAB_ACTIONS: PermissionAction[] = ["view", "create", "edit", "delete", "approve", "export"];
const tabs = (items: Array<[string, string]>): PermissionTabConfig[] =>
  items.map(([key, name]) => ({ key, name, supportedActions: TAB_ACTIONS }));
const pages = (items: Array<[string, string, Array<[string, string]>]>): PermissionPageConfig[] =>
  items.map(([key, name, tabItems]) => ({ key, name, tabs: tabs(tabItems) }));

/** Hierarchical registry for the optional Module -> Page -> Tab -> Action layer. */
export const PERMISSION_PAGE_CONFIGS: Record<string, PermissionPageConfig[]> = {
  education_dashboard: pages([
    ["dashboard", "Education Dashboard", [["overview", "Overview"]]]
  ]),
  education_organization: pages([
    ["organization", "Organization", [["campuses", "Campuses"]]]
  ]),
  education_students: pages([
    ["students", "Students", [["list", "Student Directory"]]]
  ]),
  education_guardians: pages([
    ["guardians", "Parents & Guardians", [["directory", "Guardian Directory"], ["relationships", "Student Relationships"]]]
  ]),
  education_staff: pages([
    ["staff", "Staff", [["directory", "Staff Directory"], ["leave", "Leave Management"], ["transfers", "Campus Transfers"]]]
  ]),
  education_reports: pages([
    ["reports", "Education Reports", [["staff", "Staff Headcount"], ["attendance", "Student Attendance"], ["outcomes", "Academic Outcomes"], ["enrollment", "Enrollment & Progression"]]]
  ]),
  education_admissions: pages([
    ["admissions", "Admissions", [["applications", "Applications"]]]
  ]),
  education_academics: pages([
    ["academics", "Academics", [["calendar", "Academic Calendar"], ["classes", "Classes"]]]
  ]),
  education_attendance: pages([
    ["attendance", "Attendance", [["register", "Student Register"], ["staff", "Staff Register"]]]
  ]),
  education_timetables: pages([
    ["timetables", "Timetables", [["schedule", "Class Schedule"]]]
  ]),
  education_examinations: pages([
    ["examinations", "Examinations", [["schedule", "Examination Schedule"]]]
  ]),
  education_results: pages([
    ["results", "Results", [["gradebook", "Gradebook"]]]
  ]),
  education_promotion: pages([
    ["promotion", "Promotion", [["progression", "Progression & Graduation"]]]
  ]),
  education_transfers: pages([
    ["transfers", "Student Transfers", [["requests", "Transfer Requests"]]]
  ]),
  education_user_management: pages([
    ["users", "User Management", [["directory", "Member Directory"], ["branch_access", "Campus Access"]]]
  ]),
  education_settings: pages([
    ["settings", "Institution Settings", [["institution", "Institution Details"], ["terminology", "Terminology"]]]
  ]),
  education_finance: pages([
    ["finance", "Fees & Finance", [["charges", "Fee Charges"], ["payments", "Payments & Receipts"]]]
  ]),
  education_expenses: pages([
    ["expenses", "Expenses Management", [["records", "Expense Records"]]]
  ]),
  education_library: pages([
    ["library", "Library Management", [["catalog", "Catalog & Copies"], ["circulation", "Loans & Returns"]]]
  ]),
  education_transport: pages([
    ["transport", "Transport Management", [["fleet", "Fleet & Routes"], ["assignments", "Student Assignments"]]]
  ]),
  education_inventory_assets: pages([
    ["inventory", "Inventory & Assets", [["stock", "Campus Stock"], ["assets", "Asset Register"]]]
  ]),
  education_communication: pages([
    ["communication", "Campus Communications", [["announcements", "Announcements"]]]
  ]).map((page) => ({
    ...page,
    tabs: page.tabs.map((tab) => tab.key === "announcements"
      ? { ...tab, supportedActions: [...(tab.supportedActions ?? TAB_ACTIONS), "publish"] }
      : tab),
  })),
  education_documents: pages([
    ["documents", "Documents & Records", [["library", "Document Library"]]]
  ]),
  education_notifications: pages([
    ["notifications", "Notifications", [["inbox", "Notification Centre"], ["preferences", "Preferences"]]]
  ]),
  education_audit: pages([
    ["activity", "Audit & Activity", [["records", "Activity Records"]]]
  ]).map((page) => ({
    ...page,
    tabs: page.tabs.map((tab) => tab.key === "records"
      ? { ...tab, supportedActions: [...(tab.supportedActions ?? TAB_ACTIONS), "view_audit"] }
      : tab),
  })),
  restaurant: pages([
    ["operations", "Restaurant Operations", [["orders", "Orders"], ["kitchen", "Kitchen Display"], ["pos", "Restaurant POS"], ["menu", "Menu Management"], ["tables", "Dining Tables"], ["reservations", "Reservations & Waitlist"], ["reports", "Reports & Analytics"], ["ingredients", "Ingredients & Recipes"]]]
  ]),
  sales: pages([
    ["sales", "Sales", [["new_sales", "New Sales"], ["sales_history", "Sales History"], ["returns", "Returns"], ["reports", "Reports"], ["settings", "Settings"]]]
  ]),
  inventory: pages([
    ["products", "Products", [["product_list", "Product List"], ["add_product", "Add Product"], ["product_categories", "Product Categories"], ["price_management", "Price Management"], ["product_locations", "Product Locations"], ["import_products", "Import Products"]]],
    ["stock_transfer", "Stock Transfer", [["create_transfer", "Create Transfer"], ["transfer_history", "Transfer History"], ["approvals", "Approvals"]]],
    ["inventory_intelligence", "Inventory Intelligence", [["dashboard", "Dashboard"], ["dead_stock", "Dead Stock"], ["slow_moving_stock", "Slow Moving Stock"], ["forecasting", "Forecasting"]]]
  ]).map((page) => page.key === "products"
    ? {
        ...page,
        tabs: page.tabs.map((tab) => tab.key === "product_categories" || tab.key === "import_products"
          ? { ...tab, supportedActions: [...(tab.supportedActions ?? TAB_ACTIONS), "import"] }
          : tab),
      }
    : page),
  hrm_payroll: pages([
    ["hrm", "HRM & Payroll", [["employees", "Employees"], ["attendance", "Attendance"], ["leave_management", "Leave Management"], ["payroll", "Payroll"], ["payslips", "Payslips"], ["performance_reviews", "Performance Reviews"], ["departments", "Departments"], ["recruitment", "Recruitment"], ["training", "Training & Development"], ["asset_assignment", "Asset Assignment"], ["discipline", "Discipline & Incidents"], ["organization_chart", "Organization Chart"], ["reports", "Reports & Analytics"]]]
  ]),
  purchases: pages([
    ["purchases", "Purchases", [["new_purchase", "New Purchase"], ["purchase_history", "Purchase History"], ["returns", "Returns"], ["reports", "Reports"]]]
  ]),
  accounting: pages([
    ["accounting", "Accounting", [["overview", "Overview"], ["coa", "Chart of Accounts"], ["journal", "Journal Entries"], ["reconciliation", "Bank Reconciliation"], ["receivables", "Accounts Receivable"], ["payables", "Accounts Payable"], ["fixed_assets", "Fixed Assets"], ["reports", "Financial Reports"], ["tax", "Tax Management"], ["settings", "Settings"]]]
  ]),
  crm: pages([
    ["crm", "CRM", [["customers", "Customers"], ["leads", "Leads"], ["activities", "Activities"], ["reports", "Reports"]]]
  ]),
  banking: pages([
    ["banking", "Banking", [["accounts", "Accounts"], ["transactions", "Transactions"], ["reconciliation", "Reconciliation"]]]
  ]).map((page) => ({
    ...page,
    tabs: page.tabs.map((tab) => tab.key === "reconciliation"
      ? { ...tab, supportedActions: [...(tab.supportedActions ?? TAB_ACTIONS), "print"] }
      : tab),
  }))
};

export const MODULE_CONFIGS: ModulePermissionConfig[] = [
  { key: "education_dashboard", name: "Think Education Dashboard", description: "Education overview and campus metrics", iconName: "GraduationCap", supportedActions: ["view", "export", "print"] },
  { key: "education_organization", name: "Education Organization", description: "Education campus registry and campus setup", iconName: "Building2", supportedActions: ["view", "create", "edit", "export"] },
  { key: "education_students", name: "Education Students", description: "Student records, enrollment, and student lifecycle", iconName: "GraduationCap", supportedActions: ["view", "create", "edit", "export", "import"] },
  { key: "education_guardians", name: "Education Parents & Guardians", description: "Guardian profiles and verified student relationships", iconName: "Users", supportedActions: ["view", "create", "edit", "export", "import"] },
  { key: "education_staff", name: "Education Staff", description: "Staff directory, leave requests, and approvals", iconName: "Users", supportedActions: ["view", "create", "edit", "approve", "export", "import"] },
  { key: "education_reports", name: "Education Reports", description: "Campus-scoped workforce and student attendance reports", iconName: "BarChart3", supportedActions: ["view", "export"] },
  { key: "education_admissions", name: "Education Admissions", description: "Applicant intake, application review, and admission decisions", iconName: "UserPlus", supportedActions: ["view", "create", "edit", "approve", "export"] },
  { key: "education_academics", name: "Education Academics", description: "Academic years, terms, departments, and classes", iconName: "BookOpen", supportedActions: ["view", "create", "edit", "approve", "export"] },
  { key: "education_attendance", name: "Education Attendance", description: "Student and staff attendance registers", iconName: "CalendarClock", supportedActions: ["view", "create", "edit", "export"] },
  { key: "education_timetables", name: "Education Timetables", description: "Campus class schedules and timetable conflict checks", iconName: "CalendarClock", supportedActions: ["view", "create", "edit", "export"] },
  { key: "education_examinations", name: "Education Examinations", description: "Examination scheduling and controlled publication", iconName: "ClipboardCheck", supportedActions: ["view", "create", "edit", "publish", "export"] },
  { key: "education_results", name: "Education Results", description: "Grade entry, review, approval, and publication", iconName: "FileText", supportedActions: ["view", "create", "edit", "approve", "publish", "export", "print"] },
  { key: "education_promotion", name: "Education Promotion", description: "Student progression and graduation", iconName: "TrendingUp", supportedActions: ["view", "create", "edit", "approve", "export"] },
  { key: "education_transfers", name: "Education Transfers", description: "Audited student campus transfer requests", iconName: "Truck", supportedActions: ["view", "create", "edit", "approve", "export"] },
  { key: "education_user_management", name: "Education User Management", description: "Think Education member and campus access", iconName: "Users2", supportedActions: ["view", "edit", "manage_users"] },
  { key: "education_settings", name: "Education Settings", description: "Institution identity and education terminology", iconName: "Settings", supportedActions: ["view", "create", "edit", "manage_settings"] },
  { key: "education_finance", name: "Education Fees & Finance", description: "Student fee charges, balances, and payment receipts", iconName: "Wallet", supportedActions: ["view", "create", "edit", "approve", "export", "print"] },
  { key: "education_expenses", name: "Education Expenses", description: "Campus operating expenses, approval workflow, and payment tracking", iconName: "Wallet", supportedActions: ["view", "create", "edit", "approve", "export"] },
  { key: "education_library", name: "Education Library", description: "Campus library catalog, copies, circulation, renewals, and returns", iconName: "BookOpen", supportedActions: ["view", "create", "edit", "approve", "export"] },
  { key: "education_transport", name: "Education Transport", description: "Campus transport fleet, routes, stops, and student assignments", iconName: "Truck", supportedActions: ["view", "create", "edit", "export"] },
  { key: "education_inventory_assets", name: "Education Inventory & Assets", description: "Campus stock, asset register, assignment, condition, and retirement", iconName: "Package", supportedActions: ["view", "create", "edit", "export"] },
  { key: "education_communication", name: "Education Communication", description: "Campus announcements for students, families, and staff", iconName: "MessageSquare", supportedActions: ["view", "create", "edit", "publish", "export"] },
  { key: "education_documents", name: "Education Documents", description: "Secure campus and student documents with controlled access and retention", iconName: "FolderOpen", supportedActions: ["view", "create", "edit", "delete", "export"] },
  { key: "education_notifications", name: "Education Notifications", description: "Campus-scoped in-app notifications and personal delivery preferences", iconName: "Bell", supportedActions: ["view", "edit"] },
  { key: "education_audit", name: "Education Audit & Activity", description: "Searchable campus-scoped education record and access history", iconName: "ClipboardList", supportedActions: ["view_audit", "export"] },
  { key: "dashboard", name: "Dashboard", description: "Overview metrics, KPIs, and executive charts", iconName: "LayoutDashboard", supportedActions: ["view", "export", "print"] },
  { key: "approvals", name: "Approval Center", description: "Central queue for approvals, review decisions, and exception handling", iconName: "ClipboardCheck", supportedActions: ["view", "approve", "export", "print"] },
  { key: "sales", name: "Sales", description: "Quotations, invoices, sales orders, and returns", iconName: "Receipt", supportedActions: ["view", "create", "edit", "delete", "approve", "export", "print"] },
  { key: "sales_drafts", name: "Drafts & Quotations", description: "Sales drafts, quotations, conversion, and revision history", iconName: "Clock3", supportedActions: ["view", "create", "edit", "delete", "approve", "export", "print"] },
  { key: "pos", name: "POS", description: "Point of sale register, cashier terminal, and till cashups", iconName: "ShoppingCart", supportedActions: ["view", "create", "edit", "delete", "approve", "export", "print"] },
  { key: "restaurant", name: "Restaurant", description: "Restaurant menu, dining tables, orders, kitchen queue, ingredients, recipes, and payments", iconName: "Utensils", supportedActions: ["view", "create", "edit", "delete", "approve", "print"] },
  { key: "service_jobs", name: "Service Jobs", description: "Repair intake, estimates, customer decisions, job tracking, diagnosis, and service status workflow", iconName: "Wrench", supportedActions: ["view", "create", "edit", "delete", "approve", "export", "print"] },
  { key: "service_appointments", name: "Service Appointments", description: "Schedule customer visits, technician assignments, and appointment status", iconName: "CalendarClock", supportedActions: ["view", "create", "edit", "delete", "export", "print"] },
  { key: "service_assets", name: "Service Assets", description: "Customer equipment and repair history", iconName: "Package", supportedActions: ["view", "create", "edit", "delete", "export", "print"] },
  { key: "service_technicians", name: "Service Technicians", description: "Technician assignment and service team records", iconName: "Users2", supportedActions: ["view", "create", "edit", "delete", "export"] },
  { key: "service_settings", name: "Service Settings", description: "Service categories and operating configuration", iconName: "Settings", supportedActions: ["view", "create", "edit", "delete"] },
  { key: "orders", name: "Orders", description: "Customer order management, picking, delivery, and conversions", iconName: "Inbox", supportedActions: ["view", "create", "edit", "delete", "approve", "export", "print"] },
  { key: "customer_ordering", name: "Customer Ordering", description: "Customer portal ordering, order settings, and order conversion", iconName: "Inbox", supportedActions: ["view", "create", "edit", "approve", "export", "print"] },
  { key: "products", name: "Products", description: "Product catalog, pricing tiers, barcodes, and units", iconName: "Boxes", supportedActions: ["view", "create", "edit", "delete", "approve", "export", "print"] },
  { key: "product_categories", name: "Product Categories", description: "Manage product category names, hierarchy, status, and assignments", iconName: "LayoutGrid", supportedActions: ["view", "create", "edit", "delete", "import", "export"] },
  { key: "inventory", name: "Inventory", description: "Stock levels, batches, stock takes, and adjustments", iconName: "Layers", supportedActions: ["view", "create", "edit", "delete", "approve", "export", "print"] },
  { key: "stock_adjustments", name: "Stock Adjustments", description: "Stock taking, adjustments, adjustment history, and variance review", iconName: "ClipboardEdit", supportedActions: ["view", "create", "edit", "delete", "approve", "export", "print"] },
  { key: "stock_requests", name: "Stock Requests", description: "Branch stock requests, fulfillment, and request history", iconName: "ClipboardCheck", supportedActions: ["view", "create", "edit", "delete", "approve", "export", "print"] },
  { key: "price_management", name: "Price Management", description: "Price groups, bulk price updates, and price history", iconName: "DollarSign", supportedActions: ["view", "create", "edit", "approve", "export"] },
  { key: "product_duplicates", name: "Duplicate Review", description: "Product duplicate detection, review, merge, and cleanup", iconName: "GitMerge", supportedActions: ["view", "edit", "delete", "approve", "export"] },
  { key: "transfers", name: "Transfers", description: "Inter-branch and warehouse stock transfers", iconName: "Truck", supportedActions: ["view", "create", "edit", "delete", "approve", "export", "print"] },
  { key: "purchases", name: "Purchases", description: "Purchase orders, goods receipts, and vendor bills", iconName: "ShoppingBag", supportedActions: ["view", "create", "edit", "delete", "approve", "export", "print"] },
  { key: "expenses", name: "Expenses", description: "Operating expenses, receipts, and petty cash", iconName: "Tag", supportedActions: ["view", "create", "edit", "delete", "approve", "export", "print"] },
  { key: "customers", name: "Customers", description: "Customer accounts, credit limits, and loyalty", iconName: "Contact", supportedActions: ["view", "create", "edit", "delete", "export", "print"] },
  { key: "suppliers", name: "Suppliers", description: "Vendor contacts, price agreements, and lead times", iconName: "Truck", supportedActions: ["view", "create", "edit", "delete", "export", "print"] },
  { key: "accounting", name: "Accounting", description: "General ledger, chart of accounts, and journals", iconName: "Wallet", supportedActions: ["view", "create", "edit", "delete", "approve", "export", "print"] },
  { key: "chart_of_accounts", name: "Chart of Accounts", description: "Ledger accounts, account groups, and accounting structure", iconName: "List", supportedActions: ["view", "create", "edit", "delete", "export", "print"] },
  { key: "journal_entries", name: "Journal Entries", description: "Manual journals, posting, review, and adjustments", iconName: "FileText", supportedActions: ["view", "create", "edit", "delete", "approve", "export", "print"] },
  { key: "bank_reconciliation", name: "Bank Reconciliation", description: "Bank matching, reconciliation, and exception review", iconName: "Landmark", supportedActions: ["view", "create", "edit", "approve", "export", "print"] },
  { key: "receivables", name: "Receivables", description: "Customer credit, collections, receipts, and aging", iconName: "Receipt", supportedActions: ["view", "create", "edit", "approve", "export", "print"] },
  { key: "payables", name: "Payables", description: "Supplier bills, payments, and payable aging", iconName: "ShoppingBag", supportedActions: ["view", "create", "edit", "approve", "export", "print"] },
  { key: "hrm_payroll", name: "HRM & Payroll", description: "Employee records, attendance, leaves, and payslips", iconName: "Users", supportedActions: ["view", "create", "edit", "delete", "approve", "export", "print"] },
  { key: "payslips", name: "Payslips", description: "Generated payslips, employee self-service, printing, and downloads", iconName: "FileText", supportedActions: ["view", "create", "edit", "approve", "export", "print"] },
  { key: "hrm_attendance", name: "Attendance", description: "Employee attendance, shifts, and time records", iconName: "CalendarClock", supportedActions: ["view", "create", "edit", "export", "print"] },
  { key: "hrm_leave", name: "Leave Management", description: "Leave requests, balances, approvals, and history", iconName: "ClipboardEdit", supportedActions: ["view", "create", "edit", "approve", "export", "print"] },
  { key: "hrm_recruitment", name: "Recruitment", description: "Candidates, vacancies, interviews, and hiring workflow", iconName: "UserPlus", supportedActions: ["view", "create", "edit", "delete", "approve", "export"] },
  { key: "hrm_training", name: "Training & Development", description: "Training plans, programs, attendance, and outcomes", iconName: "GraduationCap", supportedActions: ["view", "create", "edit", "delete", "export"] },
  { key: "reports", name: "Reports", description: "Financial, sales, inventory, and tax reports", iconName: "BarChart3", supportedActions: ["view", "export", "print"] },
  { key: "branch_reports", name: "Branch Performance", description: "Branch KPIs, comparisons, and operational performance", iconName: "BarChart3", supportedActions: ["view", "export", "print"] },
  { key: "forecasting", name: "Sales Forecasting", description: "Forecasts, trends, projections, and planning reports", iconName: "TrendingUp", supportedActions: ["view", "export", "print"] },
  { key: "user_management", name: "User Management", description: "User accounts, roles, access matrix, and audit logs", iconName: "ShieldCheck", supportedActions: ["view", "create", "edit", "delete", "approve", "export", "print"] },
  { key: "banking", name: "Banking", description: "Bank accounts, transactions, and reconciliation", iconName: "Landmark", supportedActions: ["view", "create", "edit", "delete", "export", "print"] },
  { key: "cash_closing", name: "End Of Day Accounts", description: "End-of-day cash reconciliation, shifts, variances, and approvals", iconName: "ClipboardCheck", supportedActions: ["view", "create", "edit", "approve", "export", "print"] },
  { key: "assets", name: "Assets", description: "Fixed assets, depreciation, and asset registers", iconName: "Package", supportedActions: ["view", "create", "edit", "delete", "export", "print"] },
  { key: "projects", name: "Projects", description: "Projects, tasks, and operational work", iconName: "FolderKanban", supportedActions: ["view", "create", "edit", "delete", "export", "print"] },
  { key: "route_sales", name: "Route Sales", description: "Field routes, collections, mobile orders, and route reporting", iconName: "Route", supportedActions: ["view", "create", "edit", "delete", "approve", "export", "print"] },
  { key: "ai", name: "AI Assistant", description: "AI-powered business assistance and generation tools", iconName: "Sparkles", supportedActions: ["view", "create"] },
  { key: "communication", name: "Communication", description: "Private direct messages, group channels, and voice notes", iconName: "MessageSquare", supportedActions: ["view", "create", "edit", "delete"] },
  { key: "audit", name: "Audit Center", description: "Activity history, audit trails, login sessions, and compliance review", iconName: "ShieldCheck", supportedActions: ["view", "export", "print"] },
  { key: "fraud", name: "Fraud & Anomaly Detection", description: "Fraud alerts, anomaly review, and investigation workflows", iconName: "ShieldAlert", supportedActions: ["view", "edit", "approve", "export", "print"] },
  { key: "offline", name: "Offline Center", description: "Offline queue, synchronization, conflict review, and retry controls", iconName: "WifiOff", supportedActions: ["view", "create", "edit", "delete", "approve"] },
  { key: "settings", name: "Settings", description: "System configuration, currencies, taxes, and integrations", iconName: "Settings", supportedActions: ["view", "create", "edit", "delete", "export", "print"] }
  ,{ key: "company_settings", name: "Company Settings", description: "Company profile, branding, invoice details, and business identity", iconName: "Building2", supportedActions: ["view", "edit", "export", "print"] }
  ,{ key: "locations", name: "Locations", description: "Branches, warehouses, and location access configuration", iconName: "Building2", supportedActions: ["view", "create", "edit", "delete", "export"] }
  ,{ key: "currencies", name: "Currencies", description: "Currencies, exchange rates, and financial display settings", iconName: "Wallet", supportedActions: ["view", "create", "edit", "delete", "export"] }
  ,{ key: "integrations", name: "Integrations", description: "External services, API connections, and synchronization settings", iconName: "Network", supportedActions: ["view", "create", "edit", "delete"] }
  ,{ key: "billing", name: "Billing", description: "Subscription, invoices, plan limits, and billing settings", iconName: "Receipt", supportedActions: ["view", "create", "edit", "export", "print"] }
  ,{ key: "team", name: "Team Management", description: "Team members, invitations, and organizational assignments", iconName: "Users2", supportedActions: ["view", "create", "edit", "delete", "export"] }
];

const PERMISSION_MODULE_FEATURES: Record<string, string[]> = {
  education_dashboard: ["Think Education"],
  education_organization: ["Organization & Branches"],
  education_students: ["Students"],
  education_guardians: ["Parent & Guardian Management"],
  education_staff: ["Staff"],
  education_admissions: ["Admissions"],
  education_academics: ["Academic Management"],
  education_attendance: ["Attendance"],
  education_timetables: ["Timetables"],
  education_examinations: ["Examinations"],
  education_results: ["Results & Report Cards"],
  education_promotion: ["Promotion & Graduation"],
  education_transfers: ["Student Transfers"],
  education_user_management: ["User Management"],
  education_settings: ["Settings"],
  education_finance: ["Fees & Finance"],
  education_expenses: ["Expenses Management"],
  education_library: ["Library"],
  education_transport: ["Transport"],
  education_inventory_assets: ["Inventory & Assets"],
  education_communication: ["Communication"],
  education_documents: ["Documents & Records"],
  education_notifications: ["Notifications"],
  education_audit: ["Audit & Activity"],
  dashboard: ["Dashboard"],
  approvals: ["Approval Center"],
  sales: ["Sales"],
  sales_drafts: ["Sales"],
  pos: ["POS"],
  restaurant: ["Restaurant"],
  orders: ["Orders", "Customer Ordering"],
  customer_ordering: ["Customer Ordering"],
  products: ["Products"],
  product_categories: ["Products"],
  inventory: ["Stock Adjustment", "Stock Transfer", "Products"],
  stock_adjustments: ["Stock Adjustment"],
  stock_requests: ["Stock Transfer"],
  price_management: ["Products"],
  product_duplicates: ["Products"],
  transfers: ["Stock Transfer"],
  purchases: ["Purchases"],
  expenses: ["Expenses"],
  customers: ["CRM"],
  suppliers: ["Purchases"],
  accounting: ["Accounting"],
  chart_of_accounts: ["Accounting"],
  journal_entries: ["Accounting"],
  bank_reconciliation: ["Accounting"],
  receivables: ["Accounting"],
  payables: ["Accounting", "Purchases"],
  hrm_payroll: ["HRM & Payroll"],
  payslips: ["HRM & Payroll"],
  hrm_attendance: ["HRM & Payroll"],
  hrm_leave: ["HRM & Payroll"],
  hrm_recruitment: ["HRM & Payroll"],
  hrm_training: ["HRM & Payroll"],
  reports: ["Business Report"],
  branch_reports: ["Business Report"],
  forecasting: ["Business Report"],
  user_management: ["Users", "User Management"],
  banking: ["Accounting", "End Of Day Accounts"],
  cash_closing: ["End Of Day Accounts"],
  assets: ["Assets"],
  projects: ["Projects"],
  route_sales: ["Route Sales"],
  ai: ["ThinkSales Ai Agent"],
  communication: ["Communication"],
  audit: ["Audit Center"],
  fraud: ["Fraud & Anomaly Detection"],
  offline: ["Offline Center"],
  settings: ["Settings"],
  company_settings: ["Settings"],
  locations: ["Settings"],
  currencies: ["Settings"],
  integrations: ["Settings"],
  billing: ["Billing"],
  team: ["Users:Team Management"],
};

const RESTAURANT_TAB_FEATURES: Record<string, string[]> = {
  orders: ["Orders & Kitchen"],
  kitchen: ["Kitchen Display"],
  pos: ["Restaurant POS"],
  menu: ["Menu Management", "Online Ordering"],
  tables: ["Dining Tables"],
  reservations: ["Reservations"],
  reports: ["Reports & Analytics"],
  ingredients: ["Ingredients & Recipes", "Packaged Item Stock"],
};

function isPermissionFeatureEnabled(feature: string, enabledModules: readonly string[]): boolean {
  return enabledModules.includes(feature) || enabledModules.some((module) => module.startsWith(`${feature}:`));
}

export function getOrganizationPermissionConfigs(enabledModules: readonly string[]) {
  const modules = MODULE_CONFIGS.filter((module) =>
    (PERMISSION_MODULE_FEATURES[module.key] ?? [module.name])
      .some((feature) => isPermissionFeatureEnabled(feature, enabledModules))
  );
  const moduleKeys = new Set(modules.map((module) => module.key));
  const pages = Object.fromEntries(
    Object.entries(PERMISSION_PAGE_CONFIGS)
      .filter(([moduleKey]) => moduleKeys.has(moduleKey))
      .map(([moduleKey, modulePages]) => {
        if (moduleKey !== "restaurant" || !enabledModules.includes("__children:Restaurant")) {
          return [moduleKey, modulePages];
        }
        return [
          moduleKey,
          modulePages
            .map((page) => ({
              ...page,
              tabs: page.tabs.filter((tab) =>
                (RESTAURANT_TAB_FEATURES[tab.key] ?? [])
                  .some((feature) => enabledModules.includes(`Restaurant:${feature}`))
              ),
            }))
            .filter((page) => page.tabs.length > 0),
        ];
      })
      .filter(([, modulePages]) => (modulePages as PermissionPageConfig[]).length > 0)
  ) as Record<string, PermissionPageConfig[]>;
  return { modules, pages };
}

export const DEPARTMENTS = [
  "Sales & Marketing",
  "Inventory & Warehouse",
  "Finance & Accounts",
  "Human Resources",
  "Operations & Logistics",
  "Executive Management",
  "Information Technology",
  "Customer Support"
];

export const DEFAULT_BRANCHES: UserBranch[] = [
  { id: "b-head", name: "Head Office", code: "ACC-HO", isMain: true },
  { id: "b-accra", name: "Accra Main Branch", code: "ACC-01" },
  { id: "b-kumasi", name: "Kumasi Branch", code: "KSI-01" },
  { id: "b-takoradi", name: "Takoradi Branch", code: "TKD-01" },
  { id: "b-tema", name: "Tema Branch", code: "TMA-01" },
  { id: "b-ho", name: "Ho Branch", code: "HO-01" },
  { id: "b-cape", name: "Cape Coast Branch", code: "CC-01" },
  { id: "b-sunyani", name: "Sunyani Branch", code: "SNY-01" },
  { id: "b-tamale", name: "Tamale Branch", code: "TML-01" },
  { id: "b-wa", name: "Wa Branch", code: "WA-01" }
];

// ── 1-Click Permission Templates ────────────────────────────
export const PERMISSION_TEMPLATES: { key: string; name: string; description: string; roleKey: string; icon: string }[] = [
  { key: "super_admin", name: "Super Admin", description: "Unrestricted master access across all registered modules and global branches", roleKey: "owner", icon: "Crown" },
  { key: "administrator", name: "Administrator", description: "Full business administration, user governance, and security controls", roleKey: "administrator", icon: "ShieldAlert" },
  { key: "branch_manager", name: "Branch Manager", description: "Complete branch operational authority, daily approvals, and stock supervision", roleKey: "manager", icon: "Building2" },
  { key: "sales_officer", name: "Sales Officer", description: "Quotation creation, sales order booking, CRM, and customer registry", roleKey: "sales_officer", icon: "Receipt" },
  { key: "cashier", name: "Cashier", description: "Fast POS register, till cashiering, payment receipts, and petty cash", roleKey: "cashier", icon: "ShoppingCart" },
  { key: "inventory_officer", name: "Inventory Officer", description: "Stock ledger, warehouse transfers, goods receipts, and adjustments", roleKey: "inventory_officer", icon: "Layers" },
  { key: "accountant", name: "Accountant", description: "Financial ledgers, expense sign-offs, purchase verification, and banking", roleKey: "accountant", icon: "Wallet" },
  { key: "hr_officer", name: "HR Officer", description: "Employee records, shift schedules, attendance logs, and payroll runs", roleKey: "hr_officer", icon: "Users" },
  { key: "viewer", name: "Read-Only Viewer", description: "Executive reporting view and export access without editing capabilities", roleKey: "viewer", icon: "Eye" }
];

export const DEFAULT_ROLES: RoleDefinition[] = [
  {
    id: "role-owner",
    key: "owner",
    name: "Super Admin",
    description: "Organization owner with unrestricted access to every page, role, branch, and permission.",
    userCount: 1,
    permissionCount: MODULE_CONFIGS.reduce((count, module) => count + module.supportedActions.length, 0),
    isSystem: true,
    scope: "all_branches",
    badgeColor: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800",
    permissions: MODULE_CONFIGS.reduce((acc, module) => {
      acc[module.key] = [...module.supportedActions];
      return acc;
    }, {} as Record<ModuleCategory, PermissionAction[]>),
    approvalCapabilities: {
      stockTransfers: true,
      purchases: true,
      expenses: true,
      priceUpdates: true,
      stockAdjustments: true,
      customerOrders: true
    }
  },
  {
    id: "role-admin",
    key: "administrator",
    name: "Administrator",
    description: "Full unrestricted access across all business modules, settings, and branches.",
    userCount: 4,
    permissionCount: 58,
    isSystem: true,
    scope: "all_branches",
    badgeColor: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800",
    permissions: MODULE_CONFIGS.reduce((acc, m) => {
      acc[m.key] = [...m.supportedActions];
      return acc;
    }, {} as Record<ModuleCategory, PermissionAction[]>),
    approvalCapabilities: {
      stockTransfers: true,
      purchases: true,
      expenses: true,
      priceUpdates: true,
      stockAdjustments: true,
      customerOrders: true
    }
  },
  {
    id: "role-manager",
    key: "manager",
    name: "Branch Manager",
    description: "Manages branch operations, daily sales, approvals, stock adjustments, and staff.",
    userCount: 5,
    permissionCount: 46,
    isSystem: true,
    scope: "branch_specific",
    badgeColor: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800",
    permissions: {
      dashboard: ["view", "export", "print"],
      sales: ["view", "create", "edit", "approve", "export", "print"],
      pos: ["view", "create", "edit", "export", "print"],
      restaurant: ["view", "create", "edit", "delete", "approve", "print"],
      service_jobs: ["view", "create", "edit", "approve"],
      service_appointments: ["view", "create", "edit"],
      service_assets: ["view", "create", "edit"],
      service_technicians: ["view", "create", "edit"],
      service_settings: ["view"],
      orders: ["view", "create", "edit", "approve", "export", "print"],
      products: ["view", "create", "edit", "export", "print"],
      inventory: ["view", "create", "edit", "approve", "export", "print"],
      transfers: ["view", "create", "edit", "approve", "export", "print"],
      purchases: ["view", "create", "edit", "approve", "export", "print"],
      expenses: ["view", "create", "edit", "approve", "export", "print"],
      customers: ["view", "create", "edit", "export", "print"],
      suppliers: ["view", "create", "edit", "export", "print"],
      accounting: ["view", "export"],
      hrm_payroll: ["view", "create", "edit", "export", "print"],
      reports: ["view", "export", "print"],
      user_management: ["view"],
      settings: ["view"]
    },
    approvalCapabilities: {
      stockTransfers: true,
      purchases: true,
      expenses: true,
      priceUpdates: false,
      stockAdjustments: true,
      customerOrders: true
    }
  },
  {
    id: "role-sales",
    key: "sales_officer",
    name: "Sales Associate",
    description: "Generates quotes, orders, customer records, and handles customer engagement.",
    userCount: 6,
    permissionCount: 22,
    isSystem: true,
    scope: "branch_specific",
    badgeColor: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800",
    permissions: {
      dashboard: ["view"],
      sales: ["view", "create", "edit", "export", "print"],
      pos: ["view", "create", "print"],
      restaurant: ["view", "create", "edit", "print"],
      orders: ["view", "create", "edit", "export", "print"],
      products: ["view", "export"],
      inventory: ["view"],
      transfers: ["view"],
      purchases: [],
      expenses: ["create"],
      customers: ["view", "create", "edit", "export", "print"],
      suppliers: ["view"],
      accounting: [],
      hrm_payroll: [],
      reports: ["view"],
      user_management: [],
      settings: []
    },
    approvalCapabilities: {
      stockTransfers: false,
      purchases: false,
      expenses: false,
      priceUpdates: false,
      stockAdjustments: false,
      customerOrders: false
    }
  },
  {
    id: "role-cashier",
    key: "cashier",
    name: "Cashier",
    description: "Operates POS terminals, issues receipts, takes payments, and manages register.",
    userCount: 4,
    permissionCount: 14,
    isSystem: true,
    scope: "branch_specific",
    badgeColor: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800",
    permissions: {
      dashboard: ["view"],
      sales: ["view", "create", "print"],
      pos: ["view", "create", "edit", "print"],
      restaurant: ["view", "create", "edit", "print"],
      orders: ["view"],
      products: ["view"],
      inventory: ["view"],
      transfers: [],
      purchases: [],
      expenses: ["create"],
      customers: ["view", "create"],
      suppliers: [],
      accounting: [],
      hrm_payroll: [],
      reports: [],
      user_management: [],
      settings: []
    },
    approvalCapabilities: {
      stockTransfers: false,
      purchases: false,
      expenses: false,
      priceUpdates: false,
      stockAdjustments: false,
      customerOrders: false
    }
  },
  {
    id: "role-inventory",
    key: "inventory_officer",
    name: "Inventory Clerk",
    description: "Oversees stock receiving, stock counts, adjustments, and warehouse transfers.",
    userCount: 3,
    permissionCount: 28,
    isSystem: true,
    scope: "branch_specific",
    badgeColor: "bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-800",
    permissions: {
      dashboard: ["view"],
      sales: ["view"],
      pos: [],
      orders: ["view"],
      products: ["view", "create", "edit", "export", "print"],
      inventory: ["view", "create", "edit", "export", "print"],
      transfers: ["view", "create", "edit", "export", "print"],
      purchases: ["view", "create", "edit", "export", "print"],
      expenses: [],
      customers: [],
      suppliers: ["view", "create", "edit", "export"],
      accounting: [],
      hrm_payroll: [],
      reports: ["view", "export"],
      user_management: [],
      settings: []
    },
    approvalCapabilities: {
      stockTransfers: false,
      purchases: false,
      expenses: false,
      priceUpdates: false,
      stockAdjustments: false,
      customerOrders: false
    }
  },
  {
    id: "role-hr",
    key: "hr_officer",
    name: "HR Officer",
    description: "Manages employee records, shifts, attendance, leaves, and payroll runs.",
    userCount: 1,
    permissionCount: 20,
    isSystem: true,
    scope: "all_branches",
    badgeColor: "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800",
    permissions: {
      dashboard: ["view"],
      sales: [],
      pos: [],
      orders: [],
      products: [],
      inventory: [],
      transfers: [],
      purchases: [],
      expenses: ["view", "create"],
      customers: [],
      suppliers: [],
      accounting: ["view"],
      hrm_payroll: ["view", "create", "edit", "delete", "approve", "export", "print"],
      reports: ["view", "export", "print"],
      user_management: ["view"],
      settings: []
    },
    approvalCapabilities: {
      stockTransfers: false,
      purchases: false,
      expenses: false,
      priceUpdates: false,
      stockAdjustments: false,
      customerOrders: false
    }
  },
  {
    id: "role-accountant",
    key: "accountant",
    name: "Accountant",
    description: "Financial reconciliations, expenses audits, journal entries, and tax returns.",
    userCount: 1,
    permissionCount: 32,
    isSystem: true,
    scope: "all_branches",
    badgeColor: "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800",
    permissions: {
      dashboard: ["view", "export", "print"],
      sales: ["view", "export", "print"],
      pos: ["view", "export"],
      orders: ["view", "export"],
      products: ["view", "export"],
      inventory: ["view", "export"],
      transfers: ["view", "export"],
      purchases: ["view", "approve", "export", "print"],
      expenses: ["view", "create", "edit", "approve", "export", "print"],
      customers: ["view", "export"],
      suppliers: ["view", "export"],
      accounting: ["view", "create", "edit", "approve", "export", "print"],
      hrm_payroll: ["view", "export"],
      reports: ["view", "export", "print"],
      user_management: ["view"],
      settings: ["view"]
    },
    approvalCapabilities: {
      stockTransfers: false,
      purchases: true,
      expenses: true,
      priceUpdates: false,
      stockAdjustments: false,
      customerOrders: false
    }
  }
];

export const INITIAL_APPROVAL_RULES: ApprovalRule[] = [
  { id: "app-1", roleKey: "administrator", roleName: "Administrator", moduleKey: "purchases", moduleName: "Purchases", canApprove: true, approvalLimitGHS: "unlimited", requiresHigherApproval: false, notes: "Unrestricted PO approval" },
  { id: "app-2", roleKey: "administrator", roleName: "Administrator", moduleKey: "expenses", moduleName: "Operating Expenses", canApprove: true, approvalLimitGHS: "unlimited", requiresHigherApproval: false, notes: "Unrestricted expense approval" },
  { id: "app-3", roleKey: "administrator", roleName: "Administrator", moduleKey: "stock_transfers", moduleName: "Stock Transfers", canApprove: true, approvalLimitGHS: "unlimited", requiresHigherApproval: false, notes: "Global transfer sign-off" },
  { id: "app-4", roleKey: "administrator", roleName: "Administrator", moduleKey: "stock_adjustments", moduleName: "Stock Adjustments", canApprove: true, approvalLimitGHS: "unlimited", requiresHigherApproval: false, notes: "Inventory variance write-off" },
  { id: "app-5", roleKey: "administrator", roleName: "Administrator", moduleKey: "price_changes", moduleName: "Price Changes", canApprove: true, approvalLimitGHS: "unlimited", requiresHigherApproval: false, notes: "Price list & tier modification" },
  { id: "app-6", roleKey: "administrator", roleName: "Administrator", moduleKey: "customer_orders", moduleName: "Customer Orders", canApprove: true, approvalLimitGHS: "unlimited", requiresHigherApproval: false, notes: "Order confirmation & credit release" },

  { id: "app-7", roleKey: "manager", roleName: "Branch Manager", moduleKey: "purchases", moduleName: "Purchases", canApprove: true, approvalLimitGHS: 50000, requiresHigherApproval: true, higherApproverRole: "Administrator", notes: "Branch procurement bills up to GHS 50,000" },
  { id: "app-8", roleKey: "manager", roleName: "Branch Manager", moduleKey: "expenses", moduleName: "Operating Expenses", canApprove: true, approvalLimitGHS: 25000, requiresHigherApproval: true, higherApproverRole: "Administrator", notes: "Branch petty cash & claims up to GHS 25,000" },
  { id: "app-9", roleKey: "manager", roleName: "Branch Manager", moduleKey: "stock_transfers", moduleName: "Stock Transfers", canApprove: true, approvalLimitGHS: "unlimited", requiresHigherApproval: false, notes: "Branch transfer dispatch & receiving" },
  { id: "app-10", roleKey: "manager", roleName: "Branch Manager", moduleKey: "stock_adjustments", moduleName: "Stock Adjustments", canApprove: true, approvalLimitGHS: 15000, requiresHigherApproval: true, higherApproverRole: "Administrator", notes: "Discrepancy adjustment threshold" },
  { id: "app-11", roleKey: "manager", roleName: "Branch Manager", moduleKey: "price_changes", moduleName: "Price Changes", canApprove: false, approvalLimitGHS: 0, requiresHigherApproval: true, higherApproverRole: "Administrator", notes: "Requires Admin authorization" },
  { id: "app-12", roleKey: "manager", roleName: "Branch Manager", moduleKey: "customer_orders", moduleName: "Customer Orders", canApprove: true, approvalLimitGHS: 100000, requiresHigherApproval: false, notes: "Direct customer order confirmation" },

  { id: "app-13", roleKey: "accountant", roleName: "Accountant", moduleKey: "purchases", moduleName: "Purchases", canApprove: true, approvalLimitGHS: 200000, requiresHigherApproval: false, notes: "Vendor invoice fiscal validation" },
  { id: "app-14", roleKey: "accountant", roleName: "Accountant", moduleKey: "expenses", moduleName: "Operating Expenses", canApprove: true, approvalLimitGHS: 100000, requiresHigherApproval: false, notes: "Ledger expense reimbursement sign-off" },
  { id: "app-15", roleKey: "accountant", roleName: "Accountant", moduleKey: "stock_transfers", moduleName: "Stock Transfers", canApprove: false, approvalLimitGHS: 0, requiresHigherApproval: false, notes: "Operational role only" },
  { id: "app-16", roleKey: "accountant", roleName: "Accountant", moduleKey: "stock_adjustments", moduleName: "Stock Adjustments", canApprove: false, approvalLimitGHS: 0, requiresHigherApproval: false, notes: "Read-only for audit" },
  { id: "app-17", roleKey: "accountant", roleName: "Accountant", moduleKey: "price_changes", moduleName: "Price Changes", canApprove: false, approvalLimitGHS: 0, requiresHigherApproval: false, notes: "Managed by Executive" },
  { id: "app-18", roleKey: "accountant", roleName: "Accountant", moduleKey: "customer_orders", moduleName: "Customer Orders", canApprove: true, approvalLimitGHS: 500000, requiresHigherApproval: false, notes: "Credit clearance verification" },

  { id: "app-19", roleKey: "sales_officer", roleName: "Sales Associate", moduleKey: "purchases", moduleName: "Purchases", canApprove: false, approvalLimitGHS: 0, requiresHigherApproval: true, notes: "Cannot approve purchases" },
  { id: "app-20", roleKey: "sales_officer", roleName: "Sales Associate", moduleKey: "expenses", moduleName: "Operating Expenses", canApprove: false, approvalLimitGHS: 0, requiresHigherApproval: true, notes: "Cannot approve expenses" },
  { id: "app-21", roleKey: "sales_officer", roleName: "Sales Associate", moduleKey: "stock_transfers", moduleName: "Stock Transfers", canApprove: false, approvalLimitGHS: 0, requiresHigherApproval: true, notes: "Requires Manager approval" },
  { id: "app-22", roleKey: "sales_officer", roleName: "Sales Associate", moduleKey: "stock_adjustments", moduleName: "Stock Adjustments", canApprove: false, approvalLimitGHS: 0, requiresHigherApproval: true, notes: "Cannot adjust inventory" },
  { id: "app-23", roleKey: "sales_officer", roleName: "Sales Associate", moduleKey: "price_changes", moduleName: "Price Changes", canApprove: false, approvalLimitGHS: 0, requiresHigherApproval: true, notes: "Fixed pricing only" },
  { id: "app-24", roleKey: "sales_officer", roleName: "Sales Associate", moduleKey: "customer_orders", moduleName: "Customer Orders", canApprove: false, approvalLimitGHS: 0, requiresHigherApproval: true, notes: "Orders route to Manager for approval" },

  { id: "app-25", roleKey: "cashier", roleName: "Cashier", moduleKey: "purchases", moduleName: "Purchases", canApprove: false, approvalLimitGHS: 0, requiresHigherApproval: true, notes: "No procurement rights" },
  { id: "app-26", roleKey: "cashier", roleName: "Cashier", moduleKey: "expenses", moduleName: "Operating Expenses", canApprove: false, approvalLimitGHS: 0, requiresHigherApproval: true, notes: "Cannot approve expenses" },
  { id: "app-27", roleKey: "cashier", roleName: "Cashier", moduleKey: "stock_transfers", moduleName: "Stock Transfers", canApprove: false, approvalLimitGHS: 0, requiresHigherApproval: true, notes: "No transfer authorization" },
  { id: "app-28", roleKey: "cashier", roleName: "Cashier", moduleKey: "stock_adjustments", moduleName: "Stock Adjustments", canApprove: false, approvalLimitGHS: 0, requiresHigherApproval: true, notes: "No adjustment authority" },
  { id: "app-29", roleKey: "cashier", roleName: "Cashier", moduleKey: "price_changes", moduleName: "Price Changes", canApprove: false, approvalLimitGHS: 0, requiresHigherApproval: true, notes: "Cannot discount or change prices" },
  { id: "app-30", roleKey: "cashier", roleName: "Cashier", moduleKey: "customer_orders", moduleName: "Customer Orders", canApprove: false, approvalLimitGHS: 0, requiresHigherApproval: true, notes: "POS transactions only" }
];

export const INITIAL_USERS: ManagedUser[] = [
  {
    id: "usr-01",
    userId: "u-01",
    name: "John Doe",
    fullName: "John Doe",
    email: "john.doe@thinksales.com",
    phone: "+233 24 412 3456",
    employeeId: "TS-EMP-001",
    avatarUrl: null,
    role: "administrator",
    roleLabel: "Administrator",
    status: "active",
    department: "Executive Management",
    locationId: "b-head",
    locationName: "Head Office",
    secondaryBranches: ["b-accra", "b-kumasi", "b-tema"],
    secondaryBranchNames: ["Accra Main Branch", "Kumasi Branch", "Tema Branch"],
    lastSignInAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    joinedAt: "2024-01-15T08:00:00Z",
    isSelf: true,
    twoFactorEnabled: true,
    branchScope: "all",
    approvalPermissions: { stockTransfers: true, purchases: true, expenses: true, priceUpdates: true, stockAdjustments: true, customerOrders: true, maxExpenseAmount: 500000, maxPurchaseAmount: 1000000 },
    performance: {
      salesCreated: 142,
      ordersApproved: 88,
      ordersProcessed: 120,
      transfersApproved: 45,
      inventoryAdjustments: 12,
      expensesApproved: 34,
      totalSalesVolumeGHS: 840500,
      activityScore: 98,
      lastLogin: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      monthlyTrend: [
        { month: "Jan", sales: 120000, activities: 240 },
        { month: "Feb", sales: 150000, activities: 310 },
        { month: "Mar", sales: 185000, activities: 420 },
        { month: "Apr", sales: 195000, activities: 390 },
        { month: "May", sales: 190500, activities: 450 }
      ]
    }
  },
  {
    id: "usr-02",
    userId: "u-02",
    name: "Mary Addo",
    fullName: "Mary Addo",
    email: "mary.addo@thinksales.com",
    phone: "+233 20 876 5432",
    employeeId: "TS-EMP-002",
    avatarUrl: null,
    role: "manager",
    roleLabel: "Branch Manager",
    status: "active",
    department: "Operations & Logistics",
    locationId: "b-kumasi",
    locationName: "Kumasi Branch",
    secondaryBranches: ["b-sunyani"],
    secondaryBranchNames: ["Sunyani Branch"],
    lastSignInAt: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
    joinedAt: "2024-02-01T09:30:00Z",
    isSelf: false,
    twoFactorEnabled: true,
    branchScope: "assigned",
    approvalPermissions: { stockTransfers: true, purchases: true, expenses: true, priceUpdates: false, stockAdjustments: true, customerOrders: true, maxExpenseAmount: 25000, maxPurchaseAmount: 50000 },
    performance: {
      salesCreated: 85,
      ordersApproved: 64,
      ordersProcessed: 90,
      transfersApproved: 28,
      inventoryAdjustments: 16,
      expensesApproved: 22,
      totalSalesVolumeGHS: 420000,
      activityScore: 92,
      lastLogin: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
      monthlyTrend: [
        { month: "Jan", sales: 65000, activities: 180 },
        { month: "Feb", sales: 78000, activities: 210 },
        { month: "Mar", sales: 92000, activities: 290 },
        { month: "Apr", sales: 90000, activities: 270 },
        { month: "May", sales: 95000, activities: 310 }
      ]
    }
  },
  {
    id: "usr-03",
    userId: "u-03",
    name: "Daniel K.",
    fullName: "Daniel Koomson",
    email: "daniel.k@thinksales.com",
    phone: "+233 55 345 6789",
    employeeId: "TS-EMP-003",
    avatarUrl: null,
    role: "sales_officer",
    roleLabel: "Sales Associate",
    status: "active",
    department: "Sales & Marketing",
    locationId: "b-takoradi",
    locationName: "Takoradi Branch",
    secondaryBranches: [],
    secondaryBranchNames: [],
    lastSignInAt: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
    joinedAt: "2024-03-10T11:15:00Z",
    isSelf: false,
    twoFactorEnabled: false,
    branchScope: "single",
    approvalPermissions: { stockTransfers: false, purchases: false, expenses: false, priceUpdates: false, stockAdjustments: false, customerOrders: false },
    performance: {
      salesCreated: 210,
      ordersApproved: 0,
      ordersProcessed: 180,
      transfersApproved: 0,
      inventoryAdjustments: 0,
      expensesApproved: 0,
      totalSalesVolumeGHS: 620000,
      activityScore: 88,
      lastLogin: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
      monthlyTrend: [
        { month: "Jan", sales: 95000, activities: 310 },
        { month: "Feb", sales: 110000, activities: 380 },
        { month: "Mar", sales: 135000, activities: 450 },
        { month: "Apr", sales: 130000, activities: 430 },
        { month: "May", sales: 150000, activities: 490 }
      ]
    }
  },
  {
    id: "usr-04",
    userId: "u-04",
    name: "Grace Mensah",
    fullName: "Grace Mensah",
    email: "grace.m@thinksales.com",
    phone: "+233 24 998 8776",
    employeeId: "TS-EMP-004",
    avatarUrl: null,
    role: "cashier",
    roleLabel: "Cashier",
    status: "active",
    department: "Sales & Marketing",
    locationId: "b-accra",
    locationName: "Accra Main Branch",
    secondaryBranches: [],
    secondaryBranchNames: [],
    lastSignInAt: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
    joinedAt: "2024-03-15T14:20:00Z",
    isSelf: false,
    twoFactorEnabled: true,
    branchScope: "single",
    approvalPermissions: { stockTransfers: false, purchases: false, expenses: false, priceUpdates: false, stockAdjustments: false, customerOrders: false },
    performance: {
      salesCreated: 340,
      ordersApproved: 0,
      ordersProcessed: 0,
      transfersApproved: 0,
      inventoryAdjustments: 0,
      expensesApproved: 0,
      totalSalesVolumeGHS: 310000,
      activityScore: 94,
      lastLogin: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
      monthlyTrend: [
        { month: "Jan", sales: 50000, activities: 420 },
        { month: "Feb", sales: 62000, activities: 510 },
        { month: "Mar", sales: 71000, activities: 580 },
        { month: "Apr", sales: 63000, activities: 530 },
        { month: "May", sales: 64000, activities: 560 }
      ]
    }
  },
  {
    id: "usr-05",
    userId: "u-05",
    name: "James Mensah",
    fullName: "James Mensah",
    email: "james.m@thinksales.com",
    phone: "+233 50 112 2334",
    employeeId: "TS-EMP-005",
    avatarUrl: null,
    role: "inventory_officer",
    roleLabel: "Inventory Clerk",
    status: "inactive",
    department: "Inventory & Warehouse",
    locationId: "b-tema",
    locationName: "Tema Branch",
    secondaryBranches: ["b-accra"],
    secondaryBranchNames: ["Accra Main Branch"],
    lastSignInAt: new Date(Date.now() - 1000 * 60 * 60 * 48 * 20).toISOString(),
    joinedAt: "2024-04-01T10:00:00Z",
    isSelf: false,
    twoFactorEnabled: false,
    branchScope: "assigned",
    attentionReason: "stale",
    approvalPermissions: { stockTransfers: false, purchases: false, expenses: false, priceUpdates: false, stockAdjustments: false, customerOrders: false }
  },
  {
    id: "usr-06",
    userId: "u-06",
    name: "Akosua Gyamfi",
    fullName: "Akosua Gyamfi",
    email: "akosua.g@thinksales.com",
    phone: "+233 27 554 4332",
    employeeId: "TS-EMP-006",
    avatarUrl: null,
    role: "sales_officer",
    roleLabel: "Sales Associate",
    status: "active",
    department: "Sales & Marketing",
    locationId: "b-ho",
    locationName: "Ho Branch",
    secondaryBranches: [],
    secondaryBranchNames: [],
    lastSignInAt: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
    joinedAt: "2024-04-12T09:05:00Z",
    isSelf: false,
    twoFactorEnabled: true,
    branchScope: "single",
    approvalPermissions: { stockTransfers: false, purchases: false, expenses: false, priceUpdates: false, stockAdjustments: false, customerOrders: false }
  },
  {
    id: "usr-07",
    userId: "u-07",
    name: "Michael Ofori",
    fullName: "Michael Ofori",
    email: "michael.o@thinksales.com",
    phone: "+233 24 667 7889",
    employeeId: "TS-EMP-007",
    avatarUrl: null,
    role: "manager",
    roleLabel: "Branch Manager",
    status: "active",
    department: "Operations & Logistics",
    locationId: "b-cape",
    locationName: "Cape Coast Branch",
    secondaryBranches: ["b-takoradi"],
    secondaryBranchNames: ["Takoradi Branch"],
    lastSignInAt: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(),
    joinedAt: "2024-04-20T16:45:00Z",
    isSelf: false,
    twoFactorEnabled: true,
    branchScope: "assigned",
    approvalPermissions: { stockTransfers: true, purchases: true, expenses: true, priceUpdates: false, stockAdjustments: true, customerOrders: true, maxExpenseAmount: 20000, maxPurchaseAmount: 40000 }
  },
  {
    id: "usr-08",
    userId: "u-08",
    name: "Abena Boateng",
    fullName: "Abena Boateng",
    email: "abena.b@thinksales.com",
    phone: "+233 54 887 7665",
    employeeId: "TS-EMP-008",
    avatarUrl: null,
    role: "cashier",
    roleLabel: "Cashier",
    status: "inactive",
    department: "Sales & Marketing",
    locationId: "b-sunyani",
    locationName: "Sunyani Branch",
    secondaryBranches: [],
    secondaryBranchNames: [],
    lastSignInAt: new Date(Date.now() - 1000 * 60 * 60 * 72 * 15).toISOString(),
    joinedAt: "2024-05-02T13:30:00Z",
    isSelf: false,
    twoFactorEnabled: false,
    branchScope: "single",
    attentionReason: "disabled",
    approvalPermissions: { stockTransfers: false, purchases: false, expenses: false, priceUpdates: false, stockAdjustments: false, customerOrders: false }
  },
  {
    id: "usr-13",
    userId: "u-13",
    name: "Kofi Annan",
    fullName: "Kofi Annan",
    email: "kofi.a@thinksales.com",
    phone: "+233 26 777 8899",
    employeeId: "TS-EMP-013",
    avatarUrl: null,
    role: "manager",
    roleLabel: "Branch Manager",
    status: "pending",
    department: "Operations & Logistics",
    locationId: "b-accra",
    locationName: "Accra Main Branch",
    secondaryBranches: ["b-tema"],
    secondaryBranchNames: ["Tema Branch"],
    lastSignInAt: null,
    joinedAt: "2024-05-24T14:00:00Z",
    isSelf: false,
    twoFactorEnabled: false,
    branchScope: "assigned",
    attentionReason: "pending_invitation",
    approvalPermissions: { stockTransfers: true, purchases: true, expenses: true, priceUpdates: false, stockAdjustments: true, customerOrders: true }
  },
  {
    id: "usr-14",
    userId: "u-14",
    name: "Faustina Arthur",
    fullName: "Faustina Arthur",
    email: "faustina.a@thinksales.com",
    phone: "+233 24 555 6677",
    employeeId: "TS-EMP-014",
    avatarUrl: null,
    role: "cashier",
    roleLabel: "Cashier",
    status: "suspended",
    department: "Sales & Marketing",
    locationId: "b-kumasi",
    locationName: "Kumasi Branch",
    secondaryBranches: [],
    secondaryBranchNames: [],
    lastSignInAt: new Date(Date.now() - 1000 * 60 * 60 * 168).toISOString(),
    joinedAt: "2024-02-28T10:00:00Z",
    isSelf: false,
    twoFactorEnabled: false,
    branchScope: "single",
    attentionReason: "locked",
    approvalPermissions: { stockTransfers: false, purchases: false, expenses: false, priceUpdates: false, stockAdjustments: false, customerOrders: false }
  }
];

export const INITIAL_LOGIN_SESSIONS: LoginSession[] = [
  {
    id: "sess-1",
    sessionId: "sess_9f81a2e4b",
    userId: "usr-01",
    userName: "John Doe",
    userEmail: "john.doe@thinksales.com",
    role: "Administrator",
    branch: "Head Office",
    loginTime: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    lastActivity: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    durationMinutes: 15,
    device: "Dell XPS 15 (Desktop)",
    browser: "Chrome 124.0",
    os: "Windows 11 Pro",
    ipAddress: "102.176.94.12",
    location: "Accra, Ghana",
    status: "active",
    isCurrent: true
  },
  {
    id: "sess-2",
    sessionId: "sess_c48b2109d",
    userId: "usr-02",
    userName: "Mary Addo",
    userEmail: "mary.addo@thinksales.com",
    role: "Branch Manager",
    branch: "Kumasi Branch",
    loginTime: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
    lastActivity: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    durationMinutes: 95,
    device: "MacBook Pro 16",
    browser: "Safari 17.4",
    os: "macOS Sonoma",
    ipAddress: "197.251.130.45",
    location: "Kumasi, Ghana",
    status: "active",
    isCurrent: false
  },
  {
    id: "sess-3",
    sessionId: "sess_7e3a98bc1",
    userId: "usr-03",
    userName: "Daniel Koomson",
    userEmail: "daniel.k@thinksales.com",
    role: "Sales Associate",
    branch: "Takoradi Branch",
    loginTime: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
    lastActivity: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    durationMinutes: 240,
    device: "Samsung Galaxy Tab S9 (Tablet)",
    browser: "Chrome Mobile 124",
    os: "Android 14",
    ipAddress: "154.160.22.89",
    location: "Takoradi, Ghana",
    status: "active",
    isCurrent: false
  },
  {
    id: "sess-4",
    sessionId: "sess_5a19d80ef",
    userId: "usr-04",
    userName: "Grace Mensah",
    userEmail: "grace.m@thinksales.com",
    role: "Cashier",
    branch: "Accra Main Branch",
    loginTime: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
    lastActivity: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    durationMinutes: 360,
    device: "POS Terminal 01",
    browser: "Chrome 123.0",
    os: "Windows 10 Enterprise",
    ipAddress: "102.176.94.18",
    location: "Accra, Ghana",
    status: "active",
    isCurrent: false
  },
  {
    id: "sess-5",
    sessionId: "sess_2b98e714a",
    userId: "usr-14",
    userName: "Faustina Arthur",
    userEmail: "faustina.a@thinksales.com",
    role: "Cashier",
    branch: "Kumasi Branch",
    loginTime: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    lastActivity: new Date(Date.now() - 1000 * 60 * 60 * 11).toISOString(),
    logoutTime: new Date(Date.now() - 1000 * 60 * 60 * 11).toISOString(),
    durationMinutes: 60,
    device: "HP ProDesk 400",
    browser: "Firefox 125.0",
    os: "Windows 10 Pro",
    ipAddress: "41.215.160.22",
    location: "Kumasi, Ghana",
    status: "timed_out",
    isCurrent: false
  },
  {
    id: "sess-6",
    sessionId: "sess_8f3d10ab7",
    userId: "usr-06",
    userName: "Akosua Gyamfi",
    userEmail: "akosua.g@thinksales.com",
    role: "Sales Associate",
    branch: "Ho Branch",
    loginTime: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
    lastActivity: new Date(Date.now() - 1000 * 60 * 60 * 21).toISOString(),
    logoutTime: new Date(Date.now() - 1000 * 60 * 60 * 21).toISOString(),
    durationMinutes: 45,
    device: "iPhone 15 Pro",
    browser: "Mobile Safari",
    os: "iOS 17.4",
    ipAddress: "154.160.44.12",
    location: "Ho, Ghana",
    status: "logged_out",
    isCurrent: false
  }
];

export const INITIAL_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: "log-1",
    logId: "ACT-2025-0982",
    userId: "usr-01",
    userName: "John Doe",
    userEmail: "john.doe@thinksales.com",
    role: "Administrator",
    branch: "Head Office",
    module: "Products",
    page: "/inventory/products",
    action: "Price Updated",
    recordType: "Product",
    recordId: "PRD-BEV-001 (Club Beer 625ml)",
    oldValue: "GHS 150.00",
    newValue: "GHS 175.00",
    changesDiff: [
      { field: "wholesalePrice", label: "Wholesale Price", oldValue: "GHS 150.00", newValue: "GHS 175.00" },
      { field: "retailPrice", label: "Retail Price", oldValue: "GHS 180.00", newValue: "GHS 210.00" },
      { field: "margin", label: "Gross Margin", oldValue: "20.0%", newValue: "20.0%" }
    ],
    timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    device: "Dell XPS 15",
    browser: "Chrome 124",
    os: "Windows 11",
    ipAddress: "102.176.94.12",
    sessionId: "sess_9f81a2e4b",
    status: "success",
    details: "Adjusted product price tier due to supplier excise rate change."
  },
  {
    id: "log-2",
    logId: "ACT-2025-0981",
    userId: "usr-01",
    userName: "John Doe",
    userEmail: "john.doe@thinksales.com",
    role: "Administrator",
    branch: "Head Office",
    module: "User Management",
    page: "/settings/organization",
    action: "Role Assigned",
    recordType: "User Account",
    recordId: "usr-02 (Mary Addo)",
    oldValue: "Sales Associate",
    newValue: "Branch Manager",
    changesDiff: [
      { field: "role", label: "System Role", oldValue: "Sales Associate", newValue: "Branch Manager" },
      { field: "branchScope", label: "Branch Access Scope", oldValue: "Single Branch (Takoradi)", newValue: "Multi-Branch (Kumasi, Sunyani)" },
      { field: "approvalLimit", label: "Expense Approval Limit", oldValue: "GHS 0", newValue: "GHS 25,000" }
    ],
    timestamp: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    device: "Dell XPS 15",
    browser: "Chrome 124",
    os: "Windows 11",
    ipAddress: "102.176.94.12",
    sessionId: "sess_9f81a2e4b",
    status: "success",
    details: "Promoted Mary Addo to Branch Manager with multi-branch management authority."
  },
  {
    id: "log-3",
    logId: "ACT-2025-0980",
    userId: "usr-02",
    userName: "Mary Addo",
    userEmail: "mary.addo@thinksales.com",
    role: "Branch Manager",
    branch: "Kumasi Branch",
    module: "Transfers",
    page: "/inventory/transfers",
    action: "Stock Transfer Approved",
    recordType: "Stock Transfer",
    recordId: "TRF-2025-089",
    oldValue: "Pending Approval",
    newValue: "Approved & Dispatched",
    changesDiff: [
      { field: "status", label: "Transfer Status", oldValue: "pending_approval", newValue: "in_transit" },
      { field: "dispatchedQty", label: "Total Units Dispatched", oldValue: 0, newValue: 50 },
      { field: "destination", label: "Destination Branch", oldValue: "None", newValue: "Sunyani Branch" }
    ],
    timestamp: new Date(Date.now() - 1000 * 60 * 75).toISOString(),
    device: "MacBook Pro 16",
    browser: "Safari 17.4",
    os: "macOS Sonoma",
    ipAddress: "197.251.130.45",
    sessionId: "sess_c48b2109d",
    status: "success",
    details: "Approved inter-branch stock dispatch of 50 units Beverages to Sunyani Branch."
  },
  {
    id: "log-4",
    logId: "ACT-2025-0979",
    userId: "usr-04",
    userName: "Grace Mensah",
    userEmail: "grace.m@thinksales.com",
    role: "Cashier",
    branch: "Accra Main Branch",
    module: "POS",
    page: "/pos",
    action: "Sale Completed",
    recordType: "POS Receipt",
    recordId: "REC-ACC-2025-1049",
    oldValue: "Cart Active (3 items)",
    newValue: "Paid GHS 450.00 via MTN MoMo",
    changesDiff: [
      { field: "subtotal", label: "Subtotal", oldValue: "GHS 450.00", newValue: "GHS 450.00" },
      { field: "paymentMethod", label: "Payment Method", oldValue: "Pending", newValue: "Mobile Money (MTN)" },
      { field: "receiptNumber", label: "Receipt Number", oldValue: "N/A", newValue: "REC-ACC-2025-1049" }
    ],
    timestamp: new Date(Date.now() - 1000 * 60 * 110).toISOString(),
    device: "POS Terminal 01",
    browser: "Chrome 123",
    os: "Windows 10",
    ipAddress: "102.176.94.18",
    sessionId: "sess_5a19d80ef",
    status: "success",
    details: "Checkout transaction processed with receipt printout."
  },
  {
    id: "log-5",
    logId: "ACT-2025-0978",
    userId: "usr-14",
    userName: "Faustina Arthur",
    userEmail: "faustina.a@thinksales.com",
    role: "Cashier",
    branch: "Kumasi Branch",
    module: "User Management",
    page: "/login",
    action: "Failed Login Attempt",
    recordType: "Auth Credential",
    recordId: "usr-14",
    oldValue: "Active Account",
    newValue: "Account Locked (3 failed attempts)",
    changesDiff: [
      { field: "failedAttempts", label: "Consecutive Failed Logins", oldValue: 2, newValue: 3 },
      { field: "accountLockState", label: "Lockout Status", oldValue: "Unlocked", newValue: "Temporary 15m Lockout" }
    ],
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    device: "HP ProDesk 400",
    browser: "Firefox 125",
    os: "Windows 10",
    ipAddress: "41.215.160.22",
    status: "failed",
    details: "3 invalid password attempts recorded. Security policy triggered account freeze."
  },
  {
    id: "log-6",
    logId: "ACT-2025-0977",
    userId: "usr-01",
    userName: "John Doe",
    userEmail: "john.doe@thinksales.com",
    role: "Administrator",
    branch: "Head Office",
    module: "Expenses",
    page: "/expenses",
    action: "Expense Approved",
    recordType: "Operating Expense",
    recordId: "EXP-2025-042",
    oldValue: "Pending Review (GHS 4,500)",
    newValue: "Approved for Disbursement",
    changesDiff: [
      { field: "approvalStatus", label: "Approval Status", oldValue: "pending_approval", newValue: "approved" },
      { field: "approvedAmount", label: "Disbursement Limit", oldValue: "GHS 0", newValue: "GHS 4,500.00" },
      { field: "category", label: "Expense Category", oldValue: "Utilities", newValue: "Utilities (Generator Fuel)" }
    ],
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 14).toISOString(),
    device: "Dell XPS 15",
    browser: "Chrome 124",
    os: "Windows 11",
    ipAddress: "102.176.94.12",
    sessionId: "sess_9f81a2e4b",
    status: "success",
    details: "Approved diesel procurement invoice for Head Office backup generator."
  },
  {
    id: "log-7",
    logId: "ACT-2025-0976",
    userId: "usr-03",
    userName: "Daniel Koomson",
    userEmail: "daniel.k@thinksales.com",
    role: "Sales Associate",
    branch: "Takoradi Branch",
    module: "Orders",
    page: "/orders",
    action: "Order Created",
    recordType: "Customer Order",
    recordId: "ORD-2025-0144",
    oldValue: "Draft Order",
    newValue: "Submitted Order (GHS 18,500)",
    changesDiff: [
      { field: "customerName", label: "Customer Name", oldValue: "N/A", newValue: "Western Wholesale Depot" },
      { field: "totalAmount", label: "Total Order Value", oldValue: "GHS 0.00", newValue: "GHS 18,500.00" },
      { field: "deliveryTarget", label: "Delivery Target Date", oldValue: "N/A", newValue: "2025-05-30" }
    ],
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
    device: "Samsung Galaxy Tab",
    browser: "Chrome Mobile",
    os: "Android 14",
    ipAddress: "154.160.22.89",
    sessionId: "sess_7e3a98bc1",
    status: "success",
    details: "New high-volume wholesale customer order created and routed for manager review."
  }
];

export const INITIAL_BRANCH_ACCESS_RULES: BranchAccessRule[] = [
  { userId: "usr-01", userName: "John Doe", userEmail: "john.doe@thinksales.com", role: "Administrator", primaryBranchId: "b-head", primaryBranchName: "Head Office", additionalBranchIds: ["b-accra", "b-kumasi", "b-takoradi", "b-tema", "b-ho", "b-cape", "b-sunyani", "b-tamale", "b-wa"], additionalBranchNames: ["All Branches"], viewAllBranches: true, canTransferBetweenBranches: true, canApproveBranchOrders: true },
  { userId: "usr-02", userName: "Mary Addo", userEmail: "mary.addo@thinksales.com", role: "Branch Manager", primaryBranchId: "b-kumasi", primaryBranchName: "Kumasi Branch", additionalBranchIds: ["b-sunyani"], additionalBranchNames: ["Sunyani Branch"], viewAllBranches: false, canTransferBetweenBranches: true, canApproveBranchOrders: true },
  { userId: "usr-03", userName: "Daniel Koomson", userEmail: "daniel.k@thinksales.com", role: "Sales Associate", primaryBranchId: "b-takoradi", primaryBranchName: "Takoradi Branch", additionalBranchIds: [], additionalBranchNames: [], viewAllBranches: false, canTransferBetweenBranches: false, canApproveBranchOrders: false },
  { userId: "usr-04", userName: "Grace Mensah", userEmail: "grace.m@thinksales.com", role: "Cashier", primaryBranchId: "b-accra", primaryBranchName: "Accra Main Branch", additionalBranchIds: [], additionalBranchNames: [], viewAllBranches: false, canTransferBetweenBranches: false, canApproveBranchOrders: false },
  { userId: "usr-07", userName: "Michael Ofori", userEmail: "michael.o@thinksales.com", role: "Branch Manager", primaryBranchId: "b-cape", primaryBranchName: "Cape Coast Branch", additionalBranchIds: ["b-takoradi"], additionalBranchNames: ["Takoradi Branch"], viewAllBranches: false, canTransferBetweenBranches: true, canApproveBranchOrders: true }
];

export const INITIAL_INVITATIONS: InvitationRecord[] = [
  { id: "inv-1", name: "Kofi Annan", email: "kofi.a@thinksales.com", role: "manager", roleLabel: "Branch Manager", branchId: "b-accra", branchName: "Accra Main Branch", invitedBy: "John Doe", invitedAt: "2024-05-24T14:00:00Z", expiresAt: "2024-05-31T14:00:00Z", status: "pending" },
  { id: "inv-2", name: "Sarah Owusu", email: "sarah.o@thinksales.com", role: "sales_officer", roleLabel: "Sales Associate", branchId: "b-tamale", branchName: "Tamale Branch", invitedBy: "John Doe", invitedAt: "2024-05-20T09:00:00Z", expiresAt: "2024-05-27T09:00:00Z", status: "expired" },
  { id: "inv-3", name: "Patrick Kyeremeh", email: "patrick.k@thinksales.com", role: "cashier", roleLabel: "Cashier", branchId: "b-sunyani", branchName: "Sunyani Branch", invitedBy: "John Doe", invitedAt: "2024-05-15T11:30:00Z", expiresAt: "2024-05-22T11:30:00Z", status: "accepted" }
];
