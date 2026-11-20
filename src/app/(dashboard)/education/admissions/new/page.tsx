import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, UserPlus } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { createEducationAdmission } from "../../actions";
import { EducationSubmitButton } from "../../submit-button";

export default async function NewEducationAdmissionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");

  const [canCreate, canViewClasses] = await Promise.all([
    canTabPermission("education_admissions", "admissions", "applications", "create"),
    canTabPermission("education_academics", "academics", "classes", "view"),
  ]);
  if (!canCreate) redirect(getProductAppPath("think-education", "/admissions"));

  const params = await searchParams;
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  const classes: Array<{
    id: string;
    branch_id: string;
    name: string;
    level_name: string | null;
  }> = [];
  if (canViewClasses && campusIds.length) {
    const supabase = await createClient();
    const { data: activeYears, error: yearsError } = await supabase.from("education_academic_years")
      .select("id").eq("org_id", context.orgId).eq("status", "active");
    if (yearsError) throw new Error(`Could not load active Think Education academic years: ${yearsError.message}`);
    const activeYearIds = (activeYears ?? []).map((year) => year.id);
    if (activeYearIds.length) {
      const { data, error } = await supabase.from("education_classes")
        .select("id, branch_id, name, level_name")
        .eq("org_id", context.orgId).in("branch_id", campusIds)
        .in("academic_year_id", activeYearIds).eq("status", "active").order("name");
      if (error) throw new Error(`Could not load active Think Education classes: ${error.message}`);
      classes.push(...(data ?? []));
    }
  }
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const classOptions = classes.map((classroom) => ({
    ...classroom,
    label: `${campusNameById.get(classroom.branch_id) ?? "Campus"} · ${classroom.name}${classroom.level_name ? ` (${classroom.level_name})` : ""}`,
  }));
  const errorMessage = params.error === "duplicate"
    ? "That application number is already in use."
    : params.error === "invalid"
      ? "Check the application number, applicant name, email, and phone."
      : params.error === "class"
        ? "Choose an active class at the selected campus and academic year."
        : params.error === "save"
          ? "The application could not be saved. Please try again."
          : null;

  return <main className="mx-auto w-full max-w-[1100px] space-y-6 p-4 md:p-6 xl:p-8">
    <header>
      <Link href={getProductAppPath("think-education", "/admissions")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Admissions list
      </Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">New admission applicant</h1>
      <p className="mt-1 text-sm leading-6 text-slate-600">Create an application for a prospective student at one of your assigned campuses.</p>
    </header>

    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

    {campuses.length === 0 ? <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
      No campus access is assigned to your account. Ask an authorized Think Education administrator to assign your campus scope.
    </section> : <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
      <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950"><UserPlus className="h-5 w-5 text-blue-700" /> Applicant details</h2>
      <form action={createEducationAdmission} className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm font-medium text-slate-700">Campus
          <select required name="branch_id" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal">
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">An application number will be generated automatically when you save.</p>
        <label className="text-sm font-medium text-slate-700">Applicant first name
          <input required name="first_name" maxLength={100} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Applicant last name
          <input required name="last_name" maxLength={100} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Other names
          <input name="other_names" maxLength={100} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Date of birth
          <input name="date_of_birth" type="date" max={new Date().toISOString().slice(0, 10)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Gender
          <input name="gender" maxLength={50} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Home address
          <textarea name="address" maxLength={500} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Email
          <input name="email" type="email" maxLength={254} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Phone
          <input name="phone" type="tel" maxLength={32} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
        </label>
        <fieldset className="rounded-lg border border-slate-200 p-4 sm:col-span-2 lg:col-span-3">
          <legend className="px-1 text-sm font-semibold text-slate-800">Guardian details (optional)</legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">First name
              <input name="guardian_first_name" maxLength={100} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
            </label>
            <label className="text-sm font-medium text-slate-700">Last name
              <input name="guardian_last_name" maxLength={100} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
            </label>
            <label className="text-sm font-medium text-slate-700">Email
              <input name="guardian_email" type="email" maxLength={254} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
            </label>
            <label className="text-sm font-medium text-slate-700">Phone
              <input name="guardian_phone" type="tel" maxLength={40} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
            </label>
            <label className="text-sm font-medium text-slate-700">Relationship
              <input name="guardian_relationship" maxLength={60} placeholder="Parent, guardian, etc." className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
            </label>
          </div>
          <p className="mt-3 text-xs text-slate-500">When supplied, the guardian record and a pending student relationship are created together during enrollment.</p>
        </fieldset>
        {canViewClasses && <label className="text-sm font-medium text-slate-700">Requested class (optional)
          <select name="requested_class_id" defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal">
            <option value="">Not selected</option>
            {classOptions.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.label}</option>)}
          </select>
        </label>}
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-3">
          <EducationSubmitButton
            pendingLabel="Saving application..."
            className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-70"
          >
            Save application
          </EducationSubmitButton>
          <Link href={getProductAppPath("think-education", "/admissions")} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</Link>
        </div>
      </form>
    </section>}
  </main>;
}
