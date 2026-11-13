import { describe, expect, it } from "vitest";
import { summarizeEducationFeeCollections } from "./fee-collection-report";

describe("summarizeEducationFeeCollections", () => {
  it("groups payment totals by campus and method using integer cents", () => {
    expect(summarizeEducationFeeCollections([
      { branch_id: "campus-b", payment_method: "cash", amount: 0.1 },
      { branch_id: "campus-a", payment_method: "mobile_money", amount: 12.35 },
      { branch_id: "campus-b", payment_method: "cash", amount: 0.2 },
      { branch_id: "campus-b", payment_method: "card", amount: 4 },
    ])).toEqual([
      { branch_id: "campus-a", payment_method: "mobile_money", payment_count: 1, total_collected: 12.35 },
      { branch_id: "campus-b", payment_method: "card", payment_count: 1, total_collected: 4 },
      { branch_id: "campus-b", payment_method: "cash", payment_count: 2, total_collected: 0.3 },
    ]);
  });
});
