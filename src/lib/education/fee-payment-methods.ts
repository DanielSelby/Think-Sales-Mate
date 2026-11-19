export const EDUCATION_FEE_PAYMENT_METHODS = [
  ["cash", "Cash"],
  ["mobile_money", "Mobile money"],
  ["bank_transfer", "Bank transfer"],
  ["card", "Card"],
  ["cheque", "Cheque"],
  ["other", "Other"],
] as const;

export function isEducationFeePaymentMethod(value: string) {
  return EDUCATION_FEE_PAYMENT_METHODS.some(([method]) => method === value);
}
