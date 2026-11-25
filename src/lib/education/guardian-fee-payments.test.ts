import { describe, expect, it } from "vitest";
import { educationGuardianFeePaymentSchema } from "./guardian-fee-payments";

describe("Think Education guardian payment receipt", () => {
  it("accepts a confirmed fee payment record", () => {
    expect(educationGuardianFeePaymentSchema.safeParse({
      payment_id: "00000000-0000-4000-8000-000000000001",
      org_id: "00000000-0000-4000-8000-000000000002",
      student_id: "00000000-0000-4000-8000-000000000003",
      student_name: "Sam Student",
      school_name: "Example School",
      currency_code: "USD",
      fee_description: "Tuition",
      amount: 25,
      payment_method: "paystack",
      reference: "EDU-REFERENCE",
      paid_at: "2026-11-24T11:00:00Z",
    }).success).toBe(true);
  });

  it("rejects unsupported payment methods and invalid currency codes", () => {
    expect(educationGuardianFeePaymentSchema.safeParse({
      payment_id: "00000000-0000-4000-8000-000000000001",
      org_id: "00000000-0000-4000-8000-000000000002",
      student_id: "00000000-0000-4000-8000-000000000003",
      student_name: "Sam Student",
      school_name: "Example School",
      currency_code: "US",
      fee_description: "Tuition",
      amount: 25,
      payment_method: "unknown",
      reference: null,
      paid_at: "2026-11-24T11:00:00Z",
    }).success).toBe(false);
  });
});
