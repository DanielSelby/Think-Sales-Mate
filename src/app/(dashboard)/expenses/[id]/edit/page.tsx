import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { AddExpenseForm, type ExpenseEditInitialValues } from "@/components/expenses/add-expense-form";
import { getApprovers } from "@/app/(dashboard)/expenses/actions";

export const metadata = { title: "Edit Expense · SalesMate ERP" };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditExpensePage({ params }: PageProps) {
  const { id } = await params;

  const context = await getCurrentOrgContext();
  if (!context) return null;

  const supabase = await createClient();

  const { data: expense, error } = await supabase
    .from("expenses")
    .select(`
      id, status, payment_status, category, vendor, department, location_id, expense_date, due_date,
      reference_number, purchase_order_id, expense_type, tags, approval_required, approver_id,
      payment_method, transaction_reference, currency, discount_amount, is_recurring, recurring_frequency
    `)
    .eq("id", id)
    .eq("org_id", context.orgId)
    .single();

  if (error || !expense) {
    notFound();
  }

  const { data: items } = await supabase
    .from("expense_items")
    .select("description, category, quantity, unit_cost, tax_amount")
    .eq("expense_id", id);

  const [{ data: locations }, { data: bankAccounts }, approvers] = await Promise.all([
    supabase.from("business_locations").select("id, name").eq("org_id", context.orgId).eq("is_active", true),
    supabase.from("bank_accounts").select("id, name").eq("org_id", context.orgId),
    getApprovers(),
  ]);

  let selectedPo: { id: string; label: string } | null = null;
  if (expense.purchase_order_id) {
    const { data: po } = await supabase
      .from("purchases")
      .select("id, purchase_number, supplier:suppliers ( name )")
      .eq("id", expense.purchase_order_id)
      .maybeSingle();
    if (po) {
      const supplierName = (po.supplier as { name: string } | null)?.name ?? "";
      selectedPo = {
        id: po.id,
        label: `PO-${new Date().getFullYear()}-${String(po.purchase_number).padStart(5, "0")}${supplierName ? ` — ${supplierName}` : ""}`,
      };
    }
  }

  const initialValues: ExpenseEditInitialValues = {
    status: expense.status,
    paymentStatus: expense.payment_status,
    dueDate: expense.due_date,
    expenseDate: expense.expense_date,
    reference: expense.reference_number ?? "",
    category: expense.category,
    department: expense.department ?? "",
    vendor: expense.vendor ?? "",
    locationId: expense.location_id ?? "",
    selectedPo,
    expenseType: expense.expense_type ?? "",
    tags: expense.tags ?? [],
    approvalRequired: expense.approval_required,
    approverId: expense.approver_id ?? "",
    paymentMethod: expense.payment_method ?? "",
    paymentAccount: "",
    transactionReference: expense.transaction_reference ?? "",
    expenseCurrency: expense.currency ?? context.currency,
    discountAmount: expense.discount_amount,
    isRecurring: expense.is_recurring,
    recurringFrequency: expense.recurring_frequency ?? "",
    items: (items ?? []).map((i) => ({
      description: i.description,
      category: i.category ?? "",
      quantity: i.quantity,
      unitCost: i.unit_cost,
      taxAmount: i.tax_amount,
    })),
  };

  return (
    <AddExpenseForm
      mode="edit"
      expenseId={id}
      initialValues={initialValues}
      locations={(locations ?? []).map((l) => ({ id: l.id, name: l.name }))}
      bankAccounts={(bankAccounts ?? []).map((a) => ({ id: a.id, name: a.name }))}
      approvers={approvers}
      currency={context.currency}
      currentUserName={context.userEmail}
    />
  );
}