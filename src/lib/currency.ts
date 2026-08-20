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
 * Formats an amount using the organization's chosen currency.
 *
 * GHS is displayed as GH₵ instead of the browser's default
 * Ghanaian Cedi formatting.
 */
export function formatMoney(
  value: number,
  currency: string = "USD"
): string {
  try {
    // Keep GHS as the real ISO currency code for Intl.NumberFormat,
    // but replace its displayed symbol with GH₵.
    if (currency === "GHS") {
      const formatted = new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "GHS",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(value);

      // Different browsers/locales can render GHS differently.
      // Normalize the symbol to GH₵.
      return formatted
        .replace(/GHS/g, "GH₵")
        .replace(/GH₵\s*/g, "GH₵");
    }

    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}