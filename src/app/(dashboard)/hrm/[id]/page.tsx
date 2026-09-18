import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Mail, Phone, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import {
  EMPLOYEE_STATUS_LABEL,
  EMPLOYEE_STATUS_TONE,
  EMPLOYMENT_TYPE_LABEL,
  EMPLOYMENT_TYPE_TONE,
  deriveEmployeeStatus,
  formatEmployeeCode,
} from "@/lib/hrm/format";

export default async function EmployeeProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getCurrentOrgContext();
  if (!context) return null;

  const supabase = await createClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("*")
    .eq("id", id)
    .eq("org_id", context.orgId)
    .maybeSingle();
  if (!employee) notFound();
  const { data: location } = employee.location_id
    ? await supabase.from("business_locations").select("name").eq("id", employee.location_id).eq("org_id", context.orgId).maybeSingle()
    : { data: null };

  const displayStatus = deriveEmployeeStatus(employee.status, employee.on_leave_until);
  const initials = employee.full_name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="space-y-5">
      <Link href="/hrm/employees" className="inline-flex items-center gap-1 text-sm text-ledger-500 hover:text-ink-900 dark:hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back to employees
      </Link>

      <Card accent="neutral">
        <CardContent className="flex flex-wrap items-center gap-4 p-5">
          {employee.avatar_url ? (
            <img src={employee.avatar_url} alt="" className="h-20 w-20 rounded-full object-cover" />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-ink-900 text-xl font-semibold text-white dark:bg-white dark:text-ink-900">{initials}</div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">{employee.full_name}</h1>
            <p className="mt-1 text-sm text-ledger-500">{employee.job_title ?? "Employee"} · {formatEmployeeCode(employee.employee_number)}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone={EMPLOYEE_STATUS_TONE[displayStatus]}>{EMPLOYEE_STATUS_LABEL[displayStatus]}</Badge>
              <Badge tone={EMPLOYMENT_TYPE_TONE[employee.employment_type]}>{EMPLOYMENT_TYPE_LABEL[employee.employment_type]}</Badge>
            </div>
          </div>
          <Link href={`/hrm/${employee.id}/edit`} className="inline-flex h-9 items-center rounded-md bg-ink-900 px-4 text-sm font-medium text-white hover:bg-ink-950 dark:bg-white dark:text-ink-900">Edit employee</Link>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card accent="neutral">
          <CardHeader><CardTitle>Overview</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Info label="Department" value={employee.department ?? "Not assigned"} />
            <Info label="Assigned branch" value={location?.name ?? "Not assigned"} />
            <Info label="Join date" value={new Date(employee.hire_date).toLocaleDateString("en-GH")} icon={<CalendarDays className="h-4 w-4" />} />
            <Info label="Monthly salary" value={`${context.currency} ${employee.monthly_salary.toLocaleString("en-GH", { minimumFractionDigits: 2 })}`} icon={<WalletCards className="h-4 w-4" />} />
          </CardContent>
        </Card>
        <Card accent="neutral">
          <CardHeader><CardTitle>Contact information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Info label="Email" value={employee.email ?? "Not provided"} icon={<Mail className="h-4 w-4" />} />
            <Info label="Phone" value={employee.phone ?? "Not provided"} icon={<Phone className="h-4 w-4" />} />
          </CardContent>
        </Card>
      </div>

      <Card accent="neutral">
        <CardHeader><CardTitle>Employee records</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/hrm/attendance" className="rounded-lg border border-ledger-100 p-4 text-sm font-medium hover:bg-ledger-50 dark:border-ledger-700 dark:hover:bg-white/[0.04]">Attendance</Link>
          <Link href="/hrm/leave" className="rounded-lg border border-ledger-100 p-4 text-sm font-medium hover:bg-ledger-50 dark:border-ledger-700 dark:hover:bg-white/[0.04]">Leave</Link>
          <Link href="/hrm/performance-reviews" className="rounded-lg border border-ledger-100 p-4 text-sm font-medium hover:bg-ledger-50 dark:border-ledger-700 dark:hover:bg-white/[0.04]">Performance</Link>
          <Link href="/hrm/payroll" className="rounded-lg border border-ledger-100 p-4 text-sm font-medium hover:bg-ledger-50 dark:border-ledger-700 dark:hover:bg-white/[0.04]">Payroll</Link>
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-ledger-400">{label}</p>
      <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-ink-900 dark:text-white">{icon}{value}</p>
    </div>
  );
}
