import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { ArrowLeft, BriefcaseBusiness, CalendarClock, Clock3, MapPin, Star } from "lucide-react";
import { TechnicianProfileWorkspace, type TechnicianProfileData } from "@/components/service-center/technician-profile-workspace";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission } from "@/lib/rbac/permissions";
import { calculateTechnicianMetrics } from "@/lib/service-center/technician-metrics";
import { createClient } from "@/lib/supabase/server";
import type { ServiceJobStatus } from "@/types/database";

export const dynamic = "force-dynamic";
export const metadata = { title: "Technician Profile · Think Service & Repairs" };

type JobRow = {
  id: string;
  job_number: string;
  location_id: string;
  customer_id: string;
  asset_id: string | null;
  technician_id: string | null;
  status: ServiceJobStatus;
  priority: string;
  reported_problem: string;
  created_at: string;
};

const SERVICE_JOB_STATUSES: ServiceJobStatus[] = [
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

function isServiceJobStatus(value: string): value is ServiceJobStatus {
  return SERVICE_JOB_STATUSES.some((status) => status === value);
}

async function loadAllRows<T>(
  loadPage: (start: number, end: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
    count: number | null;
  }>,
  label: string,
) {
  const pageSize = 1000;
  const first = await loadPage(0, pageSize - 1);
  if (first.error) throw new Error(`Unable to load ${label}: ${first.error.message}`);
  const rows = [...(first.data ?? [])];
  const total = first.count ?? rows.length;
  for (let start = pageSize; start < total; start += pageSize) {
    const page = await loadPage(start, Math.min(start + pageSize - 1, total - 1));
    if (page.error) throw new Error(`Unable to load ${label}: ${page.error.message}`);
    rows.push(...(page.data ?? []));
  }
  if (rows.length !== total) throw new Error(`Incomplete ${label}: expected ${total} rows but loaded ${rows.length}.`);
  return rows;
}

export default async function TechnicianProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;
  const [canViewTechnicians, canEditTechnicians, canViewJobs, canEditJobs, canViewAppointments] = await Promise.all([
    canPermission("service_technicians", "view"),
    canPermission("service_technicians", "edit"),
    canPermission("service_jobs", "view"),
    canPermission("service_jobs", "edit"),
    canPermission("service_appointments", "view"),
  ]);
  if (!canViewTechnicians) {
    return <div role="alert" className="rounded-xl border border-dashed border-ledger-200 bg-white p-8 text-center text-sm text-ledger-600 dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-300">You do not have permission to view technician profiles.</div>;
  }

  const supabase = await createClient();
  const allowedLocationIds = context.isBranchScoped
    ? context.allowedLocationIds
    : context.masterLocationId
      ? [context.masterLocationId]
      : null;
  let technicianQuery = supabase.from("service_technicians")
    .select("id, user_id, location_id, skills, is_active, created_at")
    .eq("org_id", context.orgId)
    .eq("id", id);
  if (allowedLocationIds) technicianQuery = technicianQuery.in("location_id", allowedLocationIds);
  const { data: technician, error: technicianError } = await technicianQuery.maybeSingle();
  if (technicianError) throw new Error(`Unable to load technician profile: ${technicianError.message}`);
  if (!technician) notFound();

  const [{ data: profile, error: profileError }, { data: member, error: memberError }, { data: location, error: locationError }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, avatar_url").eq("id", technician.user_id).maybeSingle(),
    supabase.from("organization_members")
      .select("user_id, role, phone, contact_email, department")
      .eq("org_id", context.orgId)
      .eq("user_id", technician.user_id)
      .eq("status", "active")
      .maybeSingle(),
    supabase.from("business_locations").select("id, name").eq("org_id", context.orgId).eq("id", technician.location_id).maybeSingle(),
  ]);
  if (profileError) throw new Error(`Unable to load technician name and photo: ${profileError.message}`);
  if (memberError) throw new Error(`Unable to load technician contact details: ${memberError.message}`);
  if (locationError) throw new Error(`Unable to load technician branch: ${locationError.message}`);

  const [allJobs, appointmentsResult, otherTechniciansResult] = await Promise.all([
    canViewJobs
      ? loadAllRows((start, end) => {
          let query = supabase.from("service_jobs")
            .select("id, job_number, location_id, customer_id, asset_id, technician_id, status, priority, reported_problem, created_at", { count: "exact" })
            .eq("org_id", context.orgId)
            .eq("location_id", technician.location_id)
            .order("created_at", { ascending: false })
            .range(start, end);
          if (!allowedLocationIds) return query;
          query = query.in("location_id", allowedLocationIds);
          return query;
        }, "branch service jobs")
      : Promise.resolve([] as JobRow[]),
    canViewAppointments
      ? (() => {
          let query = supabase.from("service_appointments")
            .select("id, title, starts_at, ends_at, status, job_id, customer_id")
            .eq("org_id", context.orgId)
            .eq("location_id", technician.location_id)
            .eq("technician_id", technician.id)
            .in("status", ["scheduled", "confirmed"])
            .gte("ends_at", new Date().toISOString())
            .order("starts_at", { ascending: true })
            .limit(50);
          if (allowedLocationIds) query = query.in("location_id", allowedLocationIds);
          return query;
        })()
      : Promise.resolve({ data: [], error: null }),
    supabase.from("service_technicians")
      .select("id, user_id, skills")
      .eq("org_id", context.orgId)
      .eq("location_id", technician.location_id)
      .eq("is_active", true),
  ]);
  if (appointmentsResult.error) throw new Error(`Unable to load technician appointments: ${appointmentsResult.error.message}`);
  if (otherTechniciansResult.error) throw new Error(`Unable to load branch technicians: ${otherTechniciansResult.error.message}`);

  const jobs = allJobs.filter((job) => job.technician_id === technician.id);
  const jobIds = jobs.map((job) => job.id);
  const recentJobs = jobs.slice(0, 50);
  const openJobs = allJobs.filter((job) =>
    job.technician_id === null && !["completed", "closed", "cancelled"].includes(job.status),
  );
  const appointmentCustomerIds = (appointmentsResult.data ?? []).map((appointment) => appointment.customer_id);
  const customerIds = Array.from(new Set([
    ...recentJobs.map((job) => job.customer_id),
    ...openJobs.slice(0, 100).map((job) => job.customer_id),
    ...appointmentCustomerIds,
  ]));
  const assetIds = Array.from(new Set(recentJobs.flatMap((job) => job.asset_id ? [job.asset_id] : [])));
  const [customersResult, assetsResult, historyRows, assignableProfileResult] = await Promise.all([
    customerIds.length
      ? supabase.from("customers")
        .select("id, name")
        .eq("org_id", context.orgId)
        .in("id", customerIds)
      : Promise.resolve({ data: [], error: null }),
    assetIds.length
      ? supabase.from("service_assets")
        .select("id, asset_type, brand, model")
        .eq("org_id", context.orgId)
        .eq("location_id", technician.location_id)
        .in("id", assetIds)
      : Promise.resolve({ data: [], error: null }),
    jobIds.length
      ? Promise.all(Array.from({ length: Math.ceil(jobIds.length / 100) }, (_, index) =>
          loadAllRows((start, end) => supabase.from("service_job_status_history")
            .select("id, job_id, previous_status, new_status, created_at", { count: "exact" })
            .eq("org_id", context.orgId)
            .eq("location_id", technician.location_id)
            .in("job_id", jobIds.slice(index * 100, index * 100 + 100))
            .order("created_at", { ascending: false })
            .range(start, end), "technician job history")
        )).then((batches) => batches.flat())
      : Promise.resolve([] as Array<{ id: string; job_id: string; previous_status: ServiceJobStatus | null; new_status: ServiceJobStatus; created_at: string }>),
    (otherTechniciansResult.data ?? []).length
      ? supabase.from("profiles")
        .select("id, full_name")
        .in("id", Array.from(new Set((otherTechniciansResult.data ?? []).map((other) => other.user_id))))
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (customersResult.error) throw new Error(`Unable to load technician job customers: ${customersResult.error.message}`);
  if (assetsResult.error) throw new Error(`Unable to load technician job equipment: ${assetsResult.error.message}`);
  if (assignableProfileResult.error) throw new Error(`Unable to load branch technician names: ${assignableProfileResult.error.message}`);
  const customerNames = new Map((customersResult.data ?? []).map((customer) => [customer.id, customer.name]));
  const assetNames = new Map((assetsResult.data ?? []).map((asset) => [
    asset.id,
    [asset.asset_type, asset.brand, asset.model].filter(Boolean).join(" "),
  ]));
  const technicianNames = new Map((assignableProfileResult.data ?? []).map((row) => [row.id, profileDataName(row.full_name)]));
  const completionRows = historyRows
    .filter((history) => history.new_status === "completed" || history.new_status === "closed")
    .map(({ job_id, created_at }) => ({ job_id, created_at }));
  const metrics = calculateTechnicianMetrics(jobs, completionRows);
  const assignedJobIds = new Set(jobs.map((job) => job.id));
  const assignedHistory = historyRows.filter((history): history is typeof history & {
    previous_status: ServiceJobStatus | null;
    new_status: ServiceJobStatus;
  } =>
    assignedJobIds.has(history.job_id)
    && isServiceJobStatus(history.new_status)
    && (history.previous_status === null || isServiceJobStatus(history.previous_status)),
  );
  const months = new Map<string, number>();
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 5, 1);
  for (const history of assignedHistory) {
    if (history.new_status !== "completed" && history.new_status !== "closed") continue;
    const month = history.created_at.slice(0, 7);
    if (new Date(`${month}-01T00:00:00.000Z`) >= sixMonthsAgo) {
      months.set(month, (months.get(month) ?? 0) + 1);
    }
  }

  const directoryJobs = jobs.slice(0, 50).map((job) => ({
    id: job.id,
    number: job.job_number,
    customer: customerNames.get(job.customer_id) ?? "Customer",
    asset: job.asset_id ? assetNames.get(job.asset_id) ?? "Service equipment" : "Repair service",
    status: job.status,
    priority: job.priority,
    reportedProblem: job.reported_problem,
    createdAt: job.created_at,
  }));
  const profileData: TechnicianProfileData = {
    technician: {
      id: technician.id,
      userId: technician.user_id,
      name: profile?.full_name?.trim() || "Organization member",
      title: member?.department?.trim() || "Service technician",
      phone: member?.phone ?? null,
      email: member?.contact_email ?? null,
      avatarUrl: profile?.avatar_url ?? null,
      locationId: technician.location_id,
      locationName: location?.name ?? "Branch",
      skills: technician.skills,
      isActive: technician.is_active,
      createdAt: technician.created_at,
    },
    metrics,
    chart: Array.from({ length: 6 }, (_, index) => {
      const month = new Date();
      month.setUTCDate(1);
      month.setUTCMonth(month.getUTCMonth() - (5 - index));
      const key = month.toISOString().slice(0, 7);
      return { month: key, completed: months.get(key) ?? 0 };
    }),
    jobs: directoryJobs,
    history: assignedHistory.slice(0, 80).map((event) => ({
      id: event.id,
      jobNumber: jobs.find((job) => job.id === event.job_id)?.job_number ?? "Service job",
      previousStatus: event.previous_status,
      status: event.new_status,
      createdAt: event.created_at,
    })),
    appointments: (appointmentsResult.data ?? []).map((appointment) => ({
      id: appointment.id,
      title: appointment.title,
      startsAt: appointment.starts_at,
      endsAt: appointment.ends_at,
      status: appointment.status,
      jobNumber: appointment.job_id ? jobs.find((job) => job.id === appointment.job_id)?.job_number ?? null : null,
      customerName: customerNames.get(appointment.customer_id) ?? "Customer",
    })),
    assignableJobs: openJobs.slice(0, 100).map((job) => ({
      id: job.id,
      number: job.job_number,
      status: job.status,
      customer: customerNames.get(job.customer_id) ?? "Customer",
    })),
    assignableTechnicians: (otherTechniciansResult.data ?? []).map((other) => ({
      id: other.id,
      name: technicianNames.get(other.user_id) ?? "Organization member",
      skills: other.skills,
    })),
    canEditTechnician: canEditTechnicians,
    canAssignJobs: canEditJobs,
    canViewJobs,
    canViewAppointments,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/service-center/technicians" className="inline-flex items-center gap-2 text-sm font-medium text-ledger-600 hover:text-ledger-900 dark:text-ledger-300 dark:hover:text-white"><ArrowLeft className="h-4 w-4" /> Technicians</Link>
        <div className="flex flex-wrap gap-2 text-xs text-ledger-500">
          <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{profileData.technician.locationName}</span>
          <span className="inline-flex items-center gap-1"><BriefcaseBusiness className="h-3.5 w-3.5" />{canViewJobs ? `${metrics.totalJobs} current assignments` : "Job data restricted"}</span>
          {canViewAppointments && <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />{profileData.appointments.length} upcoming appointments</span>}
          {metrics.averageResolutionDays !== null && <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{metrics.averageResolutionDays} day avg. resolution</span>}
          {metrics.completionRate !== null && <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5" />{metrics.completionRate}% completion rate</span>}
        </div>
      </div>
      <TechnicianProfileWorkspace data={profileData} />
    </div>
  );
}

function profileDataName(value: string | null | undefined) {
  return value?.trim() || "Organization member";
}
