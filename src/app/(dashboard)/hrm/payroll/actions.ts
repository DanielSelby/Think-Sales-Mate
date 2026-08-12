"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";

function redirectWithError(message: string): never {
  redirect(`/hrm/payroll?error=${encodeURIComponent(message)}`);
}

function currentPeriod() {
  const now = new Date();
  const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const periodLabel = now.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  return { periodMonth, periodLabel };
}

export async function runPayroll(): Promise<void> {
  const context = await getCurrentOrgContext();
  if (!context) redirectWithError("Your session expired — please sign in again.");
  if (!can(context.role, "hrm.manage")) {
    redirectWithError("You don't have permission to run payroll.");
  }

  const supabase = await createClient();
  const { periodMonth, periodLabel } = currentPeriod();

  const { data: existingRun } = await supabase
    .from("payroll_runs")
    .select("id")
    .eq("org_id", context.orgId)
    .eq("period_month", periodMonth)
    .maybeSingle();

  if (existingRun) {
    redirectWithError(`Payroll for ${periodLabel} has already been run.`);
  }

  const { data: employees, error: employeesError } = await supabase
    .from("employees")
    .select("id, full_name, monthly_salary")
    .eq("org_id", context.orgId)
    .eq("status", "active");

  if (employeesError) redirectWithError(employeesError.message);
  if (!employees || employees.length === 0) {
    redirectWithError("Add at least one active employee before running payroll.");
  }

  const totalAmount = employees.reduce((sum, e) => sum + Number(e.monthly_salary), 0);

  const { data: expense, error: expenseError } = await supabase
    .from("expenses")
    .insert({
      org_id: context.orgId,
      category: "salaries",
      description: `Payroll — ${periodLabel}`,
      amount: totalAmount,
      expense_date: new Date().toISOString().slice(0, 10),
      recorded_by: context.userId
    })
    .select("id")
    .single();

  if (expenseError || !expense) {
    redirectWithError(expenseError?.message ?? "Could not record the payroll expense.");
  }

  const { data: run, error: runError } = await supabase
    .from("payroll_runs")
    .insert({
      org_id: context.orgId,
      period_label: periodLabel,
      period_month: periodMonth,
      total_amount: totalAmount,
      employee_count: employees.length,
      expense_id: expense.id,
      run_by: context.userId
    })
    .select("id")
    .single();

  if (runError || !run) {
    redirectWithError(runError?.message ?? "Could not create the payroll run.");
  }

  const itemRows = employees.map((e) => ({
    payroll_run_id: run.id,
    org_id: context.orgId,
    employee_id: e.id,
    employee_name: e.full_name,
    amount: e.monthly_salary
  }));

  const { error: itemsError } = await supabase.from("payroll_run_items").insert(itemRows);
  if (itemsError) redirectWithError(itemsError.message);

  revalidatePath("/hrm/payroll");
  revalidatePath("/accounting");
  revalidatePath("/accounting/expenses");
  revalidatePath("/dashboard");
  redirect(`/hrm/payroll/${run.id}`);
}