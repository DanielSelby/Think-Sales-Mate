"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission } from "@/lib/rbac/permissions";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";

export type PriceUpdate = {
  sellingPrice: number;
  wholesalePrice: number | null;
  vipPrice: number | null;
  specialPrice: number | null;
};

export async function setUseSystemPrices(useSystemPrices: boolean) {
  const context = await getCurrentOrgContext();
  if (!context || !await canPermission("inventory", "edit")) return { ok: false, error: "You do not have permission to change price settings." };
  const supabase = await createClient();
  const { data: organization } = await supabase.from("organizations").select("use_system_prices").eq("id", context.orgId).maybeSingle();
  const { error } = await supabase.from("organizations").update({ use_system_prices: useSystemPrices }).eq("id", context.orgId);
  if (error) return { ok: false, error: error.message };
  const audit = await recordAuditEvent(supabase, {
    orgId: context.orgId,
    actorId: context.userId,
    action: "organization.price_settings_updated",
    entityType: "organization",
    entityId: context.orgId,
    module: "Inventory",
    description: "Changed whether sales use system catalog prices",
    previousValues: { use_system_prices: organization?.use_system_prices ?? null },
    newValues: { use_system_prices: useSystemPrices },
  });
  if (audit.error) return { ok: false, error: audit.error };
  revalidatePath("/inventory/prices");
  revalidatePath("/pos");
  revalidatePath("/sales/new");
  revalidatePath("/sales");
  return { ok: true };
}

function hasValidOptionalPrice(value: number | null) {
  return value === null || (Number.isFinite(value) && value >= 0);
}

export async function updateProductPrices(productId: string, prices: PriceUpdate) {
  if (!Number.isFinite(prices.sellingPrice) || prices.sellingPrice < 0 || !hasValidOptionalPrice(prices.wholesalePrice) || !hasValidOptionalPrice(prices.vipPrice) || !hasValidOptionalPrice(prices.specialPrice)) {
    return { ok: false, error: "Enter valid non-negative prices." };
  }
  const context = await getCurrentOrgContext();
  if (!context || !await canPermission("inventory", "edit")) return { ok: false, error: "You do not have permission to update prices." };
  const supabase = await createClient();
  const { data: previous } = await supabase.from("products").select("unit_price, wholesale_price, vip_price, special_price").eq("id", productId).eq("org_id", context.orgId).maybeSingle();
  const { error } = await supabase
    .from("products")
    .update({ unit_price: prices.sellingPrice, wholesale_price: prices.wholesalePrice, vip_price: prices.vipPrice, special_price: prices.specialPrice, updated_at: new Date().toISOString() })
    .eq("id", productId)
    .eq("org_id", context.orgId);
  if (error) return { ok: false, error: error.message };
  const audit = await recordAuditEvent(supabase, {
    orgId: context.orgId,
    actorId: context.userId,
    action: "product.price_updated",
    entityType: "products",
    entityId: productId,
    module: "Inventory",
    description: "Updated product selling prices",
    previousValues: previous ?? null,
    newValues: { unit_price: prices.sellingPrice, wholesale_price: prices.wholesalePrice, vip_price: prices.vipPrice, special_price: prices.specialPrice },
  });
  if (audit.error) return { ok: false, error: audit.error };
  revalidatePath("/inventory/prices");
  revalidatePath("/inventory");
  revalidatePath("/pos");
  revalidatePath("/sales/new");
  return { ok: true };
}

export async function bulkUpdateProductPrices(prices: Record<string, PriceUpdate>) {
  const context = await getCurrentOrgContext();
  if (!context || !await canPermission("inventory", "edit")) {
    return { ok: false, error: "You do not have permission to update prices.", updatedCount: 0 };
  }

  const entries = Object.entries(prices);
  if (entries.length === 0) return { ok: true, updatedCount: 0 };
  if (entries.some(([, price]) => !Number.isFinite(price.sellingPrice) || price.sellingPrice < 0 || !hasValidOptionalPrice(price.wholesalePrice) || !hasValidOptionalPrice(price.vipPrice) || !hasValidOptionalPrice(price.specialPrice))) {
    return { ok: false, error: "All prices must be valid non-negative numbers.", updatedCount: 0 };
  }

  const supabase = await createClient();
  const productIds = entries.map(([productId]) => productId);
  const { data: previousProducts } = await supabase.from("products").select("id, unit_price, wholesale_price, vip_price, special_price").in("id", productIds).eq("org_id", context.orgId);
  const results = await Promise.all(
    entries.map(([productId, price]) =>
      supabase
        .from("products")
        .update({ unit_price: price.sellingPrice, wholesale_price: price.wholesalePrice, vip_price: price.vipPrice, special_price: price.specialPrice, updated_at: new Date().toISOString() })
        .eq("id", productId)
        .eq("org_id", context.orgId)
    )
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) return { ok: false, error: failed.error.message, updatedCount: 0 };
  const previousById = new Map((previousProducts ?? []).map((product) => [product.id, product]));
  const auditResults = await Promise.all(entries.map(([productId, price]) => recordAuditEvent(supabase, {
    orgId: context.orgId,
    actorId: context.userId,
    action: "product.price_updated",
    entityType: "products",
    entityId: productId,
    module: "Inventory",
    description: "Updated product selling prices in bulk",
    previousValues: previousById.get(productId) ?? null,
    newValues: { unit_price: price.sellingPrice, wholesale_price: price.wholesalePrice, vip_price: price.vipPrice, special_price: price.specialPrice },
    metadata: { bulk: true },
  })));
  const failedAudit = auditResults.find((result) => result.error);
  if (failedAudit?.error) return { ok: false, error: failedAudit.error, updatedCount: entries.length };

  revalidatePath("/inventory/prices");
  revalidatePath("/inventory");
  revalidatePath("/pos");
  revalidatePath("/sales/new");
  return { ok: true, updatedCount: entries.length };
}

export async function getPriceHistory() {
  const context = await getCurrentOrgContext();
  if (!context || !await canPermission("inventory", "edit")) return { ok: false, error: "You do not have permission to view price history.", entries: [] };
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
