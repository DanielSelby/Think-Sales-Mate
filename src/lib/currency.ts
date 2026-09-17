export interface CurrencyOption {
  code: string;
  label: string;
}

export type CurrencyPosition = "before" | "after";

export interface CurrencyConfig {
  code: string;
  symbol: string;
  name: string;
  decimalPlaces: number;
  thousandSeparator: string;
  decimalSeparator: string;
  position: CurrencyPosition;
}

const CURRENCY_DEFAULTS: Record<string, Omit<CurrencyConfig, "code">> = {
  GHS: { symbol: "GH₵", name: "Ghana Cedi", decimalPlaces: 2, thousandSeparator: ",", decimalSeparator: ".", position: "before" },
  USD: { symbol: "$", name: "US Dollar", decimalPlaces: 2, thousandSeparator: ",", decimalSeparator: ".", position: "before" },
  EUR: { symbol: "€", name: "Euro", decimalPlaces: 2, thousandSeparator: ".", decimalSeparator: ",", position: "before" },
  GBP: { symbol: "£", name: "British Pound", decimalPlaces: 2, thousandSeparator: ",", decimalSeparator: ".", position: "before" },
  NGN: { symbol: "₦", name: "Nigerian Naira", decimalPlaces: 2, thousandSeparator: ",", decimalSeparator: ".", position: "before" },
  KES: { symbol: "KSh", name: "Kenyan Shilling", decimalPlaces: 2, thousandSeparator: ",", decimalSeparator: ".", position: "before" },
  ZAR: { symbol: "R", name: "South African Rand", decimalPlaces: 2, thousandSeparator: ",", decimalSeparator: ".", position: "before" },
  XOF: { symbol: "CFA", name: "West African CFA Franc", decimalPlaces: 0, thousandSeparator: " ", decimalSeparator: ",", position: "after" },
};

export function getCurrencyConfig(code = "GHS", overrides?: Partial<CurrencyConfig>): CurrencyConfig {
  const normalizedCode = code.trim().toUpperCase();
  const defaults = CURRENCY_DEFAULTS[normalizedCode] ?? {
    symbol: normalizedCode,
    name: normalizedCode,
    decimalPlaces: 2,
    thousandSeparator: ",",
    decimalSeparator: ".",
    position: "before" as const,
  };
  return { code: normalizedCode, ...defaults, ...overrides };
}

export function formatCurrencyAmount(value: number, config?: Partial<CurrencyConfig> & { code?: string }): string {
  const currency = getCurrencyConfig(config?.code, config);
  const numericValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  const fixed = numericValue.toFixed(currency.decimalPlaces);
  const [integer, decimal] = fixed.split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, currency.thousandSeparator);
  const numberText = decimal ? `${grouped}${currency.decimalSeparator}${decimal}` : grouped;
  return currency.position === "after" ? `${numberText} ${currency.symbol}` : `${currency.symbol} ${numberText}`;
}

export function getCurrencyConfigFromSettings(row: {
  code?: string | null;
  currency_code?: string | null;
  symbol?: string | null;
  currency_symbol?: string | null;
  name?: string | null;
  currency_name?: string | null;
  decimal_places?: number | null;
  thousand_separator?: string | null;
  decimal_separator?: string | null;
  currency_position?: CurrencyPosition | null;
}): CurrencyConfig {
  const symbol = row.symbol ?? row.currency_symbol;
  const name = row.name ?? row.currency_name;
  return getCurrencyConfig(row.code ?? row.currency_code ?? "GHS", {
    ...(symbol ? { symbol } : {}),
    ...(name ? { name } : {}),
    ...(row.decimal_places != null ? { decimalPlaces: row.decimal_places } : {}),
    ...(row.thousand_separator ? { thousandSeparator: row.thousand_separator } : {}),
    ...(row.decimal_separator ? { decimalSeparator: row.decimal_separator } : {}),
    ...(row.currency_position ? { position: row.currency_position } : {}),
  });
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
  currency: string = "GHS"
): string {
  return formatCurrencyAmount(value, { code: currency });
}