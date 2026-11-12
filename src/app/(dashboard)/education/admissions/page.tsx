import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ClipboardList, Plus, UserPlus } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { createEducationAdmission, updateEducationAdmissionStatus } from "../actions";

export default async function EducationAdmissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_admissions", "admissions", "applications", "view")) {
    redirect("/dashboard?accessDenied=think-education.admissions");
  }

  const params = await searchParams;
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const branchIds = campuses.map((campus) => campus.id);
  const [canCreate, canEdit, canApproveAction, canCreateStudent, canViewClasses] = await Promise.all([
    canTabPermission("education_admissions", "admissions", "applications", "create"),
    canTabPermission("education_admissions", "admissions", "applications", "edit"),
    canTabPermission("education_admissions", "admissions", "applications", "approve"),
    canTabPermission("education_students", "students", "list", "create"),
    canTabPermission("education_academics", "academics", "classes", "view"),
  ]);
  const canApprove = canEdit && canApproveAction;
  const canEnroll = canApprove && canCreateStudent && canViewClasses;
  const supabase = await createClient();
  let admissions: Array<{
    id: string;
    branch_id: string;
    application_number: string;
    applicant_first_name: string;
    applicant_last_name: string;
    applicant_email: string | null;
    applicant_phone: string | null;
    requested_class_id: string | null;
    decision_note: string | null;
    enrolled_student_id: string | null;
    status: string;
    applied_at: string;
  }> = [];
  let classes: Array<{
    id: string;
    branch_id: string;
    academic_year_id: string;
    name: string;
    level_name: string | null;
    stream_name: string | null;
    capacity: number | null;
  }> = [];
  if (branchIds.length) {
    const { data, error } = await supabase.from("education_admissions")
      .select("id, branch_id, application_number, applicant_first_name, applicant_last_name, applicant_email, applicant_phone, requested_class_id, decision_note, enrolled_student_id, status, applied_at")
      .eq("org_id", context.orgId).in("branch_id", branchIds)
      .order("applied_at", { ascending: false });
    if (error) throw new Error(`Could not load Think Education applications: ${error.message}`);
    admissions = data ?? [];
    if (canViewClasses) {
      const { data: activeYears, error: yearsError } = await supabase.from("education_academic_years")
        .select("id").eq("org_id", context.orgId).eq("status", "active");
      if (yearsError) throw new Error(`Could not load active Think Education academic years: ${yearsError.message}`);
      const activeYearIds = (activeYears ?? []).map((year) => year.id);
      if (activeYearIds.length) {
        const { data: classRows, error: classesError } = await supabase.from("education_classes")
          .select("id, branch_id, academic_year_id, name, level_name, stream_name, capacity")
          .eq("org_id", context.orgId).in("branch_id", branchIds)
          .in("academic_year_id", activeYearIds).eq("status", "active").order("name");
        if (classesError) throw new Error(`Could not load Think Education classes for admissions: ${classesError.message}`);
        classes = classRows ?? [];
      }
    }
  }
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const classNameById = new Map(classes.map((classroom) => [
    classroom.id,
    `${campusNameById.get(classroom.branch_id) ?? "Campus"} · ${classroom.name}${classroom.level_name ? ` (${classroom.level_name})` : ""}`,
  ]));
  const errorMessage = params.error === "duplicate"
    ? "That application number is already in use."
    : params.error === "invalid"
      ? "Check the application number, applicant name, email, and phone."
      : params.error === "student-number"
        ? "That student number is already in use, or the student is already enrolled for this year."
        : params.error === "capacity"
          ? "The selected class has reached capacity."
          : params.error === "transition"
            ? "This application cannot make that status change."
            : params.error === "class"
              ? "Choose an active class at the selected campus and academic year."
              : params.error === "not-found"
                ? "The application or class is no longer available."
                : params.error === "save" ? "The application could not be saved. Please try again." : null;

  return <main className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">Admissions</h1>
        <p className="mt-1 text-sm text-slate-600">Track applications and admission decisions across your assigned campuses.</p>
      </div>
      {canCreate && <a href="#new-application" className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
        <Plus className="h-4 w-4" /> New application
      </a>}
    </header>

    {params.created === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Application created.</p>}
    {params.updated === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Application status updated.</p>}
    {params.enrolled === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Applicant enrolled and added to the student directory.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

    <section className="grid gap-3 sm:grid-cols-3">
      {[
        { label: "Applications", value: admissions.length, icon: ClipboardList },
        { label: "Awaiting review", value: admissions.filter((item) => item.status === "pending" || item.status === "under_review").length, icon: UserPlus },
        { label: "Admitted", value: admissions.filter((item) => item.status === "admitted" || item.status === "enrolled").length, icon: UserPlus },
      ].map(({ label, value, icon: Icon }) => <article key={label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{value.toLocaleString()}</p></div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon className="h-5 w-5" /></span>
      </article>)}
    </section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {campuses.length === 0 ? <div className="p-8 text-center">
        <ClipboardList className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-3 font-semibold text-slate-900">No campus access assigned</h2>
        <p className="mt-1 text-sm text-slate-500">Ask an authorized Think Education administrator to assign your campus scope.</p>
      </div> : admissions.length === 0 ? <div className="p-8 text-center">
        <ClipboardList className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-3 font-semibold text-slate-900">No applications yet</h2>
        <p className="mt-1 text-sm text-slate-500">New applications will appear here.</p>
      </div> : <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-4 py-3">Application</th><th className="px-4 py-3">Applicant</th><th className="px-4 py-3">Campus / class</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Applied</th><th className="px-4 py-3">Status &amp; actions</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {admissions.map((application) => <tr key={application.id} className="align-top hover:bg-slate-50/70">
              <td className="whitespace-nowrap px-4 py-3 font-semibold text-blue-800">{application.application_number}</td>
              <td className="px-4 py-3 font-medium text-slate-900">{application.applicant_first_name} {application.applicant_last_name}</td>
              <td className="px-4 py-3 text-slate-600">{campusNameById.get(application.branch_id) ?? "Campus"}<br />{application.requested_class_id ? classNameById.get(application.requested_class_id)?.split(" · ").slice(1).join(" · ") ?? "Class selected" : "No class selected"}</td>
              <td className="px-4 py-3 text-slate-600">{application.applicant_email || application.applicant_phone || "—"}</td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-500">{new Date(application.applied_at).toLocaleDateString()}</td>
              <td className="px-4 py-3">
                <span className="inline-block rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold capitalize text-amber-800">{application.status.replace("_", " ")}</span>
                {application.decision_note && <p className="mt-2 max-w-xs text-xs text-slate-600">{application.decision_note}</p>}
                {application.enrolled_student_id && <p className="mt-2 text-xs font-medium text-emerald-800">Student record created</p>}
                {(application.status === "pending" && canEdit || application.status === "under_review" && canApprove) && <div className="mt-2 flex flex-wrap gap-2">
                  {application.status === "pending" && canEdit && <form action={updateEducationAdmissionStatus}>
                    <input type="hidden" name="admission_id" value={application.id} /><input type="hidden" name="status" value="under_review" />
                    <button className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">Start review</button>
                  </form>}
                  {application.status === "under_review" && canApprove && <>
                    <form action={updateEducationAdmissionStatus}>
                      <input type="hidden" name="admission_id" value={application.id} /><input type="hidden" name="status" value="admitted" />
                      <button className="rounded-md bg-emerald-700 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-800">Admit</button>
                    </form>
                    <form action={updateEducationAdmissionStatus} className="flex flex-col gap-1">
                      <input type="hidden" name="admission_id" value={application.id} /><input type="hidden" name="status" value="rejected" />
                      <input required name="decision_note" maxLength={1000} placeholder="Reason required" aria-label="Rejection reason" className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs" />
                      <button className="rounded-md border border-rose-300 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50">Reject</button>
                    </form>
                  </>}
                </div>}
                {application.status === "admitted" && canEnroll && <form action={updateEducationAdmissionStatus} className="mt-3 grid max-w-xs gap-2">
                  <input type="hidden" name="admission_id" value={application.id} /><input type="hidden" name="status" value="enrolled" />
                  <label className="text-xs font-medium text-slate-700">Student number
                    <input required name="student_number" maxLength={32} pattern="[A-Za-z0-9._/-]+" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs" />
                  </label>
                  <label className="text-xs font-medium text-slate-700">Active class
                    <select required name="class_id" defaultValue={application.requested_class_id ?? ""} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs">
                      <option value="" disabled>Select a class</option>
                      {classes.filter((classroom) => classroom.branch_id === application.branch_id).map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}{classroom.level_name ? ` · ${classroom.level_name}` : ""}{classroom.capacity ? ` (${classroom.capacity} capacity)` : ""}</option>)}
                    </select>
                  </label>
                  <button disabled={!classes.some((classroom) => classroom.branch_id === application.branch_id)} className="rounded-md bg-blue-700 px-2 py-1.5 text-xs font-semibold text-white enabled:hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300">Enroll and create student</button>
                </form>}
                {["pending", "under_review", "admitted"].includes(application.status) && canEdit && <form action={updateEducationAdmissionStatus} className="mt-2 flex flex-col gap-1">
                  <input type="hidden" name="admission_id" value={application.id} /><input type="hidden" name="status" value="withdrawn" />
                  <input required name="decision_note" maxLength={1000} placeholder="Withdrawal reason" aria-label="Withdrawal reason" className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs" />
                  <button className="self-start rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">Withdraw</button>
                </form>}
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>}
    </section>

    {canCreate && campuses.length > 0 && <section id="new-application" className="scroll-mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-950">Create application</h2>
      <p className="mt-1 text-sm text-slate-500">Record a prospective student application at an assigned campus.</p>
      <form action={createEducationAdmission} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-medium text-slate-700">Campus
          <select required name="branch_id" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">{campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select>
        </label>
        <label className="text-sm font-medium text-slate-700">Application number
          <input required name="application_number" maxLength={32} pattern="[A-Za-z0-9._/-]+" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Applicant first name
          <input required name="first_name" maxLength={100} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Applicant last name
          <input required name="last_name" maxLength={100} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Email
          <input name="email" type="email" maxLength={254} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Phone
          <input name="phone" type="tel" maxLength={32} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        {canViewClasses && <label className="text-sm font-medium text-slate-700">Requested class (optional)
          <select name="requested_class_id" defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">Not selected</option>
            {classes.map((classroom) => <option key={classroom.id} value={classroom.id}>{classNameById.get(classroom.id)}</option>)}
          </select>
        </label>}
        <div className="sm:col-span-2 lg:col-span-4"><button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Save application</button></div>
      </form>
    </section>}
  </main>;
}
