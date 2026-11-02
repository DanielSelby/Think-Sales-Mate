import type { PlatformProductSlug } from "@/types/platform-database";

export class ProductSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductSelectionError";
  }
}

export function parseRequestedProductSlugs(
  values: FormDataEntryValue[],
  publishedProductSlugs: readonly PlatformProductSlug[],
): PlatformProductSlug[] {
  const allowedSlugs = new Map<string, PlatformProductSlug>(
    publishedProductSlugs.map((slug) => [slug, slug] as const),
  );
  const selected = new Set<PlatformProductSlug>();

  for (const value of values) {
    const slug = typeof value === "string" ? allowedSlugs.get(value) : undefined;
    if (!slug) {
      throw new ProductSelectionError("Choose only products currently available for registration.");
    }
    selected.add(slug);
  }

  if (selected.size === 0) {
    throw new ProductSelectionError("Select at least one product for your workspace.");
  }
  if (selected.size > 10) {
    throw new ProductSelectionError("Select no more than 10 products.");
  }

  return [...selected];
}
