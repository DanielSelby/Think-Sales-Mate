export function normalizeInventorySearchToken(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, "").toLowerCase() ?? "";
}

export function findExactProductMatch<T extends { barcode?: string | null; sku?: string | null; name?: string | null }>(
  products: T[],
  query: string,
): T | null {
  const normalizedQuery = normalizeInventorySearchToken(query);
  if (!normalizedQuery) return null;

  const exactMatches = products.filter((product) => {
    const searchKeys = [product.barcode, product.sku, product.name];
    return searchKeys.some((value) => normalizeInventorySearchToken(value) === normalizedQuery);
  });

  return exactMatches.length === 1 ? exactMatches[0] : null;
}
