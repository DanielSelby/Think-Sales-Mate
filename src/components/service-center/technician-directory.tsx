"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  Star,
  Users,
  Wrench,
} from "lucide-react";
import { registerServiceTechnician } from "@/app/(dashboard)/service-center/actions";
import type { calculateTechnicianMetrics } from "@/lib/service-center/technician-metrics";

type Metrics = ReturnType<typeof calculateTechnicianMetrics>;
export type TechnicianDirectoryRow = {
  id: string;
  userId: string;
  name: string;
  role: string;
  locationId: string;
  locationName: string;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
  skills: string[];
  isActive: boolean;
  createdAt: string;
  metrics: Metrics;
};

type Candidate = {
  userId: string;
  name: string;
  locations: Array<{ id: string; name: string }>;
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "T";
}

function Avatar({ name, src, size = 40 }: { name: string; src: string | null; size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-100 font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-200" style={{ width: size, height: size }}>
      {src ? <Image src={src} alt="" width={size} height={size} unoptimized className="h-full w-full object-cover" /> : initials(name)}
    </span>
  );
}

export function TechnicianDirectory({
  technicians,
  candidates,
  canCreate,
  canEdit,
  canViewJobs,
  canEditJobs,
  canViewAppointments,
}: {
  technicians: TechnicianDirectoryRow[];
  candidates: Candidate[];
  canCreate: boolean;
  canEdit: boolean;
  canViewJobs: boolean;
  canEditJobs: boolean;
  canViewAppointments: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive" | "busy">("all");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState(technicians[0]?.id ?? "");
  const [showAdd, setShowAdd] = useState(false);
  const [locationId, setLocationId] = useState("");
  const [candidateUserId, setCandidateUserId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pageSize = 8;
  const filtered = useMemo(() => technicians.filter((technician) => {
    const text = `${technician.name} ${technician.role} ${technician.locationName} ${technician.skills.join(" ")} ${technician.phone ?? ""} ${technician.email ?? ""}`.toLowerCase();
    if (query && !text.includes(query.toLowerCase())) return false;
    if (filter === "active" && !technician.isActive) return false;
    if (filter === "inactive" && technician.isActive) return false;
    if (filter === "busy" && technician.metrics.openJobs === 0) return false;
    return true;
  }), [technicians, query, filter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const selected = technicians.find((technician) => technician.id === selectedId) ?? visible[0] ?? technicians[0] ?? null;
  const activeCount = technicians.filter((technician) => technician.isActive).length;
  const openCount = technicians.reduce((total, technician) => total + technician.metrics.openJobs, 0);
  const completedCount = technicians.reduce((total, technician) => total + technician.metrics.completedJobs, 0);
  const candidateOptions = candidates.filter((candidate) => candidate.locations.some((location) => location.id === locationId));
  const locationOptions = Array.from(new Map(candidates.flatMap((candidate) => candidate.locations).map((location) => [location.id, location])).values());

  async function submitRegistration(formData: FormData) {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const result = await registerServiceTechnician(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice("Technician added to this branch.");
      setShowAdd(false);
      setLocationId("");
      router.refresh();
    } catch (cause) {
      console.error("Service technician registration failed:", cause);
      setError("The technician could not be added. Please try again.");
    } finally {
      setPending(false);
    }
  }

  function exportReport() {
    const header = ["Technician", "Role", "Branch", "Status", "Jobs", "Completed", "Open jobs", "Completion rate", "Skills"];
    const lines = filtered.map((technician) => [
      technician.name,
      technician.role,
      technician.locationName,
      technician.isActive ? "Active" : "Inactive",
      technician.metrics.totalJobs,
      technician.metrics.completedJobs,
      technician.metrics.openJobs,
      technician.metrics.completionRate == null ? "" : `${technician.metrics.completionRate}%`,
      technician.skills.join("; "),
    ]);
    const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const csv = [header, ...lines].map((line) => line.map(escape).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "service-technicians.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Think Service &amp; Repairs</p>
          <h1 className="mt-1 text-2xl font-semibold text-ledger-900 dark:text-white">Technicians</h1>
          <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">Manage service technicians, skills, assignments and job performance.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={exportReport} className="inline-flex items-center gap-2 rounded-lg border border-ledger-200 bg-white px-3 py-2 text-sm font-medium text-ledger-700 hover:bg-ledger-50 dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-200">
            <Download className="h-4 w-4" /> Export report
          </button>
          {canCreate && <button type="button" onClick={() => setShowAdd(true)} className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700"><Plus className="h-4 w-4" /> Add technician</button>}
        </div>
      </header>

      {(error || notice) && <p role={error ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200" : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"}`}>{error ?? notice}</p>}

      <section aria-label="Technician summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={Users} title="Total Technicians" value={technicians.length} note="Registered in visible branches" />
        <SummaryCard icon={CheckCircle2} title="Active" value={activeCount} note="Registered and active" />
        <SummaryCard icon={BriefcaseBusiness} title="Open Assignments" value={canViewJobs ? String(openCount) : "Restricted"} note="Non-terminal assigned jobs" />
        <SummaryCard icon={Star} title="Jobs Completed" value={canViewJobs ? String(completedCount) : "Restricted"} note="Current assigned job records" />
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <article className="min-w-0 overflow-hidden rounded-xl border border-ledger-200 bg-white dark:border-ledger-700 dark:bg-ink-900">
          <div className="flex flex-col gap-3 border-b border-ledger-100 p-4 dark:border-ledger-800 sm:flex-row">
            <label className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ledger-400" aria-hidden="true" />
              <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Search technicians, skills, or contact..." className="w-full rounded-lg border border-ledger-200 bg-white py-2 pl-9 pr-3 text-sm text-ledger-800 outline-none focus:border-amber-500 dark:border-ledger-700 dark:bg-ink-800 dark:text-white" />
            </label>
            <label className="sr-only" htmlFor="technician-filter">Filter technicians</label>
            <select id="technician-filter" value={filter} onChange={(event) => { setFilter(event.target.value as typeof filter); setPage(0); }} className="rounded-lg border border-ledger-200 bg-white px-3 py-2 text-sm text-ledger-700 dark:border-ledger-700 dark:bg-ink-800 dark:text-ledger-200">
              <option value="all">All technicians</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="busy">With open jobs</option>
            </select>
          </div>
          {filtered.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-ledger-50 text-xs uppercase text-ledger-500 dark:bg-ink-800 dark:text-ledger-400">
                  <tr>{["#", "Technician", "Contact", "Specialization", "Branch", "Status", "Jobs"].map((heading) => <th key={heading} className="px-3 py-3 font-medium">{heading}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-ledger-100 dark:divide-ledger-800">
                  {visible.map((technician, index) => (
                    <tr key={technician.id} onClick={() => setSelectedId(technician.id)} className={`cursor-pointer transition-colors ${selected?.id === technician.id ? "bg-amber-50/70 dark:bg-amber-950/20" : "hover:bg-ledger-50/70 dark:hover:bg-ink-800/60"}`}>
                      <td className="px-3 py-3 text-xs text-ledger-500">{currentPage * pageSize + index + 1}</td>
                      <td className="px-3 py-3">
                        <Link href={`/service-center/technicians/${technician.id}`} onClick={(event) => event.stopPropagation()} className="flex items-center gap-2.5">
                          <Avatar name={technician.name} src={technician.avatarUrl} size={34} />
                          <span className="min-w-0"><span className="block truncate font-medium text-ledger-900 hover:underline dark:text-white">{technician.name}</span><span className="block text-xs text-ledger-500 dark:text-ledger-400">{technician.role}</span></span>
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-xs text-ledger-600 dark:text-ledger-300">{technician.phone ?? technician.email ?? "—"}</td>
                      <td className="max-w-32 px-3 py-3 text-xs text-ledger-600 dark:text-ledger-300">{technician.skills.slice(0, 2).join(", ") || "Not specified"}</td>
                      <td className="px-3 py-3 text-xs text-ledger-600 dark:text-ledger-300">{technician.locationName}</td>
                      <td className="px-3 py-3"><StatusPill active={technician.isActive} /></td>
                      <td className="px-3 py-3 text-xs text-ledger-700 dark:text-ledger-200">{technician.metrics.totalJobs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="px-5 py-12 text-center text-sm text-ledger-500 dark:text-ledger-400">{technicians.length ? "No technicians match these filters." : "No technicians are registered in the selected branches yet."}</p>}
          <div className="flex items-center justify-between border-t border-ledger-100 px-4 py-3 text-xs text-ledger-500 dark:border-ledger-800 dark:text-ledger-400">
            <span>Showing {filtered.length ? currentPage * pageSize + 1 : 0} to {Math.min((currentPage + 1) * pageSize, filtered.length)} of {filtered.length}</span>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Previous page" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="rounded border border-ledger-200 p-1.5 disabled:opacity-40 dark:border-ledger-700"><ChevronLeft className="h-4 w-4" /></button>
              <span>{currentPage + 1} / {pageCount}</span>
              <button type="button" aria-label="Next page" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)} className="rounded border border-ledger-200 p-1.5 disabled:opacity-40 dark:border-ledger-700"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        </article>

        <article className="min-w-0 overflow-hidden rounded-xl border border-ledger-200 bg-white dark:border-ledger-700 dark:bg-ink-900">
          {selected ? (
            <>
              <div className="flex flex-wrap items-center gap-4 bg-gradient-to-r from-ink-900 to-ink-800 px-5 py-5 text-white">
                <Avatar name={selected.name} src={selected.avatarUrl} size={72} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold">{selected.name}</h2><StatusPill active={selected.isActive} /></div>
                  <p className="mt-1 text-sm text-slate-300">{selected.role}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-300"><MapPin className="h-3.5 w-3.5" />{selected.locationName}</p>
                </div>
                <Link href={`/service-center/technicians/${selected.id}`} className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-2 text-xs font-medium text-white hover:bg-white/20">View profile <ArrowRight className="h-3.5 w-3.5" /></Link>
              </div>
              <div className="grid gap-3 border-b border-ledger-100 p-4 sm:grid-cols-3 dark:border-ledger-800">
                <MiniMetric label="Jobs completed" value={selected.metrics.completedJobs} />
                <MiniMetric label="Open jobs" value={selected.metrics.openJobs} />
                <MiniMetric label="Success rate" value={selected.metrics.completionRate == null ? "—" : `${selected.metrics.completionRate}%`} />
              </div>
              <div className="grid gap-4 p-5 md:grid-cols-2">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-ledger-900 dark:text-white">Contact information</h3>
                  {selected.phone && <p className="flex items-center gap-2 break-all text-xs text-ledger-600 dark:text-ledger-300"><Phone className="h-4 w-4 shrink-0 text-amber-700" />{selected.phone}</p>}
                  {selected.email && <p className="flex items-center gap-2 break-all text-xs text-ledger-600 dark:text-ledger-300"><Mail className="h-4 w-4 shrink-0 text-amber-700" />{selected.email}</p>}
                  {!selected.phone && !selected.email && <p className="text-xs text-ledger-500">Contact details are not recorded.</p>}
                </div>
                <div className="space-y-3">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-ledger-900 dark:text-white"><Wrench className="h-4 w-4 text-amber-700" />Skills &amp; expertise</h3>
                  <div className="flex flex-wrap gap-1.5">{selected.skills.length ? selected.skills.map((skill) => <span key={skill} className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">{skill}</span>) : <span className="text-xs text-ledger-500">No skills recorded.</span>}</div>
                </div>
              </div>
              {!canViewJobs && <p className="border-t border-ledger-100 px-5 py-3 text-xs text-ledger-500 dark:border-ledger-800">Job performance details require service job access.</p>}
              {canViewAppointments && <p className="border-t border-ledger-100 px-5 py-3 text-xs text-ledger-500 dark:border-ledger-800">Availability reflects scheduled appointments on the technician profile.</p>}
              {canEdit && <p className="border-t border-ledger-100 px-5 py-3 text-xs text-ledger-500 dark:border-ledger-800">Technician details and activation can be managed from the profile.</p>}
            </>
          ) : (
            <div className="flex min-h-80 flex-col items-center justify-center p-8 text-center">
              <Users className="h-10 w-10 text-ledger-300" />
              <h2 className="mt-3 font-semibold text-ledger-800 dark:text-white">Technician details</h2>
              <p className="mt-1 max-w-xs text-sm text-ledger-500">Select a technician from the directory to review their skills and workload.</p>
            </div>
          )}
        </article>
      </section>

      {showAdd && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAdd(false); }}>
          <form action={submitRegistration} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-2xl dark:bg-ink-900">
            <div className="flex items-start justify-between gap-3">
              <div><h2 className="text-lg font-semibold text-ledger-900 dark:text-white">Add technician</h2><p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">Register an active organization member at an authorized branch.</p></div>
              <button type="button" aria-label="Close dialog" onClick={() => setShowAdd(false)} className="rounded-lg px-2 py-1 text-ledger-500 hover:bg-ledger-100 dark:hover:bg-ink-800">×</button>
            </div>
            <label className="block space-y-1 text-sm text-ledger-700 dark:text-ledger-200"><span>Branch</span>
              <select name="technicianLocationId" required value={locationId} onChange={(event) => { setLocationId(event.target.value); setCandidateUserId(""); }} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800">
                <option value="">Select a branch</option>{locationOptions.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
            </label>
            <label className="block space-y-1 text-sm text-ledger-700 dark:text-ledger-200"><span>Organization member</span>
              <select name="technicianUserId" required disabled={!locationId} value={candidateUserId} onChange={(event) => setCandidateUserId(event.target.value)} className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800">
                <option value="">Select a member</option>{candidateOptions.map((candidate) => <option key={candidate.userId} value={candidate.userId}>{candidate.name}</option>)}
              </select>
            </label>
            <label className="block space-y-1 text-sm text-ledger-700 dark:text-ledger-200"><span>Skills (comma separated)</span>
              <input name="technicianSkills" maxLength={1600} placeholder="Diagnostics, electrical repair" className="w-full rounded-lg border border-ledger-300 bg-white px-3 py-2 dark:border-ledger-600 dark:bg-ink-800" />
            </label>
            {!candidates.length && <p className="text-xs text-amber-700 dark:text-amber-300">No eligible active organization members are available for this branch.</p>}
            <div className="flex justify-end gap-2 border-t border-ledger-100 pt-4 dark:border-ledger-800">
              <button type="button" onClick={() => setShowAdd(false)} className="rounded-lg border border-ledger-200 px-4 py-2 text-sm text-ledger-700 dark:border-ledger-700 dark:text-ledger-200">Cancel</button>
              <button type="submit" disabled={pending || !candidateOptions.length} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Adding..." : "Add technician"}</button>
            </div>
          </form>
        </div>
      )}
      {!canEditJobs && canViewAppointments && <p className="text-xs text-ledger-500">Appointment availability is read-only for your role.</p>}
    </div>
  );
}

function SummaryCard({ icon: Icon, title, value, note }: { icon: typeof Users; title: string; value: number | string; note: string }) {
  return <article className="rounded-xl border border-ledger-200 bg-white p-4 dark:border-ledger-700 dark:bg-ink-900"><div className="flex items-center gap-2 text-sm font-medium text-ledger-600 dark:text-ledger-300"><Icon className="h-4 w-4 text-amber-700 dark:text-amber-400" />{title}</div><p className="mt-3 text-2xl font-semibold text-ledger-900 dark:text-white">{value}</p><p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">{note}</p></article>;
}

function MiniMetric({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-lg bg-ledger-50 p-3 dark:bg-ink-800"><p className="text-lg font-semibold text-ledger-900 dark:text-white">{value}</p><p className="mt-0.5 text-[11px] text-ledger-500 dark:text-ledger-400">{label}</p></div>;
}

function StatusPill({ active }: { active: boolean }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${active ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-ledger-100 text-ledger-600 dark:bg-ink-700 dark:text-ledger-300"}`}><i className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-600" : "bg-ledger-400"}`} />{active ? "Active" : "Inactive"}</span>;
}
