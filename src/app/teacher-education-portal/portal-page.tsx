import Link from "next/link";
import { BookOpen, CalendarDays, GraduationCap, Users } from "lucide-react";
import { educationTeacherPortalSchema, type EducationTeacherPortal } from "@/lib/education/teacher-portal";
import {
  educationAssignmentsSchema,
  educationAssignmentSubmissionsSchema,
  educationAssignmentSubmissionVersionsSchema,
  educationAssignmentTargetsSchema,
  educationAssignmentAttachmentsSchema,
  type EducationAssignment,
  type EducationAssignmentAttachment,
  type EducationAssignmentSubmission,
  type EducationAssignmentSubmissionVersion,
  type EducationAssignmentTarget,
} from "@/lib/education/assignments";
import { createClient } from "@/lib/supabase/server";
import { getOptionalAuthUser } from "@/lib/supabase/optional-user";
import { isEducationOrganizationId } from "@/lib/education/portal-auth";
import { EducationPortalShell } from "@/components/education/education-portal-shell";
import { TeacherAssignments } from "./teacher-assignments";
import { TeacherAiAssistant } from "./teacher-ai-assistant";
import { claimEducationTeacherPortalAccount, recordEducationTeacherAttendance, signInToEducationTeacherPortal } from "./actions";

const ASSIGNMENTS_PAGE_SIZE = 20;
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
type TeacherPortalSection = "dashboard" | "assignments" | "classes" | "attendance" | "timetable";

function messageFor(params: Record<string, string | string[] | undefined>) {
  if (params.signin === "invalid") return "Email or password is incorrect. If you need access, contact your school administrator for a temporary password.";
  if (params.claim === "linked") return "Your teacher profile is now linked to this account.";
  if (params.claim === "verify-email") return "Verify your account email before linking a teacher profile.";
  if (params.claim === "not-found") return "No active teaching staff profile matches this verified account email.";
  if (params.claim === "error") return "The teacher profile could not be linked. Please contact the school.";
  if (params.attendance === "saved") return "Attendance saved.";
  if (params.attendance === "error") return "Attendance could not be saved. Check the class assignment and try again.";
  if (params.assignment === "created") return "Assignment published to the selected students.";
  if (params.assignment === "attachment-uploaded") return "Assignment resource uploaded.";
  if (params.assignment === "attachment-error") return "The attachment could not be uploaded. Check your class access and the file type and size, then try again.";
  if (params.assignment === "graded") return "Submission grade saved.";
  if (params.assignment === "revision-requested") return "The student has been asked to revise this submission.";
  if (params.assignment === "revision-error") return "The revision request could not be saved. Confirm that the submission is graded and belongs to one of your classes.";
  if (params.assignment === "invalid") return "Check the assignment details and try again.";
  if (params.assignment === "grade-error") return "The grade could not be saved. Confirm that the submission belongs to one of your classes.";
  if (params.assignment === "error") return "The assignment could not be saved. Confirm your class access and try again.";
  return null;
}

export async function TeacherEducationPortalPage({
  searchParams,
  section,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  section: TeacherPortalSection;
}) {
  const params = await searchParams;
  const hasOrganizationScope = params.org !== undefined;
  const requestedOrganizationId = isEducationOrganizationId(params.org)
    ? params.org.toLowerCase()
    : null;
  const requestedPageValue = Number.parseInt(
    typeof params.assignmentPage === "string" ? params.assignmentPage : "1",
    10
  );
  const assignmentPage = Number.isSafeInteger(requestedPageValue)
    ? Math.min(100_000, Math.max(1, requestedPageValue))
    : 1;
  const supabase = await createClient();
  const user = getOptionalAuthUser(await supabase.auth.getUser(), "the teacher portal");
  let portal: EducationTeacherPortal = [];
  let assignments: EducationAssignment[] = [];
  let assignmentTargets: EducationAssignmentTarget[] = [];
  let assignmentSubmissions: EducationAssignmentSubmission[] = [];
  let assignmentSubmissionVersions: EducationAssignmentSubmissionVersion[] = [];
  let assignmentAttachments: EducationAssignmentAttachment[] = [];
  let assignmentTotalCount = 0;
  if (user) {
    const { data, error } = await supabase.rpc("education_get_teacher_portal");
    if (error) throw new Error(`Could not load the teacher portal: ${error.message}`);
    const parsed = educationTeacherPortalSchema.safeParse(data);
    if (!parsed.success) {
      console.error("Think Education teacher portal returned unexpected data:", parsed.error.flatten());
      throw new Error("The teacher portal data could not be safely displayed.");
    }
    portal = hasOrganizationScope
      ? parsed.data.filter((teacher) => teacher.organizationId === requestedOrganizationId)
      : parsed.data;
    const orgIds = [...new Set(portal.map((teacher) => teacher.organizationId))];
    if (orgIds.length) {
      const { data: assignmentRows, error: assignmentError, count: assignmentCount } = await supabase
        .from("education_assignments")
        .select("id, org_id, class_id, title, description, due_on, max_score, status, created_by, created_at, updated_at", { count: "exact" })
        .in("org_id", orgIds)
        .neq("status", "archived")
        .order("due_on", { ascending: false })
        .order("id", { ascending: true })
        .range((assignmentPage - 1) * ASSIGNMENTS_PAGE_SIZE, assignmentPage * ASSIGNMENTS_PAGE_SIZE - 1);
      if (assignmentError) throw new Error(`Could not load teacher assignments: ${assignmentError.message}`);
      assignmentTotalCount = assignmentCount ?? 0;
      const parsedAssignments = educationAssignmentsSchema.safeParse(assignmentRows ?? []);
      if (!parsedAssignments.success) {
        console.error("Think Education assignments returned unexpected data:", parsedAssignments.error.flatten());
        throw new Error("Assignment data could not be safely displayed.");
      }
      assignments = parsedAssignments.data;
      const assignmentIds = assignments.map((assignment) => assignment.id);
      if (assignmentIds.length) {
        const [targetResult, submissionResult, attachmentResult] = await Promise.all([
          supabase.from("education_assignment_targets")
            .select("org_id, assignment_id, student_id, created_at")
            .in("assignment_id", assignmentIds),
          supabase.from("education_assignment_submissions")
            .select("id, org_id, assignment_id, student_id, submission_text, submitted_at, score, feedback, graded_by, graded_at, revision_requested_at, revision_requested_by, revision_request_note, updated_at")
            .in("assignment_id", assignmentIds)
            .order("submitted_at", { ascending: false }),
          supabase.from("education_assignment_attachments")
            .select("id, org_id, assignment_id, submission_id, kind, file_name, content_type, file_size, storage_path, created_at")
            .in("assignment_id", assignmentIds),
        ]);
        if (targetResult.error) throw new Error(`Could not load assignment recipients: ${targetResult.error.message}`);
        if (submissionResult.error) throw new Error(`Could not load assignment submissions: ${submissionResult.error.message}`);
        if (attachmentResult.error) throw new Error(`Could not load assignment attachments: ${attachmentResult.error.message}`);
        const parsedTargets = educationAssignmentTargetsSchema.safeParse(targetResult.data ?? []);
        if (!parsedTargets.success) {
          console.error("Think Education assignment recipients returned unexpected data:", parsedTargets.error.flatten());
          throw new Error("Assignment recipient data could not be safely displayed.");
        }
        const parsedSubmissions = educationAssignmentSubmissionsSchema.safeParse(submissionResult.data ?? []);
        if (!parsedSubmissions.success) {
          console.error("Think Education assignment submissions returned unexpected data:", parsedSubmissions.error.flatten());
          throw new Error("Assignment submission data could not be safely displayed.");
        }
        assignmentTargets = parsedTargets.data;
        assignmentSubmissions = parsedSubmissions.data;
        const parsedAttachments = educationAssignmentAttachmentsSchema.safeParse(attachmentResult.data ?? []);
        if (!parsedAttachments.success) {
          console.error("Think Education assignment attachments returned unexpected data:", parsedAttachments.error.flatten());
          throw new Error("Assignment attachments could not be safely displayed.");
        }
        assignmentAttachments = parsedAttachments.data;
        const submissionIds = assignmentSubmissions.map((submission) => submission.id);
        const versionResults = await Promise.all(
          Array.from({ length: Math.ceil(submissionIds.length / 100) }, (_, index) =>
            supabase.rpc("education_get_assignment_submission_versions", {
              p_submission_ids: submissionIds.slice(index * 100, (index + 1) * 100),
            })
          )
        );
        for (const result of versionResults) {
          if (result.error) throw new Error(`Could not load assignment revision history: ${result.error.message}`);
        }
        const parsedVersions = educationAssignmentSubmissionVersionsSchema.safeParse(
          versionResults.flatMap((result) => result.data ?? [])
        );
        if (!parsedVersions.success) {
          console.error("Think Education assignment revision history returned unexpected data:", parsedVersions.error.flatten());
          throw new Error("Assignment revision history could not be safely displayed.");
        }
        assignmentSubmissionVersions = parsedVersions.data;
      }
    }
  }
  const message = messageFor(params);
  const assignmentTotalPages = Math.max(1, Math.ceil(assignmentTotalCount / ASSIGNMENTS_PAGE_SIZE));
  const sectionDetails: Record<TeacherPortalSection, { title: string; subtitle: string }> = {
    dashboard: { title: "Teacher Dashboard", subtitle: "A quick overview of your classes, timetable, and assignments." },
    assignments: { title: "Homework & Assignments", subtitle: "Create assignments and review student submissions." },
    classes: { title: "My Classes", subtitle: "Review your assigned classes and enrolled students." },
    attendance: { title: "Attendance", subtitle: "Record and review attendance for your classes." },
    timetable: { title: "Timetable", subtitle: "See your weekly teaching schedule." },
  };
  const page = sectionDetails[section];
  const showSection = (target: Exclude<TeacherPortalSection, "dashboard">) =>
    section === "dashboard" || section === target;
  const assignmentPageHref = (page: number) => {
    const query = new URLSearchParams();
    if (requestedOrganizationId) query.set("org", requestedOrganizationId);
    query.set("assignmentPage", String(page));
    return `/teacher-education-portal/assignments?${query.toString()}`;
  };

  return <EducationPortalShell
    role="teacher"
    title={page.title}
    activeItem={section === "dashboard" ? "Dashboard" : page.title}
    subtitle={page.subtitle}
    userEmail={user?.email}
    organizationId={requestedOrganizationId}
  >
      {message && <p role={params.claim === "error" || params.signin === "error" || params.assignment === "error" || params.assignment === "attachment-error" || params.assignment === "grade-error" || params.assignment === "revision-error" || params.assignment === "invalid" ? "alert" : "status"} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">{message}</p>}
      {!user ? <section className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <h2 className="text-xl font-semibold">Sign in to your teacher account</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Use the email address recorded in your school staff profile and the temporary password provided by your school.</p>
        <form action={signInToEducationTeacherPortal} className="mt-5 space-y-3">
          {requestedOrganizationId && <input type="hidden" name="org_id" value={requestedOrganizationId} />}
          <label className="block text-sm font-medium text-slate-700">Email address
            <input type="email" name="email" required maxLength={254} autoComplete="email" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="block text-sm font-medium text-slate-700">Password
            <input type="password" name="password" required maxLength={256} autoComplete="current-password" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <button type="submit" className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800">Sign in to teacher portal</button>
        </form>
      </section> : portal.length === 0 ? <section className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <h2 className="text-xl font-semibold">Link your teacher profile</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Your account must use the email address recorded on an active teaching staff profile. If you do not have a password, contact your school administrator.</p>
        <form action={claimEducationTeacherPortalAccount} className="mt-5">
          {requestedOrganizationId && <input type="hidden" name="org_id" value={requestedOrganizationId} />}
          <button type="submit" className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800">Find and link my teacher profile</button>
        </form>
      </section> : <div className="space-y-6">
        {showSection("assignments") && <div>
          <TeacherAssignments
            teachers={portal}
            assignments={assignments}
            attachments={assignmentAttachments}
            targets={assignmentTargets}
            submissions={assignmentSubmissions}
            versions={assignmentSubmissionVersions}
          />
        </div>}
        {section === "dashboard" && <div className="grid gap-4 xl:grid-cols-2">
          {portal.map((teacher) => (
            <TeacherAiAssistant
              key={teacher.organizationId}
              orgId={teacher.organizationId}
              schoolName={teacher.organizationName}
            />
          ))}
        </div>}
        {showSection("assignments") && assignmentTotalPages > 1 && <nav aria-label="Assignment pages" className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
          {assignmentPage > 1
            ? <Link href={assignmentPageHref(assignmentPage - 1)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Previous assignments</Link>
            : <span aria-disabled="true" className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-400">Previous assignments</span>}
          <span className="text-sm text-slate-600">Assignments page {assignmentPage} of {assignmentTotalPages}</span>
          {assignmentPage < assignmentTotalPages
            ? <Link href={assignmentPageHref(assignmentPage + 1)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Next assignments</Link>
            : <span aria-disabled="true" className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-400">Next assignments</span>}
        </nav>}
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
              {(showSection("classes") || showSection("attendance")) && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="flex items-center gap-2 font-semibold"><Users className="h-5 w-5 text-emerald-700" /> {section === "attendance" ? "Record attendance" : "My classes"}</h3><div className={`mt-4 space-y-4 ${section === "classes" ? "[&_form]:hidden" : ""}`}>{classes.length ? classes.map((classroom) => <article key={classroom.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="font-semibold">{classroom.name}{classroom.levelName ? ` · ${classroom.levelName}` : ""}</h4><p className="text-sm text-slate-500">{classroom.streamName ?? "Class"} · {classroom.students.length} students</p></div><BookOpen className="h-5 w-5 text-emerald-700" /></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{classroom.students.map((student) => <div key={student.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"><span>{student.firstName} {student.lastName}<span className="ml-1 text-xs text-slate-500">({student.studentNumber})</span></span><form action={recordEducationTeacherAttendance} className="flex items-center gap-1"><input type="hidden" name="org_id" value={teacher.organizationId} /><input type="hidden" name="class_id" value={classroom.id} /><input type="hidden" name="student_id" value={student.id} /><input type="hidden" name="attendance_date" value={new Date().toISOString().slice(0, 10)} /><select name="status" defaultValue={student.attendanceStatus ?? "present"} aria-label={`Attendance for ${student.firstName} ${student.lastName}`} className="rounded border border-slate-300 bg-white px-1.5 py-1 text-xs">{["present", "absent", "late", "excused"].map((status) => <option key={status} value={status}>{status}</option>)}</select><button type="submit" className="rounded bg-emerald-700 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-800">Save</button></form></div>)}</div></article>) : <p className="text-sm text-slate-500">No classes are assigned yet.</p>}</div></section>}
              {showSection("timetable") && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="flex items-center gap-2 font-semibold"><CalendarDays className="h-5 w-5 text-emerald-700" /> Timetable</h3><div className="mt-4 space-y-2">{teacher.timetable.length ? teacher.timetable.map((lesson, index) => <div key={`${lesson.classId}-${lesson.weekday}-${lesson.startsAt}-${index}`} className="rounded-lg bg-slate-50 p-3 text-sm"><p className="font-semibold">{WEEKDAYS[lesson.weekday - 1]} · {lesson.startsAt.slice(0, 5)}–{lesson.endsAt.slice(0, 5)}</p><p className="mt-1 text-slate-700">{lesson.subject} · {lesson.className}</p>{lesson.room && <p className="text-xs text-slate-500">{lesson.room}</p>}</div>) : <p className="text-sm text-slate-500">No timetable entries are assigned yet.</p>}</div></section>}
            </div>
          </section>;
        })}
      </div>}
  </EducationPortalShell>;
}
