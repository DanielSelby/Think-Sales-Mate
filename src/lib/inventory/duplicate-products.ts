export type DuplicateControlMode = "allow" | "warn" | "block_exact" | "block_exact_similar";
export type BarcodeValidationMode = "allow" | "warn" | "block";

export type ProductDuplicateMatch = {
  id: string;
  name: string;
  sku: string;
  brand: string | null;
  category: string | null;
  barcode: string | null;
  imageUrl: string | null;
  stockQuantity: number;
  locations: string[];
  score: number;
  exact: boolean;
};

export function normalizeProductName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function tokenSimilarity(left: string, right: string) {
  const a = new Set(left.toLowerCase().split(/\s+/).filter(Boolean));
  const b = new Set(right.toLowerCase().split(/\s+/).filter(Boolean));
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const token of a) if (b.has(token)) common++;
  return Math.round((2 * common / (a.size + b.size)) * 100);
}

function editSimilarity(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    const current = [i];
    for (let j = 1; j <= right.length; j++) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    for (let j = 0; j <= right.length; j++) previous[j] = current[j];
  }
  const distance = previous[right.length];
  return Math.round((1 - distance / Math.max(left.length, right.length, 1)) * 100);
}

export function productNameScore(input: string, candidate: string) {
  const normalizedInput = normalizeProductName(input);
  const normalizedCandidate = normalizeProductName(candidate);
  if (normalizedInput === normalizedCandidate) return 100;
  return Math.max(
    tokenSimilarity(input, candidate),
    Math.round((editSimilarity(normalizedInput, normalizedCandidate) * 0.7) + (tokenSimilarity(input, candidate) * 0.3)),
  );
}

