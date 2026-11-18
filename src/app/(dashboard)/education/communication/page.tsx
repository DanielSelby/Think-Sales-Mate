import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Megaphone } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import {
  escapeEducationCommunicationCsvCell,
  escapeEducationCommunicationSearchTerm,
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
  retryEducationCommunicationDelivery,
  updateEducationCommunicationDraft,
} from "../actions";

const AUDIENCE_LABELS = Object.fromEntries(EDUCATION_COMMUNICATION_AUDIENCES);
const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};
const ANNOUNCEMENTS_PAGE_SIZE = 100;
type EducationCommunicationAudience = (typeof EDUCATION_COMMUNICATION_AUDIENCES)[number][0];
type AnnouncementDeliveryChannel = "email" | "sms";
type AnnouncementDeliveryStatus = "pending" | "sending" | "sent" | "failed" | "unconfigured" | "skipped";

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
  const parsedPage = Number.parseInt(readParam(params.page), 10);
  const requestedPage = Number.isSafeInteger(parsedPage) && parsedPage > 0
    ? Math.min(parsedPage, 100000)
    : 1;
  const [canCreate, canPublish, canArchive, canExport, { campuses }] = await Promise.all([
    canTabPermission("education_communication", "communication", "announcements", "create"),
    canTabPermission("education_communication", "communication", "announcements", "publish"),
    canTabPermission("education_communication", "communication", "announcements", "edit"),
    canTabPermission("education_communication", "communication", "announcements", "export"),
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
    : "") as EducationCommunicationAudience | "";
  const pageHref = (page: number) => {
    const query = new URLSearchParams();
    if (requestedSearch) query.set("search", requestedSearch);
    if (selectedBranch) query.set("branch", selectedBranch);
    if (statusFilter) query.set("status", statusFilter);
    if (audienceFilter) query.set("audience", audienceFilter);
    query.set("page", String(page));
    return `${getProductAppPath("think-education", "/communication")}?${query.toString()}`;
  };
  const pageOffset = (requestedPage - 1) * ANNOUNCEMENTS_PAGE_SIZE;
  const supabase = await createClient();
  const { data: announcements, error, count } = branchIds.length
    ? await (async () => {
        let query = supabase.from("education_communications")
          .select("id, branch_id, title, body, audience, status, created_at, published_at", { count: "exact" })
          .eq("org_id", context.orgId)
          .in("branch_id", branchIds)
          .order("created_at", { ascending: false })
          .range(pageOffset, pageOffset + ANNOUNCEMENTS_PAGE_SIZE - 1);
        if (statusFilter) query = query.eq("status", statusFilter);
        if (audienceFilter) query = query.eq("audience", audienceFilter);
        if (requestedSearch) {
          const escapedSearch = escapeEducationCommunicationSearchTerm(requestedSearch);
          query = query.or(`title.ilike.%${escapedSearch}%,body.ilike.%${escapedSearch}%`);
        }
        return query;
      })()
    : { data: [], error: null, count: 0 };
  if (error) throw new Error(`Could not load Think Education announcements: ${error.message}`);

  const totalAnnouncements = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalAnnouncements / ANNOUNCEMENTS_PAGE_SIZE));
  if (requestedPage > totalPages) redirect(pageHref(totalPages));
  const firstAnnouncement = totalAnnouncements ? pageOffset + 1 : 0;
  const lastAnnouncement = Math.min(pageOffset + ANNOUNCEMENTS_PAGE_SIZE, totalAnnouncements);
  const visibleAnnouncements = announcements ?? [];
  const visibleAnnouncementIds = visibleAnnouncements.map((announcement) => announcement.id);
  const { data: deliveryStatuses, error: deliveryStatusError } = visibleAnnouncementIds.length
    ? await supabase.rpc("education_announcement_delivery_summary", {
      p_org_id: context.orgId,
      p_announcement_ids: visibleAnnouncementIds,
    })
    : { data: [], error: null };
  if (deliveryStatusError) {
    throw new Error(`Could not load announcement delivery statuses: ${deliveryStatusError.message}`);
  }
  const deliverySummary = new Map<string, Record<AnnouncementDeliveryChannel, Partial<Record<AnnouncementDeliveryStatus, number>>>>();
  for (const delivery of deliveryStatuses ?? []) {
    let summary = deliverySummary.get(delivery.announcement_id);
    if (!summary) {
      summary = { email: {}, sms: {} };
      deliverySummary.set(delivery.announcement_id, summary);
    }
    const channel = delivery.channel as AnnouncementDeliveryChannel;
    const status = delivery.status as AnnouncementDeliveryStatus;
    summary[channel][status] = (summary[channel][status] ?? 0) + delivery.delivery_count;
  }

  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const csvRows = [
    ["Title", "Campus", "Audience", "Status", "Created", "Published", "Message"],
    ...visibleAnnouncements.map((announcement) => [
      announcement.title,
      campusNameById.get(announcement.branch_id) ?? announcement.branch_id,
      AUDIENCE_LABELS[announcement.audience as keyof typeof AUDIENCE_LABELS] ?? announcement.audience,
      STATUS_LABELS[announcement.status] ?? announcement.status,
      new Date(announcement.created_at).toISOString(),
      announcement.published_at ? new Date(announcement.published_at).toISOString() : "",
      announcement.body,
    ]),
  ];
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(csvRows.map((row) => row.map(escapeEducationCommunicationCsvCell).join(",")).join("\n"))}`;
  const errorMessage = params.error === "invalid"
    ? "Enter a valid campus, title, message, and audience."
    : params.error === "transition"
      ? "This announcement is no longer in a state that allows that action."
      : params.error === "not-found"
        ? "The announcement could not be found."
        : params.error === "save"
          ? "The announcement could not be saved. Please try again."
          : null;
  const deliveryMessage = params.delivery === "failed"
    ? "Some outbound deliveries failed. Review the per-channel status and retry failed or pending messages."
    : params.delivery === "unconfigured"
        ? "An email or SMS provider is unavailable or unconfigured. Delivery status is saved and can be retried after setup."
        : params.delivery === "processed"
          ? params.retry === "1"
            ? "This announcement was already published. Only pending deliveries were processed; successful messages were not repeated."
            : "The outbound delivery batch was processed. Review the per-channel status below."
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
    {params.updated === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Draft announcement updated.</p>}
    {params.published === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Announcement published to the selected audience.</p>}
    {params.archived === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Announcement archived.</p>}
    {params.error && errorMessage && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{errorMessage}</p>}
    {deliveryMessage && <p role={params.delivery === "failed" || params.delivery === "unconfigured" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${params.delivery === "failed" || params.delivery === "unconfigured" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-blue-200 bg-blue-50 text-blue-900"}`}>{deliveryMessage}</p>}

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
          <p className="mt-1 text-sm text-slate-500">Showing {firstAnnouncement}-{lastAnnouncement} of {totalAnnouncements} matching announcements.</p>
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
          {canExport && visibleAnnouncements.length > 0 && <a href={csvHref} download={`education-announcements-${new Date().toISOString().slice(0, 10)}.csv`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Export page CSV</a>}
          <Link href={getProductAppPath("think-education", "/communication")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Reset</Link>
        </form>
      </div>
      {!visibleAnnouncements.length ? <p className="p-6 text-sm text-slate-500">No announcements match these filters.</p> : <ul className="divide-y divide-slate-100">
        {visibleAnnouncements.map((announcement) => <li key={announcement.id} className="space-y-3 p-4 sm:p-5">
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
              {announcement.status === "draft" && canArchive && <details className="relative">
                <summary className="cursor-pointer list-none rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Edit draft</summary>
                <form action={updateEducationCommunicationDraft} className="absolute right-0 z-10 mt-2 grid w-[min(90vw,32rem)] gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-lg">
                  <input type="hidden" name="communication_id" value={announcement.id} />
                  <label className="text-sm font-medium text-slate-700">Title
                    <input required name="title" maxLength={160} defaultValue={announcement.title} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
                  </label>
                  <label className="text-sm font-medium text-slate-700">Audience
                    <select required name="audience" defaultValue={announcement.audience} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
                      {EDUCATION_COMMUNICATION_AUDIENCES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label className="text-sm font-medium text-slate-700">Message
                    <textarea required name="body" maxLength={5000} rows={5} defaultValue={announcement.body} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
                  </label>
                  <button type="submit" className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800">Save draft</button>
                </form>
              </details>}
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
          {announcement.status === "published" && <section className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Outbound delivery status</p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
              {(["email", "sms"] as const).map((channel) => {
                const counts = deliverySummary.get(announcement.id)?.[channel];
                const details = counts
                  ? Object.entries(counts).map(([status, count]) => `${count} ${status}`).join(" · ")
                  : "no opted-in recipients";
                return <span key={channel}><strong className="font-semibold uppercase text-slate-700">{channel}</strong>: {details}</span>;
              })}
            </div>
            {canPublish && (["pending", "failed", "unconfigured"] as const).some((status) =>
              (deliverySummary.get(announcement.id)?.email[status] ?? 0)
              + (deliverySummary.get(announcement.id)?.sms[status] ?? 0) > 0
            ) && <form action={retryEducationCommunicationDelivery} className="mt-2">
              <input type="hidden" name="communication_id" value={announcement.id} />
              <button type="submit" className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-50">Continue or retry unsuccessful delivery</button>
            </form>}
          </section>}
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{announcement.body}</p>
        </li>)}
      </ul>}
      <nav aria-label="Announcement pages" className="flex items-center justify-between border-t border-slate-100 p-4">
        {requestedPage > 1
          ? <Link href={pageHref(requestedPage - 1)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Previous</Link>
          : <span aria-disabled="true" className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-400">Previous</span>}
        <span className="text-sm text-slate-600">Page {requestedPage} of {totalPages}</span>
        {requestedPage < totalPages
          ? <Link href={pageHref(requestedPage + 1)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Next</Link>
          : <span aria-disabled="true" className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-400">Next</span>}
      </nav>
    </section>
  </main>;
}
