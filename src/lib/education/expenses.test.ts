import { describe, expect, it } from "vitest";
import { EDUCATION_EXPENSE_CATEGORIES, EDUCATION_EXPENSE_PAYMENT_METHODS, isValidEducationExpenseDate } from "./expenses";

describe("Think Education expense validation", () => {
  it("uses the supported education expense categories and payment methods", () => {
    expect(EDUCATION_EXPENSE_CATEGORIES).toContain("Utilities");
    expect(EDUCATION_EXPENSE_CATEGORIES).toContain("Other");
    expect(EDUCATION_EXPENSE_PAYMENT_METHODS.map(([value]) => value)).toEqual([
      "cash", "mobile_money", "bank_transfer", "card", "cheque", "other",
    ]);
  });

  it("accepts valid past and current dates but rejects malformed, impossible, and future dates", () => {
    expect(isValidEducationExpenseDate("2026-11-10")).toBe(true);
    expect(isValidEducationExpenseDate("2026-11-11")).toBe(true);
    expect(isValidEducationExpenseDate("2026-02-30")).toBe(false);
    expect(isValidEducationExpenseDate("11/11/2026")).toBe(false);
    expect(isValidEducationExpenseDate("2099-01-01")).toBe(false);
  });
});
