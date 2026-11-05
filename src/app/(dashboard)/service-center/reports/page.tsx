import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import type { ServiceAppointmentStatus, ServiceJobStatus } from "@/types/database";

const jobStatuses: ServiceJobStatus[] = [
  "received",
  "inspection",
  "awaiting_quotation",
  "awaiting_customer_approval",
  "approved",
  "rejected",
  "in_progress",
  "awaiting_parts",
  "quality_check",
  "ready_for_collection",
  "awaiting_payment",
  "completed",
  "closed",
  "cancelled",
];

const jobStatusLabels: Record<ServiceJobStatus, string> = {
  received: "Received",
  inspection: "Inspection",
  awaiting_quotation: "Awaiting quotation",
  awaiting_customer_approval: "Awaiting customer approval",
  approved: "Approved",
  rejected: "Rejected",
  in_progress: "In progress",
  awaiting_parts: "Awaiting parts",
  quality_check: "Quality check",
  ready_for_collection: "Ready for collection",
  awaiting_payment: "Awaiting payment",
  completed: "Completed",
  closed: "Closed",
  cancelled: "Cancelled",
};

const appointmentStatuses: ServiceAppointmentStatus[] = [
  "scheduled",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
];

const appointmentStatusLabels: Record<ServiceAppointmentStatus, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

function isValidDate(value?: string): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function defaultRange() {
  const to = new Date().toISOString().slice(0, 10);
  const fromDate = new Date(`${to}T00:00:00.000Z`);
  fromDate.setUTCDate(fromDate.getUTCDate() - 29);
  return { from: fromDate.toISOString().slice(0, 10), to };
}

export default async function ServiceReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  if (!await canPermission("service_jobs", "view")) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-dashed border-ledger-200 bg-white p-10 text-center dark:border-ledger-700 dark:bg-ink-900">
        <p className="text-sm text-ledger-500">You do not have permission to view service reports.</p>
      </div>
    );
  }

  const params = await searchParams;
  const defaults = defaultRange();
  const isRangeValid = isValidDate(params.from) && isValidDate(params.to) && params.from <= params.to;
  const from = isRangeValid ? params.from : defaults.from;
  const to = isRangeValid ? params.to : defaults.to;
  const allowedLocationIds = context.isBranchScoped
    ? Array.from(new Set([context.locationId, ...context.secondaryLocationIds].filter((id): id is string => Boolean(id))))
    : context.masterLocationId
      ? [context.masterLocationId]
      : null;
  const canViewAppointments = await canPermission("service_appointments", "view");
  const supabase = await createClient();

  const applyLocationScope = <T extends { in: (column: string, values: string[]) => T }>(query: T): T => {
    if (allowedLocationIds) return query.in("location_id", allowedLocationIds);
    return query;
  };
  const countJobsByStatus = (status: ServiceJobStatus) => {
    let query = supabase.from("service_jobs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", context.orgId)
      .eq("status", status);
    query = applyLocationScope(query);
    return query;
  };

  const createdJobsQuery = applyLocationScope(
    supabase.from("service_jobs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", context.orgId)
      .gte("created_at", `${from}T00:00:00.000Z`)
      .lte("created_at", `${to}T23:59:59.999Z`),
  );
  const totalJobsQuery = applyLocationScope(
    supabase.from("service_jobs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", context.orgId),
  );
  const appointmentCountQueries = canViewAppointments
    ? appointmentStatuses.map((status) => {
        let query = supabase.from("service_appointments")
          .select("id", { count: "exact", head: true })
          .eq("org_id", context.orgId)
          .eq("status", status)
          .gte("starts_at", `${from}T00:00:00.000Z`)
          .lte("starts_at", `${to}T23:59:59.999Z`);
        query = applyLocationScope(query);
        return query;
      })
    : [];
  const [totalJobsResult, createdJobsResult, jobStatusResults, appointmentResults] = await Promise.all([
    totalJobsQuery,
    createdJobsQuery,
    Promise.all(jobStatuses.map(countJobsByStatus)),
    Promise.all(appointmentCountQueries),
  ]);
  if (totalJobsResult.error) throw new Error(`Unable to count service jobs: ${totalJobsResult.error.message}`);
  if (createdJobsResult.error) throw new Error(`Unable to count jobs received in this period: ${createdJobsResult.error.message}`);
  const failedJobStatus = jobStatusResults.find((result) => result.error);
  if (failedJobStatus?.error) throw new Error(`Unable to count jobs by status: ${failedJobStatus.error.message}`);
  const failedAppointmentResult = appointmentResults.find((result) => result.error);
  if (failedAppointmentResult?.error) throw new Error(`Unable to count service appointments: ${failedAppointmentResult.error.message}`);

  const jobCounts = jobStatuses.map((status, index) => ({
    status,
    label: jobStatusLabels[status],
    count: jobStatusResults[index].count ?? 0,
  }));
  const appointmentCounts = appointmentStatuses.map((status, index) => ({
    status,
    label: appointmentStatusLabels[status],
    count: appointmentResults[index]?.count ?? 0,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href="/service-center" className="inline-flex items-center gap-1 text-sm text-ledger-500 hover:text-ink-900 dark:hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to service jobs
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink-900 dark:text-white">Service reports</h1>
        <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">A live view of repair workload and appointment activity for branches you can access.</p>
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-3 rounded-card border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
        <label className="space-y-1.5 text-sm font-medium text-ledger-700 dark:text-ledger-200">
          <span>From</span>
          <input name="from" type="date" required defaultValue={from} className="block rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800" />
        </label>
        <label className="space-y-1.5 text-sm font-medium text-ledger-700 dark:text-ledger-200">
          <span>To</span>
          <input name="to" type="date" required min={from} defaultValue={to} className="block rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800" />
        </label>
        <button type="submit" className="rounded-lg bg-ledger-100 px-4 py-2 text-sm font-medium text-ledger-700 hover:bg-ledger-200 dark:bg-ink-700 dark:text-ledger-200 dark:hover:bg-ink-600">
          Apply dates
        </button>
      </form>

      <div className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <p className="text-sm text-ledger-500 dark:text-ledger-400">Total service jobs</p>
          <p className="mt-2 text-3xl font-semibold text-ink-900 dark:text-white">{totalJobsResult.count ?? 0}</p>
          <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">Across your accessible branches</p>
        </article>
        <article className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <p className="text-sm text-ledger-500 dark:text-ledger-400">Jobs received in selected period</p>
          <p className="mt-2 text-3xl font-semibold text-ink-900 dark:text-white">{createdJobsResult.count ?? 0}</p>
          <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">{from} to {to}</p>
        </article>
      </div>

      <section className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
        <h2 className="font-semibold text-ink-900 dark:text-white">Current jobs by status</h2>
        <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">Counts reflect the current status for each job, regardless of when it was received.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {jobCounts.map((item) => (
            <div key={item.status} className="flex items-center justify-between rounded-lg bg-ledger-50 px-4 py-3 dark:bg-ink-800">
              <span className="text-sm text-ledger-700 dark:text-ledger-200">{item.label}</span>
              <span className="font-semibold text-ink-900 dark:text-white">{item.count}</span>
            </div>
          ))}
        </div>
      </section>

      {canViewAppointments && (
        <section className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <h2 className="font-semibold text-ink-900 dark:text-white">Appointments starting in selected period</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {appointmentCounts.map((item) => (
              <div key={item.status} className="flex items-center justify-between rounded-lg bg-ledger-50 px-4 py-3 dark:bg-ink-800">
                <span className="text-sm text-ledger-700 dark:text-ledger-200">{item.label}</span>
                <span className="font-semibold text-ink-900 dark:text-white">{item.count}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
