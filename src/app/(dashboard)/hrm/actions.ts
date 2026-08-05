"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";

function redirectWithError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function parseEmployeeForm(formData: FormData) {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const jobTitle = String(formData.get("job_title") ?? "").trim();
  const department = String(formData.get("department") ?? "").trim();
  const monthlySalary = Number(formData.get("monthly_salary"));
  const hireDate = String(formData.get("hire_date") ?? "").trim();
  const status = String(formData.get("status") ?? "active").trim() as "active" | "inactive";

  return {
    full_name: fullName,
    email: email || null,
    phone: phone || null,
    job_title: jobTitle || null,
    department: department || null,
    monthly_salary: monthlySalary,
    hire_date: hireDate || new Date().toISOString().slice(0, 10),
    status
  };
}

export async function createEmployee(formData: FormData): Promise<void> {
  const context = await getCurrentOrgContext();
  if (!context) redirectWithError("/hrm/new", "Your session expired — please sign in again.");
  if (!can(context.role, "hrm.manage")) {
    redirectWithError("/hrm/new", "You don't have permission to add employees.");
  }

  const fields = parseEmployeeForm(formData);
  if (!fields.full_name) redirectWithError("/hrm/new", "Name is required.");
  if (Number.isNaN(fields.monthly_salary) || fields.monthly_salary < 0) {
    redirectWithError("/hrm/new", "Enter a valid monthly salary.");
  }

  const supabase = createClient();
  const { error } = await supabase.from("employees").insert({
    org_id: context.orgId,
    created_by: context.userId,
    ...fields
  });

  if (error) redirectWithError("/hrm/new", error.message);

  revalidatePath("/hrm");
  redirect("/hrm");
}

export async function updateEmployee(employeeId: string, formData: FormData): Promise<void> {
  const context = await getCurrentOrgContext();
  if (!context) redirectWithError(`/hrm/${employeeId}/edit`, "Your session expired — please sign in again.");
  if (!can(context.role, "hrm.manage")) {
    redirectWithError(`/hrm/${employeeId}/edit`, "You don't have permission to edit employees.");
  }

  const fields = parseEmployeeForm(formData);
  if (!fields.full_name) redirectWithError(`/hrm/${employeeId}/edit`, "Name is required.");

  const supabase = createClient();
  const { error } = await supabase
    .from("employees")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", employeeId)
    .eq("org_id", context.orgId);

  if (error) redirectWithError(`/hrm/${employeeId}/edit`, error.message);

  revalidatePath("/hrm");
  redirect("/hrm");
}

export async function deleteEmployee(employeeId: string) {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "hrm.manage")) {
    return { error: "You don't have permission to remove employees." };
  }

  const supabase = createClient();
  const { error } = await supabase.from("employees").delete().eq("id", employeeId).eq("org_id", context.orgId);
  if (error) return { error: error.message };

  revalidatePath("/hrm");
  return { success: true };
}