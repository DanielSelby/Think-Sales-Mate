import { describe, expect, it } from "vitest";
import { getRestaurantPosPaymentAccountIndexes } from "./pos-payments";

describe("Restaurant POS payment account requirements", () => {
  it("requires accounts for positive card and mobile-money tenders", () => {
    expect(getRestaurantPosPaymentAccountIndexes([
      { method: "card", amount: 10 },
      { method: "mobile_money", amount: 20 },
      { method: "cash", amount: 5 },
    ], 0)).toEqual([0, 1]);
  });

  it("requires an account when a zero-amount card tender receives the tip", () => {
    expect(getRestaurantPosPaymentAccountIndexes([
      { method: "card", amount: 0 },
      { method: "cash", amount: 10 },
    ], 2)).toEqual([0]);
  });

  it("does not require a bank account for a cash tip or a zero-amount tender without a tip", () => {
    expect(getRestaurantPosPaymentAccountIndexes([
      { method: "cash", amount: 0 },
      { method: "card", amount: 0 },
    ], 2)).toEqual([]);
    expect(getRestaurantPosPaymentAccountIndexes([
      { method: "cash", amount: 10 },
      { method: "card", amount: 0 },
    ], 0)).toEqual([]);
  });
});
