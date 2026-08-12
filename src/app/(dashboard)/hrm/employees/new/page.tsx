import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { AddEmployeeForm } from "@/components/hrm/employees/add-employee-form";

export const metadata = { title: "Add Employee · SalesMate ERP" };

export default async function AddEmployeePage() {
  const context = await getCurrentOrgContext();
  if (!context) return null;

  const supabase = await createClient();
  const { data: employees } = await supabase.from("employees").select("department").eq("org_id", context.orgId);
  const departments = Array.from(new Set((employees ?? []).map((e) => e.department).filter(Boolean))) as string[];

  const defaultDepartments = departments.length > 0 ? departments : ["Operations", "Finance", "Sales & Marketing", "Human Resources", "IT"];

  return <AddEmployeeForm departments={defaultDepartments} />;
}