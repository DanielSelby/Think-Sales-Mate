import { createClient } from "@/lib/supabase/server";

type SupabaseClient = ReturnType<typeof createClient>;

/**
 * SalesMate ERP has no pre-existing SKU auto-generation — the current
 * "Add Product" form takes whatever SKU the user types. This is a new,
 * self-contained generator used only by the bulk import flow (the manual
 * Add Product form is intentionally left untouched).
 *
 * Format: {CATEGORY-PREFIX}-{YEAR}-{SEQUENCE}, e.g. ELEC-2026-0001.
 * Falls back to "PRD" when there's no usable category.
 */
export function skuPrefix(category?: string | null): string {
  const source = (category ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  return source.length >= 3 ? source.slice(0, 4) : "PRD";
}

export async function generateNextSku(
  supabase: SupabaseClient,
  orgId: string,
  category: string | null | undefined,
  reserved: Set<string>
): Promise<string> {
  const prefix = skuPrefix(category);
  const year = new Date().getFullYear();
  const pattern = `${prefix}-${year}-`;

  const { count } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .like("sku", `${pattern}%`);

  let seq = (count ?? 0) + 1;

  for (let attempt = 0; attempt < 200; attempt++) {
    const candidate = `${pattern}${String(seq).padStart(4, "0")}`;
    if (!reserved.has(candidate)) {
      const { data: existing } = await supabase
        .from("products")
        .select("id")
        .eq("org_id", orgId)
        .eq("sku", candidate)
        .maybeSingle();
      if (!existing) {
        reserved.add(candidate);
        return candidate;
      }
    }
    seq++;
  }

  // Extremely unlikely fallback — timestamp-based, guaranteed unique.
  return `${prefix}-${year}-${Date.now().toString().slice(-6)}`;
}