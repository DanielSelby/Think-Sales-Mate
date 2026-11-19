"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canProductTabPermission, requireTabPermission } from "@/lib/rbac/permissions";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function linkEducationStaffToEmployee(formData: FormData) {
  await requireTabPermission("hrm_payroll", "hrm", "employees", "edit");
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");

  const employeeId = String(formData.get("employee_id") ?? "");
  const staffId = String(formData.get("staff_id") ?? "");
  const action = String(formData.get("link_action") ?? "link");
  if (!isUuid(employeeId) || !isUuid(staffId) || !["link", "unlink"].includes(action)) {
    const fallbackPath = isUuid(employeeId) ? `/hrm/${employeeId}` : "/hrm";
    redirect(`${fallbackPath}?educationLink=invalid`);
  }
  const profilePath = `/hrm/${employeeId}`;

  const [canViewEducationStaff, canEditEducationStaff] = await Promise.all([
    canProductTabPermission("think-education", "education_staff", "staff", "directory", "view", context.orgId),
    canProductTabPermission("think-education", "education_staff", "staff", "directory", "edit", context.orgId),
  ]);
  if (!canViewEducationStaff || !canEditEducationStaff) {
    throw new Error("You need Think Education staff view and edit permissions to manage this link.");
  }

  const supabase = await createClient();
  const { data: staff, error: staffError } = await supabase.from("education_staff")
    .select("id, hrm_employee_id")
    .eq("org_id", context.orgId)
    .eq("id", staffId)
    .maybeSingle();
  if (staffError) throw new Error(`Could not verify the Education staff record: ${staffError.message}`);
  if (!staff) redirect(`${profilePath}?educationLink=not-found`);

  if (action === "unlink" && staff.hrm_employee_id !== employeeId) {
    redirect(`${profilePath}?educationLink=mismatch`);
  }
  if (action === "link" && staff.hrm_employee_id && staff.hrm_employee_id !== employeeId) {
    redirect(`${profilePath}?educationLink=linked`);
  }

  const { error } = await supabase.rpc("education_staff_link_hrm_employee", {
    p_org_id: context.orgId,
    p_staff_id: staff.id,
    p_employee_id: action === "unlink" ? null : employeeId,
  });
  if (error) {
    if (error.code === "23505") redirect(`${profilePath}?educationLink=linked`);
    if (error.code === "P0002") redirect(`${profilePath}?educationLink=not-found`);
    if (error.code === "42501") {
      throw new Error(`The staff link was not authorized: ${error.message}`);
    }
    console.error("Could not update the HRM-to-Education staff link:", error.message);
    redirect(`${profilePath}?educationLink=save`);
  }

  revalidatePath(profilePath);
  revalidatePath("/education/staff");
  revalidatePath(`/education/staff/${staff.id}`);
  redirect(`${profilePath}?educationLink=saved`);
}
