import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarCheck, CalendarClock } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import {
  getEducationISOWeekday,
  isValidEducationAttendanceDate,
} from "@/lib/education/lesson-attendance";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { saveEducationLessonAttendance } from "../../actions";

const PAGE_SIZE = 50;
const ATTENDANCE_STATUSES = ["present", "absent", "late", "excused"] as const;
type AttendanceStatus = typeof ATTENDANCE_STATUSES[number];

type LessonRow = {
  id: string;
  branch_id: string;
  class_id: string;
  academic_year_id: string;
  subject_name: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
};

export default async function EducationLessonAttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_attendance", "attendance", "register", "view")) {
    redirect("/dashboard?accessDenied=think-education.attendance");
  }
  const [canViewTimetables, canViewStudentList] = await Promise.all([
    canTabPermission("education_timetables", "timetables", "schedule", "view"),
    canTabPermission("education_students", "students", "list", "view"),
  ]);
  if (!canViewTimetables || !canViewStudentList) {
    redirect("/dashboard?accessDenied=think-education.lesson-attendance");
  }

  const params = await searchParams;
  const readParam = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
  const today = new Date().toISOString().slice(0, 10);
  const requestedDate = readParam(params.date);
  const attendanceDate = isValidEducationAttendanceDate(requestedDate) ? requestedDate : today;
  const weekday = getEducationISOWeekday(attendanceDate);
  const requestedPage = Number.parseInt(readParam(params.page), 10);
  const currentPage = Number.isSafeInteger(requestedPage) && requestedPage > 0
    ? Math.min(1_000_000, requestedPage)
    : 1;
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  const requestedBranch = readParam(params.branch);
  const selectedBranch = campusIds.includes(requestedBranch) ? requestedBranch : campuses[0]?.id ?? "";
  const [canCreate, canEdit, canExport] = await Promise.all([
    canTabPermission("education_attendance", "attendance", "register", "create"),
    canTabPermission("education_attendance", "attendance", "register", "edit"),
    canTabPermission("education_attendance", "attendance", "register", "export"),
  ]);
  const supabase = await createClient();
  const { data: lessonData, error: lessonError } = selectedBranch && weekday
    ? await supabase.from("education_timetable_entries")
      .select("id, branch_id, class_id, academic_year_id, subject_name, weekday, starts_at, ends_at")
      .eq("org_id", context.orgId)
      .eq("branch_id", selectedBranch)
      .eq("weekday", weekday)
      .eq("status", "active")
      .order("starts_at")
    : { data: [], error: null };
  if (lessonError) throw new Error(`Could not load lessons for Think Education attendance: ${lessonError.message}`);
  const lessons: LessonRow[] = lessonData ?? [];
  const requestedLesson = readParam(params.lesson);
  const selectedLesson = lessons.find((lesson) => lesson.id === requestedLesson) ?? lessons[0] ?? null;

  const classIds = Array.from(new Set(lessons.map((lesson) => lesson.class_id)));
  const { data: classRows, error: classError } = classIds.length
    ? await supabase.from("education_classes").select("id, name").eq("org_id", context.orgId).in("id", classIds)
    : { data: [], error: null };
  if (classError) throw new Error(`Could not load classes for lesson attendance: ${classError.message}`);
  const classNameById = new Map((classRows ?? []).map((classroom) => [classroom.id, classroom.name]));

  let totalCount = 0;
  let students: Array<{ id: string; student_number: string; first_name: string; last_name: string }> = [];
  if (selectedLesson) {
    const { data: enrollmentRows, count, error: enrollmentError } = await supabase.from("education_student_enrollments")
      .select("student_id", { count: "exact" })
      .eq("org_id", context.orgId)
      .eq("branch_id", selectedLesson.branch_id)
      .eq("class_id", selectedLesson.class_id)
      .eq("academic_year_id", selectedLesson.academic_year_id)
      .eq("status", "active")
      .lte("enrolled_on", attendanceDate)
      .or(`ended_on.is.null,ended_on.gte.${attendanceDate}`)
      .order("student_id")
      .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);
    if (enrollmentError) throw new Error(`Could not load the lesson class roster: ${enrollmentError.message}`);
    totalCount = count ?? 0;
    const studentIds = (enrollmentRows ?? []).map((enrollment) => enrollment.student_id);
    if (studentIds.length) {
      const { data, error } = await supabase.from("education_students")
        .select("id, student_number, first_name, last_name")
        .eq("org_id", context.orgId)
        .eq("branch_id", selectedLesson.branch_id)
        .eq("status", "active")
        .in("id", studentIds)
        .order("last_name").order("first_name");
      if (error) throw new Error(`Could not load students for lesson attendance: ${error.message}`);
      students = data ?? [];
    }
  }

  const studentIds = students.map((student) => student.id);
  const attendanceByStudent = new Map<string, { status: AttendanceStatus; note: string | null }>();
  if (selectedLesson && studentIds.length) {
    const { data, error } = await supabase.from("education_lesson_attendance")
      .select("student_id, status, note")
      .eq("org_id", context.orgId)
      .eq("timetable_entry_id", selectedLesson.id)
      .eq("attendance_date", attendanceDate)
      .in("student_id", studentIds);
    if (error) throw new Error(`Could not load lesson attendance: ${error.message}`);
    for (const record of data ?? []) {
      if (record.student_id && ATTENDANCE_STATUSES.includes(record.status as AttendanceStatus)) {
        attendanceByStudent.set(record.student_id, {
          status: record.status as AttendanceStatus,
          note: record.note,
        });
      }
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pageHref = (page: number) => {
    const query = new URLSearchParams({ date: attendanceDate, page: String(page) });
    if (selectedBranch) query.set("branch", selectedBranch);
    if (selectedLesson) query.set("lesson", selectedLesson.id);
    return `${getProductAppPath("think-education", "/attendance/lessons")}?${query.toString()}`;
  };
  if (currentPage > totalPages) redirect(pageHref(totalPages));
  const csvRows = [
    ["Student ID", "Student", "Subject", "Class", "Attendance status", "Note", "Date"],
    ...students.map((student) => {
      const existing = attendanceByStudent.get(student.id);
      return [
        student.student_number,
        `${student.first_name} ${student.last_name}`.trim(),
        selectedLesson?.subject_name ?? "",
        selectedLesson ? classNameById.get(selectedLesson.class_id) ?? "Class" : "",
        existing?.status ?? "not_marked",
        existing?.note ?? "",
        attendanceDate,
      ];
    }),
  ];
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(csvRows.map((row) =>
    row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")
  ).join("\n"))}`;
  const errorMessage = params.error === "invalid"
    ? "Check the attendance date, lesson, status, and note."
    : params.error === "lesson"
      ? "The selected lesson is no longer active. Choose a current timetable lesson."
      : params.error === "save"
        ? "Lesson attendance could not be saved. Please try again."
        : null;

  return <main className="mx-auto w-full max-w-[1680px] space-y-6 p-4 md:p-6 xl:p-8">
    <header>
      <Link href={getProductAppPath("think-education", "/attendance")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Daily attendance
      </Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Lesson Attendance</h1>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Record attendance for a scheduled class lesson. Daily attendance remains available separately.</p>
      {params.saved === "1" && <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Lesson attendance saved.</p>}
      {errorMessage && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}
    </header>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <form method="get" action={getProductAppPath("think-education", "/attendance/lessons")} className="grid gap-3 md:grid-cols-[1fr_1fr_1.5fr_auto_auto]">
        <label className="text-sm font-medium text-slate-700">Campus
          <select name="branch" defaultValue={selectedBranch} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Lesson date
          <input required type="date" name="date" defaultValue={attendanceDate} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Scheduled lesson
          <select name="lesson" defaultValue={selectedLesson?.id ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            {lessons.length === 0 && <option value="">No lessons for this day</option>}
            {lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>
              {lesson.starts_at.slice(0, 5)}–{lesson.ends_at.slice(0, 5)} · {lesson.subject_name} · {classNameById.get(lesson.class_id) ?? "Class"}
            </option>)}
          </select>
        </label>
        <button type="submit" className="self-end rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">Apply</button>
        {canExport && selectedLesson && students.length > 0 && <a href={csvHref} download={`education-lesson-attendance-${attendanceDate}.csv`} className="self-end rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Export page CSV</a>}
      </form>
    </section>

    {!campuses.length ? <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
      <CalendarCheck className="mx-auto h-10 w-10 text-slate-300" />
      <h2 className="mt-3 font-semibold text-slate-900">No campus access assigned</h2>
      <p className="mt-1 text-sm text-slate-500">Ask an authorized Think Education administrator to assign your campus scope.</p>
    </section> : !selectedLesson ? <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
      <CalendarClock className="mx-auto h-10 w-10 text-slate-300" />
      <h2 className="mt-3 font-semibold text-slate-900">No scheduled lesson</h2>
      <p className="mt-1 text-sm text-slate-500">Choose another date or add a lesson in the <Link className="font-semibold text-blue-700 underline" href={getProductAppPath("think-education", "/timetables")}>class timetable</Link>.</p>
    </section> : <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-4">
        <div>
          <h2 className="font-semibold text-slate-950">{selectedLesson.subject_name} · {classNameById.get(selectedLesson.class_id) ?? "Class"}</h2>
          <p className="mt-1 text-sm text-slate-500">{attendanceDate} · {selectedLesson.starts_at.slice(0, 5)}–{selectedLesson.ends_at.slice(0, 5)} · {totalCount.toLocaleString()} enrolled students</p>
        </div>
      </div>
      {!students.length ? <p className="p-6 text-sm text-slate-500">No active students are enrolled in this class for the selected date.</p> : <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Student number</th><th className="px-4 py-3">Student</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Note</th><th className="px-4 py-3">Save</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{students.map((student) => {
            const existing = attendanceByStudent.get(student.id);
            const canSave = existing ? canEdit : canCreate;
            return <tr key={student.id}>
              <td className="whitespace-nowrap px-4 py-3 font-semibold text-blue-800">{student.student_number}</td>
              <td className="px-4 py-3 font-medium text-slate-900">{student.first_name} {student.last_name}</td>
              <td colSpan={3} className="px-4 py-3">
                {canSave ? <form action={saveEducationLessonAttendance} className="grid gap-2 sm:grid-cols-[170px_minmax(160px,1fr)_auto]">
                  <input type="hidden" name="timetable_entry_id" value={selectedLesson.id} />
                  <input type="hidden" name="student_id" value={student.id} />
                  <input type="hidden" name="attendance_date" value={attendanceDate} />
                  <select name="status" defaultValue={existing?.status ?? "present"} className="rounded-lg border border-slate-300 px-3 py-2">
                    {ATTENDANCE_STATUSES.map((status) => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}
                  </select>
                  <input name="note" defaultValue={existing?.note ?? ""} maxLength={500} placeholder="Optional note" className="rounded-lg border border-slate-300 px-3 py-2" />
                  <button type="submit" className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800">{existing ? "Update" : "Mark"}</button>
                </form> : <span className="text-xs text-slate-500">{existing ? `${existing.status} (edit access required)` : "No attendance access"}</span>}
              </td>
            </tr>;
          })}</tbody>
        </table>
      </div>}
      {totalCount > 0 && <footer className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
        <span className="text-slate-500">Showing {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount.toLocaleString()}</span>
        <div className="flex items-center gap-2">
          {currentPage > 1 && <Link href={pageHref(currentPage - 1)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 font-medium text-slate-700"><ArrowLeft className="h-4 w-4" /> Previous</Link>}
          <span className="text-slate-600">{currentPage} / {totalPages}</span>
          {currentPage < totalPages && <Link href={pageHref(currentPage + 1)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 font-medium text-slate-700">Next <ArrowRight className="h-4 w-4" /></Link>}
        </div>
      </footer>}
    </section>}
  </main>;
}
