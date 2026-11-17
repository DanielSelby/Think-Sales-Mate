export function normalizeEducationLibrarySearch(value: string): string {
  return value
    .normalize("NFC")
    .trim()
    .replace(/[^\p{L}\p{N}\s_/'’-]/gu, " ")
    .replace(/[’']/g, "%")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}
