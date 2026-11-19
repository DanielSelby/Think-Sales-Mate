import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, GraduationCap, Link2, Mail, Phone, Unlink, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canProductTabPermission, canTabPermission } from "@/lib/rbac/permissions";
import { getProductAppPath } from "@/lib/product-app-routes";
import { linkEducationStaffToEmployee } from "../education-link-actions";
import {
  EMPLOYEE_STATUS_LABEL,
  EMPLOYEE_STATUS_TONE,
  EMPLOYMENT_TYPE_LABEL,
  EMPLOYMENT_TYPE_TONE,
  deriveEmployeeStatus,
  formatEmployeeCode,
} from "@/lib/hrm/format";

export default async function EmployeeProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ educationLink?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
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

  const [canViewEducationStaff, canEditEducationStaff, canEditHrmEmployee] = await Promise.all([
    canProductTabPermission("think-education", "education_staff", "staff", "directory", "view", context.orgId),
    canProductTabPermission("think-education", "education_staff", "staff", "directory", "edit", context.orgId),
    canTabPermission("hrm_payroll", "hrm", "employees", "edit", context.orgId),
  ]);
  const canManageEducationLink = canViewEducationStaff && canEditEducationStaff && canEditHrmEmployee;
  const [{ data: linkedStaff, error: linkedStaffError }, { data: availableStaff, error: availableStaffError }] = await Promise.all([
    canViewEducationStaff
      ? supabase.from("education_staff")
        .select("id, branch_id, staff_number, first_name, last_name, staff_category, status")
        .eq("org_id", context.orgId)
        .eq("hrm_employee_id", employee.id)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    canManageEducationLink
      ? supabase.from("education_staff")
        .select("id, branch_id, staff_number, first_name, last_name, staff_category, status")
        .eq("org_id", context.orgId)
        .is("hrm_employee_id", null)
        .order("last_name")
        .order("first_name")
        .limit(1000)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (linkedStaffError) throw new Error(`Could not load the linked Think Education staff record: ${linkedStaffError.message}`);
  if (availableStaffError) throw new Error(`Could not load available Think Education staff records: ${availableStaffError.message}`);

  const educationStaff = [...(linkedStaff ? [linkedStaff] : []), ...(availableStaff ?? [])];
  const branchIds = Array.from(new Set(educationStaff.map((staff) => staff.branch_id)));
  const { data: educationCampuses, error: campusesError } = branchIds.length
    ? await supabase.from("business_locations").select("id, name")
      .eq("org_id", context.orgId).in("id", branchIds)
    : { data: [], error: null };
  if (campusesError) throw new Error(`Could not load Think Education campus names: ${campusesError.message}`);
  const educationCampusNames = new Map((educationCampuses ?? []).map((campus) => [campus.id, campus.name]));

  const educationLinkMessage = query.educationLink === "saved"
    ? { text: "Think Education staff link updated.", tone: "success" as const }
    : query.educationLink === "linked"
      ? { text: "That staff record is already linked to another HRM employee.", tone: "error" as const }
      : query.educationLink === "mismatch"
        ? { text: "That staff record is no longer linked to this employee.", tone: "error" as const }
        : query.educationLink === "not-found"
          ? { text: "The selected Think Education staff record is no longer available.", tone: "error" as const }
          : query.educationLink === "invalid"
            ? { text: "Select a valid Think Education staff record.", tone: "error" as const }
            : query.educationLink === "save"
              ? { text: "The staff link could not be updated. Please try again.", tone: "error" as const }
              : null;

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

      {canViewEducationStaff && <Card accent="neutral">
        <CardHeader><CardTitle>Think Education staff record</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {educationLinkMessage && <p role={educationLinkMessage.tone === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${educationLinkMessage.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
            {educationLinkMessage.text}
          </p>}
          {linkedStaff ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ledger-100 p-4 dark:border-ledger-700">
            <div className="flex items-start gap-3">
              <GraduationCap className="mt-0.5 h-5 w-5 shrink-0 text-ledger-500" />
              <div>
                <Link href={getProductAppPath("think-education", `/staff/${linkedStaff.id}`)} className="font-semibold text-blue-700 hover:underline">
                  {linkedStaff.first_name} {linkedStaff.last_name}
                </Link>
                <p className="mt-1 text-sm text-ledger-500">
                  {linkedStaff.staff_number} · {educationCampusNames.get(linkedStaff.branch_id) ?? "Campus"} · {linkedStaff.staff_category.replace("_", " ")}
                </p>
              </div>
            </div>
            {canManageEducationLink && <form action={linkEducationStaffToEmployee}>
              <input type="hidden" name="employee_id" value={employee.id} />
              <input type="hidden" name="staff_id" value={linkedStaff.id} />
              <input type="hidden" name="link_action" value="unlink" />
              <button type="submit" className="inline-flex items-center gap-2 rounded-md border border-ledger-200 px-3 py-2 text-sm font-medium text-ledger-700 hover:bg-ledger-50 dark:border-ledger-700 dark:text-ledger-200 dark:hover:bg-white/[0.04]">
                <Unlink className="h-4 w-4" /> Unlink
              </button>
            </form>}
          </div> : <p className="rounded-lg border border-ledger-100 p-4 text-sm text-ledger-500 dark:border-ledger-700">
            No linked record is visible in your assigned Think Education campuses.
          </p>}

          <p className="text-sm text-ledger-500">This links the records for reference; employee compensation and payroll remain managed in HRM.</p>
          {canManageEducationLink && !linkedStaff && <form action={linkEducationStaffToEmployee} className="flex flex-col gap-3 sm:flex-row">
            <input type="hidden" name="employee_id" value={employee.id} />
            <input type="hidden" name="link_action" value="link" />
            <label className="min-w-0 flex-1 text-sm font-medium text-ledger-700 dark:text-ledger-200">
              Available staff
              <select required name="staff_id" defaultValue="" className="mt-1 w-full rounded-md border border-ledger-200 bg-white px-3 py-2 text-sm dark:border-ledger-700 dark:bg-ink-950">
                <option value="" disabled>Select a Think Education staff record</option>
                {(availableStaff ?? []).map((staff) => <option key={staff.id} value={staff.id}>
                  {staff.staff_number} · {staff.first_name} {staff.last_name} · {educationCampusNames.get(staff.branch_id) ?? "Campus"}
                </option>)}
              </select>
            </label>
            <button type="submit" disabled={!availableStaff?.length} className="inline-flex shrink-0 items-center justify-center gap-2 self-end rounded-md bg-ink-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-ink-950 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-ink-900">
              <Link2 className="h-4 w-4" /> Link record
            </button>
          </form>}
          {canManageEducationLink && !linkedStaff && availableStaff?.length === 1000 && <p className="text-xs text-amber-700">Showing the first 1,000 unlinked staff records in your assigned campuses.</p>}
        </CardContent>
      </Card>}

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
