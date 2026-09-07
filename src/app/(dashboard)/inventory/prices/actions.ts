"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";

export async function updateProductPrice(productId: string, price: number) {
  if (!Number.isFinite(price) || price < 0) return { ok: false, error: "Enter a valid non-negative price." };
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "inventory.manage")) return { ok: false, error: "You do not have permission to update prices." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ unit_price: price, updated_at: new Date().toISOString() })
    .eq("id", productId)
    .eq("org_id", context.orgId);
  if (error) return { ok: false, error: error.message };
  await supabase.from("audit_logs").insert({
    org_id: context.orgId,
    actor_id: context.userId,
    action: "product.price_updated",
    entity_type: "products",
    entity_id: productId,
    metadata: { new_price: price },
  });
  revalidatePath("/inventory/prices");
  revalidatePath("/inventory");
  revalidatePath("/pos");
  revalidatePath("/sales/new");
  return { ok: true };
}

export async function bulkUpdateProductPrices(prices: Record<string, number>) {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "inventory.manage")) {
    return { ok: false, error: "You do not have permission to update prices.", updatedCount: 0 };
  }

  const entries = Object.entries(prices);
  if (entries.length === 0) return { ok: true, updatedCount: 0 };
  if (entries.some(([, price]) => !Number.isFinite(price) || price < 0)) {
    return { ok: false, error: "All prices must be valid non-negative numbers.", updatedCount: 0 };
  }

  const supabase = await createClient();
  const results = await Promise.all(
    entries.map(([productId, price]) =>
      supabase
        .from("products")
        .update({ unit_price: price, updated_at: new Date().toISOString() })
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
      metadata: { new_price: price, bulk: true },
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
  return { ok: true, entries: data ?? [] };
}
