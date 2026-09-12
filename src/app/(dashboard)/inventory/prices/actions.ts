"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";

export type PriceUpdate = {
  sellingPrice: number;
  wholesalePrice: number | null;
  vipPrice: number | null;
};

function hasValidOptionalPrice(value: number | null) {
  return value === null || (Number.isFinite(value) && value >= 0);
}

export async function updateProductPrices(productId: string, prices: PriceUpdate) {
  if (!Number.isFinite(prices.sellingPrice) || prices.sellingPrice < 0 || !hasValidOptionalPrice(prices.wholesalePrice) || !hasValidOptionalPrice(prices.vipPrice)) {
    return { ok: false, error: "Enter valid non-negative prices." };
  }
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "inventory.manage")) return { ok: false, error: "You do not have permission to update prices." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ unit_price: prices.sellingPrice, wholesale_price: prices.wholesalePrice, vip_price: prices.vipPrice, updated_at: new Date().toISOString() })
    .eq("id", productId)
    .eq("org_id", context.orgId);
  if (error) return { ok: false, error: error.message };
  await supabase.from("audit_logs").insert({
    org_id: context.orgId,
    actor_id: context.userId,
    action: "product.price_updated",
    entity_type: "products",
    entity_id: productId,
    metadata: { new_price: prices.sellingPrice, wholesale_price: prices.wholesalePrice, vip_price: prices.vipPrice },
  });
  revalidatePath("/inventory/prices");
  revalidatePath("/inventory");
  revalidatePath("/pos");
  revalidatePath("/sales/new");
  return { ok: true };
}

export async function bulkUpdateProductPrices(prices: Record<string, PriceUpdate>) {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "inventory.manage")) {
    return { ok: false, error: "You do not have permission to update prices.", updatedCount: 0 };
  }

  const entries = Object.entries(prices);
  if (entries.length === 0) return { ok: true, updatedCount: 0 };
  if (entries.some(([, price]) => !Number.isFinite(price.sellingPrice) || price.sellingPrice < 0 || !hasValidOptionalPrice(price.wholesalePrice) || !hasValidOptionalPrice(price.vipPrice))) {
    return { ok: false, error: "All prices must be valid non-negative numbers.", updatedCount: 0 };
  }

  const supabase = await createClient();
  const results = await Promise.all(
    entries.map(([productId, price]) =>
      supabase
        .from("products")
        .update({ unit_price: price.sellingPrice, wholesale_price: price.wholesalePrice, vip_price: price.vipPrice, updated_at: new Date().toISOString() })
        .eq("id", productId)
        .eq("org_id", context.orgId)
    )
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) return { ok: false, error: failed.error.message, updatedCount: 0 };
  await Promise.all(entries.map(([productId, price]) =>
    supabase.from("audit_logs").insert({
      org_id: context.orgId,
      actor_id: context.userId,
      action: "product.price_updated",
      entity_type: "products",
      entity_id: productId,
      metadata: { new_price: price.sellingPrice, wholesale_price: price.wholesalePrice, vip_price: price.vipPrice, bulk: true },
    })
  ));

  revalidatePath("/inventory/prices");
  revalidatePath("/inventory");
  revalidatePath("/pos");
  revalidatePath("/sales/new");
  return { ok: true, updatedCount: entries.length };
}

export async function getPriceHistory() {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "inventory.manage")) return { ok: false, error: "You do not have permission to view price history.", entries: [] };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, entity_id, metadata, created_at")
    .eq("org_id", context.orgId)
    .eq("action", "product.price_updated")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return { ok: false, error: error.message, entries: [] };
  const productIds = [...new Set((data ?? []).map((entry) => entry.entity_id).filter(Boolean))] as string[];
  const { data: products } = productIds.length
    ? await supabase.from("products").select("id, name").in("id", productIds)
    : { data: [] as { id: string; name: string }[] };
  const names = new Map((products ?? []).map((product) => [product.id, product.name]));
  return { ok: true, entries: (data ?? []).map((entry) => ({ ...entry, product_name: names.get(entry.entity_id ?? "") ?? "Product price" })) };
}
