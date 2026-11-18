import { describe, expect, it } from "vitest";
import {
  feeAmountToMinorUnits,
  isMatchingVerifiedTransaction,
  parsePaystackCheckoutUrl,
} from "./validation";

describe("guardian Paystack checkout validation", () => {
  it("converts only positive exact cent amounts to safe minor units", () => {
    expect(feeAmountToMinorUnits(125.45)).toBe(12545);
    expect(feeAmountToMinorUnits(0)).toBeNull();
    expect(feeAmountToMinorUnits(Number.MAX_SAFE_INTEGER)).toBeNull();
    expect(feeAmountToMinorUnits(1.001)).toBeNull();
  });

  it("accepts only HTTPS checkout URLs on Paystack's checkout host", () => {
    expect(parsePaystackCheckoutUrl("https://checkout.paystack.com/session"))
      .toBeInstanceOf(URL);
    expect(parsePaystackCheckoutUrl("http://checkout.paystack.com/session")).toBeNull();
    expect(parsePaystackCheckoutUrl("https://checkout.paystack.com.attacker.test/session")).toBeNull();
    expect(parsePaystackCheckoutUrl("https://attacker.test/checkout.paystack.com")).toBeNull();
    expect(parsePaystackCheckoutUrl("https://user@checkout.paystack.com/session")).toBeNull();
  });

  it("requires the verified provider transaction to exactly match the attempt", () => {
    const expected = { reference: "EDU-123", amountMinor: 12545, currency: "GHS" };
    const transaction = {
      reference: "EDU-123",
      status: "success",
      amount: 12545,
      currency: "GHS",
    };
    expect(isMatchingVerifiedTransaction(expected, transaction)).toBe(true);
    expect(isMatchingVerifiedTransaction(expected, { ...transaction, amount: 12544 })).toBe(false);
    expect(isMatchingVerifiedTransaction(expected, { ...transaction, currency: "NGN" })).toBe(false);
    expect(isMatchingVerifiedTransaction(expected, { ...transaction, status: "pending" })).toBe(false);
  });
});
