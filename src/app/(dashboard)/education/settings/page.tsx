import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Settings } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { saveEducationInstitutionSettings } from "../actions";

const INSTITUTION_TYPES = [
  ["basic", "Basic education"],
  ["primary", "Primary school"],
  ["junior_high", "Junior high school"],
  ["senior_high", "Senior high school"],
  ["college", "College"],
  ["university", "University"],
  ["technical_vocational", "Technical / vocational"],
  ["training", "Training institution"],
  ["other", "Other"],
] as const;

const TERMINOLOGY_FIELDS = [
  { key: "student", label: "Student", name: "Student" },
  { key: "staff", label: "Staff member", name: "Staff" },
  { key: "class", label: "Class / group", name: "Class" },
  { key: "academic_year", label: "Academic year", name: "Academic year" },
] as const;

export default async function EducationSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_settings", "settings", "institution", "view")) {
    redirect("/dashboard?accessDenied=think-education.settings");
  }

  const params = await searchParams;
  const [{ hasOrganizationScope }, supabase] = await Promise.all([
    getAccessibleEducationCampuses(context.orgId, context.userId),
    createClient(),
  ]);
  const { data: institution, error } = await supabase.from("education_institution_settings")
    .select("institution_name, institution_code, institution_type, terminology")
    .eq("org_id", context.orgId)
    .maybeSingle();
  if (error) throw new Error(`Could not load Think Education institution settings: ${error.message}`);

  const canEdit = await canTabPermission("education_settings", "settings", "institution", "edit");
  const canCreate = await canTabPermission("education_settings", "settings", "institution", "create");
  const canSave = canEdit && (Boolean(institution) || canCreate);
  const terminology = institution?.terminology;
  const getTerm = (key: string) => terminology && typeof terminology === "object" && !Array.isArray(terminology)
    && typeof terminology[key] === "string" ? terminology[key] : "";
  const errorMessage = params.error === "invalid"
    ? "Check the institution details and terminology. Names and labels must fit the stated limits."
    : params.error === "save" ? "The settings could not be saved. Please try again." : null;

  return <main className="mx-auto max-w-[1100px] space-y-5 p-4 md:p-6">
    <header>
      <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-950">Institution Settings</h1>
      <p className="mt-1 text-sm text-slate-600">Set your institution identity and the terms used throughout Think Education.</p>
    </header>

    {params.updated === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Institution settings saved.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

    {!hasOrganizationScope ? <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
      Institution settings require explicit organization-wide Think Education access. Ask an authorized education administrator to grant your scope.
    </section> : <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-700"><Settings className="h-5 w-5" /></span>
        <div>
          <h2 className="font-semibold text-slate-950">Institution identity</h2>
          <p className="text-sm text-slate-500">This information is shared across your Think Education campuses.</p>
        </div>
      </div>
      {canSave ? <form action={saveEducationInstitutionSettings} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">Institution name
            <input required name="institution_name" maxLength={160} defaultValue={institution?.institution_name ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-medium text-slate-700">Institution code
            <input required name="institution_code" maxLength={32} pattern="[A-Za-z0-9._/-]+" defaultValue={institution?.institution_code ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal uppercase" />
          </label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">Institution type
            <select required name="institution_type" defaultValue={institution?.institution_type ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
              <option value="" disabled>Select institution type</option>
              {INSTITUTION_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>

        <div>
          <h3 className="font-semibold text-slate-900">Terminology</h3>
          <p className="mt-1 text-sm text-slate-500">Optional labels let the application match the language your institution uses.</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {TERMINOLOGY_FIELDS.map((field) => <label key={field.key} className="text-sm font-medium text-slate-700">{field.label}
              <input name={`terminology_${field.key}`} maxLength={40} defaultValue={getTerm(field.key)} placeholder={field.name} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>)}
          </div>
        </div>

        <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
          Save institution settings
        </button>
      </form> : <div className="grid gap-3 text-sm sm:grid-cols-2">
        <p><span className="font-medium text-slate-700">Institution:</span> {institution?.institution_name ?? "Not configured"}</p>
        <p><span className="font-medium text-slate-700">Code:</span> {institution?.institution_code ?? "—"}</p>
        <p><span className="font-medium text-slate-700">Type:</span> {INSTITUTION_TYPES.find(([value]) => value === institution?.institution_type)?.[1] ?? "—"}</p>
      </div>}
    </section>}
  </main>;
}
