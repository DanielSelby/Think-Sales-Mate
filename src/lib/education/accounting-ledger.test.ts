import { describe, expect, it } from "vitest";
import { calculateEducationLedger } from "./accounting-ledger";

describe("calculateEducationLedger", () => {
  it("sorts entries chronologically and calculates debit-normal balances in cents", () => {
    const result = calculateEducationLedger([
      { id: "b", entryDate: "2026-02-01", journalNumber: 2, lineNumber: 1, debit: "0", credit: "3.10", description: "Expense payment" },
      { id: "a", entryDate: "2026-01-01", journalNumber: 1, lineNumber: 1, debit: "10.25", credit: "0", description: "Expense" },
    ], "debit");

    expect(result.map((entry) => [entry.id, entry.runningBalanceCents])).toEqual([
      ["a", 1025],
      ["b", 715],
    ]);
  });

  it("reverses the sign convention for credit-normal accounts", () => {
    const result = calculateEducationLedger([
      { id: "a", entryDate: "2026-01-01", journalNumber: 1, lineNumber: 1, debit: "0", credit: "125.50", description: "Income" },
      { id: "b", entryDate: "2026-01-02", journalNumber: 2, lineNumber: 1, debit: "25.50", credit: "0", description: "Correction" },
    ], "credit");

    expect(result.map((entry) => entry.runningBalanceCents)).toEqual([12550, 10000]);
  });
});
