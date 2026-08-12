"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import type { EmploymentType } from "@/types/database";

export interface SimpleResult {
  ok: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

export async function createEmployee(formData: FormData) {
  const fullName      = String(formData.get("full_name") ?? "").trim();
  const email         = String(formData.get("email") ?? "").trim() || null;
  const phone         = String(formData.get("phone") ?? "").trim() || null;
  const jobTitle      = String(formData.get("job_title") ?? "").trim() || null;
  const department    = String(formData.get("department") ?? "").trim() || null;
  const monthlySalary = Number(formData.get("monthly_salary") ?? 0);
  const hireDate      = String(formData.get("hire_date") ?? new Date().toISOString().slice(0, 10));
  const status        = (formData.get("status") as "active" | "inactive") ?? "active";

  if (!fullName) redirect("/hrm/new?error=Employee+name+is+required");
  if (monthlySalary <= 0) redirect("/hrm/new?error=Enter+a+valid+monthly+salary");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/hrm/new?error=You+must+be+signed+in");

  const context = await getCurrentOrgContext();
  if (!context) redirect("/hrm/new?error=No+active+organization");

  const { data, error } = await supabase
    .from("employees")
    .insert({
      org_id:          context.orgId,
      full_name:       fullName,
      email,
      phone,
      job_title:       jobTitle,
      department,
      employment_type: "full_time",
      monthly_salary:  monthlySalary,
      hire_date:       hireDate,
      status,
      created_by:      user.id,
    })
    .select("id, employee_number")
    .single();

  if (error || !data) redirect(`/hrm/new?error=${encodeURIComponent(error?.message ?? "Could not create employee")}`);

  await supabase.from("audit_logs").insert({
    org_id:      context.orgId,
    actor_id:    user.id,
    action:      "employee.created",
    entity_type: "employees",
    entity_id:   data.id,
    metadata:    { name: fullName },
  });

  revalidatePath("/hrm");
  redirect("/hrm");
}

export async function setEmployeeStatus(employeeId: string, status: "active" | "inactive"): Promise<SimpleResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("employees").update({ status, on_leave_until: null }).eq("id", employeeId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/hrm");
  revalidatePath("/hrm/employees");
  return { ok: true };
}

export async function setEmployeeOnLeave(employeeId: string, untilDate: string): Promise<SimpleResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("employees").update({ on_leave_until: untilDate }).eq("id", employeeId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/hrm");
  revalidatePath("/hrm/employees");
  return { ok: true };
}

export async function deleteEmployee(employeeId: string): Promise<SimpleResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("employees").delete().eq("id", employeeId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/hrm");
  revalidatePath("/hrm/employees");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Process Payroll
// ---------------------------------------------------------------------------

export interface ProcessPayrollInput {
  payrollType: string;
  periodStart: string;
  periodEnd: string;
  paymentDate: string;
  /** Flat percentage applied to gross pay. This is NOT a real statutory tax
   * calculation (PAYE/SSNIT etc.) — just a configurable rate, since correct
   * tax rules are jurisdiction-specific and shouldn't be guessed at. */
  deductionRatePercent: number;
  /** A flat pool added on top of gross pay (bonuses, allowances). */
  allowancesTotal: number;
  /** Optional employer-side cost on top of gross (e.g. employer pension
   * contribution) — left at 0 unless you enter one; not auto-calculated. */
  employerContribution: number;
}

export interface ProcessPayrollResult extends SimpleResult {
  payrollRunId?: string;
}

export async function processPayroll(input: ProcessPayrollInput): Promise<ProcessPayrollResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "No active organization." };

  const { data: employees, error: employeesError } = await supabase
    .from("employees")
    .select("id, full_name, monthly_salary")
    .eq("org_id", context.orgId)
    .eq("status", "active");

  if (employeesError) return { ok: false, error: employeesError.message };
  if (!employees || employees.length === 0) return { ok: false, error: "No active employees to pay." };

  const grossPay = employees.reduce((sum, e) => sum + e.monthly_salary, 0);
  const deductions = Math.round(grossPay * (input.deductionRatePercent / 100) * 100) / 100;
  const netPay = grossPay - deductions + input.allowancesTotal;
  const employerCost = grossPay + input.employerContribution;

  const { data: run, error: runError } = await supabase
    .from("payroll_runs")
    .insert({
      org_id: context.orgId,
      period_label: `${input.periodStart} – ${input.periodEnd}`,
      period_month: input.periodStart.slice(0, 7),
      status: "completed",
      payroll_type: input.payrollType,
      pay_period_start: input.periodStart,
      pay_period_end: input.periodEnd,
      payment_date: input.paymentDate,
      total_amount: netPay,
      gross_pay: grossPay,
      deductions,
      allowances: input.allowancesTotal,
      employer_cost: employerCost,
      net_pay: netPay,
      employee_count: employees.length,
      processed_by: user.id,
      processed_at: new Date().toISOString(),
      run_by: user.id,
    })
    .select("id")
    .single();

  if (runError || !run) return { ok: false, error: runError?.message ?? "Couldn't create the payroll run." };

  const items = employees.map((e) => {
    const share = e.monthly_salary / grossPay;
    const empDeductions = Math.round(deductions * share * 100) / 100;
    const empNet = Math.round((e.monthly_salary - empDeductions + input.allowancesTotal * share) * 100) / 100;
    return {
      payroll_run_id: run.id,
      org_id: context.orgId,
      employee_id: e.id,
      employee_name: e.full_name,
      basic_pay: e.monthly_salary,
      deductions: empDeductions,
      net_pay: empNet,
      amount: empNet,
    };
  });

  const { error: itemsError } = await supabase.from("payroll_run_items").insert(items);
  if (itemsError) {
    await supabase.from("payroll_runs").delete().eq("id", run.id);
    return { ok: false, error: itemsError.message };
  }

  // Post a linked expense so this shows up in Accounting/Expenses too.
  const { data: expense } = await supabase
    .from("expenses")
    .insert({
      org_id: context.orgId,
      category: "Salaries",
      vendor: "Payroll",
      description: `Payroll — ${input.periodStart} to ${input.periodEnd}`,
      amount: netPay,
      expense_date: input.paymentDate,
      payment_method: "Bank Transfer",
      status: "approved",
      payment_status: "unpaid",
      recorded_by: user.id,
    })
    .select("id")
    .single();

  if (expense) {
    await supabase.from("payroll_runs").update({ expense_id: expense.id }).eq("id", run.id);
  }

  await supabase.from("audit_logs").insert({
    org_id: context.orgId,
    actor_id: user.id,
    action: "payroll.processed",
    entity_type: "payroll_runs",
    entity_id: run.id,
    metadata: { employee_count: employees.length, net_pay: netPay },
  });

  revalidatePath("/hrm");
  revalidatePath("/expenses");
  return { ok: true, payrollRunId: run.id };
}


export async function updateEmployee(employeeId: string, formData: FormData) {
  const context = await getCurrentOrgContext();
  if (!context) {
    redirect("/hrm?error=Session+expired");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .update({
      full_name:      String(formData.get("full_name") ?? "").trim(),
      email:          String(formData.get("email") ?? "").trim() || null,
      phone:          String(formData.get("phone") ?? "").trim() || null,
      job_title:      String(formData.get("job_title") ?? "").trim() || null,
      department:     String(formData.get("department") ?? "").trim() || null,
      monthly_salary: Number(formData.get("monthly_salary") ?? 0),
      hire_date:      String(formData.get("hire_date") ?? ""),
      status:         (formData.get("status") as "active" | "inactive") ?? "active",
    })
    .eq("id", employeeId)
    .eq("org_id", context.orgId);

  if (error) {
    redirect(`/hrm/${employeeId}/edit?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/hrm");
  redirect("/hrm");
}