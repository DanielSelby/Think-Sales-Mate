import Link from "next/link";
import { BookOpen, CalendarDays, GraduationCap } from "lucide-react";
import { educationPortalCommunicationsSchema, type EducationPortalCommunication } from "@/lib/education/communications";
import {
  markEducationNotificationRead,
  setEducationAnnouncementDeliveryPreference,
} from "@/app/education-notifications/actions";
import { educationStudentPortalSchema, type EducationStudentPortal } from "@/lib/education/student-portal";
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
import { educationNotificationsSchema } from "@/lib/education/notifications";
import { getEducationPortalScopedPath, isEducationOrganizationId } from "@/lib/education/portal-auth";
import { setEducationNotificationPreference } from "@/app/education-notifications/actions";
import { createClient } from "@/lib/supabase/server";
import { getOptionalAuthUser } from "@/lib/supabase/optional-user";
import { EducationPortalShell } from "@/components/education/education-portal-shell";
import { EducationAssignmentAttachmentLinks } from "@/components/education/assignment-attachment-links";
import { StudentAiAssistant } from "./student-ai-assistant";
import { StudentReportCardPrintButton } from "./student-report-card-print-button";
import {
  getEducationInstitutionDisplayName,
  getEducationInstitutionLogoUrl,
} from "@/lib/education/institution-branding";
import { claimEducationStudentPortalAccount, signInToEducationStudentPortal, submitEducationAssignment } from "./actions";

const ASSIGNMENTS_PAGE_SIZE = 20;

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
type StudentPortalSection = "dashboard" | "assistant" | "assignments" | "attendance" | "results" | "timetable";

function messageFor(params: Record<string, string | string[] | undefined>) {
  if (params.signin === "invalid") return "Email or password is incorrect. If you need access, contact your school administrator for a temporary password.";
  if (params.claim === "linked") return "Your student profile is now linked to this account.";
  if (params.claim === "verify-email") return "Verify this account’s email address before linking a student profile.";
  if (params.claim === "already-linked") return "A student profile is already linked to this account for one of the schools.";
  if (params.claim === "not-found") return "No linkable student profile was found for this verified email. Ask your school to confirm that the profile is active, its email matches, and the school has portal access.";
  if (params.claim === "error") return "The student profile could not be linked. Please try again or contact the school.";
  if (params.assignment === "submitted") return "Your assignment submission was saved.";
  if (params.assignment === "attachment-uploaded") return "Your assignment attachment was uploaded.";
  if (params.assignment === "attachment-error") return "Your response was saved, but the attachment could not be uploaded. Check the file type and size, then try again.";
  if (params.assignment === "invalid") return "Check your assignment response and try again.";
  if (params.assignment === "error") return "Your assignment could not be submitted. Confirm it is assigned to your profile and try again.";
  return null;
}

export async function StudentEducationPortalPage({
  searchParams,
  section,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  section: StudentPortalSection;
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
  const user = getOptionalAuthUser(await supabase.auth.getUser(), "the student portal");

  let portal: EducationStudentPortal = [];
  let assignments: EducationAssignment[] = [];
  let assignmentTargets: EducationAssignmentTarget[] = [];
  let assignmentSubmissions: EducationAssignmentSubmission[] = [];
  let assignmentSubmissionVersions: EducationAssignmentSubmissionVersion[] = [];
  let assignmentAttachments: EducationAssignmentAttachment[] = [];
  let assignmentTotalCount = 0;
  let announcements: EducationPortalCommunication[] = [];
  let notifications: Awaited<ReturnType<typeof educationNotificationsSchema.parse>> = [];
  let notificationPreferences: Array<{ org_id: string; notification_type: string; in_app_enabled: boolean }> = [];
  let outboundNotificationPreferences: Array<{
    org_id: string;
    organization_name: string;
    email_enabled: boolean;
    sms_enabled: boolean;
  }> = [];
  let publishedReportCards: Array<{
    student_id: string;
    term_id: string;
    term_name: string;
    starts_on: string;
    ends_on: string;
    teacher_comment: string | null;
    principal_comment: string | null;
    published_at: string | null;
  }> = [];
  const studentInstitutionBranding = new Map<string, {
    name: string;
    code: string | null;
    logoUrl: string | null;
  }>();
  if (user) {
    const { data, error } = await supabase.rpc("education_get_student_portal");
    if (error) throw new Error(`Could not load the student portal: ${error.message}`);
    const parsedPortal = educationStudentPortalSchema.safeParse(data);
    if (!parsedPortal.success) {
      console.error("Think Education student portal returned unexpected data:", parsedPortal.error.flatten());
      throw new Error("The student portal data could not be safely displayed.");
    }
    portal = hasOrganizationScope
      ? parsedPortal.data.filter((student) => student.organizationId === requestedOrganizationId)
      : parsedPortal.data;

    const studentIds = portal.map((student) => student.id);
    const studentOrgIds = [...new Set(portal.map((student) => student.organizationId))];
    for (const student of portal) {
      if (!studentInstitutionBranding.has(student.organizationId)) {
        const [{ data: institution }, { data: companyProfile }] = await Promise.all([
          supabase.from("education_institution_settings")
            .select("institution_name, institution_code, institution_logo_url")
            .eq("org_id", student.organizationId)
            .maybeSingle(),
          supabase.from("company_profile")
            .select("logo_url")
            .eq("org_id", student.organizationId)
            .maybeSingle(),
        ]);
        studentInstitutionBranding.set(student.organizationId, {
          name: getEducationInstitutionDisplayName(institution?.institution_name, student.organizationName),
          code: institution?.institution_code ?? null,
          logoUrl: getEducationInstitutionLogoUrl(institution?.institution_logo_url, companyProfile?.logo_url),
        });
      }
      const { data, error } = await supabase.rpc("education_get_published_student_report_cards", {
        p_org_id: student.organizationId,
        p_student_id: student.id,
      });
      if (error) throw new Error(`Could not load published report cards: ${error.message}`);
      publishedReportCards.push(...(data ?? []).map((report) => ({
        student_id: student.id,
        ...report,
      })));
    }
    if (studentIds.length) {
      const { data: assignmentRows, error: assignmentError, count: assignmentCount } = await supabase
        .from("education_assignments")
        .select("id, org_id, class_id, title, description, due_on, max_score, status, created_by, created_at, updated_at", { count: "exact" })
        .in("org_id", studentOrgIds)
        .eq("status", "published")
        .order("due_on", { ascending: true })
        .order("id", { ascending: true })
        .range((assignmentPage - 1) * ASSIGNMENTS_PAGE_SIZE, assignmentPage * ASSIGNMENTS_PAGE_SIZE - 1);
      if (assignmentError) throw new Error(`Could not load student assignments: ${assignmentError.message}`);
      assignmentTotalCount = assignmentCount ?? 0;
      const parsedAssignments = educationAssignmentsSchema.safeParse(assignmentRows ?? []);
      if (!parsedAssignments.success) {
        console.error("Think Education student assignments returned unexpected data:", parsedAssignments.error.flatten());
        throw new Error("Assignment data could not be safely displayed.");
      }
      assignments = parsedAssignments.data;
      const assignmentIds = assignments.map((assignment) => assignment.id);
      if (assignmentIds.length) {
        const [targetResult, submissionResult, attachmentResult] = await Promise.all([
          supabase.from("education_assignment_targets")
            .select("org_id, assignment_id, student_id, created_at")
            .in("assignment_id", assignmentIds)
            .in("student_id", studentIds),
          supabase.from("education_assignment_submissions")
            .select("id, org_id, assignment_id, student_id, submission_text, submitted_at, score, feedback, graded_by, graded_at, revision_requested_at, revision_requested_by, revision_request_note, updated_at")
            .in("assignment_id", assignmentIds)
            .in("student_id", studentIds),
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

    const { data: communications, error: communicationsError } = await supabase.rpc("education_get_student_communications");
    if (communicationsError) throw new Error(`Could not load student announcements: ${communicationsError.message}`);
    const parsedCommunications = educationPortalCommunicationsSchema.safeParse(communications);
    if (!parsedCommunications.success) {
      console.error("Think Education student announcements returned unexpected data:", parsedCommunications.error.flatten());
      throw new Error("Student announcements could not be safely displayed.");
    }
    announcements = parsedCommunications.data.filter((announcement) =>
      !hasOrganizationScope || announcement.organizationId === requestedOrganizationId
    );

    if (studentOrgIds.length) {
      const { data: notificationRows, error: notificationError } = await supabase.from("education_notifications")
        .select("id, org_id, branch_id, user_id, notification_type, title, message, announcement_id, assignment_id, assignment_event_key, delivery_status, read_at, created_at")
        .eq("user_id", user.id)
        .in("org_id", studentOrgIds)
        .order("created_at", { ascending: false })
        .limit(30);
      if (notificationError) throw new Error(`Could not load student notifications: ${notificationError.message}`);
      const parsedNotifications = educationNotificationsSchema.safeParse(notificationRows ?? []);
      if (!parsedNotifications.success) {
        console.error("Think Education student notifications returned unexpected data:", parsedNotifications.error.flatten());
        throw new Error("Student notifications could not be safely displayed.");
      }
      notifications = parsedNotifications.data;
    }

    if (studentOrgIds.length) {
      const { data: preferences, error: preferencesError } = await supabase.from("education_notification_preferences")
        .select("org_id, notification_type, in_app_enabled")
        .eq("user_id", user.id)
        .in("org_id", studentOrgIds);
      if (preferencesError) throw new Error(`Could not load student notification preferences: ${preferencesError.message}`);
      notificationPreferences = preferences ?? [];
    }

    const { data: outboundPreferences, error: outboundPreferencesError } = await supabase
      .rpc("education_announcement_get_delivery_preferences");
    if (outboundPreferencesError) {
      throw new Error(`Could not load student announcement delivery preferences: ${outboundPreferencesError.message}`);
    }
    outboundNotificationPreferences = (outboundPreferences ?? []).filter((preference) =>
      studentOrgIds.includes(preference.org_id)
    );
  }
  const message = messageFor(params);
  const assignmentTotalPages = Math.max(1, Math.ceil(assignmentTotalCount / ASSIGNMENTS_PAGE_SIZE));
  const sectionDetails: Record<StudentPortalSection, { title: string; subtitle: string }> = {
    dashboard: { title: "Student Dashboard", subtitle: "A quick overview of your school profile and updates." },
    assistant: { title: "AI School Assistant", subtitle: "Get school-aware help with your learning and schoolwork." },
    assignments: { title: "Homework & Assignments", subtitle: "Review, submit, and track your assigned work." },
    attendance: { title: "Attendance", subtitle: "Review your recent attendance by student profile." },
    results: { title: "My Results", subtitle: "Review results published by your school." },
    timetable: { title: "Timetable", subtitle: "See your weekly lessons and class schedule." },
  };
  const page = sectionDetails[section];
  const showSection = (target: Exclude<StudentPortalSection, "dashboard">) =>
    section === "dashboard" || section === target;
  const assignmentPageHref = (page: number) => {
    const query = new URLSearchParams();
    if (requestedOrganizationId) query.set("org", requestedOrganizationId);
    query.set("assignmentPage", String(page));
    return `/student-education-portal/assignments?${query.toString()}`;
  };

  return <EducationPortalShell
    role="student"
    title={page.title}
    activeItem={section === "dashboard" ? "Dashboard" : page.title}
    subtitle={page.subtitle}
    userEmail={user?.email}
    organizationId={requestedOrganizationId}
  >
      {showSection("results") && <style>{`
        @media print {
          @page { margin: 12mm; }
          body { background: white !important; }
          aside, header, nav, .student-report-card-controls { display: none !important; }
          main { max-width: none !important; padding: 0 !important; }
        }
      `}</style>}

      {message && <p role={params.assignment === "error" || params.assignment === "attachment-error" || params.assignment === "invalid" ? "alert" : "status"} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">{message}</p>}
      {params.preference === "saved" && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Notification preference saved.</p>}
      {params.preference === "denied" && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">This preference could not be changed for the selected school.</p>}
      {params.preference === "error" && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">The preference could not be saved. Please try again.</p>}
      {params.preference === "invalid" && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">The preference selection was invalid.</p>}

      {section === "dashboard" && notifications.length > 0 && <section className="space-y-3">
        <h2 className="text-xl font-semibold">Notifications</h2>
        <div className="space-y-2">
          {notifications.map((notification) => <article key={notification.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div>
              <p className="font-semibold">{notification.title}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{notification.message}</p>
              <p className="mt-2 text-xs text-slate-500">{new Date(notification.created_at).toLocaleString()} · {notification.delivery_status === "read" ? "Read" : "Delivered"}</p>
            </div>
            {notification.delivery_status === "delivered" && <form action={markEducationNotificationRead}>
              <input type="hidden" name="notification_id" value={notification.id} />
              <input type="hidden" name="return_to" value={requestedOrganizationId
                ? getEducationPortalScopedPath("/student-education-portal", requestedOrganizationId)
                : "/student-education-portal"} />
              <button type="submit" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Mark read</button>
            </form>}
          </article>)}
        </div>
      </section>}

      {section === "dashboard" && user && portal.length > 0 && <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold">In-app notification preferences</h2>
        <p className="mt-1 text-sm text-slate-500">Choose which school announcements and assignment updates appear in your notification inbox.</p>
        <ul className="mt-3 divide-y divide-slate-100">
          {[...new Map(portal.map((student) => [student.organizationId, student.organizationName])).entries()].flatMap(([organizationId, organizationName]) => ([
            ["announcement", "Announcements"],
            ["assignment", "Assignment updates"],
          ] as const).map(([type, label]) => {
            const enabled = notificationPreferences.find((preference) =>
              preference.org_id === organizationId && preference.notification_type === type
            )?.in_app_enabled !== false;
            return <li key={`${organizationId}-${type}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="text-sm font-medium">{organizationName} · {label}: {enabled ? "Enabled" : "Paused"}</span>
              <form action={setEducationNotificationPreference}>
                <input type="hidden" name="org_id" value={organizationId} />
                <input type="hidden" name="notification_type" value={type} />
                <input type="hidden" name="in_app_enabled" value={String(!enabled)} />
                <input type="hidden" name="return_to" value={requestedOrganizationId
                  ? getEducationPortalScopedPath("/student-education-portal", requestedOrganizationId)
                  : "/student-education-portal"} />
                <button type="submit" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">{enabled ? "Pause" : "Enable"}</button>
              </form>
            </li>;
          }))}
        </ul>
      </section>}

      {section === "dashboard" && user && outboundNotificationPreferences.length > 0 && <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Announcement email and SMS preferences</h2>
        <p className="mt-1 text-sm text-slate-500">Each channel is optional and starts off. These settings are independent of your in-app notification inbox.</p>
        <ul className="mt-3 divide-y divide-slate-100">
          {outboundNotificationPreferences.map((preference) => <li key={preference.org_id} className="py-3">
            <p className="text-sm font-medium">{preference.organization_name}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {([
                ["email", "Email", preference.email_enabled],
                ["sms", "SMS", preference.sms_enabled],
              ] as const).map(([channel, label, enabled]) => <form key={channel} action={setEducationAnnouncementDeliveryPreference} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
                <span className="text-sm text-slate-700">{label}: {enabled ? "Opted in" : "Off"}</span>
                <input type="hidden" name="org_id" value={preference.org_id} />
                <input type="hidden" name="channel" value={channel} />
                <input type="hidden" name="enabled" value={String(!enabled)} />
                <input type="hidden" name="return_to" value={requestedOrganizationId
                  ? getEducationPortalScopedPath("/student-education-portal", requestedOrganizationId)
                  : "/student-education-portal"} />
                <button type="submit" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  {enabled ? `Turn off ${label}` : `Opt in to ${label}`}
                </button>
              </form>)}
            </div>
          </li>)}
        </ul>
      </section>}

      {section === "dashboard" && announcements.length > 0 && <section id="announcements" className="space-y-3">
        <h2 className="text-xl font-semibold">School announcements</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {announcements.map((announcement) => <article key={announcement.id} className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-blue-700">{announcement.organizationName} · {announcement.campusName}</p>
            <h3 className="mt-1 font-semibold text-slate-950">{announcement.title}</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{announcement.body}</p>
            <time className="mt-3 block text-xs text-slate-500" dateTime={announcement.publishedAt}>Published {new Date(announcement.publishedAt).toLocaleString()}</time>
          </article>)}
        </div>
      </section>}

      {!user ? <section className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <h2 className="text-xl font-semibold">Sign in to your student account</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Use the email address recorded in your student profile and the temporary password provided by your school.</p>
        <form action={signInToEducationStudentPortal} className="mt-5 space-y-3">
          {requestedOrganizationId && <input type="hidden" name="org_id" value={requestedOrganizationId} />}
          <label className="block text-sm font-medium text-slate-700">
            Email address
            <input type="email" name="email" required maxLength={254} autoComplete="email" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="block text-sm font-medium text-slate-700">Password
            <input type="password" name="password" required maxLength={256} autoComplete="current-password" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <button type="submit" className="w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Sign in to student portal</button>
        </form>
      </section> : portal.length === 0 ? <section className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-[1.2fr_0.8fr] md:p-8">
        <div>
          <h2 className="text-xl font-semibold">Link your student profile</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Your account must use the verified email address already recorded in your student profile. Only an active matching student record can be linked.
          </p>
          <form action={claimEducationStudentPortalAccount} className="mt-5">
            {requestedOrganizationId && <input type="hidden" name="org_id" value={requestedOrganizationId} />}
            <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
              Find and link my student profile
            </button>
          </form>
        </div>
        <div className="rounded-xl bg-slate-50 p-5">
          <h3 className="font-semibold">Need an account?</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">If you do not have a password yet, ask your school administrator for a one-time temporary password.</p>
        </div>
      </section> : <div className="space-y-6">
        {showSection("assistant") && <div>
          <div className="grid gap-4 xl:grid-cols-2">
            {portal.map((student) => <StudentAiAssistant key={student.id} studentId={student.id} />)}
          </div>
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
        <div className="grid gap-5 lg:grid-cols-2">
        {portal.map((student) => <article key={`${student.organizationName}-${student.id}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-100 p-5">
            <p className="text-sm font-medium text-blue-700">{student.organizationName} · {student.campusName}</p>
            <div className="mt-2 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">{student.firstName} {student.otherNames ? `${student.otherNames} ` : ""}{student.lastName}</h2>
                <p className="mt-1 text-sm text-slate-500">{student.studentNumber} · {student.className ?? "No active class"}</p>
              </div>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><GraduationCap className="h-5 w-5" /></span>
            </div>
          </header>

          {(showSection("attendance") || showSection("results")) && <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
            {showSection("attendance") && <div className="rounded-xl bg-slate-50 p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><CalendarDays className="h-4 w-4" /> Attendance, 30 days</div>
              <p className="mt-2 text-lg font-semibold">{student.attendance.present} present</p>
              <p className="text-xs text-slate-500">{student.attendance.absent} absent · {student.attendance.late} late · {student.attendance.excused} excused</p>
            </div>}
            {showSection("results") && <div className="rounded-xl bg-slate-50 p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><BookOpen className="h-4 w-4" /> Results released</div>
              <p className="mt-2 text-lg font-semibold">{student.results.length}</p>
              <p className="text-xs text-slate-500">Published subject results</p>
            </div>}
          </div>}

          <div className="space-y-5 px-5 pb-5">
            {showSection("assignments") && <section>
              <h3 className="flex items-center gap-2 text-sm font-semibold"><BookOpen className="h-4 w-4 text-blue-700" /> Homework & Assignments</h3>
              {assignments.filter((assignment) => assignmentTargets.some((target) =>
                target.assignment_id === assignment.id && target.student_id === student.id
              )).length ? (
                <ul className="mt-2 space-y-3">
                  {assignments.filter((assignment) => assignmentTargets.some((target) =>
                    target.assignment_id === assignment.id && target.student_id === student.id
                  )).map((assignment) => {
                    const submission = assignmentSubmissions.find((item) =>
                      item.assignment_id === assignment.id && item.student_id === student.id
                    );
                    return <li key={assignment.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-900">{assignment.title}</p>
                          {assignment.description && <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-slate-600">{assignment.description}</p>}
                        </div>
                        <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">Due {new Date(`${assignment.due_on}T00:00:00`).toLocaleDateString()}</span>
                      </div>
                      <EducationAssignmentAttachmentLinks
                        attachments={assignmentAttachments.filter((attachment) =>
                          attachment.assignment_id === assignment.id && attachment.kind === "assignment"
                        )}
                        label="Teacher resources"
                      />
                      {submission && <EducationAssignmentAttachmentLinks
                        attachments={assignmentAttachments.filter((attachment) =>
                          attachment.submission_id === submission.id
                        )}
                        label="Your submitted files"
                      />}
                      {submission?.graded_at && !submission.revision_requested_at ? (
                        <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
                          <p className="font-semibold">Grade: {submission.score}/{assignment.max_score}</p>
                          {submission.feedback && <p className="mt-1 whitespace-pre-wrap">{submission.feedback}</p>}
                        </div>
                      ) : (
                        <form action={submitEducationAssignment} className="mt-3 space-y-2">
                          <input type="hidden" name="org_id" value={assignment.org_id} />
                          <input type="hidden" name="assignment_id" value={assignment.id} />
                          <input type="hidden" name="student_id" value={student.id} />
                          <label className="block text-xs font-medium text-slate-600">
                            {submission?.revision_requested_at ? `Revise your response · Maximum ${assignment.max_score}` : submission ? `Update response · Maximum ${assignment.max_score}` : `Your response · Maximum ${assignment.max_score}`}
                            <textarea name="submission_text" required maxLength={10000} rows={3} defaultValue={submission?.submission_text ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900" />
                          </label>
                          {submission?.revision_requested_at && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><span className="font-semibold">Teacher feedback:</span> {submission.revision_request_note}</p>}
                          {submission && <p className="text-xs text-slate-500">Last submitted {new Date(submission.submitted_at).toLocaleString()}{submission.submitted_at.slice(0, 10) > assignment.due_on ? " · Late" : ""}</p>}
                          <button type="submit" className="rounded-lg bg-indigo-700 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-800">{submission?.revision_requested_at ? "Resubmit assignment" : submission ? "Update submission" : "Submit assignment"}</button>
                        </form>
                      )}
                      {submission && (!submission.graded_at || submission.revision_requested_at) && <form action="/api/education/assignment-attachments" method="post" encType="multipart/form-data" className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3">
                        <input type="hidden" name="org_id" value={assignment.org_id} />
                        <input type="hidden" name="kind" value="submission" />
                        <input type="hidden" name="assignment_id" value={assignment.id} />
                        <input type="hidden" name="submission_id" value={submission.id} />
                        <input type="hidden" name="student_id" value={student.id} />
                        <label className="min-w-52 flex-1 text-xs font-medium text-slate-600">
                          Add a submission file (PDF, image, Word, or text; max 10 MB)
                          <input type="file" name="attachment" required accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.txt" className="mt-1 block w-full text-sm font-normal text-slate-700" />
                        </label>
                        <button type="submit" className="rounded-lg border border-indigo-300 px-3 py-2 text-xs font-semibold text-indigo-800 hover:bg-indigo-50">Upload file</button>
                      </form>}
                      {(assignmentSubmissionVersions.filter((version) => version.submission_id === submission?.id)).length > 0 && <details className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
                        <summary className="cursor-pointer text-xs font-semibold text-slate-700">Previous attempts ({assignmentSubmissionVersions.filter((version) => version.submission_id === submission?.id).length})</summary>
                        <ol className="mt-2 space-y-2">
                          {assignmentSubmissionVersions.filter((version) => version.submission_id === submission?.id).map((version) => <li key={`${version.submission_id}-${version.version_number}`} className="border-t border-slate-200 pt-2 text-xs text-slate-600">
                            <p className="font-medium">Attempt {version.version_number} · {new Date(version.submitted_at).toLocaleString()}</p>
                            <p className="mt-1 whitespace-pre-wrap">{version.submission_text}</p>
                            {version.score !== null && <p className="mt-1">Grade: {version.score}{version.feedback ? ` · ${version.feedback}` : ""}</p>}
                          </li>)}
                        </ol>
                      </details>}
                    </li>;
                  })}
                </ul>
              ) : <p className="mt-2 text-sm text-slate-500">No assignments have been published for this student.</p>}
            </section>}
            {showSection("timetable") && <section>
              <h3 className="flex items-center gap-2 text-sm font-semibold"><CalendarDays className="h-4 w-4 text-blue-700" /> Weekly timetable</h3>
              {student.timetable.length ? <ul className="mt-2 divide-y divide-slate-100">
                {student.timetable.map((entry, index) => <li key={`${entry.weekday}-${entry.startsAt}-${entry.subject}-${index}`} className="flex justify-between gap-3 py-2 text-sm">
                  <span className="font-medium">{WEEKDAYS[entry.weekday - 1]} · {entry.subject}</span>
                  <span className="shrink-0 text-slate-500">{entry.startsAt.slice(0, 5)}–{entry.endsAt.slice(0, 5)}{entry.room ? ` · ${entry.room}` : ""}</span>
                </li>)}
              </ul> : <p className="mt-2 text-sm text-slate-500">No active weekly timetable is available.</p>}
            </section>}
            {showSection("results") && <section>
              {student.results.length > 0 && (() => {
                const totalScore = student.results.reduce((total, result) => total + result.score, 0);
                const totalMaximum = student.results.reduce((total, result) => total + result.maximumScore, 0);
                const percentage = totalMaximum > 0 ? (totalScore / totalMaximum) * 100 : null;
                return <div className="mb-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Overall weighted percentage</p>
                  <p className="mt-1 text-xl font-bold text-slate-950">{percentage === null ? "—" : `${percentage.toFixed(1)}%`}</p>
                  <p className="mt-1 text-xs text-slate-500">Calculated across published result entries.</p>
                </div>;
              })()}
              {(() => {
                const branding = studentInstitutionBranding.get(student.organizationId);
                if (!branding) return null;
                return <header className="mb-3 flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-3">
                    {branding.logoUrl
                      ? <img src={branding.logoUrl} alt="" className="h-12 w-12 rounded-lg border border-slate-200 object-contain p-1" />
                      : null}
                    <div>
                      <p className="font-bold text-slate-950">{branding.name}</p>
                      {branding.code && <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{branding.code}</p>}
                    </div>
                  </div>
                  <p className="text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Official report card</p>
                </header>;
              })()}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><BookOpen className="h-4 w-4 text-blue-700" /> Published results</h3>
                {student.results.length > 0 && <div className="student-report-card-controls"><StudentReportCardPrintButton /></div>}
              </div>
              {student.results.length ? <ul className="mt-2 divide-y divide-slate-100">
                {student.results.map((result, index) => <li key={`${result.examination}-${result.subject}-${index}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span><span className="font-medium">{result.subject}</span><span className="block text-xs text-slate-500">{result.examination}</span></span>
                  <span className="shrink-0 text-right font-medium">{result.score}/{result.maximumScore}{result.grade ? ` · ${result.grade}` : ""}</span>
                </li>)}
              </ul> : <p className="mt-2 text-sm text-slate-500">No results have been published.</p>}
              {publishedReportCards.filter((report) => report.student_id === student.id).length > 0 && <div className="mt-4 space-y-3">
                {publishedReportCards.filter((report) => report.student_id === student.id).map((report) => <article key={report.term_id} className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
                  <h4 className="font-semibold text-indigo-950">{report.term_name}</h4>
                  <p className="mt-1 text-xs text-slate-500">
                    {new Date(`${report.starts_on}T00:00:00`).toLocaleDateString()} – {new Date(`${report.ends_on}T00:00:00`).toLocaleDateString()}
                  </p>
                  {report.teacher_comment && <p className="mt-2 text-sm"><strong>Class teacher:</strong> {report.teacher_comment}</p>}
                  {report.principal_comment && <p className="mt-2 text-sm"><strong>Principal / head teacher:</strong> {report.principal_comment}</p>}
                  <p className="mt-2 text-xs font-medium text-emerald-700">
                    Published{report.published_at ? ` ${new Date(report.published_at).toLocaleDateString()}` : ""}
                  </p>
                </article>)}
              </div>}
            </section>}
          </div>
        </article>)}
        </div>
      </div>}

      <footer className="text-center text-xs text-slate-500">
        Only this signed-in account’s active student profile is shown. Results are visible after publication by the school.
      </footer>
  </EducationPortalShell>;
}
