import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission } from "@/lib/rbac/permissions";
import { formatCurrencyAmount } from "@/lib/currency";
import {
  calculateAverageServiceTurnaroundDays,
  calculateServicePartsSummary,
  calculateServicePaymentSummary,
} from "@/lib/service-center/report-calculations";
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

async function fetchReportRows<T>(
  loadPage: (start: number, end: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
    count: number | null;
  }>,
): Promise<T[]> {
  const pageSize = 1000;
  const firstPage = await loadPage(0, pageSize - 1);
  if (firstPage.error) throw new Error(`Unable to load service report data: ${firstPage.error.message}`);
  const rows = [...(firstPage.data ?? [])];
  const totalCount = firstPage.count ?? rows.length;

  for (let start = pageSize; start < totalCount; start += pageSize) {
    const page = await loadPage(start, Math.min(start + pageSize - 1, totalCount - 1));
    if (page.error) throw new Error(`Unable to load service report data: ${page.error.message}`);
    rows.push(...(page.data ?? []));
  }
  if (rows.length !== totalCount) {
    throw new Error(`Service report data is incomplete: expected ${totalCount} rows but loaded ${rows.length}.`);
  }
  return rows;
}

function splitIntoBatches<T>(values: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size)
  );
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
  const [canViewAppointments, canViewAccounting, canViewInventory, canViewTechnicians] = await Promise.all([
    canPermission("service_appointments", "view"),
    canPermission("accounting", "view"),
    canPermission("inventory", "view"),
    canPermission("service_technicians", "view"),
  ]);
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

  const periodStart = `${from}T00:00:00.000Z`;
  const periodEnd = `${to}T23:59:59.999Z`;
  const [paymentRows, partMovementRows, assignedJobs, closedJobHistory] = await Promise.all([
    canViewAccounting
      ? fetchReportRows((start, end) => applyLocationScope(
          supabase.from("service_invoice_payments")
            .select("amount, payment_method", { count: "exact" })
            .eq("org_id", context.orgId)
            .gte("payment_date", from)
            .lte("payment_date", to)
            .range(start, end),
        ))
      : Promise.resolve([]),
    canViewInventory
      ? fetchReportRows((start, end) => applyLocationScope(
          supabase.from("service_job_part_movements")
            .select("movement_type, quantity, unit_cost", { count: "exact" })
            .eq("org_id", context.orgId)
            .gte("created_at", periodStart)
            .lte("created_at", periodEnd)
            .range(start, end),
        ))
      : Promise.resolve([]),
    canViewTechnicians
      ? fetchReportRows((start, end) => applyLocationScope(
          supabase.from("service_jobs")
            .select("technician_id", { count: "exact" })
            .eq("org_id", context.orgId)
            .not("technician_id", "is", null)
            .gte("created_at", periodStart)
            .lte("created_at", periodEnd)
            .range(start, end),
        ))
      : Promise.resolve([]),
    fetchReportRows((start, end) => applyLocationScope(
      supabase.from("service_job_status_history")
        .select("job_id, created_at", { count: "exact" })
        .eq("org_id", context.orgId)
        .eq("new_status", "closed")
        .gte("created_at", periodStart)
        .lte("created_at", periodEnd)
        .order("created_at", { ascending: false })
        .range(start, end),
    )),
  ]);

  const closedAtByJobId = new Map<string, string>();
  for (const history of closedJobHistory) {
    if (!closedAtByJobId.has(history.job_id)) closedAtByJobId.set(history.job_id, history.created_at);
  }
  const closedJobIds = Array.from(closedAtByJobId.keys());
  const closedJobBatches = await Promise.all(splitIntoBatches(closedJobIds, 100).map((jobIds) =>
    fetchReportRows((start, end) => applyLocationScope(
      supabase.from("service_jobs")
        .select("id, created_at", { count: "exact" })
        .eq("org_id", context.orgId)
        .in("id", jobIds)
        .range(start, end),
    ))
  ));
  const closedJobs = closedJobBatches.flat();
  const averageTurnaroundDays = calculateAverageServiceTurnaroundDays(closedJobs, closedAtByJobId);
  const paymentSummary = calculateServicePaymentSummary(paymentRows);
  const partsSummary = calculateServicePartsSummary(partMovementRows);

  let technicianWorkload: Array<{ name: string; count: number }> = [];
  const assignedTechnicianIds = Array.from(new Set(assignedJobs
    .map((job) => job.technician_id)
    .filter((id): id is string => Boolean(id))));
  if (canViewTechnicians && assignedTechnicianIds.length) {
    const technicianBatches = await Promise.all(splitIntoBatches(assignedTechnicianIds, 100).map((technicianIds) =>
      fetchReportRows((start, end) => applyLocationScope(
        supabase.from("service_technicians")
          .select("id, user_id", { count: "exact" })
          .in("id", technicianIds)
          .range(start, end),
      ))
    ));
    const technicians = technicianBatches.flat();
    const technicianById = new Map(technicians.map((technician) => [technician.id, technician.user_id]));
    const userIds = Array.from(new Set(technicians.map((technician) => technician.user_id)));
    const profiles = await Promise.all(splitIntoBatches(userIds, 100).map((userBatch) =>
      supabase.from("profiles").select("id, full_name").in("id", userBatch)
    ));
    const failedProfiles = profiles.find((profile) => profile.error);
    if (failedProfiles?.error) throw new Error(`Unable to load technician names for reports: ${failedProfiles.error.message}`);
    const profileNameById = new Map(profiles.flatMap((profile) =>
      (profile.data ?? []).map((row) => [row.id, row.full_name] as const)
    ));
    const counts = new Map<string, number>();
    for (const job of assignedJobs) {
      if (job.technician_id) counts.set(job.technician_id, (counts.get(job.technician_id) ?? 0) + 1);
    }
    technicianWorkload = Array.from(counts, ([technicianId, count]) => {
      const userId = technicianById.get(technicianId);
      return { name: (userId && profileNameById.get(userId))?.trim() || null, count };
    }).sort((left, right) => right.count - left.count || (left.name ?? "").localeCompare(right.name ?? ""))
      .slice(0, 10)
      .map((technician, index) => ({ ...technician, name: technician.name || `Technician ${index + 1}` }));
  }

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

      <section className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <p className="text-sm text-ledger-500 dark:text-ledger-400">Jobs closed in selected period</p>
          <p className="mt-2 text-3xl font-semibold text-ink-900 dark:text-white">{closedAtByJobId.size}</p>
          <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">Includes handed-over jobs closed during these dates</p>
        </article>
        <article className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <p className="text-sm text-ledger-500 dark:text-ledger-400">Average repair turnaround</p>
          <p className="mt-2 text-3xl font-semibold text-ink-900 dark:text-white">
            {averageTurnaroundDays === null ? "—" : `${averageTurnaroundDays.toFixed(1)} days`}
          </p>
          <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">From job intake to closure for jobs closed in the selected period</p>
        </article>
      </section>

      {canViewAccounting && (
        <section className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <h2 className="font-semibold text-ink-900 dark:text-white">Repair payments collected</h2>
          <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">Recorded repair invoice payments dated {from} to {to}; amounts are collections, not invoice totals.</p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs text-ledger-500 dark:text-ledger-400">Total collected</p>
              <p className="mt-1 text-2xl font-semibold text-ink-900 dark:text-white">
                {formatCurrencyAmount(paymentSummary.total, { code: context.currency })}
              </p>
            </div>
            <p className="text-sm text-ledger-600 dark:text-ledger-300">{paymentSummary.count} payment{paymentSummary.count === 1 ? "" : "s"}</p>
          </div>
          {paymentSummary.methods.length > 0 && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {paymentSummary.methods.map((method) => (
                <div key={method.name} className="flex items-center justify-between rounded-lg bg-ledger-50 px-4 py-3 dark:bg-ink-800">
                  <span className="text-sm text-ledger-700 dark:text-ledger-200">{method.name} ({method.count})</span>
                  <span className="text-sm font-semibold text-ink-900 dark:text-white">
                    {formatCurrencyAmount(method.amount, { code: context.currency })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {canViewInventory && (
        <section className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <h2 className="font-semibold text-ink-900 dark:text-white">Repair parts movement</h2>
          <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">Stock issues and returns recorded {from} to {to}; value uses inventory cost, not customer charges.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-ledger-50 px-4 py-3 dark:bg-ink-800">
              <p className="text-xs text-ledger-500 dark:text-ledger-400">Units issued</p>
              <p className="mt-1 font-semibold text-ink-900 dark:text-white">{partsSummary.issuedQuantity}</p>
            </div>
            <div className="rounded-lg bg-ledger-50 px-4 py-3 dark:bg-ink-800">
              <p className="text-xs text-ledger-500 dark:text-ledger-400">Units returned</p>
              <p className="mt-1 font-semibold text-ink-900 dark:text-white">{partsSummary.returnedQuantity}</p>
            </div>
            <div className="rounded-lg bg-ledger-50 px-4 py-3 dark:bg-ink-800">
              <p className="text-xs text-ledger-500 dark:text-ledger-400">Net inventory cost</p>
              <p className="mt-1 font-semibold text-ink-900 dark:text-white">
                {formatCurrencyAmount(partsSummary.netCost, { code: context.currency })}
              </p>
            </div>
          </div>
        </section>
      )}

      {canViewTechnicians && (
        <section className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <h2 className="font-semibold text-ink-900 dark:text-white">Technician workload</h2>
          <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">Jobs received in the selected period, grouped by the technician currently assigned.</p>
          {technicianWorkload.length ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {technicianWorkload.map((technician, index) => (
                <div key={`${technician.name}-${index}`} className="flex items-center justify-between rounded-lg bg-ledger-50 px-4 py-3 dark:bg-ink-800">
                  <span className="text-sm text-ledger-700 dark:text-ledger-200">{technician.name}</span>
                  <span className="font-semibold text-ink-900 dark:text-white">{technician.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-ledger-500 dark:text-ledger-400">No assigned technician jobs were received in this period.</p>
          )}
        </section>
      )}

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
