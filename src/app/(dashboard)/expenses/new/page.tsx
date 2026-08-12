import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { AddExpenseForm } from "@/components/expenses/add-expense-form";
import { getApprovers } from "@/app/(dashboard)/expenses/actions";

export const metadata = { title: "Add Expense · SalesMate ERP" };

export default async function AddExpensePage() {
  const context = await getCurrentOrgContext();
  if (!context) return null;

  const supabase = await createClient();
  const [{ data: locations }, { data: bankAccounts }, approvers] = await Promise.all([
    supabase.from("business_locations").select("id, name").eq("org_id", context.orgId).eq("is_active", true),
    supabase.from("bank_accounts").select("id, name").eq("org_id", context.orgId),
    getApprovers(),
  ]);

  return (
    <AddExpenseForm
      locations={(locations ?? []).map((l) => ({ id: l.id, name: l.name }))}
      bankAccounts={(bankAccounts ?? []).map((a) => ({ id: a.id, name: a.name }))}
      approvers={approvers}
      currency={context.currency}
      currentUserName={context.userEmail}
    />
  );
}