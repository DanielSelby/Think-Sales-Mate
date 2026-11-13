import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ClipboardList, Search } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";

const PAGE_SIZE = 50;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type SearchParams = Record<string, string | string[] | undefined>;

function getStringParam(params: SearchParams, key: string): string {
  return typeof params[key] === "string" ? params[key] as string : "";
}

function dateBoundary(value: string, endOfDay = false): string | null {
  if (!DATE_PATTERN.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  if (endOfDay) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

function displayAction(action: string): string {
  return action.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function EducationActivityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_audit", "activity", "records", "view_audit")) {
    redirect("/dashboard?accessDenied=think-education.activity");
  }

  const params = await searchParams;
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = new Set(campuses.map((campus) => campus.id));
  const requestedBranch = getStringParam(params, "branch");
  const branchId = campusIds.has(requestedBranch) ? requestedBranch : "";
  const search = getStringParam(params, "q").trim().slice(0, 100);
  const fromDate = getStringParam(params, "from");
  const toDate = getStringParam(params, "to");
  const from = fromDate ? dateBoundary(fromDate) : null;
  const to = toDate ? dateBoundary(toDate, true) : null;
  const dateError = Boolean((fromDate && !from) || (toDate && !to)
    || (from && to && from >= to));
  const parsedPage = Number.parseInt(getStringParam(params, "page"), 10);
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, 2001) : 1;
  const supabase = await createClient();
  const activityResult = dateError || campuses.length === 0
    ? { data: [], error: null }
    : await supabase.rpc("education_get_audit_activity", {
      p_org_id: context.orgId,
      p_branch_id: branchId || null,
      p_search: search || null,
      p_from: from,
      p_to: to,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    });
  if (activityResult.error) throw new Error(`Could not load Think Education activity: ${activityResult.error.message}`);
  const records = activityResult.data ?? [];
  const totalCount = records[0]?.total_count ?? 0;
  const actorIds = Array.from(new Set(records.flatMap((record) => record.actor_id ? [record.actor_id] : [])));
  const actorsResult = actorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", actorIds)
    : { data: [], error: null };
  if (actorsResult.error) throw new Error(`Could not resolve Think Education activity actors: ${actorsResult.error.message}`);
  const actorNames = new Map((actorsResult.data ?? []).map((actor) => [actor.id, actor.full_name]));
  const campusNames = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const csvRows = [
    ["Date", "Campus", "Actor", "Action", "Entity type", "Entity ID", "Details"],
    ...records.map((record) => {
      const metadata = record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
        ? record.metadata
        : {};
      const recordBranch = typeof metadata.branch_id === "string"
        ? metadata.branch_id
        : typeof metadata.location_id === "string" ? metadata.location_id : "";
      return [
        new Date(record.created_at).toISOString(),
        campusNames.get(recordBranch) ?? (recordBranch ? "Campus" : "Organization-wide"),
        actorNames.get(record.actor_id ?? "") ?? "System",
        displayAction(record.action),
        displayAction(record.entity_type),
        record.entity_id ?? "",
        JSON.stringify(metadata),
      ];
    }),
  ];
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(csvRows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"))}`;
  const pageCount = Math.ceil(totalCount / PAGE_SIZE);
  const makePageHref = (nextPage: number) => {
    const query = new URLSearchParams();
    if (branchId) query.set("branch", branchId);
    if (search) query.set("q", search);
    if (fromDate) query.set("from", fromDate);
    if (toDate) query.set("to", toDate);
    query.set("page", String(nextPage));
    return `/education/activity?${query.toString()}`;
  };

  return <main className="mx-auto max-w-[1400px] space-y-5 p-4 md:p-6">
    <header>
      <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-950"><ClipboardList className="h-6 w-6 text-blue-700" /> Audit &amp; Activity</h1>
      <p className="mt-1 text-sm text-slate-600">Review education changes and workflow activity for your authorized campuses.</p>
    </header>

    <form method="get" className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_1fr_180px_180px_200px]">
      <label className="text-sm font-medium text-slate-700">Campus
        <select name="branch" defaultValue={branchId} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
          <option value="">All accessible campuses</option>
          {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">Search
        <input name="q" defaultValue={search} maxLength={100} placeholder="Action, record, details…" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
      </label>
      <label className="text-sm font-medium text-slate-700">From
        <input name="from" type="date" defaultValue={fromDate} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
      </label>
      <label className="text-sm font-medium text-slate-700">To
        <input name="to" type="date" defaultValue={toDate} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
      </label>
      <div className="flex items-end gap-2">
        <button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"><Search className="h-4 w-4" /> Apply filters</button>
        {records.length > 0 && <a href={csvHref} download={`education-activity-${new Date().toISOString().slice(0, 10)}.csv`} className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Export CSV</a>}
      </div>
    </form>

    {dateError && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Enter valid dates and make sure the start date is not after the end date.</p>}
    {!campuses.length ? <section className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">No active Think Education campuses are assigned to your account.</section>
      : <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-4">
          <div>
            <h2 className="font-semibold text-slate-950">Activity records</h2>
            <p className="mt-1 text-sm text-slate-500">{totalCount.toLocaleString()} matching records · newest first</p>
          </div>
          <span className="text-sm text-slate-500">Page {page}{pageCount ? ` of ${pageCount}` : ""}</span>
        </div>
        {!records.length ? <p className="p-8 text-center text-sm text-slate-500">{dateError ? "Correct the date filters to view activity." : "No education activity matches these filters."}</p>
          : <ul className="divide-y divide-slate-100">
            {records.map((record) => {
              const metadata = record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
                ? record.metadata
                : {};
              const recordBranch = typeof metadata.branch_id === "string"
                ? metadata.branch_id
                : typeof metadata.location_id === "string" ? metadata.location_id : "";
              return <li key={record.id} className="p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-950">{displayAction(record.action)}</h3>
                    <p className="mt-1 break-all text-sm text-slate-600">
                      {displayAction(record.entity_type)}{record.entity_id ? ` · ${record.entity_id}` : ""}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      {actorNames.get(record.actor_id ?? "") ?? "System"} · {campusNames.get(recordBranch) ?? (recordBranch ? "Campus" : "Organization-wide")} · {new Date(record.created_at).toLocaleString()}
                    </p>
                  </div>
                  <details className="max-w-full text-sm text-slate-600">
                    <summary className="cursor-pointer font-medium text-blue-700">Details</summary>
                    <pre className="mt-2 max-h-64 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-xs">{JSON.stringify(metadata, null, 2)}</pre>
                  </details>
                </div>
              </li>;
            })}
          </ul>}
        {(page > 1 || (pageCount > 0 && page < pageCount)) && <nav aria-label="Activity pages" className="flex items-center justify-between border-t border-slate-100 p-4">
          {page > 1 ? <Link href={makePageHref(page - 1)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Previous</Link> : <span />}
          {pageCount > 0 && page < pageCount && <Link href={makePageHref(page + 1)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Next</Link>}
        </nav>}
      </section>}
  </main>;
}
