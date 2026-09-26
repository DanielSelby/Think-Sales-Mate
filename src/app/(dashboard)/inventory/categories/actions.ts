"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission } from "@/lib/rbac/permissions";

export interface ProductCategoryInput {
  name: string;
  code: string;
  description: string | null;
  status: "active" | "inactive";
  icon: string | null;
  color: string | null;
  parentId: string | null;
  displayOrder: number;
}

export interface ProductCategoryResult {
  ok: boolean;
  error?: string;
}

async function categoryContext(action: "view" | "create" | "edit" | "delete" | "import" | "export") {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "Your session expired — please sign in again." } as const;
  if (context.isBranchScoped && action !== "view") {
    return { error: "Product categories are shared organization-wide. Only users with organization-wide access can change or export them." } as const;
  }
  if (!await canPermission("product_categories", action)) {
    return { error: `You don't have permission to ${action} product categories.` } as const;
  }
  return { context } as const;
}

async function writeCategoryAudit(
  admin: ReturnType<typeof createAdminClient>,
  input: { orgId: string; actorId: string; action: string; categoryId: string; name: string; metadata?: Record<string, unknown> },
) {
  const { error } = await admin.from("audit_logs").insert({
    org_id: input.orgId,
    actor_id: input.actorId,
    action: input.action,
    entity_type: "product_categories",
    entity_id: input.categoryId,
    metadata: { name: input.name, ...input.metadata },
  });
  return error;
}

async function nextCategoryCode(orgId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("product_categories").select("code").eq("org_id", orgId);
  if (error) throw new Error(error.message);
  const next = (data ?? []).reduce((max, row) => {
    const match = row.code.match(/^CAT-(\d+)$/i);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0) + 1;
  return `CAT-${String(next).padStart(3, "0")}`;
}

function normalizeInput(input: ProductCategoryInput) {
  return {
    name: input.name.trim(),
    code: input.code.trim().toUpperCase(),
    description: input.description?.trim() || null,
    status: input.status,
    icon: input.icon?.trim() || null,
    color: input.color?.trim() || null,
    parent_id: input.parentId || null,
    display_order: Number.isFinite(input.displayOrder) ? Math.trunc(input.displayOrder) : 0,
  };
}

export async function createProductCategory(input: ProductCategoryInput): Promise<ProductCategoryResult> {
  const auth = await categoryContext("create");
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!input.name.trim()) return { ok: false, error: "Category name is required." };

  const admin = createAdminClient();
  const code = input.code.trim() || await nextCategoryCode(auth.context.orgId);
  const values = { ...normalizeInput({ ...input, code }), org_id: auth.context.orgId, created_by: auth.context.userId };
  if (values.parent_id) {
    const { data: parent, error: parentError } = await admin.from("product_categories").select("id").eq("id", values.parent_id).eq("org_id", auth.context.orgId).maybeSingle();
    if (parentError) return { ok: false, error: parentError.message };
    if (!parent) return { ok: false, error: "Select a valid parent category." };
    let parentId: string | null = values.parent_id;
    const seen = new Set<string>();
    while (parentId) {
      if (seen.has(parentId)) return { ok: false, error: "This parent selection would create a category hierarchy cycle." };
      seen.add(parentId);
      const parentResult: { data: { parent_id: string | null } | null; error: { message: string } | null } = await admin.from("product_categories")
        .select("parent_id").eq("id", parentId).eq("org_id", auth.context.orgId).maybeSingle();
      if (parentResult.error) return { ok: false, error: parentResult.error.message };
      parentId = parentResult.data?.parent_id ?? null;
    }
  }
  const { data, error } = await admin.from("product_categories").insert(values).select("id").single();
  if (error) return { ok: false, error: error.code === "23505" ? "A category with this name or code already exists." : error.message };
  const auditError = await writeCategoryAudit(admin, {
    orgId: auth.context.orgId, actorId: auth.context.userId, action: "product_category.created",
    categoryId: data.id, name: values.name,
  });
  if (auditError) return { ok: false, error: `Category was created, but its audit entry could not be recorded: ${auditError.message}` };

  revalidatePath("/inventory/categories");
  revalidatePath("/inventory/new");
  revalidatePath("/inventory");
  return { ok: true };
}

export async function updateProductCategory(categoryId: string, input: ProductCategoryInput): Promise<ProductCategoryResult> {
  const auth = await categoryContext("edit");
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!categoryId || !input.name.trim() || !input.code.trim()) return { ok: false, error: "Category name and code are required." };
  if (input.parentId === categoryId) return { ok: false, error: "A category cannot be its own parent." };

  const admin = createAdminClient();
  const values = normalizeInput(input);
  if (values.parent_id) {
    const { data: parent, error: parentError } = await admin.from("product_categories").select("id").eq("id", values.parent_id).eq("org_id", auth.context.orgId).maybeSingle();
    if (parentError) return { ok: false, error: parentError.message };
    if (!parent) return { ok: false, error: "Select a valid parent category." };
    let parentId: string | null = values.parent_id;
    const seen = new Set<string>([categoryId]);
    while (parentId) {
      if (seen.has(parentId)) return { ok: false, error: "This parent selection would create a category hierarchy cycle." };
      seen.add(parentId);
      const parentResult: { data: { parent_id: string | null } | null; error: { message: string } | null } = await admin.from("product_categories")
        .select("parent_id").eq("id", parentId).eq("org_id", auth.context.orgId).maybeSingle();
      if (parentResult.error) return { ok: false, error: parentResult.error.message };
      parentId = parentResult.data?.parent_id ?? null;
    }
  }
  const { data: existing } = await admin.from("product_categories").select("name").eq("id", categoryId).eq("org_id", auth.context.orgId).maybeSingle();
  if (!existing) return { ok: false, error: "Category not found." };
  const { error } = await admin.from("product_categories").update({ ...values, updated_at: new Date().toISOString() }).eq("id", categoryId).eq("org_id", auth.context.orgId);
  if (error) return { ok: false, error: error.code === "23505" ? "A category with this name or code already exists." : error.message };
  const auditError = await writeCategoryAudit(admin, {
    orgId: auth.context.orgId, actorId: auth.context.userId, action: "product_category.edited",
    categoryId, name: values.name, metadata: { previous_name: existing.name },
  });
  if (auditError) return { ok: false, error: `Category was updated, but its audit entry could not be recorded: ${auditError.message}` };

  revalidatePath("/inventory/categories");
  revalidatePath("/inventory");
  revalidatePath("/inventory/new");
  return { ok: true };
}

export async function setProductCategoryStatus(categoryId: string, status: "active" | "inactive"): Promise<ProductCategoryResult> {
  const auth = await categoryContext("edit");
  if ("error" in auth) return { ok: false, error: auth.error };
  const admin = createAdminClient();
  const { data: category } = await admin.from("product_categories").select("name").eq("id", categoryId).eq("org_id", auth.context.orgId).maybeSingle();
  if (!category) return { ok: false, error: "Category not found." };
  const { error } = await admin.from("product_categories").update({ status, updated_at: new Date().toISOString() }).eq("id", categoryId).eq("org_id", auth.context.orgId);
  if (error) return { ok: false, error: error.message };
  const auditError = await writeCategoryAudit(admin, {
    orgId: auth.context.orgId,
    actorId: auth.context.userId,
    action: status === "active" ? "product_category.activated" : "product_category.deactivated",
    categoryId,
    name: category.name,
  });
  if (auditError) return { ok: false, error: `Category status changed, but its audit entry could not be recorded: ${auditError.message}` };
  revalidatePath("/inventory/categories");
  revalidatePath("/inventory/new");
  return { ok: true };
}

export async function deleteProductCategory(categoryId: string, moveToCategoryId?: string): Promise<ProductCategoryResult> {
  const auth = await categoryContext("delete");
  if ("error" in auth) return { ok: false, error: auth.error };
  const admin = createAdminClient();
  const { data: category } = await admin.from("product_categories").select("name").eq("id", categoryId).eq("org_id", auth.context.orgId).maybeSingle();
  if (!category) return { ok: false, error: "Category not found." };
  const { count, error: countError } = await admin.from("products").select("id", { count: "exact", head: true })
    .eq("org_id", auth.context.orgId).eq("product_category_id", categoryId);
  if (countError) return { ok: false, error: countError.message };

  if (count && count > 0) {
    if (!moveToCategoryId) return { ok: false, error: `This category is assigned to ${count} products. Choose another category to move them to, or cancel.` };
    if (moveToCategoryId === categoryId) return { ok: false, error: "Choose a different destination category." };
    const { data: target } = await admin.from("product_categories").select("id, name").eq("id", moveToCategoryId)
      .eq("org_id", auth.context.orgId).eq("status", "active").maybeSingle();
    if (!target) return { ok: false, error: "Choose a valid active destination category." };
    const { error: moveError } = await admin.from("products").update({
      product_category_id: target.id,
      category: target.name,
    }).eq("org_id", auth.context.orgId).eq("product_category_id", categoryId);
    if (moveError) return { ok: false, error: `Products could not be moved: ${moveError.message}` };
  }

  const { error } = await admin.from("product_categories").delete().eq("id", categoryId).eq("org_id", auth.context.orgId);
  if (error) return { ok: false, error: error.message };
  const auditError = await writeCategoryAudit(admin, {
    orgId: auth.context.orgId, actorId: auth.context.userId, action: "product_category.deleted",
    categoryId, name: category.name, metadata: { moved_products: count ?? 0, move_to_category_id: moveToCategoryId ?? null },
  });
  if (auditError) return { ok: false, error: `Category was deleted, but its audit entry could not be recorded: ${auditError.message}` };
  revalidatePath("/inventory/categories");
  revalidatePath("/inventory");
  return { ok: true };
}

export async function importProductCategories(rows: { name: string; description?: string | null; parentName?: string | null; status?: string }[]): Promise<ProductCategoryResult> {
  const auth = await categoryContext("import");
  if ("error" in auth) return { ok: false, error: auth.error };
  if (rows.length > 1000) return { ok: false, error: "Import is limited to 1,000 categories per file." };
  const admin = createAdminClient();
  const { data: existing, error } = await admin.from("product_categories").select("id, name, code").eq("org_id", auth.context.orgId);
  if (error) return { ok: false, error: error.message };

  const known = new Map((existing ?? []).map((row) => [row.name.trim().toLowerCase(), row.id]));
  const importRows = new Map<string, typeof rows[number]>();
  for (const row of rows) {
    const name = row.name.trim();
    if (name && !known.has(name.toLowerCase()) && !importRows.has(name.toLowerCase())) importRows.set(name.toLowerCase(), row);
  }
  for (const row of importRows.values()) {
    const parentKey = row.parentName?.trim().toLowerCase();
    if (parentKey && !known.has(parentKey) && !importRows.has(parentKey)) {
      return { ok: false, error: `Parent category "${row.parentName}" for "${row.name}" was not found.` };
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const containsCycle = (key: string): boolean => {
    if (visiting.has(key)) return true;
    if (visited.has(key)) return false;
    visiting.add(key);
    const parentKey = importRows.get(key)?.parentName?.trim().toLowerCase();
    if (parentKey && importRows.has(parentKey) && containsCycle(parentKey)) return true;
    visiting.delete(key);
    visited.add(key);
    return false;
  };
  for (const key of importRows.keys()) {
    if (containsCycle(key)) return { ok: false, error: "The imported parent category relationships contain a cycle." };
  }
  let nextCode = (existing ?? []).reduce((max, row) => {
    const match = row.code.match(/^CAT-(\d+)$/i);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0) + 1;
  const pending = Array.from(importRows.values());
  while (pending.length) {
    const index = pending.findIndex((row) => !row.parentName?.trim() || known.has(row.parentName.trim().toLowerCase()));
    if (index < 0) return { ok: false, error: "Imported categories could not be ordered by parent relationship." };
    const [row] = pending.splice(index, 1);
    const name = row.name.trim();
    const { data: inserted, error: insertError } = await admin.from("product_categories").insert({
      org_id: auth.context.orgId,
      name,
      code: `CAT-${String(nextCode++).padStart(3, "0")}`,
      description: row.description?.trim() || null,
      status: row.status?.trim().toLowerCase() === "inactive" ? "inactive" : "active",
      parent_id: row.parentName?.trim() ? known.get(row.parentName.trim().toLowerCase()) ?? null : null,
      created_by: auth.context.userId,
    }).select("id").single();
    if (insertError || !inserted) return { ok: false, error: `Import stopped at "${name}": ${insertError?.message ?? "No category record was returned."}` };
    const auditError = await writeCategoryAudit(admin, {
      orgId: auth.context.orgId, actorId: auth.context.userId, action: "product_category.created",
      categoryId: inserted.id, name, metadata: { import: true },
    });
    if (auditError) return { ok: false, error: `Category "${name}" was imported, but its audit entry could not be recorded: ${auditError.message}` };
    known.set(name.toLowerCase(), inserted.id);
  }
  revalidatePath("/inventory/categories");
  revalidatePath("/inventory/new");
  return { ok: true };
}
