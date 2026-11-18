export function feeAmountToMinorUnits(amount: number): number | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const minorUnits = Math.round(amount * 100);
  if (!Number.isSafeInteger(minorUnits) || Math.abs(minorUnits / 100 - amount) > 1e-8) return null;
  return minorUnits;
}

export function parsePaystackCheckoutUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:"
      || url.hostname !== "checkout.paystack.com"
      || url.port
      || url.username
      || url.password
      || url.hash
      || url.pathname === "/") {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

export function isMatchingVerifiedTransaction(
  expected: { reference: string; amountMinor: number; currency: string },
  transaction: { reference: string; status: string; amount: number; currency: string }
): boolean {
  return transaction.status === "success"
    && transaction.reference === expected.reference
    && transaction.amount === expected.amountMinor
    && transaction.currency === expected.currency;
}
