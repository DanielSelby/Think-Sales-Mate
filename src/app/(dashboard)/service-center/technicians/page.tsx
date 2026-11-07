import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { TechnicianDirectory, type TechnicianDirectoryRow } from "@/components/service-center/technician-directory";
import { calculateTechnicianMetrics } from "@/lib/service-center/technician-metrics";
import type { ServiceJobStatus } from "@/types/database";

export const dynamic = "force-dynamic";
export const metadata = { title: "Technicians · Think Service & Repairs" };

type TechnicianJob = {
  id: string;
  technician_id: string | null;
  location_id: string;
  status: ServiceJobStatus;
  created_at: string;
};

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

export default async function TechniciansPage() {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const [canView, canCreate, canEdit, canViewJobs, canEditJobs, canViewAppointments] = await Promise.all([
    canPermission("service_technicians", "view"),
    canPermission("service_technicians", "create"),
    canPermission("service_technicians", "edit"),
    canPermission("service_jobs", "view"),
    canPermission("service_jobs", "edit"),
    canPermission("service_appointments", "view"),
  ]);
  if (!canView) {
    return <div role="alert" className="rounded-xl border border-dashed border-ledger-200 bg-white p-8 text-center text-sm text-ledger-600 dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-300">You do not have permission to view service technicians.</div>;
  }

  const supabase = await createClient();
  const allowedLocationIds = context.isBranchScoped
    ? context.allowedLocationIds
    : context.masterLocationId
      ? [context.masterLocationId]
      : null;
  const locationsQuery = supabase.from("business_locations")
    .select("id, name")
    .eq("org_id", context.orgId)
    .eq("is_active", true)
    .order("name");
  const locationsPromise = allowedLocationIds
    ? allowedLocationIds.length
      ? locationsQuery.in("id", allowedLocationIds)
      : Promise.resolve({ data: [], error: null })
    : locationsQuery;
  const technicianQuery = supabase.from("service_technicians")
    .select("id, user_id, location_id, skills, is_active, created_at", { count: "exact" })
    .eq("org_id", context.orgId)
    .order("created_at", { ascending: false });
  const technicianPromise = allowedLocationIds
    ? allowedLocationIds.length
      ? technicianQuery.in("location_id", allowedLocationIds)
      : Promise.resolve({ data: [], error: null, count: 0 })
    : technicianQuery;
  const [locationsResult, techniciansResult] = await Promise.all([locationsPromise, technicianPromise]);
  if (locationsResult.error) throw new Error(`Unable to load service branches: ${locationsResult.error.message}`);
  if (techniciansResult.error) throw new Error(`Unable to load technicians: ${techniciansResult.error.message}`);

  const technicians = techniciansResult.data ?? [];
  const locationIds = new Set((locationsResult.data ?? []).map((location) => location.id));
  const technicianIds = technicians.map((technician) => technician.id);
  const userIds = Array.from(new Set(technicians.map((technician) => technician.user_id)));
  const [profilesResult, membersResult, jobs] = await Promise.all([
    userIds.length
      ? supabase.from("profiles").select("id, full_name, avatar_url").in("id", userIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? supabase.from("organization_members")
        .select("user_id, role, phone, contact_email, department, location_id, secondary_location_ids, branch_scope")
        .eq("org_id", context.orgId)
        .eq("status", "active")
        .in("user_id", userIds)
      : Promise.resolve({ data: [], error: null }),
    canViewJobs && technicianIds.length && allowedLocationIds?.length !== 0
      ? loadAllRows((start, end) => {
          let query = supabase.from("service_jobs")
            .select("id, technician_id, location_id, status, created_at", { count: "exact" })
            .eq("org_id", context.orgId)
            .in("technician_id", technicianIds)
            .order("created_at", { ascending: false })
            .range(start, end);
          if (allowedLocationIds) query = query.in("location_id", allowedLocationIds);
          return query;
        }, "technician service jobs")
      : Promise.resolve([] as TechnicianJob[]),
  ]);
  if (profilesResult.error) throw new Error(`Unable to load technician profiles: ${profilesResult.error.message}`);
  if (membersResult.error) throw new Error(`Unable to load technician organization details: ${membersResult.error.message}`);

  const profiles = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile]));
  const members = new Map((membersResult.data ?? []).map((member) => [member.user_id, member]));
  const locationNames = new Map((locationsResult.data ?? []).map((location) => [location.id, location.name]));
  const relevantJobIds = jobs.map((job) => job.id);
  const completionRows: Array<{ job_id: string; created_at: string }> = [];
  if (canViewJobs && relevantJobIds.length) {
    for (let offset = 0; offset < relevantJobIds.length; offset += 100) {
      const { data, error } = await supabase.from("service_job_status_history")
        .select("job_id, created_at")
        .eq("org_id", context.orgId)
        .in("job_id", relevantJobIds.slice(offset, offset + 100))
        .in("new_status", ["completed", "closed"])
        .order("created_at", { ascending: false });
      if (error) throw new Error(`Unable to load technician completion history: ${error.message}`);
      completionRows.push(...(data ?? []));
    }
  }
  const jobsByTechnician = new Map<string, TechnicianJob[]>();
  for (const job of jobs) {
    if (!job.technician_id) continue;
    const rows = jobsByTechnician.get(job.technician_id) ?? [];
    rows.push(job);
    jobsByTechnician.set(job.technician_id, rows);
  }
  const completionByTechnician = new Map<string, Array<{ job_id: string; created_at: string }>>();
  const jobTechnicianById = new Map(jobs.filter((job) => job.technician_id).map((job) => [job.id, job.technician_id!]));
  for (const completion of completionRows) {
    const technicianId = jobTechnicianById.get(completion.job_id);
    if (!technicianId) continue;
    const rows = completionByTechnician.get(technicianId) ?? [];
    rows.push(completion);
    completionByTechnician.set(technicianId, rows);
  }

  const rows: TechnicianDirectoryRow[] = technicians
    .filter((technician) => locationIds.has(technician.location_id))
    .map((technician) => {
      const profile = profiles.get(technician.user_id);
      const member = members.get(technician.user_id);
      const name = profile?.full_name?.trim() || "Organization member";
      const assignedJobs = jobsByTechnician.get(technician.id) ?? [];
      return {
        id: technician.id,
        userId: technician.user_id,
        name,
        role: member?.department?.trim() || "Service technician",
        locationId: technician.location_id,
        locationName: locationNames.get(technician.location_id) ?? "Branch",
        phone: member?.phone ?? null,
        email: member?.contact_email ?? null,
        avatarUrl: profile?.avatar_url ?? null,
        skills: technician.skills,
        isActive: technician.is_active,
        createdAt: technician.created_at,
        metrics: calculateTechnicianMetrics(
          assignedJobs,
          completionByTechnician.get(technician.id) ?? [],
        ),
      };
    });

  const candidates = canCreate && allowedLocationIds?.length !== 0
    ? await (async () => {
        const query = supabase.from("organization_members")
          .select("user_id, role, phone, contact_email, department, location_id, secondary_location_ids, branch_scope")
          .eq("org_id", context.orgId)
          .eq("status", "active")
          .not("user_id", "is", null);
        const { data, error } = await query;
        if (error) throw new Error(`Unable to load eligible technician candidates: ${error.message}`);
        const candidateUsers = Array.from(new Set((data ?? []).map((member) => member.user_id).filter((id): id is string => Boolean(id))));
        const candidateProfiles = candidateUsers.length
          ? await supabase.from("profiles").select("id, full_name").in("id", candidateUsers)
          : { data: [], error: null };
        if (candidateProfiles.error) throw new Error(`Unable to load technician candidate names: ${candidateProfiles.error.message}`);
        const candidateNames = new Map((candidateProfiles.data ?? []).map((profile) => [profile.id, profile.full_name?.trim() || "Organization member"]));
        const registeredByLocation = new Set(technicians.map((technician) => `${technician.location_id}:${technician.user_id}`));
        return (data ?? []).flatMap((member) => {
          if (!member.user_id || !candidateNames.has(member.user_id)) return [];
          const eligibleLocations = (locationsResult.data ?? []).filter((location) =>
            !registeredByLocation.has(`${location.id}:${member.user_id}`)
            && (member.branch_scope === "all" || member.location_id === location.id || (member.secondary_location_ids ?? []).includes(location.id)),
          );
          if (!eligibleLocations.length) return [];
          return [{
            userId: member.user_id,
            name: candidateNames.get(member.user_id)!,
            locations: eligibleLocations.map(({ id, name }) => ({ id, name })),
          }];
        });
      })()
    : [];

  return (
    <TechnicianDirectory
      technicians={rows}
      candidates={candidates}
      canCreate={canCreate}
      canEdit={canEdit}
      canViewJobs={canViewJobs}
      canEditJobs={canEditJobs}
      canViewAppointments={canViewAppointments}
    />
  );
}
