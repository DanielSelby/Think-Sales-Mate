export function normalizeGuardianSearchValue(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}\s._/-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);

  return normalized;
}
