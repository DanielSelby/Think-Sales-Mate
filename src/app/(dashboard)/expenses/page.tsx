import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { ExpenseListView, type ExpenseKpis, type CategorySlice, type ExpenseActivity } from "@/components/expenses/expense-list-view";
import { deriveDisplayStatus } from "@/lib/expenses/format";

export const metadata = { title: "Expenses · SalesMate ERP" };

const ACTIVITY_LABEL: Record<string, string> = {
  "expense.created": "New expense added",
  "expense.approved": "Expense approved",
  "expense.rejected": "Expense rejected",
  "expense.paid": "Expense marked paid",
};

export default async function ExpensesPage() {
  const context = await getCurrentOrgContext();
  if (!context) return null;

  const orgId = context.orgId;
  const supabase = createClient();

  const [{ data: expenses }, { data: locations }] = await Promise.all([
    supabase.from("expenses").select("*").eq("org_id", orgId).order("expense_date", { ascending: false }),
    supabase.from("business_locations").select("id, name").eq("org_id", orgId).eq("is_active", true),
  ]);

  const rows = (expenses ?? []).map((e) => ({
    id: e.id,
    expenseNumber: e.expense_number,
    date: e.expense_date,
    category: e.category,
    description: e.description,
    vendor: e.vendor,
    paymentMethod: e.payment_method,
    amount: e.amount,
    status: e.status,
    paymentStatus: e.payment_status,
    dueDate: e.due_date,
    paidOn: e.paid_on,
    department: e.department,
  }));

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());

  const kpis: ExpenseKpis = {
    totalExpenses: rows.reduce((sum, r) => sum + r.amount, 0),
    thisMonth: rows.filter((r) => new Date(r.date) >= monthStart).reduce((sum, r) => sum + r.amount, 0),
    thisWeek: rows.filter((r) => new Date(r.date) >= weekStart).reduce((sum, r) => sum + r.amount, 0),
    pendingApproval: rows.filter((r) => r.status === "pending_approval").reduce((sum, r) => sum + r.amount, 0),
    overdue: rows
      .filter((r) => deriveDisplayStatus(r.status, r.paymentStatus, r.dueDate) === "overdue")
      .reduce((sum, r) => sum + r.amount, 0),
  };

  const categories = Array.from(new Set(rows.map((r) => r.category)));
  const paymentMethods = Array.from(new Set(rows.map((r) => r.paymentMethod).filter(Boolean))) as string[];
  const departments = Array.from(new Set(rows.map((r) => r.department).filter(Boolean))) as string[];

  const categoryTotals = new Map<string, number>();
  for (const r of rows) categoryTotals.set(r.category, (categoryTotals.get(r.category) ?? 0) + r.amount);
  const categoryBreakdown: CategorySlice[] = Array.from(categoryTotals.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  const { data: activityLogs } = await supabase
    .from("audit_logs")
    .select("id, action, entity_id, metadata, created_at")
    .eq("org_id", orgId)
    .eq("entity_type", "expenses")
    .order("created_at", { ascending: false })
    .limit(6);

  const expenseById = new Map(rows.map((r) => [r.id, r]));
  const recentActivity: ExpenseActivity[] = (activityLogs ?? [])
    .map((l) => {
      const meta = l.metadata as { expense_number?: number; category?: string } | null;
      const expense = l.entity_id ? expenseById.get(l.entity_id) : null;
      return {
        id: l.id,
        label: ACTIVITY_LABEL[l.action] ?? l.action,
        expenseNumber: expense?.expenseNumber ?? meta?.expense_number ?? 0,
        category: expense?.category ?? meta?.category ?? "—",
        createdAt: l.created_at,
      };
    })
    .filter((a) => a.expenseNumber > 0);

  return (
    <ExpenseListView
      expenses={rows}
      kpis={kpis}
      currency={context.currency}
      categories={categories}
      paymentMethods={paymentMethods}
      departments={departments}
      locations={(locations ?? []).map((l) => ({ id: l.id, name: l.name }))}
      categoryBreakdown={categoryBreakdown}
      recentActivity={recentActivity}
    />
  );
}