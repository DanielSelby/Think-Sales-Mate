"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Mail,
  MapPin,
  Phone,
  Save,
  type LucideIcon,
  UserRound,
  Wrench,
} from "lucide-react";
import {
  assignServiceJobTechnician,
  updateServiceTechnician,
} from "@/app/(dashboard)/service-center/actions";
import type { calculateTechnicianMetrics } from "@/lib/service-center/technician-metrics";
import type { ServiceAppointmentStatus, ServiceJobStatus } from "@/types/database";

type Metrics = ReturnType<typeof calculateTechnicianMetrics>;
type ProfileJob = {
  id: string;
  number: string;
  customer: string;
  asset: string;
  status: ServiceJobStatus;
  priority: string;
  reportedProblem: string;
  createdAt: string;
};

export type TechnicianProfileData = {
  technician: {
    id: string;
    userId: string;
    name: string;
    title: string;
    phone: string | null;
    email: string | null;
    avatarUrl: string | null;
    locationId: string;
    locationName: string;
    skills: string[];
    isActive: boolean;
    createdAt: string;
  };
  metrics: Metrics;
  chart: Array<{ month: string; completed: number }>;
  jobs: ProfileJob[];
  history: Array<{
    id: string;
    jobNumber: string;
    previousStatus: ServiceJobStatus | null;
    status: ServiceJobStatus;
    createdAt: string;
  }>;
  appointments: Array<{
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    status: ServiceAppointmentStatus;
    jobNumber: string | null;
    customerName: string;
  }>;
  assignableJobs: Array<{ id: string; number: string; status: ServiceJobStatus; customer: string }>;
  assignableTechnicians: Array<{ id: string; name: string; skills: string[] }>;
  canEditTechnician: boolean;
  canAssignJobs: boolean;
  canViewJobs: boolean;
  canViewAppointments: boolean;
};

const STATUS_LABELS: Record<ServiceJobStatus, string> = {
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
  closed: "Handed over",
  cancelled: "Cancelled",
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "T";
}

function formatMonth(month: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short" }).format(new Date(`${month}-01T00:00:00`));
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function TechnicianProfileWorkspace({ data }: { data: TechnicianProfileData }) {
  const router = useRouter();
  const { technician, metrics } = data;
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const groupedJobs = [
    { label: "Total jobs", value: metrics.totalJobs },
    { label: "Completed", value: metrics.completedJobs },
    { label: "In progress", value: data.jobs.filter((job) => job.status === "in_progress").length },
    { label: "Cancelled", value: metrics.cancelledJobs },
  ];

  async function submitProfile(formData: FormData) {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const result = await updateServiceTechnician(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
      setNotice("Technician profile updated.");
      router.refresh();
    } catch (cause) {
      console.error("Service technician update failed:", cause);
      setError("The technician profile could not be updated. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function submitAssignment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const result = await assignServiceJobTechnician(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice("Service job assignment updated.");
      router.refresh();
    } catch (cause) {
      console.error("Service job assignment failed:", cause);
      setError("The service job assignment could not be updated. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="service-center-ui space-y-5">
      {(error || notice) && <p role={error ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200" : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"}`}>{error ?? notice}</p>}

      <header className="relative overflow-hidden rounded-2xl border border-ledger-200 bg-white dark:border-ledger-700 dark:bg-ink-900">
        <div className="h-28 bg-gradient-to-r from-ink-950 via-ink-900 to-amber-900/80" />
        <div className="flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end">
          <div className="-mt-12 flex items-end gap-4">
            <span className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-amber-100 text-2xl font-bold text-amber-900 shadow-md dark:border-ink-900 dark:bg-amber-950 dark:text-amber-200">
              {technician.avatarUrl ? <Image src={technician.avatarUrl} alt="" width={96} height={96} unoptimized className="h-full w-full object-cover" /> : initials(technician.name)}
            </span>
            <div className="pb-1">
              <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold text-ledger-900 dark:text-white">{technician.name}</h1><StatusBadge active={technician.isActive} /></div>
              <p className="mt-1 text-sm text-ledger-600 dark:text-ledger-300">{technician.title}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-1 text-xs text-ledger-600 dark:text-ledger-300 sm:ml-auto">
            {technician.phone && <a href={`tel:${technician.phone}`} className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{technician.phone}</a>}
            {technician.email && <a href={`mailto:${technician.email}`} className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{technician.email}</a>}
            <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{technician.locationName}</span>
            {data.canEditTechnician && <button type="button" onClick={() => setEditing((value) => !value)} className="inline-flex items-center gap-1 rounded-lg border border-ledger-200 px-3 py-2 font-medium hover:bg-ledger-50 dark:border-ledger-700 dark:hover:bg-ink-800">{editing ? "Close editor" : "Edit profile"}</button>}
          </div>
        </div>
        <nav aria-label="Technician profile sections" className="flex gap-5 overflow-x-auto border-t border-ledger-100 px-5 dark:border-ledger-800">
          {[["overview", "Overview"], ["job-history", "Job History"], ["skills", "Skills & Expertise"], ["performance", "Performance"], ["availability", "Availability"]].map(([id, label]) => <a key={id} href={`#${id}`} className="whitespace-nowrap border-b-2 border-transparent py-3 text-xs font-medium text-ledger-600 hover:border-amber-600 hover:text-amber-800 dark:text-ledger-300 dark:hover:text-amber-300">{label}</a>)}
        </nav>
      </header>

      {editing && (
        <form action={submitProfile} className="grid gap-4 rounded-xl border border-ledger-200 bg-white p-5 dark:border-ledger-700 dark:bg-ink-900 sm:grid-cols-2">
          <div className="sm:col-span-2"><h2 className="font-semibold text-ledger-900 dark:text-white">Edit technician details</h2><p className="mt-1 text-xs text-ledger-500">The technician is an existing organization member; contact details are managed in organization membership.</p></div>
          <input type="hidden" name="technicianId" value={technician.id} />
          <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200 sm:col-span-2"><span>Skills (comma separated, up to 20)</span><input name="technicianSkills" defaultValue={technician.skills.join(", ")} maxLength={1600} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800" /></label>
          <label className="space-y-1 text-sm text-ledger-700 dark:text-ledger-200"><span>Technician status</span><select name="technicianActive" defaultValue={technician.isActive ? "true" : "false"} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800"><option value="true">Active</option><option value="false">Inactive</option></select></label>
          <div className="flex items-end justify-end"><button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"><Save className="h-4 w-4" />{pending ? "Saving..." : "Save profile"}</button></div>
        </form>
      )}

      <section id="overview" className="scroll-mt-24 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {groupedJobs.map((item) => <article key={item.label} className="rounded-xl border border-ledger-200 bg-white p-4 dark:border-ledger-700 dark:bg-ink-900"><div className="flex items-center gap-2 text-xs text-ledger-500 dark:text-ledger-400"><BriefcaseBusiness className="h-4 w-4 text-amber-700" />{item.label}</div><p className="mt-3 text-2xl font-semibold text-ledger-900 dark:text-white">{data.canViewJobs ? item.value : "Restricted"}</p></article>)}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.85fr]">
        <article id="performance" className="scroll-mt-24 rounded-xl border border-ledger-200 bg-white p-5 dark:border-ledger-700 dark:bg-ink-900">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-ledger-900 dark:text-white">Performance Overview</h2><p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">Recorded completions for currently assigned jobs over the last six months.</p></div><div className="flex gap-4 text-xs text-ledger-600 dark:text-ledger-300"><span>{metrics.completionRate == null ? "—" : `${metrics.completionRate}%`} completion</span><span>{metrics.averageResolutionDays == null ? "—" : `${metrics.averageResolutionDays} days`} avg. resolution</span></div></div>
          {data.canViewJobs && data.chart.some((point) => point.completed > 0) ? (
            <div className="mt-4 h-56">
              <ResponsiveContainer width="100%" height="100%"><AreaChart data={data.chart} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}><defs><linearGradient id="technicianCompletion" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#d97706" stopOpacity={0.24} /><stop offset="95%" stopColor="#d97706" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="month" tickFormatter={formatMonth} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} /><Tooltip labelFormatter={(value) => formatMonth(String(value))} formatter={(value) => [value, "Completed jobs"]} /><Area type="monotone" dataKey="completed" stroke="#d97706" fill="url(#technicianCompletion)" strokeWidth={2.5} /></AreaChart></ResponsiveContainer>
            </div>
          ) : <div className="mt-4 flex h-56 items-center justify-center rounded-lg bg-ledger-50 text-sm text-ledger-500 dark:bg-ink-800 dark:text-ledger-400">{data.canViewJobs ? "No recorded job completions are available for this period." : "Service job access is required to view performance."}</div>}
        </article>
        <article className="rounded-xl border border-ledger-200 bg-white p-5 dark:border-ledger-700 dark:bg-ink-900">
          <h2 className="font-semibold text-ledger-900 dark:text-white">Technician Information</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <InfoRow icon={UserRound} label="Profile" value={technician.title} />
            <InfoRow icon={MapPin} label="Branch" value={technician.locationName} />
            <InfoRow icon={CalendarClock} label="Registered" value={new Date(technician.createdAt).toLocaleDateString()} />
            <InfoRow icon={BriefcaseBusiness} label="Open assigned jobs" value={data.canViewJobs ? String(metrics.openJobs) : "Restricted"} />
          </dl>
          <div className="mt-5 border-t border-ledger-100 pt-4 dark:border-ledger-800">
            <h3 className="text-sm font-semibold text-ledger-900 dark:text-white">Skills &amp; Expertise</h3>
            <div id="skills" className="mt-3 flex scroll-mt-24 flex-wrap gap-2">{technician.skills.length ? technician.skills.map((skill) => <span key={skill} className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{skill}</span>) : <span className="text-xs text-ledger-500">No skills have been recorded.</span>}</div>
          </div>
        </article>
      </section>

      <section id="job-history" className="scroll-mt-24 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <article className="overflow-hidden rounded-xl border border-ledger-200 bg-white dark:border-ledger-700 dark:bg-ink-900">
          <div className="flex items-center justify-between border-b border-ledger-100 px-5 py-4 dark:border-ledger-800"><div><h2 className="font-semibold text-ledger-900 dark:text-white">Current &amp; Recent Jobs</h2><p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">Jobs currently assigned to this technician, newest first.</p></div><Link href="/service-center#service-jobs" className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 dark:text-amber-300">View all <ArrowRight className="h-3.5 w-3.5" /></Link></div>
          {!data.canViewJobs ? <p className="p-6 text-sm text-ledger-500">Service job access is required to view assigned jobs.</p> : data.jobs.length ? (
            <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-ledger-50 text-xs text-ledger-500 dark:bg-ink-800 dark:text-ledger-400"><tr>{["Job", "Customer / service", "Status", "Created"].map((item) => <th key={item} className="px-4 py-3 font-medium">{item}</th>)}</tr></thead><tbody className="divide-y divide-ledger-100 dark:divide-ledger-800">{data.jobs.map((job) => <tr key={job.id}><td className="px-4 py-3"><Link href={`/service-center#job-${job.id}`} className="font-semibold text-amber-800 hover:underline dark:text-amber-300">{job.number}</Link><p className="mt-1 max-w-48 truncate text-xs text-ledger-500">{job.reportedProblem}</p></td><td className="px-4 py-3 text-xs text-ledger-700 dark:text-ledger-300">{job.customer}<p className="mt-1 text-ledger-500">{job.asset}</p></td><td className="px-4 py-3"><StatusBadge label={STATUS_LABELS[job.status]} /></td><td className="whitespace-nowrap px-4 py-3 text-xs text-ledger-500">{formatDateTime(job.createdAt)}</td></tr>)}</tbody></table></div>
          ) : <p className="p-8 text-center text-sm text-ledger-500">No service jobs are currently assigned to this technician.</p>}
        </article>

        <article className="overflow-hidden rounded-xl border border-ledger-200 bg-white dark:border-ledger-700 dark:bg-ink-900">
          <div className="border-b border-ledger-100 px-5 py-4 dark:border-ledger-800"><h2 className="font-semibold text-ledger-900 dark:text-white">Job History</h2><p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">Status changes recorded for jobs currently assigned to this technician.</p></div>
          {!data.canViewJobs ? <p className="p-6 text-sm text-ledger-500">Service job access is required to view job history.</p> : data.history.length ? <ol className="max-h-[420px] divide-y divide-ledger-100 overflow-y-auto dark:divide-ledger-800">{data.history.map((event) => <li key={event.id} className="flex gap-3 px-5 py-3"><span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"><CheckCircle2 className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-ledger-800 dark:text-ledger-200">{event.jobNumber} · {STATUS_LABELS[event.status]}</p><p className="mt-1 text-[11px] text-ledger-500">{event.previousStatus ? `${STATUS_LABELS[event.previousStatus]} → ` : ""}{formatDateTime(event.createdAt)}</p></div></li>)}</ol> : <p className="p-8 text-center text-sm text-ledger-500">No status history is recorded for this technician’s jobs.</p>}
        </article>
      </section>

      {data.canAssignJobs && (
        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-xl border border-ledger-200 bg-white p-5 dark:border-ledger-700 dark:bg-ink-900">
            <h2 className="font-semibold text-ledger-900 dark:text-white">Assign an unassigned job</h2>
            <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">Only open jobs at this technician’s branch can be assigned here.</p>
            {technician.isActive && data.assignableJobs.length ? <div className="mt-3 space-y-2">{data.assignableJobs.slice(0, 8).map((job) => <form key={job.id} onSubmit={submitAssignment} className="flex flex-wrap items-center gap-2 rounded-lg bg-ledger-50 p-3 dark:bg-ink-800"><input type="hidden" name="jobId" value={job.id} /><span className="min-w-32 flex-1 text-xs"><strong className="text-ledger-900 dark:text-white">{job.number}</strong><span className="ml-2 text-ledger-500">{job.customer} · {STATUS_LABELS[job.status]}</span></span><input type="hidden" name="technicianId" value={technician.id} /><button type="submit" disabled={pending} className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Assign to {technician.name.split(" ")[0]}</button></form>)}</div> : <p className="mt-4 text-sm text-ledger-500">{technician.isActive ? "No unassigned open jobs are available at this branch." : "Activate this technician before assigning new jobs."}</p>}
          </article>
          <article className="rounded-xl border border-ledger-200 bg-white p-5 dark:border-ledger-700 dark:bg-ink-900">
            <h2 className="font-semibold text-ledger-900 dark:text-white">Reassign current jobs</h2>
            <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">Assignments are branch-scoped and require service job edit permission.</p>
            {data.jobs.filter((job) => !["completed", "closed", "cancelled"].includes(job.status)).length ? <div className="mt-3 space-y-2">{data.jobs.filter((job) => !["completed", "closed", "cancelled"].includes(job.status)).slice(0, 8).map((job) => <form key={job.id} onSubmit={submitAssignment} className="flex flex-wrap items-center gap-2 rounded-lg bg-ledger-50 p-3 dark:bg-ink-800"><input type="hidden" name="jobId" value={job.id} /><span className="min-w-28 flex-1 text-xs font-semibold text-ledger-800 dark:text-ledger-200">{job.number}</span><select name="technicianId" defaultValue={technician.id} className="max-w-48 rounded-md border border-ledger-300 bg-white px-2 py-1.5 text-xs dark:border-ledger-600 dark:bg-ink-900"><option value="">Unassigned</option>{data.assignableTechnicians.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select><button type="submit" disabled={pending} className="rounded-md border border-ledger-300 px-2.5 py-1.5 text-xs font-medium text-ledger-700 disabled:opacity-50 dark:border-ledger-600 dark:text-ledger-200">Save</button></form>)}</div> : <p className="mt-4 text-sm text-ledger-500">No open jobs are assigned to this technician.</p>}
          </article>
        </section>
      )}

      <section id="availability" className="scroll-mt-24 rounded-xl border border-ledger-200 bg-white p-5 dark:border-ledger-700 dark:bg-ink-900">
        <div className="flex items-start gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"><CalendarClock className="h-5 w-5" /></span><div><h2 className="font-semibold text-ledger-900 dark:text-white">Availability &amp; Schedule</h2><p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">Availability is based on appointments already scheduled in the service calendar.</p></div></div>
        {!data.canViewAppointments ? <p className="mt-4 text-sm text-ledger-500">Appointment access is required to view this schedule.</p> : data.appointments.length ? <ul className="mt-4 divide-y divide-ledger-100 dark:divide-ledger-800">{data.appointments.map((appointment) => <li key={appointment.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div><p className="text-sm font-medium text-ledger-800 dark:text-ledger-200">{appointment.title}</p><p className="mt-1 text-xs text-ledger-500">{appointment.customerName}{appointment.jobNumber ? ` · ${appointment.jobNumber}` : ""} · {appointment.status === "confirmed" ? "Confirmed" : "Scheduled"}</p></div><time className="text-xs text-ledger-600 dark:text-ledger-300">{formatDateTime(appointment.startsAt)} – {new Date(appointment.endsAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</time></li>)}</ul> : <p className="mt-4 rounded-lg bg-ledger-50 p-4 text-sm text-ledger-500 dark:bg-ink-800 dark:text-ledger-400">No upcoming appointments are assigned. The system does not currently store shift or leave availability.</p>}
      </section>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return <div className="flex items-center gap-3"><Icon className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" /><dt className="min-w-24 text-xs text-ledger-500">{label}</dt><dd className="text-sm text-ledger-800 dark:text-ledger-200">{value}</dd></div>;
}

function StatusBadge({ active, label }: { active?: boolean; label?: string }) {
  const text = label ?? (active ? "Active" : "Inactive");
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ${active === false ? "bg-ledger-100 text-ledger-600 dark:bg-ink-700 dark:text-ledger-300" : "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200"}`}><i className={`h-1.5 w-1.5 rounded-full ${active === false ? "bg-ledger-400" : "bg-blue-600"}`} />{text}</span>;
}
