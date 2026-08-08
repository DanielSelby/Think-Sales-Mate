import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { CategoryListView, type CategoryKpis, type CategoryActivity } from "@/components/expenses/categories/category-list-view";
import type { CategoryIconKey, CategoryColorKey } from "@/lib/expenses/categories";

export const metadata = { title: "Expense Categories · SalesMate ERP" };

const ACTIVITY_LABEL: Record<string, string> = {
  "expense_category.created": "New category added:",
};

export default async function ExpenseCategoriesPage() {
  const context = await getCurrentOrgContext();
  if (!context) return null;

  const orgId = context.orgId;
  const supabase = createClient();

  const [{ data: categories }, { data: expenses }] = await Promise.all([
    supabase.from("expense_categories").select("*").eq("org_id", orgId).order("name"),
    supabase.from("expenses").select("category, amount, expense_date, recorded_by").eq("org_id", orgId),
  ]);

  const rawCategories = categories ?? [];
  const rawExpenses = expenses ?? [];

  const creatorIds = Array.from(new Set(rawCategories.map((c) => c.created_by)));
  const { data: staff } = creatorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", creatorIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const staffNameById = new Map((staff ?? []).map((s) => [s.id, s.full_name ?? "Unknown"]));

  const spendByCategory = new Map<string, { total: number; count: number }>();
  for (const e of rawExpenses) {
    const entry = spendByCategory.get(e.category) ?? { total: 0, count: 0 };
    entry.total += e.amount;
    entry.count += 1;
    spendByCategory.set(e.category, entry);
  }

  const rows = rawCategories.map((c) => {
    const spend = spendByCategory.get(c.name) ?? { total: 0, count: 0 };
    return {
      id: c.id,
      name: c.name,
      icon: c.icon as CategoryIconKey,
      color: c.color as CategoryColorKey,
      description: c.description,
      department: c.department,
      budgetLimit: c.budget_limit,
      totalExpenses: spend.total,
      transactions: spend.count,
      status: c.status,
      createdByName: staffNameById.get(c.created_by) ?? "—",
      updatedAt: c.updated_at,
    };
  });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthlyExpenses = rawExpenses.filter((e) => new Date(e.expense_date) >= monthStart).reduce((sum, e) => sum + e.amount, 0);

  const mostUsed = [...rows].sort((a, b) => b.transactions - a.transactions)[0] ?? null;
  const totalSpend = rows.reduce((sum, r) => sum + r.totalExpenses, 0);

  const budgeted = rows.filter((r) => r.budgetLimit && r.budgetLimit > 0);
  const budgetUtilization = budgeted.length > 0
    ? Math.round((budgeted.reduce((sum, r) => sum + Math.min(r.totalExpenses, r.budgetLimit!), 0) / budgeted.reduce((sum, r) => sum + r.budgetLimit!, 0)) * 100)
    : null;

  const kpis: CategoryKpis = {
    totalCategories: rows.length,
    activeCategories: rows.filter((r) => r.status === "active").length,
    monthlyExpenses,
    mostUsedCategory: mostUsed?.name ?? null,
    mostUsedPercent: mostUsed && totalSpend > 0 ? Math.round((mostUsed.totalExpenses / totalSpend) * 100) : 0,
    budgetUtilization,
  };

  const departments = Array.from(new Set(rows.map((r) => r.department).filter(Boolean))) as string[];

  const { data: activityLogs } = await supabase
    .from("audit_logs")
    .select("id, action, entity_id, metadata, created_at")
    .eq("org_id", orgId)
    .eq("entity_type", "expense_categories")
    .order("created_at", { ascending: false })
    .limit(6);

  const categoryNameById = new Map(rows.map((r) => [r.id, r.name]));
  const recentActivity: CategoryActivity[] = (activityLogs ?? []).map((l) => {
    const meta = l.metadata as { name?: string } | null;
    return {
      id: l.id,
      label: ACTIVITY_LABEL[l.action] ?? l.action,
      categoryName: (l.entity_id && categoryNameById.get(l.entity_id)) ?? meta?.name ?? "—",
      createdAt: l.created_at,
    };
  });

  return (
    <CategoryListView
      categories={rows}
      kpis={kpis}
      currency={context.currency}
      departments={departments}
      recentActivity={recentActivity}
    />
  );
}