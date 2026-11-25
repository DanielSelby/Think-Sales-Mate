import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, Link2 } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { isOrganizationSuperAdminMember } from "@/lib/organizations/member-access";
import { getProductAppPath } from "@/lib/product-app-routes";
import { getEducationPortalScopedPath } from "@/lib/education/portal-auth";
import { EducationPortalPasswordManager } from "./education-portal-password-manager";
import { PortalLinkCard } from "./portal-link-card";

const PORTALS = [
  { type: "student", title: "Student Portal", description: "Student timetable, attendance, and published results." },
  { type: "family", title: "Family Portal", description: "Guardians can review linked students, announcements, and fee balances." },
  { type: "staff", title: "Staff / Teacher Portal", description: "Active teaching staff can view assigned classes and record attendance." },
] as const;

export default async function EducationPortalLinksPage() {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_settings", "settings", "institution", "view")) {
    redirect("/dashboard?accessDenied=think-education.settings");
  }

  const { hasOrganizationScope } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!hasOrganizationScope) {
    return <main className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-bold text-slate-950">Portal Links</h1>
      <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Portal links are organization-wide. Ask an Education administrator to grant you organization-wide access.
      </p>
    </main>;
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (!siteUrl) throw new Error("Set NEXT_PUBLIC_SITE_URL or SITE_URL to display shareable portal links.");
  let origin: string;
  try {
    origin = new URL(siteUrl).origin;
  } catch {
    throw new Error("The configured application URL is invalid. Set NEXT_PUBLIC_SITE_URL to the application origin.");
  }

  const supabase = await createClient();
  const { data: records, error } = await supabase.from("education_portal_links")
    .select("portal_type, portal_path")
    .eq("org_id", context.orgId);
  if (error) throw new Error(`Could not load portal links for ${context.orgName}: ${error.message}`);

  const pathByType = new Map((records ?? []).map((record) => [record.portal_type, record.portal_path]));
  const links = PORTALS.map((portal) => {
    const path = pathByType.get(portal.type);
    if (!path) {
      throw new Error(`The ${portal.title} link is not configured for ${context.orgName}. Apply the Education portal links migration.`);
    }
    return {
      ...portal,
      url: new URL(getEducationPortalScopedPath(path, context.orgId), origin).toString(),
    };
  });
  const canManagePortalPasswords = isOrganizationSuperAdminMember({
    role: context.role,
    userId: context.userId,
    accessPermissions: context.accessPermissions,
  });

  return <main className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
    <header>
      <Link href={getProductAppPath("think-education", "/settings")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Institution Settings
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-950">Portal Links</h1>
      <p className="mt-1 text-sm text-slate-600">Share the correct portal link with students, families, and teaching staff at {context.orgName}.</p>
    </header>

    <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
      These are separate sign-in pages for the student, family, and teaching-staff portals. Users sign in with the email on their active school profile and a temporary password issued by the school. Portal access is not the same as system-dashboard access.
    </section>

    <section className="grid gap-4 md:grid-cols-2">
      {links.map((portal) => <PortalLinkCard key={portal.type} {...portal} />)}
    </section>

    {canManagePortalPasswords && <EducationPortalPasswordManager />}

    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 font-semibold text-slate-950"><Link2 className="h-5 w-5 text-blue-700" />How portal sign-in works</h2>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-700">
        <li>The user opens the correct portal link and signs in with the email recorded on their active profile.</li>
        <li>Issue a unique temporary password when creating the portal account, or generate one above for an existing profile. Share it securely.</li>
        <li>The user must choose a new password at first sign-in. The portal then shows only information they are authorized to see.</li>
      </ol>
      <Link href={links[0].url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline">
        Preview Student Portal <ExternalLink className="h-4 w-4" />
      </Link>
    </section>
  </main>;
}
