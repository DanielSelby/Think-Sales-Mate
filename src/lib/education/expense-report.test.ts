import { describe, expect, it } from "vitest";
import { summarizeEducationExpenses } from "./expense-report";

describe("summarizeEducationExpenses", () => {
  it("groups totals by campus, category, approval, and payment status in cents", () => {
    const summaries = summarizeEducationExpenses([
      { branch_id: "campus-b", category: "Utilities", status: "approved", payment_status: "paid", amount: 10.1 },
      { branch_id: "campus-a", category: "Supplies", status: "pending_approval", payment_status: "unpaid", amount: 3.25 },
      { branch_id: "campus-b", category: "Utilities", status: "approved", payment_status: "paid", amount: 0.2 },
      { branch_id: "campus-b", category: "Utilities", status: "approved", payment_status: "unpaid", amount: 7 },
    ]);

    expect(summaries).toEqual([
      {
        branch_id: "campus-a",
        category: "Supplies",
        status: "pending_approval",
        payment_status: "unpaid",
        expense_count: 1,
        total_amount: 3.25,
      },
      {
        branch_id: "campus-b",
        category: "Utilities",
        status: "approved",
        payment_status: "paid",
        expense_count: 2,
        total_amount: 10.3,
      },
      {
        branch_id: "campus-b",
        category: "Utilities",
        status: "approved",
        payment_status: "unpaid",
        expense_count: 1,
        total_amount: 7,
      },
    ]);
  });
});
