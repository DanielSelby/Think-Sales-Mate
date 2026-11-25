"use client";

import { useMemo, useState } from "react";
import { Archive, ArrowDown, ArrowUp, Download, Eye, FileText, Mail, Pencil, Printer, Search, Users, X } from "lucide-react";
import { setEducationClassTeacher } from "../actions";
import { archiveEducationClass, emailEducationClassesPdf } from "./class-actions";
import { EducationClassModal } from "./education-class-form";

type CampusOption = { id: string; name: string };
type AcademicYearOption = { id: string; name: string };
type TeacherOption = {
  id: string;
  branch_id: string;
  first_name: string;
  last_name: string;
  status: string;
};
type TimetableItem = {
  subject_name: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
  room: string | null;
};
type EducationClassRow = {
  id: string;
  branch_id: string;
  academic_year_id: string;
  name: string;
  class_code: string | null;
  level_name: string | null;
  stream_name: string | null;
  curriculum_stage: string | null;
  medium: string | null;
  class_teacher_id: string | null;
  capacity: number | null;
  status: string;
  created_at: string;
  active_students: number;
  room_names: string[];
  active_subject_count: number;
  active_subjects: string[];
  timetable: TimetableItem[];
};
type SortKey = "id" | "name" | "stream" | "grade" | "code" | "stage" | "medium" | "year" | "teacher" | "capacity" | "room" | "status" | "created";

function csvCell(value: unknown) {
  const text = String(value ?? "");
  const safeText = /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

function weekdayName(weekday: number) {
  return ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][weekday] ?? "Day";
}

export function EducationClassesWorkspace({
  classes,
  campuses,
  academicYears,
  teachers,
  canViewStaff,
  canViewTimetables,
  canEdit,
  canArchive,
  canExport,
}: {
  classes: EducationClassRow[];
  campuses: CampusOption[];
  academicYears: AcademicYearOption[];
  teachers: TeacherOption[];
  canViewStaff: boolean;
  canViewTimetables: boolean;
  canEdit: boolean;
  canArchive: boolean;
  canExport: boolean;
}) {
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [mediumFilter, setMediumFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAscending, setSortAscending] = useState(true);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [viewingClass, setViewingClass] = useState<EducationClassRow | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);

  const sectionOptions = useMemo(() => Array.from(new Set(classes.map((item) => item.stream_name).filter((value): value is string => Boolean(value)))).sort(), [classes]);
  const stageOptions = useMemo(() => Array.from(new Set(classes.map((item) => item.curriculum_stage).filter((value): value is string => Boolean(value)))).sort(), [classes]);
  const mediumOptions = useMemo(() => Array.from(new Set(classes.map((item) => item.medium).filter((value): value is string => Boolean(value)))).sort(), [classes]);
  const visibleClasses = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = classes.filter((item) => {
      const teacher = teachers.find((member) => member.id === item.class_teacher_id);
      const haystack = [
        item.id,
        item.name,
        item.class_code,
        item.level_name,
        item.stream_name,
        item.curriculum_stage,
        item.medium,
        teacher?.first_name,
        teacher?.last_name,
      ].filter(Boolean).join(" ").toLowerCase();
      return (!term || haystack.includes(term))
        && (!yearFilter || item.academic_year_id === yearFilter)
        && (!sectionFilter || item.stream_name === sectionFilter)
        && (!stageFilter || item.curriculum_stage === stageFilter)
        && (!mediumFilter || item.medium === mediumFilter);
    });

    return filtered.sort((left, right) => {
      const teacherName = (row: EducationClassRow) => {
        const teacher = teachers.find((member) => member.id === row.class_teacher_id);
        return teacher ? `${teacher.first_name} ${teacher.last_name}` : "";
      };
      const values: Record<SortKey, (row: EducationClassRow) => string | number> = {
        id: (row) => row.id,
        name: (row) => row.name,
        code: (row) => row.class_code ?? "",
        stream: (row) => row.stream_name ?? "",
        grade: (row) => row.level_name ?? "",
        stage: (row) => row.curriculum_stage ?? "",
        medium: (row) => row.medium ?? "",
        year: (row) => academicYears.find((year) => year.id === row.academic_year_id)?.name ?? "",
        teacher: teacherName,
        capacity: (row) => row.capacity ?? Number.MAX_SAFE_INTEGER,
        room: (row) => row.room_names.join(", "),
        status: (row) => row.status,
        created: (row) => row.created_at,
      };
      const a = values[sortKey](left);
      const b = values[sortKey](right);
      const comparison = typeof a === "number" && typeof b === "number"
        ? a - b
        : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
      return sortAscending ? comparison : -comparison;
    });
  }, [academicYears, classes, mediumFilter, search, sectionFilter, sortAscending, sortKey, stageFilter, teachers, yearFilter]);

  const pageCount = Math.max(1, Math.ceil(visibleClasses.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedClasses = isPrinting
    ? visibleClasses
    : visibleClasses.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const activeCount = classes.filter((item) => item.status === "active").length;
  const inactiveCount = classes.filter((item) => item.status !== "active").length;

  const resetFilters = () => {
    setSearch("");
    setYearFilter("");
    setSectionFilter("");
    setStageFilter("");
    setMediumFilter("");
    setPage(1);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAscending((current) => !current);
    else {
      setSortKey(key);
      setSortAscending(true);
    }
  };

  const downloadCsv = () => {
    const headers = [
      "ID", "Class", "Section", "Grade", "Code", "Academic Year", "Stage", "Medium",
      "Class Teacher", "Current Students", "Capacity", "Room", "Status", "Created",
    ];
    const rows = visibleClasses.map((item) => {
      const teacher = teachers.find((member) => member.id === item.class_teacher_id);
      return [
        item.id,
        item.name,
        item.stream_name ?? "",
        item.level_name ?? "",
        item.class_code ?? "",
        academicYears.find((year) => year.id === item.academic_year_id)?.name ?? "",
        item.curriculum_stage ?? "",
        item.medium ?? "",
        canViewStaff ? teacher ? `${teacher.first_name} ${teacher.last_name}` : "Unassigned" : "Restricted",
        item.active_students,
        item.capacity ?? "",
        item.room_names.join("; "),
        item.status,
        new Date(item.created_at).toISOString(),
      ];
    });
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `education-classes-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const printReport = () => {
    setIsPrinting(true);
    window.setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 100);
  };

  const sortableHeader = (label: string, key: SortKey) => <button
    type="button"
    onClick={() => handleSort(key)}
    className="inline-flex items-center gap-1 text-left hover:text-blue-700"
    aria-label={`Sort by ${label}`}
  >
    {label}
    {sortKey === key && (sortAscending ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
  </button>;

  return <section className="education-classes-report space-y-5">
    <style>{`
      @media print {
        @page { size: landscape; margin: 10mm; }
        body * { visibility: hidden !important; }
        #education-classes-print-report, #education-classes-print-report * { visibility: visible !important; }
        #education-classes-print-report { position: absolute; inset: 0 auto auto 0; width: 100%; padding: 16px; }
        #education-classes-print-report .no-print { display: none !important; }
        #education-classes-print-report .print-only { display: block !important; }
        #education-classes-print-report .overflow-x-auto { overflow: visible !important; }
        #education-classes-print-report table { min-width: 0 !important; width: 100% !important; font-size: 9px; }
        #education-classes-print-report th, #education-classes-print-report td { padding: 4px !important; }
      }
    `}</style>

    <section data-education-metrics className="grid gap-3 sm:grid-cols-3">
      {[
        { label: "Total Classes", value: classes.length, icon: Users, tone: "border-blue-100 bg-blue-50 text-blue-800" },
        { label: "Active Classes", value: activeCount, icon: Users, tone: "border-emerald-100 bg-emerald-50 text-emerald-800" },
        { label: "Inactive Classes", value: inactiveCount, icon: Users, tone: "border-slate-200 bg-slate-100 text-slate-700" },
      ].map(({ label, value, icon: Icon, tone }) => <article key={label} className={`flex items-center justify-between rounded-xl border p-4 shadow-sm ${tone}`}>
        <div><p className="text-sm font-medium">{label}</p><p className="mt-1 text-2xl font-bold">{value.toLocaleString()}</p></div>
        <Icon className="h-8 w-8 opacity-80" aria-hidden="true" />
      </article>)}
    </section>

    <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold text-slate-900">Filters</h2>
        <button type="button" onClick={resetFilters} className="rounded-lg border border-slate-300 bg-slate-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">Clear</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <label className="relative text-xs font-semibold text-slate-700">
          Search
          <Search className="pointer-events-none absolute bottom-3 left-3 h-4 w-4 text-slate-400" />
          <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Class, code, section, teacher..." className="mt-1 w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm font-normal" />
        </label>
        <label className="text-xs font-semibold text-slate-700">Academic Year
          <select value={yearFilter} onChange={(event) => { setYearFilter(event.target.value); setPage(1); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal">
            <option value="">All academic years</option>
            {academicYears.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-700">Section
          <select value={sectionFilter} onChange={(event) => { setSectionFilter(event.target.value); setPage(1); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal">
            <option value="">All Sections</option>
            {sectionOptions.map((section) => <option key={section} value={section}>{section}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-700">Curriculum Stage
          <select value={stageFilter} onChange={(event) => { setStageFilter(event.target.value); setPage(1); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal">
            <option value="">All stages</option>
            {stageOptions.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-700">Medium
          <select value={mediumFilter} onChange={(event) => { setMediumFilter(event.target.value); setPage(1); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal">
            <option value="">All mediums</option>
            {mediumOptions.map((medium) => <option key={medium} value={medium}>{medium}</option>)}
          </select>
        </label>
      </div>
    </section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {canExport && <button type="button" onClick={downloadCsv} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"><Download className="h-4 w-4" /> CSV</button>}
          {canExport && <>
            <button type="button" onClick={printReport} className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700"><FileText className="h-4 w-4" /> PDF</button>
            <button type="button" onClick={printReport} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800"><Printer className="h-4 w-4" /> PRINT</button>
            <button type="button" disabled={visibleClasses.length === 0 || visibleClasses.length > 2000} title={visibleClasses.length > 2000 ? "Narrow the filters to email no more than 2,000 classes at a time." : undefined} onClick={() => setEmailDialogOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"><Mail className="h-4 w-4" /> Email PDF</button>
          </>}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Show
          <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5">
            {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
          entries
        </label>
      </div>

      <div id="education-classes-print-report" className="overflow-x-auto">
        <div className="print-only hidden px-1 pb-3">
          <h1 className="text-xl font-bold text-slate-950">Think Education — Classes &amp; Sections</h1>
          <p className="mt-1 text-xs text-slate-600">Generated {new Date().toLocaleString()} · {visibleClasses.length} matching classes</p>
        </div>
        {pagedClasses.length ? <table className="w-full min-w-[1450px] text-left text-xs">
          <thead className="bg-[#063b83] text-[10px] font-semibold uppercase tracking-wide text-white">
            <tr>
              <th className="px-3 py-3">{sortableHeader("ID", "id")}</th>
              <th className="px-3 py-3">{sortableHeader("Class", "name")}</th>
              <th className="px-3 py-3">{sortableHeader("Section", "stream")}</th>
              <th className="px-3 py-3">{sortableHeader("Grade", "grade")}</th>
              <th className="px-3 py-3">{sortableHeader("Code", "code")}</th>
              <th className="px-3 py-3">{sortableHeader("Academic Year", "year")}</th>
              <th className="px-3 py-3">{sortableHeader("Stage", "stage")}</th>
              <th className="px-3 py-3">{sortableHeader("Medium", "medium")}</th>
              <th className="px-3 py-3">{sortableHeader("Class Teacher", "teacher")}</th>
              <th className="px-3 py-3">Capacity</th>
              <th className="px-3 py-3">{sortableHeader("Room", "room")}</th>
              <th className="px-3 py-3">{sortableHeader("Status", "status")}</th>
              <th className="px-3 py-3">{sortableHeader("Created", "created")}</th>
              <th className="no-print px-3 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pagedClasses.map((item) => {
              const assignedTeacher = teachers.find((member) => member.id === item.class_teacher_id);
              const progress = item.capacity ? Math.min(100, Math.round(item.active_students / item.capacity * 100)) : 0;
              return <tr key={item.id} className="align-middle hover:bg-blue-50/30">
                <td className="whitespace-nowrap px-3 py-3 text-slate-600" title={item.id}>{item.id.slice(0, 8).toUpperCase()}</td>
                <td className="px-3 py-3 font-semibold text-slate-900">{item.name}</td>
                <td className="px-3 py-3 text-slate-700">{item.stream_name || "—"}</td>
                <td className="px-3 py-3 text-slate-700">{item.level_name || "—"}</td>
                <td className="px-3 py-3 text-slate-700">{item.class_code || "—"}</td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-700">{academicYears.find((year) => year.id === item.academic_year_id)?.name ?? "—"}</td>
                <td className="px-3 py-3 text-slate-700">{item.curriculum_stage || "—"}</td>
                <td className="px-3 py-3 text-slate-700">{item.medium || "—"}</td>
                <td className="px-3 py-3">
                  {canViewStaff && canEdit
                    ? <form action={setEducationClassTeacher} className="no-print flex min-w-[190px] items-center gap-1.5">
                      <input type="hidden" name="class_id" value={item.id} />
                      <select name="class_teacher_id" defaultValue={item.class_teacher_id ?? ""} aria-label={`Class teacher for ${item.name}`} className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5">
                        <option value="">Unassigned</option>
                        {item.class_teacher_id && !teachers.some((member) => member.id === item.class_teacher_id) && <option value={item.class_teacher_id}>Previously assigned</option>}
                        {teachers.filter((member) => member.branch_id === item.branch_id
                          && (member.status === "active" || member.id === item.class_teacher_id))
                          .map((member) => <option key={member.id} value={member.id}>{member.first_name} {member.last_name}{member.status === "active" ? "" : " · inactive"}</option>)}
                      </select>
                      <button type="submit" className="rounded-md border border-blue-200 px-2 py-1.5 text-[10px] font-semibold text-blue-800 hover:bg-blue-50">Save</button>
                    </form>
                    : <span className="text-slate-700">{canViewStaff ? assignedTeacher ? `${assignedTeacher.first_name} ${assignedTeacher.last_name}` : "Unassigned" : "Staff access required"}</span>}
                </td>
                <td className="min-w-[110px] px-3 py-3">
                  <p className="whitespace-nowrap font-medium text-slate-700">{item.active_students} / {item.capacity ?? "—"}</p>
                  {item.capacity !== null && <span className="mt-1 block h-1.5 w-20 overflow-hidden rounded-full bg-slate-200"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} /></span>}
                </td>
                <td className="px-3 py-3 text-slate-700">{canViewTimetables ? item.room_names.join(", ") || "Unassigned" : "Timetable access required"}</td>
                <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold capitalize ${item.status === "active" ? "bg-emerald-100 text-emerald-800" : item.status === "archived" ? "bg-slate-200 text-slate-700" : "bg-blue-100 text-blue-800"}`}>{item.status}</span></td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-600">{new Date(item.created_at).toLocaleDateString()}</td>
                <td className="no-print px-3 py-3">
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setViewingClass(item)} title={`View ${item.name}`} aria-label={`View ${item.name}`} className="rounded-md p-1.5 text-blue-700 hover:bg-blue-50"><Eye className="h-4 w-4" /></button>
                    {canEdit && item.status !== "archived" && <EducationClassModal
                      campuses={campuses}
                      academicYears={academicYears}
                      teachers={teachers.filter((member) => member.status === "active")}
                      canViewStaff={canViewStaff}
                      classroom={item}
                      trigger={<button type="button" title={`Edit ${item.name}`} aria-label={`Edit ${item.name}`} className="rounded-md p-1.5 text-blue-700 hover:bg-blue-50"><Pencil className="h-4 w-4" /></button>}
                    />}
                    {canArchive && item.status !== "archived" && <form action={archiveEducationClass} onSubmit={(event) => {
                      if (!window.confirm(`Archive ${item.name}? Historical records will be retained.`)) event.preventDefault();
                    }}>
                      <input type="hidden" name="class_id" value={item.id} />
                      <button type="submit" title={`Archive ${item.name}`} aria-label={`Archive ${item.name}`} className="rounded-md p-1.5 text-rose-700 hover:bg-rose-50"><Archive className="h-4 w-4" /></button>
                    </form>}
                  </div>
                </td>
              </tr>;
            })}
          </tbody>
        </table> : <div className="p-10 text-center">
          <Users className="mx-auto h-10 w-10 text-slate-300" />
          <h3 className="mt-3 font-semibold text-slate-900">{classes.length ? "No classes match these filters" : "No classes found"}</h3>
          <p className="mt-1 text-sm text-slate-500">{classes.length ? "Change your search or clear filters to see more classes." : "Create a class to begin managing sections and assignments."}</p>
          {classes.length > 0 && <button type="button" onClick={resetFilters} className="mt-3 text-sm font-semibold text-blue-700 hover:text-blue-900">Clear filters</button>}
        </div>}
      </div>

      {visibleClasses.length > 0 && <footer className="no-print flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
        <p>Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, visibleClasses.length)} of {visibleClasses.length} entries</p>
        <div className="flex items-center gap-2">
          <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-50">Previous</button>
          <span className="rounded-md bg-blue-700 px-3 py-1.5 font-semibold text-white">{currentPage}</span>
          <button type="button" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-50">Next</button>
        </div>
      </footer>}
    </section>

    {viewingClass && <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="education-class-view-title" onClick={(event) => {
      if (event.target === event.currentTarget) setViewingClass(null);
    }}>
      <section className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="education-class-view-title" className="text-lg font-bold text-slate-950">{viewingClass.name}</h2>
            <p className="mt-1 text-sm text-slate-600">{campuses.find((campus) => campus.id === viewingClass.branch_id)?.name ?? "Campus"} · {academicYears.find((year) => year.id === viewingClass.academic_year_id)?.name ?? "Academic year"}</p>
          </div>
          <button type="button" onClick={() => setViewingClass(null)} aria-label="Close class details" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </header>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Detail label="Section" value={viewingClass.stream_name || "Not assigned"} />
          <Detail label="Grade / level" value={viewingClass.level_name || "Not assigned"} />
          <Detail label="Class teacher" value={canViewStaff
            ? teachers.find((member) => member.id === viewingClass.class_teacher_id)
              ? `${teachers.find((member) => member.id === viewingClass.class_teacher_id)?.first_name} ${teachers.find((member) => member.id === viewingClass.class_teacher_id)?.last_name}`
              : "Unassigned"
            : "Staff access required"} />
          <Detail label="Active enrollment" value={`${viewingClass.active_students} / ${viewingClass.capacity ?? "No capacity limit"}`} />
          <Detail label="Active subjects" value={viewingClass.active_subjects.join(", ") || "No subjects assigned"} />
          <Detail label="Rooms in active timetable" value={canViewTimetables ? viewingClass.room_names.join(", ") || "No room assigned" : "Timetable access required"} />
          <Detail label="Status" value={viewingClass.status} />
          <Detail label="Class code" value={viewingClass.class_code || "Not set"} />
          <Detail label="Curriculum stage" value={viewingClass.curriculum_stage || "Not set"} />
          <Detail label="Medium" value={viewingClass.medium || "Not set"} />
          <div className="sm:col-span-2">
            <h3 className="font-semibold text-slate-900">Class timetable</h3>
            {viewingClass.timetable.length ? <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Day</th><th className="px-3 py-2">Time</th><th className="px-3 py-2">Subject</th><th className="px-3 py-2">Room</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{viewingClass.timetable.map((entry, index) => <tr key={`${entry.weekday}-${entry.starts_at}-${entry.subject_name}-${index}`}>
                  <td className="px-3 py-2">{weekdayName(entry.weekday)}</td>
                  <td className="whitespace-nowrap px-3 py-2">{entry.starts_at.slice(0, 5)}–{entry.ends_at.slice(0, 5)}</td>
                  <td className="px-3 py-2">{entry.subject_name}</td>
                  <td className="px-3 py-2">{entry.room || "Unassigned"}</td>
                </tr>)}</tbody>
              </table>
            </div> : <p className="mt-2 text-sm text-slate-500">No active timetable entries.</p>}
          </div>
        </div>
      </section>
    </div>}
    {emailDialogOpen && <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="education-class-email-title" onClick={(event) => {
      if (event.target === event.currentTarget) setEmailDialogOpen(false);
    }}>
      <section className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="education-class-email-title" className="font-bold text-slate-950">Email classes PDF</h2>
            <p className="mt-1 text-sm text-slate-600">Send a PDF of the {visibleClasses.length} classes matching the current filters.</p>
          </div>
          <button type="button" onClick={() => setEmailDialogOpen(false)} aria-label="Close email report dialog" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </header>
        <form action={emailEducationClassesPdf} className="space-y-4 p-5">
          <input type="hidden" name="class_ids" value={JSON.stringify(visibleClasses.map((item) => item.id))} />
          <label className="block text-sm font-medium text-slate-700">Recipient email
            <input required type="email" name="recipient" maxLength={254} autoComplete="email" placeholder="name@example.com" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">
            <Mail className="h-4 w-4" /> Send PDF
          </button>
        </form>
      </section>
    </div>}
  </section>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-200 p-3">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
  </div>;
}
