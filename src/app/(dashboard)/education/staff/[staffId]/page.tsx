import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, BriefcaseBusiness, FileText, GraduationCap, UserRound } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { EducationRecordSwitcher } from "../../record-switcher";
import {
  recordEducationStaffEmployment,
  saveEducationStaffContract,
  saveEducationStaffQualification,
  updateEducationStaffProfile,
} from "../../actions";

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
  const switchSearch = getParam(query, "switchSearch").trim().slice(0, 80);
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  const supabase = await createClient();
  const { data: staff, error: staffError } = await supabase.from("education_staff")
    .select("id, branch_id, staff_number, first_name, last_name, other_names, email, phone, date_of_birth, address, emergency_contact_name, emergency_contact_phone, staff_category, department_id, job_title, status, photo_path")
    .eq("org_id", context.orgId).eq("id", staffId).maybeSingle();
  if (staffError) throw new Error(`Could not load Think Education staff profile: ${staffError.message}`);
  if (!staff || !campusIds.includes(staff.branch_id)) notFound();

  let staffPhotoUrl: string | null = null;
  if (staff.photo_path) {
    const { data: photo, error: photoError } = await supabase.storage
      .from("education-staff-images")
      .createSignedUrl(staff.photo_path, 60 * 60);
    if (photoError) {
      console.error("Could not load Think Education staff photo:", photoError.message);
      throw new Error("The staff photo could not be loaded.");
    }
    staffPhotoUrl = photo.signedUrl;
  }

  const [canEdit, canViewDocuments, employmentResult, qualificationsResult, contractsResult] = await Promise.all([
    canTabPermission("education_staff", "staff", "directory", "edit"),
    canTabPermission("education_documents", "documents", "library", "view"),
    supabase.from("education_staff_employment_records")
      .select("id, employment_type, job_title, department_name, effective_on, reason, created_at")
      .eq("org_id", context.orgId).eq("staff_id", staff.id)
      .order("effective_on", { ascending: false }).order("created_at", { ascending: false }).limit(50),
    supabase.from("education_staff_qualifications")
      .select("id, qualification, institution, field_of_study, awarded_on, expires_on, created_at")
      .eq("org_id", context.orgId).eq("staff_id", staff.id)
      .order("awarded_on", { ascending: false }).order("created_at", { ascending: false }).limit(50),
    supabase.from("education_staff_contracts")
      .select("id, contract_type, reference_number, position_title, start_on, end_on, status, notes, created_at")
      .eq("org_id", context.orgId).eq("staff_id", staff.id)
      .order("start_on", { ascending: false }).order("created_at", { ascending: false }).limit(50),
  ]);
  if (employmentResult.error) {
    throw new Error(`Could not load Think Education employment history: ${employmentResult.error.message}`);
  }
  if (qualificationsResult.error) throw new Error(`Could not load Think Education qualifications: ${qualificationsResult.error.message}`);
  if (contractsResult.error) throw new Error(`Could not load Think Education contracts: ${contractsResult.error.message}`);
  const campusName = campuses.find((campus) => campus.id === staff.branch_id)?.name ?? "Campus";
  const safeSwitchSearch = switchSearch.replace(/[^A-Za-z0-9\s_-]/g, "");
  let switchQuery = supabase.from("education_staff")
    .select("id, staff_number, first_name, last_name, branch_id, staff_category, status")
    .eq("org_id", context.orgId)
    .in("branch_id", campusIds)
    .order("last_name")
    .order("first_name")
    .limit(50);
  if (safeSwitchSearch) {
    const pattern = `%${safeSwitchSearch}%`;
    switchQuery = switchQuery.or(`staff_number.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern}`);
  } else if (switchSearch) {
    switchQuery = switchQuery.eq("id", "00000000-0000-0000-0000-000000000000");
  }
  const { data: staffSwitchRows, error: staffSwitchError } = await switchQuery;
  if (staffSwitchError) throw new Error(`Could not load staff profile search results: ${staffSwitchError.message}`);
  const staffSwitchRecords = (staffSwitchRows ?? []).map((member) => ({
    id: member.id,
    label: `${member.staff_number} · ${member.first_name} ${member.last_name} · ${campuses.find((campus) => campus.id === member.branch_id)?.name ?? "Campus"} · ${label(member.status)}`,
    href: getProductAppPath("think-education", `/staff/${member.id}`),
  }));
  const { data: departments, error: departmentsError } = canEdit
    ? await supabase.from("education_departments").select("id, name")
      .eq("org_id", context.orgId).eq("is_active", true)
      .or(`branch_id.is.null,branch_id.eq.${staff.branch_id}`).order("name")
    : { data: [], error: null };
  if (departmentsError) throw new Error(`Could not load Think Education departments: ${departmentsError.message}`);

  const errorMessage = query.error === "invalid"
    ? "Check the profile, employment, qualification, or contract details and try again."
    : query.error === "history"
      ? "The effective date must be later than the latest employment entry."
      : query.error === "department"
        ? "The selected department is not available at this campus."
        : query.error === "save"
          ? "The staff details could not be saved. Please try again."
          : query.error === "not-found"
            ? "The staff record or related HR record is no longer available."
          : query.error === "photo-invalid"
            ? "Choose a valid JPEG, PNG, or WebP staff photo no larger than 5 MB."
          : null;

  return <main className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
    <header>
      <Link href={getProductAppPath("think-education", "/staff")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Staff management
      </Link>
      <EducationRecordSwitcher
        key={staff.id}
        recordType="staff"
        searchPath={getProductAppPath("think-education", `/staff/${staff.id}`)}
        search={switchSearch}
        records={staffSwitchRecords}
      />
        <div className="mt-3 flex items-center gap-4">
          <span
            role="img"
            aria-label={`${staff.first_name} ${staff.last_name} photo`}
            className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full border border-slate-200 bg-blue-50 bg-cover bg-center text-2xl font-semibold text-blue-700"
            style={staffPhotoUrl ? { backgroundImage: `url(${JSON.stringify(staffPhotoUrl)})` } : undefined}
          >
            {!staffPhotoUrl && <UserRound className="h-9 w-9" />}
          </span>
          <div>
            <h1 className="text-2xl font-bold text-slate-950">{staff.first_name} {staff.last_name}</h1>
            <p className="mt-1 text-sm text-slate-600">{staff.staff_number} · {campusName} · {label(staff.status)}</p>
            {canViewDocuments && <Link href={getProductAppPath("think-education", `/documents?search=${encodeURIComponent(staff.staff_number)}`)} className="mt-2 inline-flex rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-800 hover:bg-blue-100">View staff documents</Link>}
          </div>
        </div>
    </header>

    {query.saved === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Staff profile saved.</p>}
    {query.photo === "upload" && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">The staff profile was saved, but the photo could not be uploaded.</p>}
    {query.photo === "save" && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">The staff profile was saved, but the photo could not be attached.</p>}
    {query.photo === "cleanup" && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">The new staff photo was saved, but the previous photo could not be removed.</p>}
    {query.employment === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Employment history recorded.</p>}
    {query.qualification === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Qualification saved.</p>}
    {query.contract === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Contract saved.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <UserRound className="h-5 w-5 text-blue-700" />
        <h2 className="text-lg font-bold text-slate-950">Personal and contact details</h2>
      </div>
      {canEdit ? <form action={updateEducationStaffProfile} encType="multipart/form-data" className="mt-4 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="staff_id" value={staff.id} />
        <label className="text-sm font-medium text-slate-700 sm:col-span-2">Staff photo
          <input name="staff_photo" type="file" accept="image/jpeg,image/png,image/webp" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          <span className="mt-1 block text-xs font-normal text-slate-500">JPEG, PNG, or WebP; maximum 5 MB.</span>
        </label>
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

    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <GraduationCap className="h-5 w-5 text-blue-700" />
        <h2 className="text-lg font-bold text-slate-950">Qualifications</h2>
      </div>
      <p className="mt-1 text-sm text-slate-500">Record credentials and validity dates. Store supporting files in Documents &amp; Records under the staff category.</p>
      {qualificationsResult.data.length ? <ul className="mt-4 space-y-3">
        {qualificationsResult.data.map((record) => <li key={record.id} className="rounded-lg border border-slate-200 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold text-slate-900">{record.qualification}</h3>
            <span className="text-sm text-slate-500">{record.awarded_on ? `Awarded ${record.awarded_on}` : "Award date not recorded"}</span>
          </div>
          <p className="mt-1 text-sm text-slate-700">{[record.institution, record.field_of_study].filter(Boolean).join(" · ") || "Institution and field not recorded"}</p>
          {record.expires_on && <p className="mt-1 text-xs text-slate-500">Expires {record.expires_on}</p>}
          {canEdit && <details className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold text-blue-700">Edit qualification</summary>
            <form action={saveEducationStaffQualification} className="mt-3 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="staff_id" value={staff.id} />
              <input type="hidden" name="qualification_id" value={record.id} />
              <label className="text-sm font-medium text-slate-700">Qualification
                <input required name="qualification" maxLength={160} defaultValue={record.qualification} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <label className="text-sm font-medium text-slate-700">Institution
                <input name="institution" maxLength={160} defaultValue={record.institution ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <label className="text-sm font-medium text-slate-700">Field of study
                <input name="field_of_study" maxLength={160} defaultValue={record.field_of_study ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <label className="text-sm font-medium text-slate-700">Awarded on
                <input name="awarded_on" type="date" defaultValue={record.awarded_on ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <label className="text-sm font-medium text-slate-700">Expires on
                <input name="expires_on" type="date" defaultValue={record.expires_on ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <div className="flex items-end"><button type="submit" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">Save qualification</button></div>
            </form>
          </details>}
        </li>)}
      </ul> : <p className="mt-4 text-sm text-slate-500">No qualifications recorded.</p>}
      {canEdit && <form action={saveEducationStaffQualification} className="mt-5 grid gap-3 border-t border-slate-200 pt-5 sm:grid-cols-2">
        <input type="hidden" name="staff_id" value={staff.id} />
        <input type="hidden" name="qualification_id" value="" />
        <label className="text-sm font-medium text-slate-700">Qualification
          <input required name="qualification" maxLength={160} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Institution
          <input name="institution" maxLength={160} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Field of study
          <input name="field_of_study" maxLength={160} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Awarded on
          <input name="awarded_on" type="date" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Expires on
          <input name="expires_on" type="date" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <div className="flex items-end"><button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Add qualification</button></div>
      </form>}
    </section>

    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5 text-blue-700" />
        <h2 className="text-lg font-bold text-slate-950">Contract records</h2>
      </div>
      <p className="mt-1 text-sm text-slate-500">Track contract dates and status without duplicating compensation or payroll managed by HRM.</p>
      {contractsResult.data.length ? <ul className="mt-4 space-y-3">
        {contractsResult.data.map((record) => <li key={record.id} className="rounded-lg border border-slate-200 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold text-slate-900">{record.position_title}</h3>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">{label(record.status)}</span>
          </div>
          <p className="mt-1 text-sm text-slate-700">{label(record.contract_type)}{record.reference_number ? ` · ${record.reference_number}` : ""}</p>
          <p className="mt-1 text-sm text-slate-500">{record.start_on} to {record.end_on ?? "No end date"}</p>
          {record.notes && <p className="mt-2 text-sm text-slate-600">{record.notes}</p>}
          {canEdit && <details className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold text-blue-700">Edit contract</summary>
            <form action={saveEducationStaffContract} className="mt-3 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="staff_id" value={staff.id} />
              <input type="hidden" name="contract_id" value={record.id} />
              <label className="text-sm font-medium text-slate-700">Contract type
                <select name="contract_type" defaultValue={record.contract_type} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
                  <option value="permanent">Permanent</option><option value="fixed_term">Fixed term</option><option value="temporary">Temporary</option><option value="casual">Casual</option><option value="consultant">Consultant</option>
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">Status
                <select name="status" defaultValue={record.status} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
                  <option value="draft">Draft</option><option value="active">Active</option><option value="completed">Completed</option><option value="terminated">Terminated</option>
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">Position
                <input required name="position_title" maxLength={120} defaultValue={record.position_title} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <label className="text-sm font-medium text-slate-700">Reference number
                <input name="reference_number" maxLength={80} defaultValue={record.reference_number ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <label className="text-sm font-medium text-slate-700">Start date
                <input required name="start_on" type="date" defaultValue={record.start_on} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <label className="text-sm font-medium text-slate-700">End date
                <input name="end_on" type="date" defaultValue={record.end_on ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">Notes
                <textarea name="notes" maxLength={1000} rows={2} defaultValue={record.notes ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <div className="sm:col-span-2"><button type="submit" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">Save contract</button></div>
            </form>
          </details>}
        </li>)}
      </ul> : <p className="mt-4 text-sm text-slate-500">No contract records recorded.</p>}
      {canEdit && <form action={saveEducationStaffContract} className="mt-5 grid gap-3 border-t border-slate-200 pt-5 sm:grid-cols-2">
        <input type="hidden" name="staff_id" value={staff.id} />
        <input type="hidden" name="contract_id" value="" />
        <label className="text-sm font-medium text-slate-700">Contract type
          <select name="contract_type" defaultValue="permanent" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="permanent">Permanent</option><option value="fixed_term">Fixed term</option><option value="temporary">Temporary</option><option value="casual">Casual</option><option value="consultant">Consultant</option>
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Status
          <select name="status" defaultValue="draft" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="draft">Draft</option><option value="active">Active</option><option value="completed">Completed</option><option value="terminated">Terminated</option>
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Position
          <input required name="position_title" maxLength={120} defaultValue={staff.job_title ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Reference number
          <input name="reference_number" maxLength={80} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Start date
          <input required name="start_on" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">End date
          <input name="end_on" type="date" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700 sm:col-span-2">Notes
          <textarea name="notes" maxLength={1000} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <div className="sm:col-span-2"><button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Add contract</button></div>
      </form>}
    </section>
  </main>;
}
