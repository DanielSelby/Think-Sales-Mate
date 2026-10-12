import { describe, expect, it } from "vitest";
import { buildAccountStatement, type BankStatementTransaction } from "./statement-ledger";

const transactions: BankStatementTransaction[] = [
  { id: "1", type: "deposit", amount: 100, description: "Opening deposit", counterparty_name: null, transaction_category: null, transaction_date: "2026-10-01", created_at: "2026-10-01T09:00:00.000Z" },
  { id: "2", type: "withdrawal", amount: 25, description: "Payment", counterparty_name: null, transaction_category: "expense", transaction_date: "2026-10-03", created_at: "2026-10-03T12:00:00.000Z" },
  { id: "3", type: "deposit", amount: 40, description: "Refund", counterparty_name: null, transaction_category: null, transaction_date: "2026-10-05", created_at: "2026-10-05T08:00:00.000Z" },
  { id: "4", type: "withdrawal", amount: 10, description: "Later", counterparty_name: null, transaction_category: null, transaction_date: "2026-10-08", created_at: "2026-10-08T08:00:00.000Z" },
];

describe("account statement balances", () => {
  it("reconciles opening, transaction running, and closing balances for a date range", () => {
    const statement = buildAccountStatement(50, transactions, "2026-10-03", "2026-10-05");

    expect(statement.openingBalance).toBe(150);
    expect(statement.transactions.map((transaction) => transaction.runningBalance)).toEqual([125, 165]);
    expect(statement.deposits).toBe(40);
    expect(statement.withdrawals).toBe(25);
    expect(statement.closingBalance).toBe(165);
  });

  it("uses the full ledger to calculate balances regardless of date filters", () => {
    const statement = buildAccountStatement(50, transactions, "", "2026-10-05");

    expect(statement.openingBalance).toBe(50);
    expect(statement.transactions).toHaveLength(3);
    expect(statement.closingBalance).toBe(165);
  });

  it("uses an account's opening balance when the selected period has no transactions", () => {
    const statement = buildAccountStatement(50, transactions, "2026-10-06", "2026-10-07");

    expect(statement.openingBalance).toBe(165);
    expect(statement.transactions).toEqual([]);
    expect(statement.closingBalance).toBe(165);
  });
});
