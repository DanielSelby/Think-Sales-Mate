export type AccountType = "asset" | "liability" | "equity" | "revenue" | "cogs" | "expense";

export interface AccountingAccount {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  subType?: string;
  parentId?: string | null;
  parentName?: string | null;
  branch: string;
  currency: string;
  balance: number;
  status: "active" | "inactive";
  description?: string;
}

export type JournalStatus = "draft" | "posted" | "reversed";

export interface JournalLineItem {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description?: string;
}

export interface JournalEntry {
  id: string;
  entryNumber: string;
  date: string;
  branch: string;
  reference: string;
  description: string;
  status: JournalStatus;
  lines: JournalLineItem[];
  totalDebit: number;
  totalCredit: number;
  sourceModule?: string;
  sourceId?: string;
  isAuto?: boolean;
  postedBy?: string;
  postedAt?: string;
}

export interface BankAccountItem {
  id: string;
  name: string;
  accountNumber?: string;
  bankName: string;
  type: "cash" | "checking" | "savings" | "mobile_money";
  bookBalance: number;
  statementBalance: number;
  difference: number;
  status: "reconciled" | "in_progress" | "unreconciled";
  lastReconciledDate?: string;
}

export interface BankStatementTransaction {
  id: string;
  date: string;
  reference: string;
  description: string;
  amount: number;
  type: "deposit" | "withdrawal";
  matched: boolean;
  matchedJournalId?: string;
}

export interface AccountsReceivableItem {
  id: string;
  customerName: string;
  customerId?: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  daysOutstanding: number;
  status: "current" | "1-30" | "31-60" | "61-90" | "120+" | "paid";
  branch: string;
}

export interface AccountsPayableItem {
  id: string;
  supplierName: string;
  supplierId?: string;
  billNumber: string;
  billDate: string;
  dueDate: string;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  daysOutstanding: number;
  status: "current" | "1-30" | "31-60" | "over-60" | "paid";
  branch: string;
  paymentMethod?: string;
  scheduledDate?: string;
}

export interface AgingSummary {
  current: number;
  currentPct: number;
  days30: number;
  days30Pct: number;
  days60: number;
  days60Pct: number;
  over60: number;
  over60Pct: number;
  total: number;
}

export type DepreciationMethod = "straight_line" | "reducing_balance" | "none";

export interface FixedAsset {
  id: string;
  assetCode: string;
  assetName: string;
  category: string;
  purchaseDate: string;
  cost: number;
  depreciationMethod: DepreciationMethod;
  usefulLifeYears: number;
  salvageValue: number;
  accumulatedDepreciation: number;
  currentValue: number;
  branch: string;
  status: "in_use" | "under_repair" | "disposed";
  notes?: string;
}

export interface FinancialKPIs {
  totalIncome: number;
  totalIncomeChangePct: number;
  totalExpenses: number;
  totalExpensesChangePct: number;
  netProfit: number;
  netProfitChangePct: number;
  totalAssets: number;
  totalAssetsChangePct: number;
  totalLiabilities: number;
  totalLiabilitiesChangePct: number;
  totalEquity: number;
  totalEquityChangePct: number;
}

export interface MonthlyTrendPoint {
  month: string;
  income: number;
  expenses: number;
}

export interface ExpenseSlice {
  name: string;
  value: number;
  percentage: number;
  color: string;
}

export interface RecentTransactionItem {
  id: string;
  date: string;
  reference: string;
  description: string;
  account: string;
  type: "Income" | "Expense";
  amount: number;
  status: "Posted" | "Draft" | "Reversed";
}

export interface TaxRateConfig {
  id: string;
  name: string;
  code: string;
  rate: number;
  isCompound: boolean;
  appliesTo: "sales" | "purchases" | "both";
  isActive: boolean;
  description: string;
}

export interface TaxFilingSummary {
  period: string;
  grossSales: number;
  exemptSales: number;
  taxableSales: number;
  standardVAT: number;
  nhil: number;
  getFund: number;
  covidLevy: number;
  totalOutputTax: number;
  inputTaxDeductions: number;
  withholdingTaxCredited: number;
  netTaxPayable: number;
}

export interface AccountingSettings {
  financialYearStart: string;
  financialYearEnd: string;
  periodLockDate: string;
  defaultCurrency: string;
  exchangeRates: Record<string, number>;
  taxRegistrationNumber: string;
  autoJournalRules: {
    sales: boolean;
    purchases: boolean;
    expenses: boolean;
    inventoryAdjustments: boolean;
    payroll: boolean;
  };
  numberSequences: {
    journalPrefix: string;
    nextJournalNumber: number;
    invoicePrefix: string;
    nextInvoiceNumber: number;
    billPrefix: string;
    nextBillNumber: number;
    assetPrefix: string;
    nextAssetNumber: number;
  };
  approvalThreshold: number;
}

export interface AccountingAuditLog {
  id: string;
  userName: string;
  userRole: string;
  action: string;
  module: string;
  branchName: string;
  device: string;
  ipAddress: string;
  details: string;
  createdAt: string;
}
