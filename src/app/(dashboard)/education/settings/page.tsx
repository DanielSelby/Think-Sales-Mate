import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Image as ImageIcon, Settings, Trash2, Upload } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import {
  getEducationInstitutionDisplayName,
} from "@/lib/education/institution-branding";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import {
  clearEducationInstitutionLogo,
  saveEducationInstitutionSettings,
  uploadEducationInstitutionLogo,
} from "../actions";

const INSTITUTION_TYPES = [
  ["basic", "Basic education"],
  ["primary", "Primary school"],
  ["junior_high", "Junior high school"],
  ["senior_high", "Senior high school"],
  ["college", "College"],
  ["university", "University"],
  ["technical_vocational", "Technical / vocational"],
  ["training", "Training institution"],
  ["multi_level", "Multi-level institution (basic to university)"],
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

  const [canViewRoles, canViewUsers, canViewActivity] = await Promise.all([
    canTabPermission("education_user_management", "users", "directory", "view"),
    canTabPermission("education_user_management", "users", "branch_access", "view"),
    canTabPermission("education_audit", "activity", "records", "view_audit"),
  ]);

  const params = await searchParams;
  const [{ hasOrganizationScope }, supabase] = await Promise.all([
    getAccessibleEducationCampuses(context.orgId, context.userId),
    createClient(),
  ]);
  const [institutionResult, companyProfileResult] = await Promise.all([
    supabase.from("education_institution_settings")
      .select("institution_name, institution_code, institution_type, institution_logo_url, terminology")
      .eq("org_id", context.orgId)
      .maybeSingle(),
    supabase.from("company_profile")
      .select("logo_url")
      .eq("org_id", context.orgId)
      .maybeSingle(),
  ]);
  if (institutionResult.error) throw new Error(`Could not load Think Education institution settings: ${institutionResult.error.message}`);
  if (companyProfileResult.error) throw new Error(`Could not load organization logo: ${companyProfileResult.error.message}`);
  const institution = institutionResult.data;
  const companyLogoUrl = companyProfileResult.data?.logo_url ?? null;

  const canEdit = await canTabPermission("education_settings", "settings", "institution", "edit");
  const canCreate = await canTabPermission("education_settings", "settings", "institution", "create");
  const canSave = canEdit && (Boolean(institution) || canCreate);
  const canManageIntegrations = hasOrganizationScope && canEdit;
  const institutionDisplayName = getEducationInstitutionDisplayName(institution?.institution_name, context.orgName);
  const displayedLogoUrl = institution?.institution_logo_url || companyLogoUrl;
  const terminology = institution?.terminology;
  const getTerm = (key: string) => terminology && typeof terminology === "object" && !Array.isArray(terminology)
    && typeof terminology[key] === "string" ? terminology[key] : "";
  const errorMessage = params.error === "invalid"
    ? "Check the institution details and terminology. Names and labels must fit the stated limits."
    : params.error === "save" ? "The settings could not be saved. Please try again." : null;
  const logoMessage = params.logo === "updated"
    ? "Institution logo saved. It will be used in Think Education instead of the organization logo."
    : params.logo === "cleared"
      ? "Institution logo removed. Think Education will use the organization logo."
      : params.logo === "save-settings-first"
        ? "Save the institution details before uploading a logo."
        : params.logo === "invalid"
          ? "Choose a valid PNG, JPEG, or WebP logo."
          : params.logo === "too-large"
            ? "Institution logos must be 2 MB or smaller."
            : params.logo === "error" ? "The institution logo could not be saved. Please try again." : null;

  return <main className="mx-auto max-w-[1200px] space-y-4 p-3 md:p-5">
    <header className="space-y-2">
      <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium" style={{ color: "var(--theme-primary)" }}>
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <h1 className="text-2xl font-bold" style={{ color: "var(--theme-primary)" }}>Institution Settings</h1>
      <p className="text-sm" style={{ color: "var(--theme-text-muted, #4b5563)" }}>Set your institution identity and the terms used throughout Think Education.</p>
    </header>

    {params.updated === "1" && <p role="status" className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "rgba(16,185,129,0.3)", backgroundColor: "rgba(16,185,129,0.08)", color: "#065f46" }}>Institution settings saved.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "rgba(239,68,68,0.25)", backgroundColor: "rgba(239,68,68,0.06)", color: "#991b1b" }}>{errorMessage}</p>}
    {logoMessage && <p role={params.logo === "invalid" || params.logo === "too-large" || params.logo === "error" ? "alert" : "status"} className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: params.logo === "invalid" || params.logo === "too-large" || params.logo === "error" ? "rgba(239,68,68,0.25)" : "rgba(16,185,129,0.3)", backgroundColor: params.logo === "invalid" || params.logo === "too-large" || params.logo === "error" ? "rgba(239,68,68,0.06)" : "rgba(16,185,129,0.08)", color: params.logo === "invalid" || params.logo === "too-large" || params.logo === "error" ? "#991b1b" : "#065f46" }}>{logoMessage}</p>}

    {!hasOrganizationScope ? <section className="rounded-xl border p-5 text-sm" style={{ borderColor: "rgba(245,158,11,0.35)", backgroundColor: "rgba(245,158,11,0.08)", color: "#78350f" }}>
      Institution settings require explicit organization-wide Think Education access. Ask an authorized education administrator to grant your scope.
    </section> : <section className="rounded-xl border bg-white p-4 shadow-sm md:p-5" style={{ borderColor: "var(--theme-header-border-light, #e2e8f0)", backgroundColor: "var(--theme-surface, #fff)" }}>
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ backgroundColor: "var(--theme-primary-pale, #eff6ff)", color: "var(--theme-primary, #2563eb)" }}><Settings className="h-5 w-5" /></span>
        <div>
          <h2 className="font-semibold" style={{ color: "var(--theme-text, #111827)" }}>Institution identity</h2>
          <p className="text-sm" style={{ color: "var(--theme-text-muted, #4b5563)" }}>This information is shared across your Think Education campuses.</p>
        </div>
      </div>
      {canSave ? <form action={saveEducationInstitutionSettings} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium" style={{ color: "var(--theme-text, #111827)" }}>Institution name
            <input required name="institution_name" maxLength={160} defaultValue={institutionDisplayName} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" style={{ borderColor: "var(--theme-header-border-light, #dbeafe)", backgroundColor: "#fff", color: "var(--theme-text, #111827)" }} />
          </label>
          <label className="text-sm font-medium" style={{ color: "var(--theme-text, #111827)" }}>Institution code
            <input required name="institution_code" maxLength={32} pattern="[A-Za-z0-9._/-]+" defaultValue={institution?.institution_code ?? ""} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal uppercase" style={{ borderColor: "var(--theme-header-border-light, #dbeafe)", backgroundColor: "#fff", color: "var(--theme-text, #111827)" }} />
          </label>
          <label className="text-sm font-medium sm:col-span-2" style={{ color: "var(--theme-text, #111827)" }}>Institution type
            <select required name="institution_type" defaultValue={institution?.institution_type ?? ""} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" style={{ borderColor: "var(--theme-header-border-light, #dbeafe)", backgroundColor: "#fff", color: "var(--theme-text, #111827)" }}>
              <option value="" disabled>Select institution type</option>
              {INSTITUTION_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>

        <div>
          <h3 className="font-semibold" style={{ color: "var(--theme-text, #111827)" }}>Terminology</h3>
          <p className="mt-1 text-sm" style={{ color: "var(--theme-text-muted, #4b5563)" }}>Optional labels let the application match the language your institution uses.</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {TERMINOLOGY_FIELDS.map((field) => <label key={field.key} className="text-sm font-medium" style={{ color: "var(--theme-text, #111827)" }}>{field.label}
              <input name={`terminology_${field.key}`} maxLength={40} defaultValue={getTerm(field.key)} placeholder={field.name} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" style={{ borderColor: "var(--theme-header-border-light, #dbeafe)", backgroundColor: "#fff", color: "var(--theme-text, #111827)" }} />
            </label>)}
          </div>
        </div>

        <button type="submit" className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-95" style={{ backgroundColor: "var(--theme-primary, #2563eb)" }}>
          Save institution settings
        </button>
      </form> : <div className="grid gap-3 text-sm sm:grid-cols-2" style={{ color: "var(--theme-text, #111827)" }}>
        <p><span className="font-medium" style={{ color: "var(--theme-text-muted, #4b5563)" }}>Institution:</span> {institutionDisplayName}</p>
        <p><span className="font-medium" style={{ color: "var(--theme-text-muted, #4b5563)" }}>Code:</span> {institution?.institution_code ?? "—"}</p>
        <p><span className="font-medium" style={{ color: "var(--theme-text-muted, #4b5563)" }}>Type:</span> {INSTITUTION_TYPES.find(([value]) => value === institution?.institution_type)?.[1] ?? "—"}</p>
      </div>}

      <div className="mt-6 border-t pt-5" style={{ borderColor: "var(--theme-header-border-light, #e2e8f0)" }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold" style={{ color: "var(--theme-text, #111827)" }}>Institution logo</h3>
            <p className="mt-1 max-w-2xl text-sm" style={{ color: "var(--theme-text-muted, #4b5563)" }}>
              This logo replaces the organization logo in Think Education only. Other products keep using the organization logo.
            </p>
          </div>
          {displayedLogoUrl
            ? <img src={displayedLogoUrl} alt={`${institutionDisplayName} logo`} className="h-16 w-16 rounded-xl border bg-white object-contain p-2" />
            : <div className="grid h-16 w-16 place-items-center rounded-xl border border-dashed bg-slate-50 text-slate-400" style={{ borderColor: "var(--theme-header-border-light, #cbd5e1)" }}>
                <ImageIcon className="h-7 w-7" aria-hidden="true" />
              </div>}
        </div>
        <p className="mt-2 text-xs" style={{ color: "var(--theme-text-muted, #4b5563)" }}>
          {institution?.institution_logo_url ? "Institution logo is active." : companyLogoUrl ? "Organization logo is shown by default until you upload an institution logo." : "No institution logo is set; Think Education will use its standard logo."}
        </p>
        {canSave && <div className="mt-4 flex flex-wrap items-center gap-3">
          {institution ? <form action={uploadEducationInstitutionLogo} encType="multipart/form-data" className="flex flex-wrap items-center gap-2">
            <label className="flex min-h-10 items-center rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--theme-header-border-light, #dbeafe)", color: "var(--theme-text, #111827)" }}>
              Choose logo
              <input type="file" name="institution_logo" required accept="image/png,image/jpeg,image/webp" className="ml-2 max-w-56 text-xs" />
            </label>
            <button type="submit" className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white" style={{ backgroundColor: "var(--theme-primary, #2563eb)" }}>
              <Upload className="h-4 w-4" aria-hidden="true" /> Upload logo
            </button>
          </form> : <p className="text-sm" style={{ color: "var(--theme-text-muted, #4b5563)" }}>Save the institution details before uploading a logo.</p>}
          {institution?.institution_logo_url && <form action={clearEducationInstitutionLogo}>
            <button type="submit" className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium" style={{ borderColor: "var(--theme-header-border-light, #dbeafe)", color: "var(--theme-text, #111827)" }}>
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Use organization logo
            </button>
          </form>}
        </div>}
        <p className="mt-2 text-xs" style={{ color: "var(--theme-text-muted, #4b5563)" }}>PNG, JPEG, or WebP; maximum 2 MB.</p>
      </div>

      {(canViewRoles || canViewUsers || canViewActivity || canManageIntegrations) && <div className="mt-6 border-t border-slate-200 pt-5">
        <h2 className="text-lg font-semibold text-slate-950">Management shortcuts</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {canManageIntegrations && <Link href={getProductAppPath("think-education", "/settings/integrations/google-classroom")} className="rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-blue-300 hover:bg-blue-50">
            <p className="text-sm font-semibold text-slate-900">Google Classroom</p>
            <p className="mt-1 text-sm text-slate-600">Connect Classroom and import course rosters into existing classes.</p>
          </Link>}
          {canViewRoles && <Link href={getProductAppPath("think-education", "/settings/roles")} className="rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-blue-300 hover:bg-blue-50">
            <p className="text-sm font-semibold text-slate-900">Roles &amp; permissions</p>
            <p className="mt-1 text-sm text-slate-600">Manage product-specific permission templates and member access.</p>
          </Link>}
          {canViewUsers && <Link href={getProductAppPath("think-education", "/settings/users")} className="rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-blue-300 hover:bg-blue-50">
            <p className="text-sm font-semibold text-slate-900">User access</p>
            <p className="mt-1 text-sm text-slate-600">Assign organization or campus scope to active members.</p>
          </Link>}
          {canViewActivity && <Link href={getProductAppPath("think-education", "/activity")} className="rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-blue-300 hover:bg-blue-50">
            <p className="text-sm font-semibold text-slate-900">Audit &amp; activity</p>
            <p className="mt-1 text-sm text-slate-600">Review recent education changes and workflow activity.</p>
          </Link>}
        </div>
      </div>}
    </section>}
  </main>;
}
