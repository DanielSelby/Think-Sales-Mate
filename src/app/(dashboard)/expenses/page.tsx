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

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ location?: string; category?: string; view?: string }> }) {
  const context = await getCurrentOrgContext();
  if (!context) return null;
  const filters = await searchParams;

  const orgId = context.orgId;
  const supabase = await createClient();
  const view = ["approvals", "recurring", "budgets", "reports", "attachments", "settings"].includes(filters.view ?? "")
    ? filters.view as "approvals" | "recurring" | "budgets" | "reports" | "attachments" | "settings"
    : "list";

  const requestedLocationId = context.masterLocationId ?? (filters.location && filters.location !== "all" ? filters.location : null);
  let expensesQuery = supabase.from("expenses").select("*").eq("org_id", orgId).order("expense_date", { ascending: false });

  if (context.isBranchScoped && context.allowedLocationIds.length > 0) {
    if (requestedLocationId && context.allowedLocationIds.includes(requestedLocationId)) {
      expensesQuery = expensesQuery.eq("location_id", requestedLocationId);
    } else {
      expensesQuery = expensesQuery.in("location_id", context.allowedLocationIds);
    }
  } else if (requestedLocationId) {
    expensesQuery = expensesQuery.eq("location_id", requestedLocationId);
  }

  if (!context.canViewOtherTransactions) {
    expensesQuery = expensesQuery.eq("recorded_by", context.userId);
  }

  const [{ data: expenses, error: expensesError }, { data: locations }, { data: budgetCategories, error: budgetsError }] = await Promise.all([
    expensesQuery,
    supabase.from("business_locations").select("id, name").eq("org_id", orgId).eq("is_active", true),
    supabase.from("expense_categories").select("name, budget_limit").eq("org_id", orgId).not("budget_limit", "is", null).order("name"),
  ]);
  if (expensesError) throw new Error(`Could not load expenses: ${expensesError.message}`);
  if (budgetsError) throw new Error(`Could not load expense budgets: ${budgetsError.message}`);

  const rawLocations = locations ?? [];
  const scopedLocations = context.isBranchScoped && context.allowedLocationIds.length > 0
    ? rawLocations.filter((l) => context.allowedLocationIds.includes(l.id))
    : rawLocations;

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
    isRecurring: e.is_recurring,
    recurringFrequency: e.recurring_frequency,
    nextRecurrenceDate: e.next_recurrence_date,
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

  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const budgetRows = (budgetCategories ?? [])
    .filter((budget) => Number(budget.budget_limit) > 0)
    .map((budget) => {
    const monthExpenses = rows.filter((row) => row.category === budget.name && row.date.slice(0, 7) === currentMonthKey);
    return {
      category: budget.name,
      monthlyLimit: Number(budget.budget_limit),
      monthSpend: monthExpenses.reduce((sum, row) => sum + row.amount, 0),
      transactions: monthExpenses.length,
    };
  });

  let attachments: {
    id: string;
    expenseId: string;
    expenseNumber: number;
    category: string;
    fileName: string;
    contentType: string;
    fileSize: number;
    createdAt: string;
    url: string | null;
    linkError: string | null;
  }[] = [];
  if (view === "attachments" && rows.length > 0) {
    const allowedExpenses = new Map(rows.map((row) => [row.id, row]));
    const { data: attachmentRows, error: attachmentError } = await supabase
      .from("expense_attachments")
      .select("id, expense_id, storage_path, file_name, content_type, file_size, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (attachmentError) throw new Error(`Could not load expense attachments: ${attachmentError.message}`);
    const visibleAttachments = (attachmentRows ?? []).filter((attachment: { expense_id: string }) =>
      allowedExpenses.has(attachment.expense_id)
    );
    if (visibleAttachments.length > 0) {
      const { data: signedUrls, error: signedUrlError } = await supabase.storage
        .from("expense-attachments")
        .createSignedUrls(visibleAttachments.map((attachment: { storage_path: string }) => attachment.storage_path), 60 * 60);
      if (signedUrlError) throw new Error(`Could not create expense attachment links: ${signedUrlError.message}`);
      const signedUrlByPath = new Map((signedUrls ?? []).map((entry) => [entry.path, {
        url: entry.signedUrl,
        error: entry.error,
      }]));
      attachments = visibleAttachments.flatMap((attachment: {
        id: string; expense_id: string; storage_path: string; file_name: string;
        content_type: string; file_size: number; created_at: string;
      }) => {
        const expense = allowedExpenses.get(attachment.expense_id);
        const signedLink = signedUrlByPath.get(attachment.storage_path);
        return expense ? [{
          id: attachment.id,
          expenseId: expense.id,
          expenseNumber: expense.expenseNumber,
          category: expense.category,
          fileName: attachment.file_name,
          contentType: attachment.content_type,
          fileSize: Number(attachment.file_size),
          createdAt: attachment.created_at,
          url: signedLink?.url ?? null,
          linkError: signedLink?.error ?? (signedLink ? null : "Could not create a secure file link."),
        }] : [];
      });
    }
  }

  return (
    <ExpenseListView
      key={view}
      expenses={rows}
      kpis={kpis}
      currency={context.currency}
      initialCategory={filters.category === "payroll" ? "payroll" : "all"}
      categories={categories}
      paymentMethods={paymentMethods}
      departments={departments}
      locations={scopedLocations.map((l) => ({ id: l.id, name: l.name }))}
      categoryBreakdown={categoryBreakdown}
      recentActivity={recentActivity}
      view={view}
      budgets={budgetRows}
      attachments={attachments}
    />
  );
}