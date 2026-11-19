import { BookOpen, CalendarDays, GraduationCap, Users } from "lucide-react";
import { educationTeacherPortalSchema, type EducationTeacherPortal } from "@/lib/education/teacher-portal";
import { createClient } from "@/lib/supabase/server";
import { claimEducationTeacherPortalAccount, recordEducationTeacherAttendance, requestEducationTeacherPortalSignIn } from "./actions";

export const dynamic = "force-dynamic";
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function messageFor(params: Record<string, string | string[] | undefined>) {
  if (params.emailSent === "1") return "If this email belongs to an active teacher record, a secure sign-in link has been sent.";
  if (params.signin === "invalid") return "Enter a valid email address.";
  if (params.signin === "configuration") return "Sign-in links are temporarily unavailable. Please contact the school.";
  if (params.signin === "error") return "The sign-in email could not be sent. Please wait and try again.";
  if (params.claim === "linked") return "Your teacher profile is now linked to this account.";
  if (params.claim === "verify-email") return "Verify your account email before linking a teacher profile.";
  if (params.claim === "not-found") return "No active teaching staff profile matches this verified account email.";
  if (params.claim === "error") return "The teacher profile could not be linked. Please contact the school.";
  if (params.attendance === "saved") return "Attendance saved.";
  if (params.attendance === "error") return "Attendance could not be saved. Check the class assignment and try again.";
  return null;
}

export default async function EducationTeacherPortalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(`Could not verify the signed-in account: ${userError.message}`);
  let portal: EducationTeacherPortal = [];
  if (user) {
    const { data, error } = await supabase.rpc("education_get_teacher_portal");
    if (error) throw new Error(`Could not load the teacher portal: ${error.message}`);
    const parsed = educationTeacherPortalSchema.safeParse(data);
    if (!parsed.success) {
      console.error("Think Education teacher portal returned unexpected data:", parsed.error.flatten());
      throw new Error("The teacher portal data could not be safely displayed.");
    }
    portal = parsed.data;
  }
  const params = await searchParams;
  const message = messageFor(params);

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="rounded-2xl bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-800 p-6 text-white shadow-lg sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-200">Think Education</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Teacher Portal</h1>
        <p className="mt-2 max-w-2xl text-sm text-emerald-100">Your classes, timetable, and daily attendance workspace.</p>
        {user && <p className="mt-4 text-sm text-emerald-100">Signed in as {user.email ?? "your account"}</p>}
      </header>
      {message && <p role={params.claim === "error" || params.signin === "error" ? "alert" : "status"} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">{message}</p>}
      {!user ? <section className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <h2 className="text-xl font-semibold">Sign in to your teacher account</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Use the verified email address recorded in your school staff profile.</p>
        <form action={requestEducationTeacherPortalSignIn} className="mt-5 space-y-3">
          <label className="block text-sm font-medium text-slate-700">Email address
            <input type="email" name="email" required maxLength={254} autoComplete="email" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <button type="submit" className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800">Email me a secure sign-in link</button>
        </form>
      </section> : portal.length === 0 ? <section className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <h2 className="text-xl font-semibold">Link your teacher profile</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Your account must use the verified email address recorded on an active teaching staff profile.</p>
        <form action={claimEducationTeacherPortalAccount} className="mt-5">
          <button type="submit" className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800">Find and link my teacher profile</button>
        </form>
      </section> : <div className="space-y-6">
        {portal.map((teacher) => {
          const classes = teacher.classes;
          const studentCount = classes.reduce((total, classroom) => total + classroom.students.length, 0);
          return <section key={teacher.id} className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><p className="text-sm font-medium text-emerald-700">{teacher.organizationName} · {teacher.campusName}</p><h2 className="mt-1 text-2xl font-bold">{teacher.firstName} {teacher.lastName}</h2><p className="text-sm text-slate-500">{teacher.staffNumber}{teacher.jobTitle ? ` · ${teacher.jobTitle}` : ""}</p></div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"><GraduationCap className="mx-auto h-4 w-4 text-emerald-700" /><p className="mt-1 text-lg font-bold">{classes.length}</p><p className="text-xs text-slate-500">Classes</p></div>
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"><Users className="mx-auto h-4 w-4 text-emerald-700" /><p className="mt-1 text-lg font-bold">{studentCount}</p><p className="text-xs text-slate-500">Students</p></div>
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"><CalendarDays className="mx-auto h-4 w-4 text-emerald-700" /><p className="mt-1 text-lg font-bold">{teacher.timetable.length}</p><p className="text-xs text-slate-500">Lessons</p></div>
              </div>
            </div>
            <div className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="flex items-center gap-2 font-semibold"><Users className="h-5 w-5 text-emerald-700" /> My classes</h3><div className="mt-4 space-y-4">{classes.length ? classes.map((classroom) => <article key={classroom.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="font-semibold">{classroom.name}{classroom.levelName ? ` · ${classroom.levelName}` : ""}</h4><p className="text-sm text-slate-500">{classroom.streamName ?? "Class"} · {classroom.students.length} students</p></div><BookOpen className="h-5 w-5 text-emerald-700" /></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{classroom.students.map((student) => <div key={student.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"><span>{student.firstName} {student.lastName}<span className="ml-1 text-xs text-slate-500">({student.studentNumber})</span></span><form action={recordEducationTeacherAttendance} className="flex items-center gap-1"><input type="hidden" name="org_id" value={teacher.organizationId} /><input type="hidden" name="class_id" value={classroom.id} /><input type="hidden" name="student_id" value={student.id} /><input type="hidden" name="attendance_date" value={new Date().toISOString().slice(0, 10)} /><select name="status" defaultValue={student.attendanceStatus ?? "present"} aria-label={`Attendance for ${student.firstName} ${student.lastName}`} className="rounded border border-slate-300 bg-white px-1.5 py-1 text-xs">{["present", "absent", "late", "excused"].map((status) => <option key={status} value={status}>{status}</option>)}</select><button type="submit" className="rounded bg-emerald-700 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-800">Save</button></form></div>)}</div></article>) : <p className="text-sm text-slate-500">No classes are assigned yet.</p>}</div></section>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="flex items-center gap-2 font-semibold"><CalendarDays className="h-5 w-5 text-emerald-700" /> Timetable</h3><div className="mt-4 space-y-2">{teacher.timetable.length ? teacher.timetable.map((lesson, index) => <div key={`${lesson.classId}-${lesson.weekday}-${lesson.startsAt}-${index}`} className="rounded-lg bg-slate-50 p-3 text-sm"><p className="font-semibold">{WEEKDAYS[lesson.weekday - 1]} · {lesson.startsAt.slice(0, 5)}–{lesson.endsAt.slice(0, 5)}</p><p className="mt-1 text-slate-700">{lesson.subject} · {lesson.className}</p>{lesson.room && <p className="text-xs text-slate-500">{lesson.room}</p>}</div>) : <p className="text-sm text-slate-500">No timetable entries are assigned yet.</p>}</div></section>
            </div>
          </section>;
        })}
      </div>}
    </div>
  </main>;
}
