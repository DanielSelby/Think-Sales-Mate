import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, Building2, MapPin, Search } from "lucide-react";
import { createEducationCampus, grantOwnEducationOrganizationScope } from "../actions";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { getProductAppPath } from "@/lib/product-app-routes";
import { EducationRecordModal } from "@/components/education/education-record-modal";
import { EducationImportModal } from "@/components/education/education-import-modal";

export default async function EducationOrganizationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_organization", "organization", "campuses", "view")) {
    redirect("/dashboard?accessDenied=think-education.organization");
  }
  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search.trim().slice(0, 80).toLowerCase() : "";
  const { campuses, hasOrganizationScope } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const canCreate = hasOrganizationScope
    && await canTabPermission("education_organization", "organization", "campuses", "create");
  const filteredCampuses = campuses.filter((campus) =>
    !search || [campus.name, campus.code, campus.city, campus.region]
      .some((value) => value?.toLowerCase().includes(search))
  );
  const csvRows = [
    ["Campus", "Campus code", "City", "Region", "Status", "Access scope"],
    ...filteredCampuses.map((campus) => [
      campus.name,
      campus.code ?? "—",
      campus.city ?? "—",
      campus.region ?? "—",
      "Active",
      hasOrganizationScope ? "Organization-wide" : "Assigned campus",
    ]),
  ];
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(csvRows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"))}`;
  const errorMessage = params.error === "duplicate"
    ? "That campus code is already in use in this organization."
    : params.error === "invalid"
      ? "Enter a campus name, a unique code, and a valid email address."
      : params.error === "save" ? "The campus could not be saved. Please try again." : null;

  return <main className="mx-auto w-full max-w-[1680px] space-y-6 p-4 md:p-6 xl:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Organization &amp; Branch Management</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Manage {context.orgName} campuses and their education-specific settings.</p>
      </div>
      <div className="flex gap-2">
        <Link href={getProductAppPath("think-education", "/students")} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50">
          Students <ArrowRight className="h-4 w-4" />
        </Link>
        <div className="flex flex-wrap gap-2">
          {canCreate && <EducationImportModal entity="campuses" label="campuses" columns={[
            { key: "name", label: "Campus", required: true },
            { key: "code", label: "Campus Code", required: true },
            { key: "address", label: "Address" },
            { key: "city", label: "City" },
            { key: "region", label: "Region" },
            { key: "country", label: "Country" },
            { key: "phone", label: "Phone" },
            { key: "email", label: "Email" },
          ]} />}
          {canCreate && <EducationRecordModal
            title="Add campus"
            description="Create an Education campus and register it as an organization branch."
            buttonLabel="Add campus"
            submitLabel="Create campus"
            action={createEducationCampus}
            fields={[
              { name: "name", label: "Campus name", required: true, maxLength: 120 },
              { name: "code", label: "Campus code", required: true, maxLength: 32, pattern: "[A-Za-z0-9-]+" },
              { name: "address", label: "Address", maxLength: 200 },
              { name: "city", label: "City", maxLength: 100 },
              { name: "region", label: "Region", maxLength: 100 },
              { name: "country", label: "Country", maxLength: 100 },
              { name: "phone", label: "Phone", type: "tel", maxLength: 32 },
              { name: "email", label: "Email", type: "email", maxLength: 254 },
            ]}
          />}
        </div>
      </div>
    </header>

    {params.created === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Campus created and added to your organization.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

    <section data-education-metrics className="grid gap-3 sm:grid-cols-3">
      {[
        { label: "Campuses in your access", value: campuses.length.toLocaleString(), icon: Building2 },
        { label: "Active campuses", value: campuses.length.toLocaleString(), icon: MapPin },
        { label: "Institution", value: context.orgName, icon: Building2 },
      ].map(({ label, value, icon: Icon }) => <article key={label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 truncate text-xl font-bold text-slate-950">{value}</p></div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon className="h-5 w-5" /></span>
      </article>)}
    </section>

    {campuses.length === 0 && context.role === "owner" && <section className="rounded-xl border border-blue-200 bg-blue-50 p-5">
      <h2 className="font-semibold text-blue-950">Choose your Think Education access scope</h2>
      <p className="mt-1 text-sm text-blue-900">Organization-wide access is not assigned automatically. Grant it explicitly to manage all campuses, or have an administrator assign selected branches.</p>
      <form action={grantOwnEducationOrganizationScope} className="mt-4">
        <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">Grant me access to all campuses</button>
      </form>
    </section>}

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <form method="get" action={getProductAppPath("think-education", "/organization")} className="flex flex-wrap items-end gap-3 border-b border-slate-200 bg-slate-50/70 p-4 md:p-5">
        <label className="relative min-w-[240px] flex-1">
          <span className="sr-only">Search campuses</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input name="search" defaultValue={search} placeholder="Search campus name, code, or location" className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        </label>
        <button type="submit" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">Search campuses</button>
        {filteredCampuses.length > 0 && <a href={csvHref} download={`education-campuses-${new Date().toISOString().slice(0, 10)}.csv`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Export CSV</a>}
      </form>
      {filteredCampuses.length === 0 ? <div className="p-8 text-center">
        <Building2 className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-3 font-semibold text-slate-900">{campuses.length ? "No campuses match your search" : "No campuses in your assigned scope"}</h2>
        <p className="mt-1 text-sm text-slate-500">{campuses.length ? "Try another name, campus code, or location." : "Ask an authorized Think Education administrator to assign your campus access."}</p>
      </div> : <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Campus</th><th className="px-4 py-3">Campus code</th><th className="px-4 py-3">Location</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Scope</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredCampuses.map((campus, index) => <tr key={campus.id} className="transition-colors hover:bg-slate-50/80">
              <td className="whitespace-nowrap px-4 py-3 text-slate-500">{index + 1}</td>
              <td className="px-4 py-3 font-semibold text-slate-900">{campus.name}</td>
              <td className="px-4 py-3"><span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800">{campus.code ?? "—"}</span></td>
              <td className="px-4 py-3 text-slate-600">{[campus.city, campus.region].filter(Boolean).join(", ") || "—"}</td>
              <td className="px-4 py-3"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">Active</span></td>
              <td className="px-4 py-3 text-slate-600">{hasOrganizationScope ? "Organization-wide" : "Assigned campus"}</td>
            </tr>)}
          </tbody>
        </table>
      </div>}
    </section>

  </main>;
}
