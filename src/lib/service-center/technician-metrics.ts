import type { ServiceJobStatus } from "@/types/database";

const terminalStatuses = new Set<ServiceJobStatus>(["completed", "closed", "cancelled"]);
const successfulStatuses = new Set<ServiceJobStatus>(["completed", "closed"]);

export type TechnicianMetricJob = {
  id: string;
  status: ServiceJobStatus;
  created_at: string;
};

export type TechnicianCompletion = {
  job_id: string;
  created_at: string;
};

export function calculateTechnicianMetrics(
  jobs: readonly TechnicianMetricJob[],
  completionEvents: readonly TechnicianCompletion[],
) {
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const validCompletionEvents = completionEvents.filter((event) =>
    jobById.has(event.job_id) && Number.isFinite(new Date(event.created_at).getTime()),
  );
  const completedJobIds = new Set(validCompletionEvents.map((event) => event.job_id));
  const durations: number[] = [];

  for (const event of validCompletionEvents) {
    const job = jobById.get(event.job_id);
    if (!job) continue;
    const duration = new Date(event.created_at).getTime() - new Date(job.created_at).getTime();
    if (Number.isFinite(duration) && duration >= 0) durations.push(duration / 86_400_000);
  }

  const completedJobs = jobs.filter((job) => successfulStatuses.has(job.status)).length;
  const nonCancelledJobs = jobs.filter((job) => job.status !== "cancelled").length;
  return {
    totalJobs: jobs.length,
    completedJobs,
    openJobs: jobs.filter((job) => !terminalStatuses.has(job.status)).length,
    cancelledJobs: jobs.filter((job) => job.status === "cancelled").length,
    completionRate: nonCancelledJobs ? Math.round((completedJobs / nonCancelledJobs) * 1000) / 10 : null,
    averageResolutionDays: durations.length
      ? Math.round((durations.reduce((total, duration) => total + duration, 0) / durations.length) * 10) / 10
      : null,
    completionEvents: completedJobIds.size,
  };
}
