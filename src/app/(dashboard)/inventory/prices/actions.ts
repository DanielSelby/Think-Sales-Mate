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
  revalidatePath("/inventory/prices");
  revalidatePath("/inventory");
  revalidatePath("/pos");
  revalidatePath("/sales/new");
  return { ok: true };
}
