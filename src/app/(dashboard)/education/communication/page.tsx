import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Megaphone } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import {
  EDUCATION_COMMUNICATION_AUDIENCES,
} from "@/lib/education/communications";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import {
  archiveEducationCommunication,
  createEducationCommunicationDraft,
  publishEducationCommunication,
} from "../actions";

const AUDIENCE_LABELS = Object.fromEntries(EDUCATION_COMMUNICATION_AUDIENCES);
const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

export default async function EducationCommunicationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_communication", "communication", "announcements", "view")) {
    redirect("/dashboard?accessDenied=think-education.communication");
  }

  const params = await searchParams;
  const readParam = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
  const requestedBranch = readParam(params.branch);
  const requestedStatus = readParam(params.status);
  const requestedAudience = readParam(params.audience);
  const requestedSearch = readParam(params.search).trim().toLowerCase();
  const [canCreate, canPublish, canArchive, { campuses }] = await Promise.all([
    canTabPermission("education_communication", "communication", "announcements", "create"),
    canTabPermission("education_communication", "communication", "announcements", "publish"),
    canTabPermission("education_communication", "communication", "announcements", "edit"),
    getAccessibleEducationCampuses(context.orgId, context.userId),
  ]);
  const campusIds = campuses.map((campus) => campus.id);
  const selectedBranch = campusIds.includes(requestedBranch) ? requestedBranch : "";
  const branchIds = selectedBranch ? [selectedBranch] : campusIds;
  const statusFilter = (["draft", "published", "archived"].includes(requestedStatus)
    ? requestedStatus
    : "") as "draft" | "published" | "archived" | "";
  const audienceFilter = (Object.keys(AUDIENCE_LABELS).includes(requestedAudience)
    ? requestedAudience
    : "") as "all" | "campus" | "students" | "staff" | "parents" | "";
  const supabase = await createClient();
  const { data: announcements, error } = branchIds.length
    ? await (async () => {
        let query = supabase.from("education_communications")
          .select("id, branch_id, title, body, audience, status, created_at, published_at")
          .eq("org_id", context.orgId)
          .in("branch_id", branchIds)
          .order("created_at", { ascending: false })
          .limit(100);
        if (statusFilter) query = query.eq("status", statusFilter);
        return query;
      })()
    : { data: [], error: null };
  if (error) throw new Error(`Could not load Think Education announcements: ${error.message}`);

  const filteredAnnouncements = (announcements ?? []).filter((announcement) => {
    if (audienceFilter && announcement.audience !== audienceFilter) return false;
    if (!requestedSearch) return true;
    const announcementText = `${announcement.title} ${announcement.body}`.toLowerCase();
    return announcementText.includes(requestedSearch);
  });

  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const csvRows = [
    ["Title", "Campus", "Audience", "Status", "Created", "Published", "Message"],
    ...filteredAnnouncements.map((announcement) => [
      announcement.title,
      campusNameById.get(announcement.branch_id) ?? announcement.branch_id,
      AUDIENCE_LABELS[announcement.audience as keyof typeof AUDIENCE_LABELS] ?? announcement.audience,
      STATUS_LABELS[announcement.status] ?? announcement.status,
      new Date(announcement.created_at).toISOString(),
      announcement.published_at ? new Date(announcement.published_at).toISOString() : "",
      announcement.body,
    ]),
  ];
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(csvRows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"))}`;
  const errorMessage = params.error === "invalid"
    ? "Enter a valid campus, title, message, and audience."
    : params.error === "transition"
      ? "This announcement is no longer in a state that allows that action."
      : params.error === "not-found"
        ? "The announcement could not be found."
        : params.error === "save"
          ? "The announcement could not be saved. Please try again."
          : null;

  return <main className="mx-auto max-w-[1400px] space-y-5 p-4 md:p-6">
    <header>
      <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-950"><Megaphone className="h-6 w-6 text-blue-700" /> Communications</h1>
      <p className="mt-1 text-sm text-slate-600">Draft campus announcements, publish them to the intended audience, and archive outdated notices.</p>
    </header>

    {params.created === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Announcement saved as a draft.</p>}
    {params.published === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Announcement published to the selected audience.</p>}
    {params.archived === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Announcement archived.</p>}
    {params.error && errorMessage && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{errorMessage}</p>}

    {canCreate && <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-950">Create announcement draft</h2>
      <p className="mt-1 text-sm text-slate-500">Drafts are private to authorized campus staff until explicitly published.</p>
      {!campuses.length ? <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">You need an assigned Think Education campus before creating announcements.</p> : <form action={createEducationCommunicationDraft} className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">Campus
          <select required name="branch_id" defaultValue={selectedBranch || campuses[0]?.id || ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Audience
          <select required name="audience" defaultValue="all" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            {EDUCATION_COMMUNICATION_AUDIENCES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700 md:col-span-2">Title
          <input required name="title" maxLength={160} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700 md:col-span-2">Message
          <textarea required name="body" maxLength={5000} rows={5} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <div className="md:col-span-2">
          <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">Save draft</button>
        </div>
      </form>}
    </section>}

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 p-4">
        <div>
          <h2 className="font-semibold text-slate-950">Campus announcements</h2>
          <p className="mt-1 text-sm text-slate-500">Showing up to 100 most recent records across your accessible campuses.</p>
        </div>
        <form method="get" className="flex flex-wrap gap-2">
          <input name="search" defaultValue={requestedSearch} placeholder="Search title or content" aria-label="Search announcements" className="min-w-[180px] rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <select name="branch" defaultValue={selectedBranch} aria-label="Filter by campus" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">All accessible campuses</option>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
          <select name="status" defaultValue={statusFilter} aria-label="Filter by status" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select name="audience" defaultValue={audienceFilter} aria-label="Filter by audience" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">All audiences</option>
            {EDUCATION_COMMUNICATION_AUDIENCES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button type="submit" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">Apply filters</button>
          {filteredAnnouncements.length > 0 && <a href={csvHref} download={`education-announcements-${new Date().toISOString().slice(0, 10)}.csv`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Export CSV</a>}
          <Link href={getProductAppPath("think-education", "/communication")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Reset</Link>
        </form>
      </div>
      {!filteredAnnouncements.length ? <p className="p-6 text-sm text-slate-500">No announcements match these filters.</p> : <ul className="divide-y divide-slate-100">
        {filteredAnnouncements.map((announcement) => <li key={announcement.id} className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-slate-950">{announcement.title}</h3>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${announcement.status === "published" ? "bg-emerald-50 text-emerald-800" : announcement.status === "archived" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-800"}`}>
                  {STATUS_LABELS[announcement.status] ?? announcement.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {campusNameById.get(announcement.branch_id) ?? "Campus"} · {AUDIENCE_LABELS[announcement.audience as keyof typeof AUDIENCE_LABELS] ?? announcement.audience} · {announcement.published_at ? `Published ${new Date(announcement.published_at).toLocaleString()}` : `Created ${new Date(announcement.created_at).toLocaleString()}`}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {announcement.status === "draft" && canPublish && <form action={publishEducationCommunication}>
                <input type="hidden" name="communication_id" value={announcement.id} />
                <button type="submit" className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800">Publish</button>
              </form>}
              {announcement.status !== "archived" && canArchive && <form action={archiveEducationCommunication}>
                <input type="hidden" name="communication_id" value={announcement.id} />
                <button type="submit" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Archive</button>
              </form>}
            </div>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{announcement.body}</p>
        </li>)}
      </ul>}
    </section>
  </main>;
}
