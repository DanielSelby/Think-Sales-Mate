export interface CurrencyOption {
  code: string;
  label: string;
}

export const SUPPORTED_CURRENCIES: CurrencyOption[] = [
  { code: "USD", label: "US Dollar ($)" },
  { code: "GHS", label: "Ghanaian Cedi (GH₵)" },
  { code: "NGN", label: "Nigerian Naira (₦)" },
  { code: "KES", label: "Kenyan Shilling (KSh)" },
  { code: "ZAR", label: "South African Rand (R)" },
  { code: "XOF", label: "West African CFA Franc (CFA)" },
  { code: "EGP", label: "Egyptian Pound (E£)" },
  { code: "EUR", label: "Euro (€)" },
  { code: "GBP", label: "British Pound (£)" },
  { code: "CAD", label: "Canadian Dollar (C$)" },
  { code: "AUD", label: "Australian Dollar (A$)" },
  { code: "INR", label: "Indian Rupee (₹)" }
];

/**
 * Formats an amount using the organization's chosen currency — every
 * money display in the app should go through this rather than
 * hand-rolling a "$" prefix, so switching currency in Settings updates
 * every page at once.
 */
export function formatMoney(value: number, currency: string = "USD"): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  } catch {
    // Fall back gracefully if an unrecognized currency code ever sneaks in.
    return `${currency} ${value.toFixed(2)}`;
  }
}