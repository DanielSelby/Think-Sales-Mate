import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { ExpenseDetailView, type ExpenseDetail, type ExpenseDetailItem } from "@/components/expenses/expense-detail-view";

export const metadata = { title: "Expense Details · SalesMate ERP" };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ExpenseDetailPage({ params }: PageProps) {
  const { id } = await params;

  const context = await getCurrentOrgContext();
  if (!context) return null;

  const supabase = await createClient();

  const { data: expense, error } = await supabase
    .from("expenses")
    .select(`
      id, expense_number, status, payment_status, category, vendor, description, amount, currency,
      expense_date, due_date, paid_on, payment_method, transaction_reference, reference_number,
      department, location_id, purchase_order_id, expense_type, tags, approval_required, approver_id,
      approved_by, approved_at, discount_amount, is_recurring, recurring_frequency, next_recurrence_date,
      recorded_by, created_at,
      location:business_locations ( name )
    `)
    .eq("id", id)
    .eq("org_id", context.orgId)
    .single();

  if (error || !expense) {
    notFound();
  }

  const { data: items } = await supabase
    .from("expense_items")
    .select("id, description, category, quantity, unit_cost, tax_amount, line_total")
    .eq("expense_id", id);

  // Names for approver / decider / creator — no FK to profiles declared on
  // these columns, so resolved as a separate lookup (same pattern used on
  // the purchases pages).
  const profileIds = Array.from(
    new Set([expense.approver_id, expense.approved_by, expense.recorded_by].filter(Boolean))
  ) as string[];
  const { data: profiles } = profileIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", profileIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? "Unknown"]));

  let purchaseOrderLabel: string | null = null;
  if (expense.purchase_order_id) {
    const { data: po } = await supabase
      .from("purchases")
      .select("purchase_number, supplier:suppliers ( name )")
      .eq("id", expense.purchase_order_id)
      .maybeSingle();
    if (po) {
      const supplierName = (po.supplier as { name: string } | null)?.name ?? "";
      purchaseOrderLabel = `PO-${new Date().getFullYear()}-${String(po.purchase_number).padStart(5, "0")}${supplierName ? ` — ${supplierName}` : ""}`;
    }
  }

  const location = expense.location as { name: string } | null;

  const detail: ExpenseDetail = {
    id: expense.id,
    expenseNumber: expense.expense_number,
    status: expense.status,
    paymentStatus: expense.payment_status,
    category: expense.category,
    vendor: expense.vendor,
    description: expense.description,
    amount: expense.amount,
    currency: expense.currency ?? context.currency,
    expenseDate: expense.expense_date,
    dueDate: expense.due_date,
    paidOn: expense.paid_on,
    paymentMethod: expense.payment_method,
    transactionReference: expense.transaction_reference,
    referenceNumber: expense.reference_number,
    department: expense.department,
    locationName: location?.name ?? null,
    purchaseOrderLabel,
    expenseType: expense.expense_type,
    tags: expense.tags ?? [],
    approvalRequired: expense.approval_required,
    approverName: expense.approver_id ? nameById.get(expense.approver_id) ?? "Unknown" : null,
    approvedByName: expense.approved_by ? nameById.get(expense.approved_by) ?? "Unknown" : null,
    approvedAt: expense.approved_at,
    discountAmount: expense.discount_amount,
    isRecurring: expense.is_recurring,
    recurringFrequency: expense.recurring_frequency,
    nextRecurrenceDate: expense.next_recurrence_date,
    createdByName: nameById.get(expense.recorded_by) ?? "Unknown",
    createdAt: expense.created_at,
    items: (items ?? []).map((i): ExpenseDetailItem => ({
      id: i.id,
      description: i.description,
      category: i.category,
      quantity: i.quantity,
      unitCost: i.unit_cost,
      taxAmount: i.tax_amount,
      lineTotal: i.line_total,
    })),
  };

  return <ExpenseDetailView expense={detail} />;
}