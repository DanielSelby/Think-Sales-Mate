import Link from "next/link";
import { cookies } from "next/headers";
import { Plus, Wallet } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { EmployeesTable, type EmployeeRow } from "@/components/hrm/employees-table";

export default async function HrmPage() {
  const activeOrgId = cookies().get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  if (!can(context.role, "hrm.view")) {
    return (
      <div className="mx-auto max-w-2xl rounded-card border border-dashed border-ledger-200 bg-white p-10 text-center dark:border-ledger-700 dark:bg-ink-900">
        <p className="text-sm text-ledger-500 dark:text-ledger-400">
          Employee and payroll data is restricted to managers and above.
        </p>
      </div>
    );
  }

  const supabase = createClient();
  const { data: rows } = await supabase
    .from("employees")
    .select("id, full_name, job_title, department, monthly_salary, status")
    .eq("org_id", context.orgId)
    .order("full_name");

  const employees: EmployeeRow[] = (rows ?? []).map((e) => ({
    id: e.id,
    fullName: e.full_name,
    jobTitle: e.job_title,
    department: e.department,
    monthlySalary: e.monthly_salary,
    status: e.status
  }));

  const canManage = can(context.role, "hrm.manage");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">Employees</h1>
          <p className="text-sm text-ledger-500 dark:text-ledger-400">
            {employees.length} employee{employees.length === 1 ? "" : "s"} at {context.orgName}.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/hrm/payroll">
            <Button variant="outline">
              <Wallet className="h-4 w-4" />
              Payroll
            </Button>
          </Link>
          {canManage && (
            <Link href="/hrm/new">
              <Button>
                <Plus className="h-4 w-4" />
                Add employee
              </Button>
            </Link>
          )}
        </div>
      </div>

      <EmployeesTable employees={employees} canManage={canManage} />
    </div>
  );
}