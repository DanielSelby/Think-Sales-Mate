import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { EmployeeForm } from "@/components/hrm/employee-form";
import { updateEmployee } from "@/app/(dashboard)/hrm/actions";

export default async function EditEmployeePage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = createClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("id, full_name, email, phone, job_title, department, monthly_salary, hire_date, status")
    .eq("id", params.id)
    .eq("org_id", context.orgId)
    .single();

  if (!employee) notFound();

  const boundUpdate = updateEmployee.bind(null, employee.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/hrm" className="inline-flex items-center gap-1 text-sm text-ledger-500 hover:text-ink-900 dark:hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to employees
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink-900 dark:text-white">Edit {employee.full_name}</h1>
      </div>

      <EmployeeForm action={boundUpdate} initialValues={employee} error={searchParams.error} submitLabel="Save changes" />
    </div>
  );
}