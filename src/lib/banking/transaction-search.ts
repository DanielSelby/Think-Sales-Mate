export function normalizeBankTransactionSearch(value: string): string {
  return value
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}
