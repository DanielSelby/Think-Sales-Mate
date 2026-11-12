import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, BriefcaseBusiness, UserRound } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { recordEducationStaffEmployment, updateEducationStaffProfile } from "../../actions";

type SearchParams = Record<string, string | string[] | undefined>;

function getParam(params: SearchParams, key: string) {
  return typeof params[key] === "string" ? params[key] as string : "";
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function EducationStaffProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ staffId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_staff", "staff", "directory", "view")) {
    redirect("/dashboard?accessDenied=think-education.staff");
  }

  const [{ staffId }, query] = await Promise.all([params, searchParams]);
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  const supabase = await createClient();
  const { data: staff, error: staffError } = await supabase.from("education_staff")
    .select("id, branch_id, staff_number, first_name, last_name, other_names, email, phone, date_of_birth, address, emergency_contact_name, emergency_contact_phone, staff_category, department_id, job_title, status")
    .eq("org_id", context.orgId).eq("id", staffId).maybeSingle();
  if (staffError) throw new Error(`Could not load Think Education staff profile: ${staffError.message}`);
  if (!staff || !campusIds.includes(staff.branch_id)) notFound();

  const [canEdit, employmentResult] = await Promise.all([
    canTabPermission("education_staff", "staff", "directory", "edit"),
    supabase.from("education_staff_employment_records")
      .select("id, employment_type, job_title, department_name, effective_on, reason, created_at")
      .eq("org_id", context.orgId).eq("staff_id", staff.id)
      .order("effective_on", { ascending: false }).order("created_at", { ascending: false }).limit(50),
  ]);
  if (employmentResult.error) {
    throw new Error(`Could not load Think Education employment history: ${employmentResult.error.message}`);
  }
  const campusName = campuses.find((campus) => campus.id === staff.branch_id)?.name ?? "Campus";
  const { data: departments, error: departmentsError } = canEdit
    ? await supabase.from("education_departments").select("id, name")
      .eq("org_id", context.orgId).eq("is_active", true)
      .or(`branch_id.is.null,branch_id.eq.${staff.branch_id}`).order("name")
    : { data: [], error: null };
  if (departmentsError) throw new Error(`Could not load Think Education departments: ${departmentsError.message}`);

  const errorMessage = query.error === "invalid"
    ? "Check the profile or employment details and try again."
    : query.error === "history"
      ? "The effective date must be later than the latest employment entry."
      : query.error === "department"
        ? "The selected department is not available at this campus."
        : query.error === "save"
          ? "The staff details could not be saved. Please try again."
          : null;

  return <main className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
    <header>
      <Link href={getProductAppPath("think-education", "/staff")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Staff management
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-950">{staff.first_name} {staff.last_name}</h1>
      <p className="mt-1 text-sm text-slate-600">{staff.staff_number} · {campusName} · {label(staff.status)}</p>
    </header>

    {query.saved === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Staff profile saved.</p>}
    {query.employment === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Employment history recorded.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <UserRound className="h-5 w-5 text-blue-700" />
        <h2 className="text-lg font-bold text-slate-950">Personal and contact details</h2>
      </div>
      {canEdit ? <form action={updateEducationStaffProfile} className="mt-4 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="staff_id" value={staff.id} />
        <label className="text-sm font-medium text-slate-700">First name
          <input required name="first_name" maxLength={100} defaultValue={staff.first_name} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Last name
          <input required name="last_name" maxLength={100} defaultValue={staff.last_name} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Other names
          <input name="other_names" maxLength={100} defaultValue={staff.other_names ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Date of birth
          <input name="date_of_birth" type="date" max={new Date().toISOString().slice(0, 10)} defaultValue={staff.date_of_birth ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Email
          <input name="email" type="email" maxLength={254} defaultValue={staff.email ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Phone
          <input name="phone" type="tel" maxLength={32} defaultValue={staff.phone ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700 sm:col-span-2">Address
          <textarea name="address" maxLength={500} rows={2} defaultValue={staff.address ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Emergency contact
          <input name="emergency_contact_name" maxLength={120} defaultValue={staff.emergency_contact_name ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Emergency contact phone
          <input name="emergency_contact_phone" type="tel" maxLength={32} defaultValue={staff.emergency_contact_phone ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <div className="sm:col-span-2">
          <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Save profile</button>
        </div>
      </form> : <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-500">Other names</dt><dd className="font-medium text-slate-900">{staff.other_names || "—"}</dd></div>
        <div><dt className="text-slate-500">Date of birth</dt><dd className="font-medium text-slate-900">{staff.date_of_birth || "—"}</dd></div>
        <div><dt className="text-slate-500">Email</dt><dd className="font-medium text-slate-900">{staff.email || "—"}</dd></div>
        <div><dt className="text-slate-500">Phone</dt><dd className="font-medium text-slate-900">{staff.phone || "—"}</dd></div>
        <div className="sm:col-span-2"><dt className="text-slate-500">Address</dt><dd className="font-medium text-slate-900">{staff.address || "—"}</dd></div>
        <div><dt className="text-slate-500">Emergency contact</dt><dd className="font-medium text-slate-900">{staff.emergency_contact_name || "—"}</dd></div>
        <div><dt className="text-slate-500">Emergency phone</dt><dd className="font-medium text-slate-900">{staff.emergency_contact_phone || "—"}</dd></div>
      </dl>}
    </section>

    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <BriefcaseBusiness className="h-5 w-5 text-blue-700" />
        <h2 className="text-lg font-bold text-slate-950">Employment history</h2>
      </div>
      <p className="mt-1 text-sm text-slate-500">Changes are recorded in date order and retained as an audit history.</p>
      {employmentResult.data.length ? <ol className="mt-4 space-y-3">
        {employmentResult.data.map((record) => <li key={record.id} className="rounded-lg border border-slate-200 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold text-slate-900">{record.job_title}</h3>
            <time className="text-sm text-slate-500" dateTime={record.effective_on}>{record.effective_on}</time>
          </div>
          <p className="mt-1 text-sm text-slate-700">{label(record.employment_type)}{record.department_name ? ` · ${record.department_name}` : ""}</p>
          <p className="mt-2 text-sm text-slate-600">{record.reason}</p>
        </li>)}
      </ol> : <p className="mt-4 text-sm text-slate-500">No employment history has been recorded yet.</p>}

      {canEdit && <form action={recordEducationStaffEmployment} className="mt-5 grid gap-3 border-t border-slate-200 pt-5 sm:grid-cols-2">
        <input type="hidden" name="staff_id" value={staff.id} />
        <label className="text-sm font-medium text-slate-700">Employment type
          <select required name="employment_type" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="full_time">Full-time</option><option value="part_time">Part-time</option>
            <option value="contract">Contract</option><option value="temporary">Temporary</option><option value="casual">Casual</option>
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Job title
          <input required name="job_title" maxLength={120} defaultValue={staff.job_title ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Department
          <select name="department_id" defaultValue={staff.department_id ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">No department</option>
            {(departments ?? []).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Effective date
          <input required name="effective_on" type="date" max={new Date().toISOString().slice(0, 10)} defaultValue={new Date().toISOString().slice(0, 10)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700 sm:col-span-2">Reason for this employment record
          <textarea required name="reason" maxLength={1000} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <div className="sm:col-span-2">
          <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Record employment details</button>
        </div>
      </form>}
    </section>
  </main>;
}
