"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import type { ExpenseCategoryStatus } from "@/types/database";
import type { CategoryIconKey, CategoryColorKey } from "@/lib/expenses/categories";

export interface CategoryInput {
  name: string;
  icon: CategoryIconKey;
  color: CategoryColorKey;
  description: string | null;
  department: string | null;
  budgetLimit: number | null;
}

export interface SimpleResult {
  ok: boolean;
  error?: string;
  categoryId?: string;
}

export async function createExpenseCategory(input: CategoryInput): Promise<SimpleResult> {
  if (!input.name.trim()) return { ok: false, error: "Category name is required." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "No active organization." };

  const { data, error } = await supabase
    .from("expense_categories")
    .insert({
      org_id: context.orgId,
      name: input.name.trim(),
      icon: input.icon,
      color: input.color,
      description: input.description,
      department: input.department,
      budget_limit: input.budgetLimit,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, error: "A category with this name already exists." };
    return { ok: false, error: error.message };
  }

  await supabase.from("audit_logs").insert({
    org_id: context.orgId,
    actor_id: user.id,
    action: "expense_category.created",
    entity_type: "expense_categories",
    entity_id: data.id,
    metadata: { name: input.name },
  });

  revalidatePath("/expenses/categories");
  return { ok: true, categoryId: data.id };
}

export async function updateExpenseCategory(categoryId: string, input: CategoryInput): Promise<SimpleResult> {
  if (!input.name.trim()) return { ok: false, error: "Category name is required." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("expense_categories")
    .update({
      name: input.name.trim(),
      icon: input.icon,
      color: input.color,
      description: input.description,
      department: input.department,
      budget_limit: input.budgetLimit,
    })
    .eq("id", categoryId);

  if (error) {
    if (error.code === "23505") return { ok: false, error: "A category with this name already exists." };
    return { ok: false, error: error.message };
  }

  revalidatePath("/expenses/categories");
  return { ok: true };
}

export async function toggleExpenseCategoryStatus(categoryId: string, status: ExpenseCategoryStatus): Promise<SimpleResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("expense_categories").update({ status }).eq("id", categoryId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/expenses/categories");
  return { ok: true };
}

export async function deleteExpenseCategory(categoryId: string): Promise<SimpleResult> {
  const supabase = await createClient();

  const { data: category } = await supabase.from("expense_categories").select("org_id, name").eq("id", categoryId).single();
  if (!category) return { ok: false, error: "Category not found." };

  const { count } = await supabase
    .from("expenses")
    .select("id", { count: "exact", head: true })
    .eq("org_id", category.org_id)
    .eq("category", category.name);

  if (count && count > 0) {
    return { ok: false, error: `${count} expense(s) use this category — deactivate it instead of deleting.` };
  }

  const { error } = await supabase.from("expense_categories").delete().eq("id", categoryId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/expenses/categories");
  return { ok: true };
}