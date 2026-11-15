import { describe, expect, it } from "vitest";
import {
  buildEducationBalanceSheet,
  buildEducationCashFlow,
  buildEducationIncomeStatement,
  buildEducationTrialBalance,
  type EducationReportAccount,
  type EducationReportLine,
} from "./accounting-reports";

const accounts: EducationReportAccount[] = [
  { id: "cash", code: "1000", name: "Cash", account_type: "asset", normal_balance: "debit", is_cash_account: true, cash_flow_activity: null },
  { id: "receivable", code: "1100", name: "Receivable", account_type: "asset", normal_balance: "debit", is_cash_account: false, cash_flow_activity: "operating" },
  { id: "payable", code: "2000", name: "Payable", account_type: "liability", normal_balance: "credit", is_cash_account: false, cash_flow_activity: null },
  { id: "equity", code: "3000", name: "Equity", account_type: "equity", normal_balance: "credit", is_cash_account: false, cash_flow_activity: null },
  { id: "income", code: "4000", name: "Fees", account_type: "income", normal_balance: "credit", is_cash_account: false, cash_flow_activity: "operating" },
  { id: "expense", code: "5000", name: "Supplies", account_type: "expense", normal_balance: "debit", is_cash_account: false, cash_flow_activity: "operating" },
];

const lines: EducationReportLine[] = [
  { id: "1", journal_id: "j1", account_id: "receivable", entry_date: "2026-01-01", debit: 100, credit: 0 },
  { id: "2", journal_id: "j1", account_id: "income", entry_date: "2026-01-01", debit: 0, credit: 100 },
  { id: "3", journal_id: "j2", account_id: "cash", entry_date: "2026-01-05", debit: 60, credit: 0 },
  { id: "4", journal_id: "j2", account_id: "receivable", entry_date: "2026-01-05", debit: 0, credit: 60 },
  { id: "5", journal_id: "j3", account_id: "expense", entry_date: "2026-01-06", debit: 20, credit: 0 },
  { id: "6", journal_id: "j3", account_id: "payable", entry_date: "2026-01-06", debit: 0, credit: 20 },
];

describe("Education accounting reports", () => {
  it("builds a balanced trial balance from signed account balances", () => {
    const rows = buildEducationTrialBalance(accounts, lines);
    expect(rows.reduce((sum, row) => sum + row.debitCents, 0))
      .toBe(rows.reduce((sum, row) => sum + row.creditCents, 0));
    expect(rows.find((row) => row.account.id === "receivable")).toMatchObject({
      debitCents: 4000,
      creditCents: 0,
    });
  });

  it("separates income, expenses, and current earnings", () => {
    const income = buildEducationIncomeStatement(accounts, lines);
    expect(income).toMatchObject({ incomeCents: 10000, expensesCents: 2000, netIncomeCents: 8000 });
    const balanceSheet = buildEducationBalanceSheet(accounts, lines, lines);
    expect(balanceSheet.currentEarningsCents).toBe(8000);
    expect(balanceSheet.assetsCents).toBe(balanceSheet.liabilitiesCents + balanceSheet.equityCents);
  });

  it("groups cash movements by counterpart classification and exposes unclassified totals", () => {
    const cashFlow = buildEducationCashFlow(accounts, lines);
    expect(cashFlow.operatingCents).toBe(6000);
    expect(cashFlow.unclassifiedCents).toBe(0);
  });
});
