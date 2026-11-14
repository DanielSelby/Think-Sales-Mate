import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Building2, CircleCheck, Users2 } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";
import { CompanyProfileForm } from "@/components/settings/company-profile-form";
import { getCompanyProfile } from "@/app/(dashboard)/settings/company/actions";

export const metadata = { title: "Company Information · SalesMate ERP" };

export default async function CompanySettingsPage() {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const profile = await getCompanyProfile(context.orgId);

  return (
    <div className="workspace-organization-overview mx-auto max-w-6xl space-y-6">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div className="flex min-w-0 items-center gap-4">
            <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              {profile?.logo_url
                ? <Image src={profile.logo_url} alt="" width={64} height={64} unoptimized className="h-full w-full object-contain p-1" />
                : <Building2 className="h-7 w-7 text-slate-400" />}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Organization profile</p>
              <h1 className="mt-1 truncate text-2xl font-semibold text-slate-950">{profile?.company_name || context.orgName}</h1>
              <p className="mt-1 text-sm text-slate-500">{profile?.industry || "Business information and workspace identity"}</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 self-start rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 sm:self-center">
            <CircleCheck className="h-4 w-4" />
            Active workspace
          </span>
        </div>
        <div className="grid border-t border-slate-100 sm:grid-cols-3">
          {[
            { label: "Business email", value: profile?.business_email || "Not provided" },
            { label: "Business phone", value: profile?.business_phone || "Not provided" },
            { label: "Website", value: profile?.website || "Not provided" },
          ].map(({ label, value }) => (
            <div key={label} className="border-b border-slate-100 px-5 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 sm:px-7">
              <p className="text-xs font-medium text-slate-500">{label}</p>
              <p className="mt-1 truncate text-sm font-semibold text-slate-800">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/settings/organization#users" className="group flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
          <span className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-700"><Users2 className="h-5 w-5" /></span>
            <span><span className="block text-sm font-semibold text-slate-900">Manage users and roles</span><span className="mt-1 block text-xs text-slate-500">Review invitations, roles, and product access.</span></span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-1" />
        </Link>
        <Link href="/subscription-status" className="group flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
          <span className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><CircleCheck className="h-5 w-5" /></span>
            <span><span className="block text-sm font-semibold text-slate-900">Product access and subscriptions</span><span className="mt-1 block text-xs text-slate-500">View access status and organization usage.</span></span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>

      <CompanyProfileForm profile={profile} canManage={can(context.role, "settings.edit")} />
    </div>
  );
}