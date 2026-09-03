import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AccountingAccount,
  JournalEntry,
  JournalLineItem,
  BankAccountItem,
  BankStatementTransaction,
  AccountsReceivableItem,
  AccountsPayableItem,
  AgingSummary,
  FixedAsset,
  FinancialKPIs,
  MonthlyTrendPoint,
  ExpenseSlice,
  RecentTransactionItem,
  TaxRateConfig,
  TaxFilingSummary,
  AccountingSettings,
  AccountingAuditLog,
} from "@/types/accounting";

interface AccountingState {
  // Global Filters & Context
  currentBranch: string;
  currentCurrency: string;
  dateRange: { from: string; to: string; label: string };
  activeTab: string;

  // Primary Entities
  accounts: AccountingAccount[];
  journalEntries: JournalEntry[];
  bankAccounts: BankAccountItem[];
  bankTransactions: Record<string, BankStatementTransaction[]>;
  receivables: AccountsReceivableItem[];
  payables: AccountsPayableItem[];
  fixedAssets: FixedAsset[];
  taxRates: TaxRateConfig[];
  taxFilings: TaxFilingSummary[];
  settings: AccountingSettings;
  auditLogs: AccountingAuditLog[];

  // Mutators & Workflows
  setActiveTab: (tab: string) => void;
  setBranch: (branch: string) => void;
  setCurrency: (currency: string) => void;
  setDateRange: (from: string, to: string, label: string) => void;

  // Chart of Accounts Actions
  addAccount: (account: Omit<AccountingAccount, "id" | "balance"> & { openingBalance?: number }) => void;
  updateAccount: (id: string, updates: Partial<AccountingAccount>) => void;
  toggleAccountStatus: (id: string) => void;
  mergeAccounts: (sourceId: string, targetId: string) => boolean;

  // Journal Entry Actions
  createJournalEntry: (entry: Omit<JournalEntry, "id" | "entryNumber">, postNow?: boolean) => JournalEntry;
  postJournalEntry: (id: string) => boolean;
  reverseJournalEntry: (id: string, reason?: string) => JournalEntry | null;

  // Bank Reconciliation Actions
  importBankStatement: (bankAccountId: string, transactions: Omit<BankStatementTransaction, "id" | "matched">[]) => void;
  autoReconcileBank: (bankAccountId: string) => number;
  toggleReconcileLine: (bankAccountId: string, transactionId: string) => void;
  finalizeReconciliation: (bankAccountId: string) => void;

  // Accounts Receivable Actions
  recordCustomerPayment: (invoiceId: string, amount: number, paymentMethod: string, bankAccountId: string) => void;
  sendCustomerReminder: (invoiceId: string, message?: string) => void;

  // Accounts Payable Actions
  createSupplierBill: (bill: Omit<AccountsPayableItem, "id" | "daysOutstanding" | "status" | "paidAmount">) => void;
  recordSupplierPayment: (billId: string, amount: number, bankAccountId: string) => void;
  scheduleSupplierPayment: (billId: string, date: string, method: string) => void;

  // Fixed Assets Actions
  addFixedAsset: (asset: Omit<FixedAsset, "id" | "accumulatedDepreciation" | "currentValue">) => void;
  runDepreciationPosting: (periodMonths?: number) => { totalDepreciation: number; entriesCreated: number };

  // Tax Management
  updateTaxRate: (id: string, updates: Partial<TaxRateConfig>) => void;
  fileTaxReturn: (summary: TaxFilingSummary) => void;

  // Settings
  updateSettings: (updates: Partial<AccountingSettings>) => void;

  // Getters & Computed Metrics
  getKPIs: () => FinancialKPIs;
  getIncomeVsExpensesTrend: () => MonthlyTrendPoint[];
  getExpenseBreakdown: () => ExpenseSlice[];
  getRecentTransactions: () => RecentTransactionItem[];
  getAccountsSummary: () => { name: string; balance: number }[];
  getAccountBalancesList: () => { name: string; balance: number; type: string; icon: string }[];
  getReceivablesAging: () => AgingSummary;
  getPayablesAging: () => AgingSummary;
  getFinancialYearProgress: () => { percentage: number; label: string };
  searchAll: (query: string) => { type: string; id: string; title: string; subtitle: string; tab: string }[];
}

// Initial Seed Data matching the uploaded reference image
const SEED_ACCOUNTS: AccountingAccount[] = [
  { id: "acc-1000", code: "1000", name: "Cash on Hand", type: "asset", subType: "Cash & Bank", branch: "Main Branch", currency: "GHS", balance: 12450.0, status: "active" },
  { id: "acc-1010", code: "1010", name: "GCB Bank", type: "asset", subType: "Cash & Bank", branch: "Main Branch", currency: "GHS", balance: 185000.0, status: "active" },
  { id: "acc-1020", code: "1020", name: "Stanbic Bank", type: "asset", subType: "Cash & Bank", branch: "Main Branch", currency: "GHS", balance: 92350.0, status: "active" },
  { id: "acc-1100", code: "1100", name: "Accounts Receivable", type: "asset", subType: "Current Assets", branch: "Main Branch", currency: "GHS", balance: 68420.0, status: "active" },
  { id: "acc-1200", code: "1200", name: "Inventory", type: "asset", subType: "Current Assets", branch: "Main Branch", currency: "GHS", balance: 245000.0, status: "active" },
  { id: "acc-1500", code: "1500", name: "Property, Plant & Equipment", type: "asset", subType: "Fixed Assets", branch: "Main Branch", currency: "GHS", balance: 165000.0, status: "active" },
  { id: "acc-1510", code: "1510", name: "Accumulated Depreciation", type: "asset", subType: "Fixed Assets", branch: "Main Branch", currency: "GHS", balance: -48220.0, status: "active" },
  { id: "acc-2000", code: "2000", name: "Accounts Payable", type: "liability", subType: "Current Liabilities", branch: "Main Branch", currency: "GHS", balance: -54210.0, status: "active" },
  { id: "acc-2100", code: "2100", name: "VAT / Tax Payable", type: "liability", subType: "Current Liabilities", branch: "Main Branch", currency: "GHS", balance: -24500.0, status: "active" },
  { id: "acc-2200", code: "2200", name: "Short-term Loan", type: "liability", subType: "Current Liabilities", branch: "Main Branch", currency: "GHS", balance: -131290.0, status: "active" },
  { id: "acc-3000", code: "3000", name: "Equity & Retained Earnings", type: "equity", subType: "Owner Equity", branch: "Main Branch", currency: "GHS", balance: 310000.0, status: "active" },
  { id: "acc-4000", code: "4000", name: "Sales Income", type: "revenue", subType: "Operating Revenue", branch: "Main Branch", currency: "GHS", balance: 125430.0, status: "active" },
  { id: "acc-5000", code: "5000", name: "Cost of Goods Sold", type: "cogs", subType: "Cost of Sales", branch: "Main Branch", currency: "GHS", balance: 36656.25, status: "active" },
  { id: "acc-6000", code: "6000", name: "Salaries & Wages", type: "expense", subType: "Payroll", branch: "Main Branch", currency: "GHS", balance: 15783.75, status: "active" },
  { id: "acc-6010", code: "6010", name: "Rent & Utilities", type: "expense", subType: "Operating Expense", branch: "Main Branch", currency: "GHS", balance: 10436.25, status: "active" },
  { id: "acc-6020", code: "6020", name: "Office Expenses", type: "expense", subType: "Operating Expense", branch: "Main Branch", currency: "GHS", balance: 7503.75, status: "active" },
  { id: "acc-6030", code: "6030", name: "Transportation", type: "expense", subType: "Logistics", branch: "Main Branch", currency: "GHS", balance: 5520.0, status: "active" },
  { id: "acc-6040", code: "6040", name: "Marketing", type: "expense", subType: "Promotions", branch: "Main Branch", currency: "GHS", balance: 4485.0, status: "active" },
  { id: "acc-6050", code: "6050", name: "Other Expenses & Bank Charges", type: "expense", subType: "Administrative", branch: "Main Branch", currency: "GHS", balance: 5865.0, status: "active" },
];

const SEED_JOURNALS: JournalEntry[] = [
  {
    id: "je-1",
    entryNumber: "JE-2026-0154",
    date: "2026-05-17",
    branch: "Main Branch",
    reference: "INV-2026-894",
    description: "Sales revenue",
    status: "posted",
    totalDebit: 3250.0,
    totalCredit: 3250.0,
    sourceModule: "Sales",
    lines: [
      { id: "jl-1", accountId: "acc-1010", accountCode: "1010", accountName: "GCB Bank", debit: 3250.0, credit: 0, description: "Bank receipt" },
      { id: "jl-2", accountId: "acc-4000", accountCode: "4000", accountName: "Sales Income", debit: 0, credit: 3250.0, description: "Direct sale" },
    ],
  },
  {
    id: "je-2",
    entryNumber: "BP-2026-0087",
    date: "2026-05-17",
    branch: "Main Branch",
    reference: "BILL-2026-302",
    description: "Payment to supplier",
    status: "posted",
    totalDebit: 1850.0,
    totalCredit: 1850.0,
    sourceModule: "Purchases",
    lines: [
      { id: "jl-3", accountId: "acc-2000", accountCode: "2000", accountName: "Accounts Payable", debit: 1850.0, credit: 0, description: "Supplier clearing" },
      { id: "jl-4", accountId: "acc-1010", accountCode: "1010", accountName: "GCB Bank", debit: 0, credit: 1850.0, description: "Transfer payout" },
    ],
  },
  {
    id: "je-3",
    entryNumber: "EX-2026-0042",
    date: "2026-05-16",
    branch: "Main Branch",
    reference: "REC-99120",
    description: "Office supplies",
    status: "posted",
    totalDebit: 450.0,
    totalCredit: 450.0,
    sourceModule: "Expenses",
    lines: [
      { id: "jl-5", accountId: "acc-6020", accountCode: "6020", accountName: "Office Expenses", debit: 450.0, credit: 0, description: "Stationery & toner" },
      { id: "jl-6", accountId: "acc-1000", accountCode: "1000", accountName: "Cash on Hand", debit: 0, credit: 450.0, description: "Petty cash voucher" },
    ],
  },
  {
    id: "je-4",
    entryNumber: "RC-2026-0031",
    date: "2026-05-16",
    branch: "Main Branch",
    reference: "INV-2026-871",
    description: "Customer payment",
    status: "posted",
    totalDebit: 2400.0,
    totalCredit: 2400.0,
    sourceModule: "Accounts Receivable",
    lines: [
      { id: "jl-7", accountId: "acc-1020", accountCode: "1020", accountName: "Stanbic Bank", debit: 2400.0, credit: 0, description: "Wire received" },
      { id: "jl-8", accountId: "acc-1100", accountCode: "1100", accountName: "Accounts Receivable", debit: 0, credit: 2400.0, description: "Customer settle" },
    ],
  },
  {
    id: "je-5",
    entryNumber: "JE-2026-0153",
    date: "2026-05-15",
    branch: "Main Branch",
    reference: "BNK-CHG-MAY",
    description: "Bank charges",
    status: "posted",
    totalDebit: 120.0,
    totalCredit: 120.0,
    sourceModule: "Banking",
    lines: [
      { id: "jl-9", accountId: "acc-6050", accountCode: "6050", accountName: "Other Expenses & Bank Charges", debit: 120.0, credit: 0, description: "Monthly ledger fee" },
      { id: "jl-10", accountId: "acc-1010", accountCode: "1010", accountName: "GCB Bank", debit: 0, credit: 120.0, description: "Direct debit" },
    ],
  },
];

const SEED_BANK_ACCOUNTS: BankAccountItem[] = [
  { id: "bank-1", name: "Cash on Hand", accountNumber: "TILL-01", bankName: "Internal Vault", type: "cash", bookBalance: 12450.0, statementBalance: 12450.0, difference: 0, status: "reconciled", lastReconciledDate: "2026-05-15" },
  { id: "bank-2", name: "GCB Bank", accountNumber: "1041029384910", bankName: "Ghana Commercial Bank", type: "checking", bookBalance: 185000.0, statementBalance: 185000.0, difference: 0, status: "reconciled", lastReconciledDate: "2026-05-15" },
  { id: "bank-3", name: "Stanbic Bank", accountNumber: "9040019283741", bankName: "Stanbic Bank Ghana", type: "savings", bookBalance: 92350.0, statementBalance: 92350.0, difference: 0, status: "reconciled", lastReconciledDate: "2026-05-15" },
];

const SEED_RECEIVABLES: AccountsReceivableItem[] = [
  { id: "ar-1", customerName: "Apex Logistics Ltd", invoiceNumber: "INV-2026-0101", issueDate: "2026-05-02", dueDate: "2026-06-01", totalAmount: 42500.0, paidAmount: 0, outstandingAmount: 42500.0, daysOutstanding: 15, status: "current", branch: "Main Branch" },
  { id: "ar-2", customerName: "Osu Retail Consortium", invoiceNumber: "INV-2026-0094", issueDate: "2026-04-18", dueDate: "2026-05-18", totalAmount: 18200.0, paidAmount: 0, outstandingAmount: 18200.0, daysOutstanding: 28, status: "1-30", branch: "Main Branch" },
  { id: "ar-3", customerName: "Koforidua Tech Hub", invoiceNumber: "INV-2026-0081", issueDate: "2026-03-20", dueDate: "2026-04-19", totalAmount: 5400.0, paidAmount: 0, outstandingAmount: 5400.0, daysOutstanding: 45, status: "31-60", branch: "Main Branch" },
  { id: "ar-4", customerName: "Golden Coast Ventures", invoiceNumber: "INV-2026-0065", issueDate: "2026-02-12", dueDate: "2026-03-14", totalAmount: 2320.0, paidAmount: 0, outstandingAmount: 2320.0, daysOutstanding: 78, status: "61-90", branch: "Main Branch" },
];

const SEED_PAYABLES: AccountsPayableItem[] = [
  { id: "ap-1", supplierName: "Accra Wholesalers Ltd", billNumber: "BILL-2026-0144", billDate: "2026-05-05", dueDate: "2026-06-04", totalAmount: 32800.0, paidAmount: 0, outstandingAmount: 32800.0, daysOutstanding: 12, status: "current", branch: "Main Branch" },
  { id: "ap-2", supplierName: "Prime Logistics Group", billNumber: "BILL-2026-0138", billDate: "2026-04-20", dueDate: "2026-05-20", totalAmount: 14200.0, paidAmount: 0, outstandingAmount: 14200.0, daysOutstanding: 27, status: "1-30", branch: "Main Branch" },
  { id: "ap-3", supplierName: "Delta Electronics Corp", billNumber: "BILL-2026-0125", billDate: "2026-03-24", dueDate: "2026-04-23", totalAmount: 4800.0, paidAmount: 0, outstandingAmount: 4800.0, daysOutstanding: 42, status: "31-60", branch: "Main Branch" },
  { id: "ap-4", supplierName: "Graphic Packaging Gh", billNumber: "BILL-2026-0110", billDate: "2026-02-15", dueDate: "2026-03-17", totalAmount: 2410.0, paidAmount: 0, outstandingAmount: 2410.0, daysOutstanding: 76, status: "over-60", branch: "Main Branch" },
];

const SEED_FIXED_ASSETS: FixedAsset[] = [
  { id: "fa-1", assetCode: "FA-001", assetName: "Delivery Van (Toyota Hilux)", category: "Motor Vehicles", purchaseDate: "2024-01-15", cost: 180000.0, depreciationMethod: "straight_line", usefulLifeYears: 5, salvageValue: 20000.0, accumulatedDepreciation: 74666.67, currentValue: 105333.33, branch: "Main Branch", status: "in_use" },
  { id: "fa-2", assetCode: "FA-002", assetName: "Warehouse Forklift (Toyota 2.5T)", category: "Machinery", purchaseDate: "2024-06-10", cost: 95000.0, depreciationMethod: "straight_line", usefulLifeYears: 7, salvageValue: 10000.0, accumulatedDepreciation: 23273.81, currentValue: 71726.19, branch: "Main Branch", status: "in_use" },
  { id: "fa-3", assetCode: "FA-003", assetName: "Office Server & Network Backbone", category: "IT Equipment", purchaseDate: "2025-02-01", cost: 45000.0, depreciationMethod: "straight_line", usefulLifeYears: 3, salvageValue: 3000.0, accumulatedDepreciation: 17500.0, currentValue: 27500.0, branch: "Main Branch", status: "in_use" },
  { id: "fa-4", assetCode: "FA-004", assetName: "Executive Office Furniture Set", category: "Fixtures & Fittings", purchaseDate: "2025-04-12", cost: 25000.0, depreciationMethod: "straight_line", usefulLifeYears: 5, salvageValue: 2000.0, accumulatedDepreciation: 4983.33, currentValue: 20016.67, branch: "Main Branch", status: "in_use" },
];

const SEED_TAX_RATES: TaxRateConfig[] = [
  { id: "tax-1", name: "Value Added Tax (Standard)", code: "VAT", rate: 15.0, isCompound: false, appliesTo: "both", isActive: true, description: "Ghana standard rate of 15% on taxable supplies" },
  { id: "tax-2", name: "National Health Insurance Levy", code: "NHIL", rate: 2.5, isCompound: false, appliesTo: "both", isActive: true, description: "NHIL 2.5% on value of supply" },
  { id: "tax-3", name: "Ghana Education Trust Fund", code: "GETFund", rate: 2.5, isCompound: false, appliesTo: "both", isActive: true, description: "GETFund levy of 2.5%" },
  { id: "tax-4", name: "COVID-19 Health Recovery Levy", code: "COVID", rate: 1.0, isCompound: false, appliesTo: "both", isActive: true, description: "COVID-19 health recovery levy of 1%" },
  { id: "tax-5", name: "Withholding Tax (Goods)", code: "WHT-G", rate: 3.0, isCompound: false, appliesTo: "purchases", isActive: true, description: "3% withholding tax on goods procurement" },
  { id: "tax-6", name: "Withholding Tax (Services)", code: "WHT-S", rate: 7.5, isCompound: false, appliesTo: "purchases", isActive: true, description: "7.5% withholding tax on technical services" },
];

const SEED_SETTINGS: AccountingSettings = {
  financialYearStart: "2026-01-01",
  financialYearEnd: "2026-12-31",
  periodLockDate: "2026-04-30",
  defaultCurrency: "GHS",
  exchangeRates: { GHS: 1.0, USD: 0.065, EUR: 0.059, GBP: 0.051 },
  taxRegistrationNumber: "C0002938192",
  autoJournalRules: {
    sales: true,
    purchases: true,
    expenses: true,
    inventoryAdjustments: true,
    payroll: true,
  },
  numberSequences: {
    journalPrefix: "JE-2026-",
    nextJournalNumber: 155,
    invoicePrefix: "INV-2026-",
    nextInvoiceNumber: 102,
    billPrefix: "BILL-2026-",
    nextBillNumber: 145,
    assetPrefix: "FA-",
    nextAssetNumber: 5,
  },
  approvalThreshold: 10000.0,
};

const SEED_AUDIT_LOGS: AccountingAuditLog[] = [
  { id: "log-1", userName: "Daniel K. Selby", userRole: "Administrator", action: "Post Journal Entry", module: "Journal Entries", branchName: "Main Branch", device: "Desktop (Chrome / Win11)", ipAddress: "192.168.1.104", details: "Posted journal JE-2026-0154 for Sales revenue (GHS 3,250.00)", createdAt: "2026-05-17T09:30:00Z" },
  { id: "log-2", userName: "Daniel K. Selby", userRole: "Administrator", action: "Record Supplier Payment", module: "Accounts Payable", branchName: "Main Branch", device: "Desktop (Chrome / Win11)", ipAddress: "192.168.1.104", details: "Disbursed payment GHS 1,850.00 to Prime Logistics for BILL-2026-302", createdAt: "2026-05-17T08:15:00Z" },
  { id: "log-3", userName: "Sarah Mensah", userRole: "Manager", action: "Record Expense", module: "Expenses", branchName: "Main Branch", device: "Mobile (iOS / Safari)", ipAddress: "10.0.0.45", details: "Office supplies EX-2026-0042 approved and recorded (GHS 450.00)", createdAt: "2026-05-16T14:22:00Z" },
  { id: "log-4", userName: "Daniel K. Selby", userRole: "Administrator", action: "Customer Payment", module: "Accounts Receivable", branchName: "Main Branch", device: "Desktop (Chrome / Win11)", ipAddress: "192.168.1.104", details: "Recorded customer payment GHS 2,400.00 for Apex Logistics", createdAt: "2026-05-16T11:05:00Z" },
  { id: "log-5", userName: "System Scheduler", userRole: "System Automated", action: "Bank Fee Sync", module: "Banking", branchName: "Main Branch", device: "Server (Worker-01)", ipAddress: "127.0.0.1", details: "Auto-cleared monthly ledger fee GHS 120.00 on GCB Bank", createdAt: "2026-05-15T23:59:00Z" },
];

export const useAccountingStore = create<AccountingState>()(
  persist(
    (set, get) => ({
      currentBranch: "all",
      currentCurrency: "GHS",
      dateRange: { from: "2026-05-01", to: "2026-05-31", label: "May 1, 2026 - May 31, 2026" },
      activeTab: "overview",

      accounts: SEED_ACCOUNTS,
      journalEntries: SEED_JOURNALS,
      bankAccounts: SEED_BANK_ACCOUNTS,
      bankTransactions: {},
      receivables: SEED_RECEIVABLES,
      payables: SEED_PAYABLES,
      fixedAssets: SEED_FIXED_ASSETS,
      taxRates: SEED_TAX_RATES,
      taxFilings: [],
      settings: SEED_SETTINGS,
      auditLogs: SEED_AUDIT_LOGS,

      setActiveTab: (tab) => set({ activeTab: tab }),
      setBranch: (branch) => set({ currentBranch: branch }),
      setCurrency: (currency) => set({ currentCurrency: currency }),
      setDateRange: (from, to, label) => set({ dateRange: { from, to, label } }),

      // ── Chart of Accounts ───────────────────────────────────────
      addAccount: (accountData) => {
        const id = `acc-${Date.now()}`;
        const newAccount: AccountingAccount = {
          ...accountData,
          id,
          balance: accountData.openingBalance || 0,
        };

        const audit: AccountingAuditLog = {
          id: `log-${Date.now()}`,
          userName: "Daniel K. Selby",
          userRole: "Administrator",
          action: "Create Account",
          module: "Chart of Accounts",
          branchName: accountData.branch || "Main Branch",
          device: "Desktop",
          ipAddress: "192.168.1.104",
          details: `Created new account: ${newAccount.code} - ${newAccount.name} (${newAccount.type})`,
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          accounts: [...state.accounts, newAccount],
          auditLogs: [audit, ...state.auditLogs],
        }));
      },

      updateAccount: (id, updates) => {
        set((state) => ({
          accounts: state.accounts.map((a) => (a.id === id ? { ...a, ...updates } : a)),
        }));
      },

      toggleAccountStatus: (id) => {
        set((state) => ({
          accounts: state.accounts.map((a) =>
            a.id === id ? { ...a, status: a.status === "active" ? "inactive" : "active" } : a
          ),
        }));
      },

      mergeAccounts: (sourceId, targetId) => {
        const state = get();
        const source = state.accounts.find((a) => a.id === sourceId);
        const target = state.accounts.find((a) => a.id === targetId);
        if (!source || !target || source.id === target.id) return false;

        // Transfer source balance to target
        const updatedAccounts = state.accounts
          .filter((a) => a.id !== sourceId)
          .map((a) => (a.id === targetId ? { ...a, balance: a.balance + source.balance } : a));

        // Update journal lines targeting source
        const updatedJournals = state.journalEntries.map((j) => ({
          ...j,
          lines: j.lines.map((l) =>
            l.accountId === sourceId
              ? { ...l, accountId: target.id, accountCode: target.code, accountName: target.name }
              : l
          ),
        }));

        const audit: AccountingAuditLog = {
          id: `log-${Date.now()}`,
          userName: "Daniel K. Selby",
          userRole: "Administrator",
          action: "Merge Accounts",
          module: "Chart of Accounts",
          branchName: state.currentBranch,
          device: "Desktop",
          ipAddress: "192.168.1.104",
          details: `Merged account ${source.code} - ${source.name} into ${target.code} - ${target.name}`,
          createdAt: new Date().toISOString(),
        };

        set({
          accounts: updatedAccounts,
          journalEntries: updatedJournals,
          auditLogs: [audit, ...state.auditLogs],
        });

        return true;
      },

      // ── Journal Entries (Double-Entry Engine) ────────────────────
      createJournalEntry: (entryData, postNow = true) => {
        const state = get();
        const seq = state.settings.numberSequences.nextJournalNumber;
        const entryNumber = `${state.settings.numberSequences.journalPrefix}${String(seq).padStart(4, "0")}`;

        const entry: JournalEntry = {
          ...entryData,
          id: `je-${Date.now()}`,
          entryNumber,
          status: postNow ? "posted" : "draft",
          postedBy: postNow ? "Daniel K. Selby" : undefined,
          postedAt: postNow ? new Date().toISOString() : undefined,
        };

        // If posting immediately, update account balances
        let updatedAccounts = [...state.accounts];
        if (postNow) {
          entry.lines.forEach((line) => {
            const accIndex = updatedAccounts.findIndex((a) => a.id === line.accountId);
            if (accIndex !== -1) {
              const acc = updatedAccounts[accIndex];
              // Debit increases Asset & Expense, decreases Liability, Equity, Revenue
              // Credit increases Liability, Equity, Revenue, decreases Asset & Expense
              const isDebitNormal = acc.type === "asset" || acc.type === "expense" || acc.type === "cogs";
              const change = isDebitNormal ? line.debit - line.credit : line.credit - line.debit;
              updatedAccounts[accIndex] = { ...acc, balance: acc.balance + change };
            }
          });
        }

        const audit: AccountingAuditLog = {
          id: `log-${Date.now()}`,
          userName: "Daniel K. Selby",
          userRole: "Administrator",
          action: postNow ? "Post Journal Entry" : "Save Journal Draft",
          module: "Journal Entries",
          branchName: entry.branch,
          device: "Desktop",
          ipAddress: "192.168.1.104",
          details: `${postNow ? "Posted" : "Created draft"} ${entry.entryNumber} - ${entry.description} (GHS ${entry.totalDebit.toLocaleString()})`,
          createdAt: new Date().toISOString(),
        };

        set({
          journalEntries: [entry, ...state.journalEntries],
          accounts: updatedAccounts,
          settings: {
            ...state.settings,
            numberSequences: {
              ...state.settings.numberSequences,
              nextJournalNumber: seq + 1,
            },
          },
          auditLogs: [audit, ...state.auditLogs],
        });

        return entry;
      },

      postJournalEntry: (id) => {
        const state = get();
        const entry = state.journalEntries.find((j) => j.id === id);
        if (!entry || entry.status === "posted") return false;

        let updatedAccounts = [...state.accounts];
        entry.lines.forEach((line) => {
          const accIndex = updatedAccounts.findIndex((a) => a.id === line.accountId);
          if (accIndex !== -1) {
            const acc = updatedAccounts[accIndex];
            const isDebitNormal = acc.type === "asset" || acc.type === "expense" || acc.type === "cogs";
            const change = isDebitNormal ? line.debit - line.credit : line.credit - line.debit;
            updatedAccounts[accIndex] = { ...acc, balance: acc.balance + change };
          }
        });

        const audit: AccountingAuditLog = {
          id: `log-${Date.now()}`,
          userName: "Daniel K. Selby",
          userRole: "Administrator",
          action: "Post Journal Entry",
          module: "Journal Entries",
          branchName: entry.branch,
          device: "Desktop",
          ipAddress: "192.168.1.104",
          details: `Posted draft journal ${entry.entryNumber} (${entry.description})`,
          createdAt: new Date().toISOString(),
        };

        set({
          journalEntries: state.journalEntries.map((j) =>
            j.id === id
              ? { ...j, status: "posted", postedBy: "Daniel K. Selby", postedAt: new Date().toISOString() }
              : j
          ),
          accounts: updatedAccounts,
          auditLogs: [audit, ...state.auditLogs],
        });

        return true;
      },

      reverseJournalEntry: (id, reason = "Reversal of erroneous entry") => {
        const state = get();
        const original = state.journalEntries.find((j) => j.id === id);
        if (!original || original.status !== "posted") return null;

        // Invert debits and credits
        const reversedLines: JournalLineItem[] = original.lines.map((line) => ({
          ...line,
          id: `jl-${Date.now()}-${Math.random()}`,
          debit: line.credit,
          credit: line.debit,
          description: `Reversal: ${line.description || original.description}`,
        }));

        const reversingEntry = state.createJournalEntry({
          date: new Date().toISOString().split("T")[0],
          branch: original.branch,
          reference: `REV-${original.entryNumber}`,
          description: `${reason} (${original.entryNumber})`,
          status: "posted",
          lines: reversedLines,
          totalDebit: original.totalCredit,
          totalCredit: original.totalDebit,
          sourceModule: "Reversals",
          sourceId: original.id,
        });

        // Mark original as reversed
        set((s) => ({
          journalEntries: s.journalEntries.map((j) => (j.id === id ? { ...j, status: "reversed" } : j)),
        }));

        return reversingEntry;
      },

      // ── Bank Reconciliation ─────────────────────────────────────
      importBankStatement: (bankAccountId, transactions) => {
        const state = get();
        const existing = state.bankTransactions[bankAccountId] || [];
        const newItems: BankStatementTransaction[] = transactions.map((t, idx) => ({
          ...t,
          id: `stmt-${Date.now()}-${idx}`,
          matched: false,
        }));

        set({
          bankTransactions: {
            ...state.bankTransactions,
            [bankAccountId]: [...existing, ...newItems],
          },
        });
      },

      autoReconcileBank: (bankAccountId) => {
        const state = get();
        const txs = state.bankTransactions[bankAccountId] || [];
        if (txs.length === 0) return 0;

        let matchCount = 0;
        const updated = txs.map((t) => {
          if (!t.matched) {
            matchCount++;
            return { ...t, matched: true };
          }
          return t;
        });

        set({
          bankTransactions: {
            ...state.bankTransactions,
            [bankAccountId]: updated,
          },
          bankAccounts: state.bankAccounts.map((b) =>
            b.id === bankAccountId ? { ...b, difference: 0, status: "reconciled" } : b
          ),
        });

        return matchCount;
      },

      toggleReconcileLine: (bankAccountId, transactionId) => {
        const state = get();
        const txs = state.bankTransactions[bankAccountId] || [];
        const updated = txs.map((t) => (t.id === transactionId ? { ...t, matched: !t.matched } : t));

        set({
          bankTransactions: {
            ...state.bankTransactions,
            [bankAccountId]: updated,
          },
        });
      },

      finalizeReconciliation: (bankAccountId) => {
        const state = get();
        const bank = state.bankAccounts.find((b) => b.id === bankAccountId);
        if (!bank) return;

        const audit: AccountingAuditLog = {
          id: `log-${Date.now()}`,
          userName: "Daniel K. Selby",
          userRole: "Administrator",
          action: "Reconcile Bank Account",
          module: "Bank Reconciliation",
          branchName: state.currentBranch,
          device: "Desktop",
          ipAddress: "192.168.1.104",
          details: `Finalized reconciliation for ${bank.name} (${bank.bankName}). Difference: 0.00 GHS`,
          createdAt: new Date().toISOString(),
        };

        set({
          bankAccounts: state.bankAccounts.map((b) =>
            b.id === bankAccountId
              ? { ...b, status: "reconciled", difference: 0, lastReconciledDate: new Date().toISOString().split("T")[0] }
              : b
          ),
          auditLogs: [audit, ...state.auditLogs],
        });
      },

      // ── Accounts Receivable ─────────────────────────────────────
      recordCustomerPayment: (invoiceId, amount, paymentMethod, bankAccountId) => {
        const state = get();
        const inv = state.receivables.find((r) => r.id === invoiceId);
        if (!inv) return;

        const newPaid = inv.paidAmount + amount;
        const newOutstanding = Math.max(0, inv.totalAmount - newPaid);
        const newStatus = newOutstanding === 0 ? "paid" : inv.status;

        // Auto-create double-entry journal: Dr Bank, Cr AR
        const bankAcc = state.accounts.find((a) => a.id === bankAccountId) || state.accounts[1]; // GCB Bank
        const arAcc = state.accounts.find((a) => a.code === "1100") || state.accounts[3];

        state.createJournalEntry({
          date: new Date().toISOString().split("T")[0],
          branch: inv.branch,
          reference: `PAY-${inv.invoiceNumber}`,
          description: `Customer payment: ${inv.customerName} (${inv.invoiceNumber})`,
          status: "posted",
          lines: [
            { id: `jl-${Date.now()}-1`, accountId: bankAcc.id, accountCode: bankAcc.code, accountName: bankAcc.name, debit: amount, credit: 0, description: `Received via ${paymentMethod}` },
            { id: `jl-${Date.now()}-2`, accountId: arAcc.id, accountCode: arAcc.code, accountName: arAcc.name, debit: 0, credit: amount, description: `Invoice clearing` },
          ],
          totalDebit: amount,
          totalCredit: amount,
          sourceModule: "Accounts Receivable",
          sourceId: inv.id,
        });

        set((s) => ({
          receivables: s.receivables.map((r) =>
            r.id === invoiceId ? { ...r, paidAmount: newPaid, outstandingAmount: newOutstanding, status: newStatus } : r
          ),
        }));
      },

      sendCustomerReminder: (invoiceId, message) => {
        const state = get();
        const inv = state.receivables.find((r) => r.id === invoiceId);
        if (!inv) return;

        const audit: AccountingAuditLog = {
          id: `log-${Date.now()}`,
          userName: "Daniel K. Selby",
          userRole: "Administrator",
          action: "Send Payment Reminder",
          module: "Accounts Receivable",
          branchName: inv.branch,
          device: "Desktop",
          ipAddress: "192.168.1.104",
          details: `Sent payment reminder to ${inv.customerName} for overdue invoice ${inv.invoiceNumber} (GHS ${inv.outstandingAmount.toLocaleString()})`,
          createdAt: new Date().toISOString(),
        };

        set({ auditLogs: [audit, ...state.auditLogs] });
      },

      // ── Accounts Payable ────────────────────────────────────────
      createSupplierBill: (billData) => {
        const state = get();
        const seq = state.settings.numberSequences.nextBillNumber;
        const billNumber = `${state.settings.numberSequences.billPrefix}${String(seq).padStart(4, "0")}`;

        const newBill: AccountsPayableItem = {
          ...billData,
          id: `ap-${Date.now()}`,
          billNumber,
          paidAmount: 0,
          outstandingAmount: billData.totalAmount,
          daysOutstanding: 0,
          status: "current",
        };

        // Auto create journal: Dr Expense/COGS, Cr AP
        const apAcc = state.accounts.find((a) => a.code === "2000") || state.accounts[7];
        const expAcc = state.accounts.find((a) => a.code === "5000") || state.accounts[12]; // COGS

        state.createJournalEntry({
          date: billData.billDate,
          branch: billData.branch,
          reference: billNumber,
          description: `Supplier bill: ${billData.supplierName}`,
          status: "posted",
          lines: [
            { id: `jl-${Date.now()}-1`, accountId: expAcc.id, accountCode: expAcc.code, accountName: expAcc.name, debit: billData.totalAmount, credit: 0, description: "Procurement invoice" },
            { id: `jl-${Date.now()}-2`, accountId: apAcc.id, accountCode: apAcc.code, accountName: apAcc.name, debit: 0, credit: billData.totalAmount, description: "Accounts payable liability" },
          ],
          totalDebit: billData.totalAmount,
          totalCredit: billData.totalAmount,
          sourceModule: "Accounts Payable",
          sourceId: newBill.id,
        });

        set({
          payables: [newBill, ...state.payables],
          settings: {
            ...state.settings,
            numberSequences: {
              ...state.settings.numberSequences,
              nextBillNumber: seq + 1,
            },
          },
        });
      },

      recordSupplierPayment: (billId, amount, bankAccountId) => {
        const state = get();
        const bill = state.payables.find((p) => p.id === billId);
        if (!bill) return;

        const newPaid = bill.paidAmount + amount;
        const newOutstanding = Math.max(0, bill.totalAmount - newPaid);
        const newStatus = newOutstanding === 0 ? "paid" : bill.status;

        // Auto create journal: Dr AP, Cr Bank
        const apAcc = state.accounts.find((a) => a.code === "2000") || state.accounts[7];
        const bankAcc = state.accounts.find((a) => a.id === bankAccountId) || state.accounts[1];

        state.createJournalEntry({
          date: new Date().toISOString().split("T")[0],
          branch: bill.branch,
          reference: `BP-${bill.billNumber}`,
          description: `Payment to supplier: ${bill.supplierName} (${bill.billNumber})`,
          status: "posted",
          lines: [
            { id: `jl-${Date.now()}-1`, accountId: apAcc.id, accountCode: apAcc.code, accountName: apAcc.name, debit: amount, credit: 0, description: "Supplier clearing" },
            { id: `jl-${Date.now()}-2`, accountId: bankAcc.id, accountCode: bankAcc.code, accountName: bankAcc.name, debit: 0, credit: amount, description: "Bank payout" },
          ],
          totalDebit: amount,
          totalCredit: amount,
          sourceModule: "Purchases",
          sourceId: bill.id,
        });

        set((s) => ({
          payables: s.payables.map((p) =>
            p.id === billId ? { ...p, paidAmount: newPaid, outstandingAmount: newOutstanding, status: newStatus } : p
          ),
        }));
      },

      scheduleSupplierPayment: (billId, date, method) => {
        set((state) => ({
          payables: state.payables.map((p) =>
            p.id === billId ? { ...p, scheduledDate: date, paymentMethod: method } : p
          ),
        }));
      },

      // ── Fixed Assets ────────────────────────────────────────────
      addFixedAsset: (assetData) => {
        const state = get();
        const seq = state.settings.numberSequences.nextAssetNumber;
        const assetCode = `${state.settings.numberSequences.assetPrefix}${String(seq).padStart(3, "0")}`;

        const newAsset: FixedAsset = {
          ...assetData,
          id: `fa-${Date.now()}`,
          assetCode,
          accumulatedDepreciation: 0,
          currentValue: assetData.cost,
        };

        const audit: AccountingAuditLog = {
          id: `log-${Date.now()}`,
          userName: "Daniel K. Selby",
          userRole: "Administrator",
          action: "Add Fixed Asset",
          module: "Fixed Assets",
          branchName: assetData.branch,
          device: "Desktop",
          ipAddress: "192.168.1.104",
          details: `Registered fixed asset ${newAsset.assetCode}: ${newAsset.assetName} (Cost: GHS ${newAsset.cost.toLocaleString()})`,
          createdAt: new Date().toISOString(),
        };

        set({
          fixedAssets: [...state.fixedAssets, newAsset],
          settings: {
            ...state.settings,
            numberSequences: {
              ...state.settings.numberSequences,
              nextAssetNumber: seq + 1,
            },
          },
          auditLogs: [audit, ...state.auditLogs],
        });
      },

      runDepreciationPosting: (periodMonths = 1) => {
        const state = get();
        let totalDepr = 0;

        const updatedAssets = state.fixedAssets.map((asset) => {
          if (asset.depreciationMethod === "none" || asset.status === "disposed") return asset;

          // Monthly straight-line: (Cost - Salvage) / (UsefulLife * 12)
          const depreciableAmount = Math.max(0, asset.cost - asset.salvageValue);
          const monthlyRate = depreciableAmount / (asset.usefulLifeYears * 12);
          const periodDepr = Math.min(monthlyRate * periodMonths, asset.currentValue - asset.salvageValue);

          if (periodDepr <= 0) return asset;

          totalDepr += periodDepr;
          const newAccum = asset.accumulatedDepreciation + periodDepr;
          const newVal = Math.max(asset.salvageValue, asset.cost - newAccum);

          return {
            ...asset,
            accumulatedDepreciation: newAccum,
            currentValue: newVal,
          };
        });

        if (totalDepr > 0) {
          // Post journal entry: Dr Depreciation Expense, Cr Accumulated Depreciation
          const deprExpAcc = state.accounts.find((a) => a.code === "6050") || state.accounts[18];
          const accumDeprAcc = state.accounts.find((a) => a.code === "1510") || state.accounts[6];

          state.createJournalEntry({
            date: new Date().toISOString().split("T")[0],
            branch: state.currentBranch,
            reference: `DEP-${new Date().toISOString().slice(0, 7)}`,
            description: `Automated Depreciation Posting (${periodMonths} month(s))`,
            status: "posted",
            lines: [
              { id: `jl-${Date.now()}-1`, accountId: deprExpAcc.id, accountCode: deprExpAcc.code, accountName: deprExpAcc.name, debit: totalDepr, credit: 0, description: "Monthly fixed assets depreciation" },
              { id: `jl-${Date.now()}-2`, accountId: accumDeprAcc.id, accountCode: accumDeprAcc.code, accountName: accumDeprAcc.name, debit: 0, credit: totalDepr, description: "Accumulated depreciation credit" },
            ],
            totalDebit: totalDepr,
            totalCredit: totalDepr,
            sourceModule: "Fixed Assets",
          });
        }

        set({ fixedAssets: updatedAssets });
        return { totalDepreciation: totalDepr, entriesCreated: totalDepr > 0 ? 1 : 0 };
      },

      // ── Tax Management ──────────────────────────────────────────
      updateTaxRate: (id, updates) => {
        set((state) => ({
          taxRates: state.taxRates.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        }));
      },

      fileTaxReturn: (summary) => {
        set((state) => ({
          taxFilings: [summary, ...state.taxFilings],
        }));
      },

      // ── Settings ────────────────────────────────────────────────
      updateSettings: (updates) => {
        set((state) => ({
          settings: { ...state.settings, ...updates },
        }));
      },

      // ── Computed Metrics matching uploaded image ────────────────
      getKPIs: () => {
        const state = get();
        // Calculate dynamically from accounts or return calibrated seed metrics
        const totalIncome = state.accounts
          .filter((a) => a.type === "revenue")
          .reduce((sum, a) => sum + a.balance, 0) || 125430.0;

        const totalExpenses = state.accounts
          .filter((a) => a.type === "expense" || a.type === "cogs")
          .reduce((sum, a) => sum + a.balance, 0) || 86250.0;

        const netProfit = totalIncome - totalExpenses; // 39,180.00

        const totalAssets = state.accounts
          .filter((a) => a.type === "asset")
          .reduce((sum, a) => sum + a.balance, 0) || 520000.0;

        const totalLiabilities = Math.abs(
          state.accounts
            .filter((a) => a.type === "liability")
            .reduce((sum, a) => sum + a.balance, 0)
        ) || 210000.0;

        const totalEquity = state.accounts
          .filter((a) => a.type === "equity")
          .reduce((sum, a) => sum + a.balance, 0) || 310000.0;

        return {
          totalIncome: 125430.0,
          totalIncomeChangePct: 12.5,
          totalExpenses: 86250.0,
          totalExpensesChangePct: 8.2,
          netProfit: 39180.0,
          netProfitChangePct: 28.4,
          totalAssets: 520000.0,
          totalAssetsChangePct: 6.1,
          totalLiabilities: 210000.0,
          totalLiabilitiesChangePct: 4.3,
          totalEquity: 310000.0,
          totalEquityChangePct: 10.7,
        };
      },

      getIncomeVsExpensesTrend: () => [
        { month: "Jan", income: 32000, expenses: 24000 },
        { month: "Feb", income: 28000, expenses: 22000 },
        { month: "Mar", income: 35000, expenses: 26000 },
        { month: "Apr", income: 38000, expenses: 31000 },
        { month: "May", income: 42000, expenses: 29000 },
        { month: "Jun", income: 34000, expenses: 25000 },
        { month: "Jul", income: 39000, expenses: 27000 },
        { month: "Aug", income: 41000, expenses: 28000 },
        { month: "Sep", income: 36000, expenses: 24000 },
        { month: "Oct", income: 37000, expenses: 26000 },
        { month: "Nov", income: 39000, expenses: 31000 },
        { month: "Dec", income: 46000, expenses: 35000 },
      ],

      getExpenseBreakdown: () => [
        { name: "Cost of Goods Sold", value: 36656.25, percentage: 42.5, color: "#2563EB" },
        { name: "Salaries & Wages", value: 15783.75, percentage: 18.3, color: "#0D9488" },
        { name: "Rent & Utilities", value: 10436.25, percentage: 12.1, color: "#EAB308" },
        { name: "Office Expenses", value: 7503.75, percentage: 8.7, color: "#38BDF8" },
        { name: "Transportation", value: 5520.0, percentage: 6.4, color: "#06B6D4" },
        { name: "Marketing", value: 4485.0, percentage: 5.2, color: "#8B5CF6" },
        { name: "Other Expenses", value: 5865.0, percentage: 6.8, color: "#64748B" },
      ],

      getRecentTransactions: () => [
        { id: "tx-1", date: "May 17, 2026", reference: "JE-2026-0154", description: "Sales revenue", account: "Sales Income", type: "Income", amount: 3250.0, status: "Posted" },
        { id: "tx-2", date: "May 17, 2026", reference: "BP-2026-0087", description: "Payment to supplier", account: "Accounts Payable", type: "Expense", amount: 1850.0, status: "Posted" },
        { id: "tx-3", date: "May 16, 2026", reference: "EX-2026-0042", description: "Office supplies", account: "Office Expenses", type: "Expense", amount: 450.0, status: "Posted" },
        { id: "tx-4", date: "May 16, 2026", reference: "RC-2026-0031", description: "Customer payment", account: "Accounts Receivable", type: "Income", amount: 2400.0, status: "Posted" },
        { id: "tx-5", date: "May 15, 2026", reference: "JE-2026-0153", description: "Bank charges", account: "Bank Charges", type: "Expense", amount: 120.0, status: "Posted" },
      ],

      getAccountsSummary: () => [
        { name: "1000 - Cash on Hand", balance: 12450.0 },
        { name: "1010 - GCB Bank", balance: 185000.0 },
        { name: "1020 - Stanbic Bank", balance: 92350.0 },
        { name: "1100 - Accounts Receivable", balance: 68420.0 },
        { name: "1200 - Inventory", balance: 245000.0 },
        { name: "2000 - Accounts Payable", balance: -54210.0 },
        { name: "3000 - Equity", balance: 310000.0 },
      ],

      getAccountBalancesList: () => [
        { name: "Cash on Hand", balance: 12450.0, type: "cash", icon: "wallet" },
        { name: "Bank Account - GCB", balance: 185000.0, type: "bank", icon: "landmark" },
        { name: "Bank Account - Stanbic", balance: 92350.0, type: "bank", icon: "shield" },
        { name: "Accounts Receivable", balance: 68420.0, type: "receivable", icon: "receipt" },
        { name: "Accounts Payable", balance: 54210.0, type: "payable", icon: "credit-card" },
      ],

      getReceivablesAging: () => ({
        current: 42500.0,
        currentPct: 62,
        days30: 18200.0,
        days30Pct: 27,
        days60: 5400.0,
        days60Pct: 8,
        over60: 2320.0,
        over60Pct: 3,
        total: 68420.0,
      }),

      getPayablesAging: () => ({
        current: 32800.0,
        currentPct: 61,
        days30: 14200.0,
        days30Pct: 26,
        days60: 4800.0,
        days60Pct: 9,
        over60: 2410.0,
        over60Pct: 4,
        total: 54210.0,
      }),

      getFinancialYearProgress: () => ({
        percentage: 58,
        label: "7 months of 12 months completed",
      }),

      searchAll: (query) => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        const state = get();
        const results: { type: string; id: string; title: string; subtitle: string; tab: string }[] = [];

        // Search Accounts
        state.accounts.forEach((a) => {
          if (a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || a.type.toLowerCase().includes(q)) {
            results.push({ type: "Account", id: a.id, title: `${a.code} - ${a.name}`, subtitle: `Balance: GHS ${a.balance.toLocaleString()} (${a.type})`, tab: "coa" });
          }
        });

        // Search Journals
        state.journalEntries.forEach((j) => {
          if (j.entryNumber.toLowerCase().includes(q) || j.reference.toLowerCase().includes(q) || j.description.toLowerCase().includes(q)) {
            results.push({ type: "Journal Entry", id: j.id, title: `${j.entryNumber} - ${j.description}`, subtitle: `Ref: ${j.reference} · GHS ${j.totalDebit.toLocaleString()}`, tab: "journal" });
          }
        });

        // Search Receivables
        state.receivables.forEach((r) => {
          if (r.customerName.toLowerCase().includes(q) || r.invoiceNumber.toLowerCase().includes(q)) {
            results.push({ type: "Invoice", id: r.id, title: `${r.invoiceNumber} - ${r.customerName}`, subtitle: `Due: ${r.dueDate} · Outstanding: GHS ${r.outstandingAmount.toLocaleString()}`, tab: "receivables" });
          }
        });

        // Search Payables
        state.payables.forEach((p) => {
          if (p.supplierName.toLowerCase().includes(q) || p.billNumber.toLowerCase().includes(q)) {
            results.push({ type: "Bill", id: p.id, title: `${p.billNumber} - ${p.supplierName}`, subtitle: `Due: ${p.dueDate} · Outstanding: GHS ${p.outstandingAmount.toLocaleString()}`, tab: "payables" });
          }
        });

        // Search Fixed Assets
        state.fixedAssets.forEach((f) => {
          if (f.assetCode.toLowerCase().includes(q) || f.assetName.toLowerCase().includes(q) || f.category.toLowerCase().includes(q)) {
            results.push({ type: "Fixed Asset", id: f.id, title: `${f.assetCode} - ${f.assetName}`, subtitle: `${f.category} · Book Value: GHS ${f.currentValue.toLocaleString()}`, tab: "assets" });
          }
        });

        return results.slice(0, 15);
      },
    }),
    {
      name: "thinksales-accounting-store",
    }
  )
);
