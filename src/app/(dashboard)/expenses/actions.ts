"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { formatExpenseNumber } from "@/lib/expenses/format";

export interface ExpenseItemInput {
  description: string;
  category: string | null;
  quantity: number;
  unitCost: number;
  taxAmount: number;
}

export interface CreateExpenseInput {
  category: string;
  vendor: string | null;
  department: string | null;
  locationId: string | null;
  paymentMethod: string | null;
  paymentAccount: string | null;
  transactionReference: string | null;
  currency: string;
  referenceNumber: string | null;
  purchaseOrderId: string | null;
  expenseDate: string;
  dueDate: string | null;
  notes: string | null;
  expenseType: string | null;
  tags: string[];
  approvalRequired: boolean;
  approverId: string | null;
  discountAmount: number;
  paymentStatus: "unpaid" | "paid";
  paidOn: string | null;
  items: ExpenseItemInput[];
  isRecurring: boolean;
  recurringFrequency: string | null;
  /** draft = not submitted; submitted = pending_approval (or auto-approved if approvalRequired is false) */
  action: "draft" | "submitted";
}

export interface CreateExpenseResult {
  ok: boolean;
  error?: string;
  expenseId?: string;
  expenseNumber?: string;
}

function nextRecurrenceDate(from: string, frequency: string): string {
  const d = new Date(from);
  switch (frequency) {
    case "Weekly": d.setDate(d.getDate() + 7); break;
    case "Monthly": d.setMonth(d.getMonth() + 1); break;
    case "Quarterly": d.setMonth(d.getMonth() + 3); break;
    case "Yearly": d.setFullYear(d.getFullYear() + 1); break;
  }
  return d.toISOString().slice(0, 10);
}

export async function createExpense(input: CreateExpenseInput): Promise<CreateExpenseResult> {
  if (!input.category) return { ok: false, error: "Select a category." };
  const items = input.items.filter((i) => i.description.trim() && i.quantity > 0);
  if (items.length === 0) return { ok: false, error: "Add at least one expense item." };

  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0);
  const taxAmount = items.reduce((sum, i) => sum + i.taxAmount, 0);
  const total = Math.max(0, subtotal + taxAmount - input.discountAmount);
  if (total <= 0) return { ok: false, error: "Total amount must be greater than zero." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "No active organization." };

  const status = input.action === "draft" ? "pending_approval" : input.approvalRequired ? "pending_approval" : "approved";

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      org_id: context.orgId,
      category: input.category,
      vendor: input.vendor,
      description: items[0]?.description ?? null,
      amount: total,
      expense_date: input.expenseDate,
      payment_method: input.paymentMethod,
      status,
      payment_status: input.paymentStatus,
      paid_on: input.paymentStatus === "paid" ? (input.paidOn ?? input.expenseDate) : null,
      department: input.department,
      location_id: input.locationId,
      due_date: input.dueDate,
      reference_number: input.referenceNumber,
      purchase_order_id: input.purchaseOrderId,
      currency: input.currency,
      tags: input.tags,
      expense_type: input.expenseType,
      approver_id: input.approverId,
      approval_required: input.approvalRequired,
      transaction_reference: input.transactionReference,
      discount_amount: input.discountAmount,
      is_recurring: input.isRecurring,
      recurring_frequency: input.isRecurring ? input.recurringFrequency : null,
      next_recurrence_date: input.isRecurring && input.recurringFrequency
        ? nextRecurrenceDate(input.expenseDate, input.recurringFrequency)
        : null,
      recorded_by: user.id,
    })
    .select("id, expense_number")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Couldn't create the expense." };

  const { error: itemsError } = await supabase.from("expense_items").insert(
    items.map((i) => ({
      expense_id: data.id,
      org_id: context.orgId,
      description: i.description,
      category: i.category,
      quantity: i.quantity,
      unit_cost: i.unitCost,
      tax_amount: i.taxAmount,
      line_total: i.quantity * i.unitCost + i.taxAmount,
    }))
  );

  if (itemsError) {
    await supabase.from("expenses").delete().eq("id", data.id);
    return { ok: false, error: itemsError.message };
  }

  await supabase.from("audit_logs").insert({
    org_id: context.orgId,
    actor_id: user.id,
    action: input.action === "draft" ? "expense.created" : "expense.submitted",
    entity_type: "expenses",
    entity_id: data.id,
    metadata: { expense_number: data.expense_number, amount: total, category: input.category },
  });

  revalidatePath("/expenses");
  return { ok: true, expenseId: data.id, expenseNumber: formatExpenseNumber(data.expense_number) };
}

// ---------------------------------------------------------------------------
// Supporting data for the Add Expense form
// ---------------------------------------------------------------------------

export interface ApproverOption {
  id: string;
  name: string;
}

export async function getApprovers(): Promise<ApproverOption[]> {
  const context = await getCurrentOrgContext();
  if (!context) return [];
  const supabase = createClient();

  const { data: members } = await supabase
    .from("organization_members")
    .select("user_id, role")
    .eq("org_id", context.orgId)
    .eq("status", "active")
    .in("role", ["owner", "admin", "manager"]);

  const userIds = (members ?? []).map((m) => m.user_id).filter((id): id is string => Boolean(id));
  if (userIds.length === 0) return [];

  const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? "Unknown"]));

  return userIds.map((id) => ({ id, name: nameById.get(id) ?? "Unknown" }));
}

export interface PurchaseOrderOption {
  id: string;
  label: string;
}

export async function searchPurchaseOrdersForExpense(query: string): Promise<PurchaseOrderOption[]> {
  const context = await getCurrentOrgContext();
  if (!context) return [];
  const supabase = createClient();
  const { data } = await supabase
    .from("purchases")
    .select("id, purchase_number, supplier:suppliers ( name )")
    .eq("org_id", context.orgId)
    .order("purchase_date", { ascending: false })
    .limit(50);

  const rows = (data ?? []).map((p) => ({
    id: p.id,
    label: `PO-${new Date().getFullYear()}-${String(p.purchase_number).padStart(5, "0")} — ${(p.supplier as { name: string } | null)?.name ?? ""}`,
  }));

  const q = query.trim().toLowerCase();
  if (!q) return rows.slice(0, 8);
  return rows.filter((r) => r.label.toLowerCase().includes(q)).slice(0, 8);
}

export interface BudgetStatus {
  hasBudget: boolean;
  monthlyLimit: number;
  spentThisMonth: number;
  remaining: number;
  percentUsed: number;
}

export async function getBudgetStatus(category: string): Promise<BudgetStatus> {
  const context = await getCurrentOrgContext();
  if (!context) return { hasBudget: false, monthlyLimit: 0, spentThisMonth: 0, remaining: 0, percentUsed: 0 };

  const supabase = createClient();
  const { data: categoryRow } = await supabase
    .from("expense_categories")
    .select("budget_limit")
    .eq("org_id", context.orgId)
    .eq("name", category)
    .maybeSingle();

  if (!categoryRow?.budget_limit) return { hasBudget: false, monthlyLimit: 0, spentThisMonth: 0, remaining: 0, percentUsed: 0 };

  const monthStart = new Date();
  monthStart.setDate(1);
  const { data: spent } = await supabase
    .from("expenses")
    .select("amount")
    .eq("org_id", context.orgId)
    .eq("category", category)
    .gte("expense_date", monthStart.toISOString().slice(0, 10));

  const spentThisMonth = (spent ?? []).reduce((sum, e) => sum + e.amount, 0);
  return {
    hasBudget: true,
    monthlyLimit: categoryRow.budget_limit,
    spentThisMonth,
    remaining: Math.max(0, categoryRow.budget_limit - spentThisMonth),
    percentUsed: Math.min(100, Math.round((spentThisMonth / categoryRow.budget_limit) * 100)),
  };
}

export interface RecentExpenseSummary {
  id: string;
  expenseNumber: number;
  category: string;
  amount: number;
  date: string;
}

export async function getRecentExpensesForCategory(category: string): Promise<RecentExpenseSummary[]> {
  const context = await getCurrentOrgContext();
  if (!context) return [];
  const supabase = createClient();
  const { data } = await supabase
    .from("expenses")
    .select("id, expense_number, category, amount, expense_date")
    .eq("org_id", context.orgId)
    .eq("category", category)
    .order("expense_date", { ascending: false })
    .limit(5);

  return (data ?? []).map((e) => ({
    id: e.id,
    expenseNumber: e.expense_number,
    category: e.category,
    amount: e.amount,
    date: e.expense_date,
  }));
}

export interface SimpleResult {
  ok: boolean;
  error?: string;
}

async function logExpenseAction(orgId: string, actorId: string, action: string, expenseId: string, metadata: Record<string, unknown>) {
  const supabase = createClient();
  await supabase.from("audit_logs").insert({ org_id: orgId, actor_id: actorId, action, entity_type: "expenses", entity_id: expenseId, metadata });
}

export async function approveExpense(expenseId: string): Promise<SimpleResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: expense, error: fetchError } = await supabase.from("expenses").select("org_id, expense_number").eq("id", expenseId).single();
  if (fetchError || !expense) return { ok: false, error: "Expense not found." };

  const { error } = await supabase.from("expenses").update({ status: "approved", approved_by: user.id, approved_at: new Date().toISOString() }).eq("id", expenseId);
  if (error) return { ok: false, error: error.message };

  await logExpenseAction(expense.org_id, user.id, "expense.approved", expenseId, { expense_number: expense.expense_number });
  revalidatePath("/expenses");
  return { ok: true };
}

export async function rejectExpense(expenseId: string, reason?: string): Promise<SimpleResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: expense, error: fetchError } = await supabase.from("expenses").select("org_id, expense_number").eq("id", expenseId).single();
  if (fetchError || !expense) return { ok: false, error: "Expense not found." };

  const { error } = await supabase.from("expenses").update({ status: "rejected", approved_by: user.id, approved_at: new Date().toISOString() }).eq("id", expenseId);
  if (error) return { ok: false, error: error.message };

  await logExpenseAction(expense.org_id, user.id, "expense.rejected", expenseId, { expense_number: expense.expense_number, reason });
  revalidatePath("/expenses");
  return { ok: true };
}

export async function markExpensePaid(expenseId: string, paidOn?: string): Promise<SimpleResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: expense, error: fetchError } = await supabase.from("expenses").select("org_id, expense_number, status").eq("id", expenseId).single();
  if (fetchError || !expense) return { ok: false, error: "Expense not found." };
  if (expense.status !== "approved") return { ok: false, error: "Only approved expenses can be marked as paid." };

  const { error } = await supabase.from("expenses").update({ payment_status: "paid", paid_on: paidOn ?? new Date().toISOString().slice(0, 10) }).eq("id", expenseId);
  if (error) return { ok: false, error: error.message };

  await logExpenseAction(expense.org_id, user.id, "expense.paid", expenseId, { expense_number: expense.expense_number });
  revalidatePath("/expenses");
  return { ok: true };
}

export async function deleteExpense(expenseId: string): Promise<SimpleResult> {
  const supabase = createClient();
  const { error } = await supabase.from("expenses").delete().eq("id", expenseId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/expenses");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Bulk operations
// ---------------------------------------------------------------------------

export interface BulkResult {
  ok: boolean;
  error?: string;
  affected?: number;
}

export async function bulkApproveExpenses(ids: string[]): Promise<BulkResult> {
  if (ids.length === 0) return { ok: false, error: "No expenses selected." };
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { error } = await supabase.from("expenses").update({ status: "approved", approved_by: user.id, approved_at: new Date().toISOString() }).in("id", ids);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/expenses");
  return { ok: true, affected: ids.length };
}

export async function bulkDeleteExpenses(ids: string[]): Promise<BulkResult> {
  if (ids.length === 0) return { ok: false, error: "No expenses selected." };
  const supabase = createClient();
  const { error } = await supabase.from("expenses").delete().in("id", ids);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/expenses");
  return { ok: true, affected: ids.length };
}

// ---------------------------------------------------------------------------
// Recurring expenses — there's no scheduler wired up in this app, so this
// is a manual "run now" action rather than an automatic daily job. Wire it
// to a cron (Supabase Edge Function on a schedule, or a Vercel Cron hitting
// a route that calls this) to make it actually automatic.
// ---------------------------------------------------------------------------

export interface GenerateRecurringResult {
  ok: boolean;
  error?: string;
  created?: number;
}

export async function generateDueRecurringExpenses(): Promise<GenerateRecurringResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "No active organization." };

  const today = new Date().toISOString().slice(0, 10);
  const { data: due } = await supabase
    .from("expenses")
    .select("*")
    .eq("org_id", context.orgId)
    .eq("is_recurring", true)
    .lte("next_recurrence_date", today);

  if (!due || due.length === 0) return { ok: true, created: 0 };

  let created = 0;
  for (const template of due) {
    const { error: insertError } = await supabase.from("expenses").insert({
      org_id: template.org_id,
      category: template.category,
      vendor: template.vendor,
      description: template.description,
      amount: template.amount,
      expense_date: today,
      payment_method: template.payment_method,
      status: "pending_approval",
      department: template.department,
      location_id: template.location_id,
      is_recurring: false,
      parent_expense_id: template.id,
      recorded_by: user.id,
    });
    if (!insertError) {
      created += 1;
      await supabase
        .from("expenses")
        .update({ next_recurrence_date: nextRecurrenceDate(today, template.recurring_frequency ?? "Monthly") })
        .eq("id", template.id);
    }
  }

  revalidatePath("/expenses");
  return { ok: true, created };
}