import Link from "next/link";
import { BookOpen, CalendarDays, GraduationCap, Wallet } from "lucide-react";
import { z } from "zod";
import { educationPortalCommunicationsSchema, type EducationPortalCommunication } from "@/lib/education/communications";
import { markEducationNotificationRead } from "@/app/education-notifications/actions";
import { educationGuardianPortalSchema, type EducationGuardianPortal } from "@/lib/education/guardian-portal";
import {
  educationGuardianAttendanceHistorySchema,
  type EducationGuardianAttendanceRecord,
} from "@/lib/education/guardian-attendance";
import {
  educationGuardianFeePaymentsSchema,
  type EducationGuardianFeePayment,
} from "@/lib/education/guardian-fee-payments";
import {
  educationGuardianContactProfilesSchema,
  educationGuardianScheduleSchema,
  type EducationGuardianScheduleItem,
} from "@/lib/education/guardian-schedule";
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
import { formatCurrencyAmount, getCurrencyConfigFromSettings } from "@/lib/currency";
import {
  setEducationAnnouncementDeliveryPreference,
  setEducationNotificationPreference,
} from "@/app/education-notifications/actions";
import { createClient } from "@/lib/supabase/server";
import { getOptionalAuthUser } from "@/lib/supabase/optional-user";
import { getEducationPortalScopedPath, isEducationOrganizationId } from "@/lib/education/portal-auth";
import { EducationPortalShell } from "@/components/education/education-portal-shell";
import { EducationAssignmentAttachmentLinks } from "@/components/education/assignment-attachment-links";
import { GuardianAiAssistant } from "./guardian-ai-assistant";
import {
  claimEducationGuardianPortalAccount,
  signInToEducationGuardianPortal,
  updateEducationGuardianContact,
  bookEducationPTM,
} from "./actions";

export const dynamic = "force-dynamic";
const ASSIGNMENTS_PAGE_SIZE = 20;

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const guardianFeePaymentDataSchema = z.array(z.object({
  organizationId: z.string().uuid(),
  studentId: z.string().uuid(),
  chargeId: z.string().uuid(),
  description: z.string(),
  dueOn: z.string().nullable(),
  amount: z.number().nonnegative(),
  paid: z.number().nonnegative(),
  balance: z.number().nonnegative(),
  paymentStatus: z.enum(["pending", "paid", "failed", "expired"]).nullable(),
}));
const guardianCurrencyConfigsSchema = z.array(z.object({
  organization_id: z.string().uuid(),
  currency_code: z.string().regex(/^[A-Z]{3}$/),
  currency_symbol: z.string(),
  currency_name: z.string(),
  decimal_places: z.number().int().min(0).max(4),
  thousand_separator: z.string(),
  decimal_separator: z.string(),
  currency_position: z.enum(["before", "after"]),
}));

function messageFor(params: Record<string, string | string[] | undefined>) {
  if (params.signin === "invalid") return "Email or password is incorrect. If you need access, contact your school administrator for a temporary password.";
  if (params.claim === "linked") return "Your verified guardian profile is now linked to this account.";
  if (params.claim === "verify-email") return "Verify this account’s email address before linking a guardian profile.";
  if (params.claim === "already-linked") return "A guardian profile is already linked to this account for one of the schools.";
  if (params.claim === "not-found") return "No unlinked guardian profile with a verified student relationship matches this verified account email.";
  if (params.claim === "error") return "The guardian profile could not be linked. Please try again or contact the school.";
  return null;
}

function paymentMessageFor(params: Record<string, string | string[] | undefined>) {
  if (params.payment === "success") return "Payment received and recorded.";
  if (params.payment === "failed") return "Paystack reports that the payment failed. The outstanding balance is unchanged.";
  if (params.payment === "pending") return "Payment is still being verified. Refresh the portal shortly to see its status.";
  if (params.payment === "review") return "Paystack returned a payment that does not match the reserved fee. It has not been recorded; please contact the school.";
  if (params.payment === "invalid") return "The payment reference could not be verified.";
  return null;
}

export default async function EducationGuardianPortalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const hasOrganizationScope = params.org !== undefined;
  const requestedOrganizationId = isEducationOrganizationId(params.org)
    ? params.org.toLowerCase()
    : null;
  const requestedAssignmentPageValue = Number.parseInt(
    typeof params.assignmentPage === "string" ? params.assignmentPage : "1",
    10
  );
  const assignmentPage = Number.isSafeInteger(requestedAssignmentPageValue)
    ? Math.min(100_000, Math.max(1, requestedAssignmentPageValue))
    : 1;
  const supabase = await createClient();
  const user = getOptionalAuthUser(await supabase.auth.getUser(), "the family portal");

  let portal: EducationGuardianPortal = [];
  let guardianAttendanceHistory: EducationGuardianAttendanceRecord[] = [];
  let guardianFeePaymentHistory: EducationGuardianFeePayment[] = [];
  let guardianSchedule: EducationGuardianScheduleItem[] = [];
  let guardianContacts: Array<{
    org_id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
  }> = [];
  let assignments: EducationAssignment[] = [];
  let assignmentTargets: EducationAssignmentTarget[] = [];
  let assignmentSubmissions: EducationAssignmentSubmission[] = [];
  let assignmentTotalCount = 0;
  let assignmentSubmissionVersions: EducationAssignmentSubmissionVersion[] = [];
  let assignmentAttachments: EducationAssignmentAttachment[] = [];
  let announcements: EducationPortalCommunication[] = [];
  let notifications: Awaited<ReturnType<typeof educationNotificationsSchema.parse>> = [];
  let notificationPreferences: Array<{ org_id: string; notification_type: string; in_app_enabled: boolean }> = [];
  let outboundNotificationPreferences: Array<{
    org_id: string;
    organization_name: string;
    email_enabled: boolean;
    sms_enabled: boolean;
  }> = [];
  let guardianFeePaymentData: z.infer<typeof guardianFeePaymentDataSchema> = [];
  let guardianMeetings: Array<{
    meeting_id: string;
    branch_id: string;
    staff_id: string;
    student_id: string;
    guardian_id: string | null;
    starts_at: string;
    ends_at: string;
    status: "scheduled" | "completed" | "cancelled";
    purpose: string | null;
  }> = [];
  let guardianReportCards: Array<{
    student_id: string;
    term_id: string;
    term_name: string;
    starts_on: string;
    ends_on: string;
    teacher_comment: string | null;
    principal_comment: string | null;
    published_at: string | null;
  }> = [];
  const currencyConfigByOrganization = new Map<string, ReturnType<typeof getCurrencyConfigFromSettings>>();
  if (user) {
    const { data, error } = await supabase.rpc("education_get_guardian_portal");
    if (error) throw new Error(`Could not load the guardian portal: ${error.message}`);
    const parsedPortal = educationGuardianPortalSchema.safeParse(data);
    if (!parsedPortal.success) {
      console.error("Think Education guardian portal returned unexpected data:", parsedPortal.error.flatten());
      throw new Error("The guardian portal data could not be safely displayed.");
    }
    portal = hasOrganizationScope
      ? parsedPortal.data.filter((organization) => organization.organizationId === requestedOrganizationId)
      : parsedPortal.data;
    const guardianOrgIds = portal.map((organization) => organization.organizationId);
    const guardianStudentIds = portal.flatMap((organization) =>
      organization.children.map((student) => student.id)
    );
    if (guardianOrgIds.length && guardianStudentIds.length) {
      const now = new Date();
      const end = new Date(now);
      end.setDate(end.getDate() + 90);
      for (const organizationId of guardianOrgIds) {
        const { data: meetingRows, error: meetingError } = await supabase.rpc("education_get_ptm_list", {
          p_org_id: organizationId,
          p_branch_ids: [],
          p_from: now.toISOString(),
          p_to: end.toISOString(),
        });
        if (meetingError) throw new Error(`Could not load parent-teacher meetings: ${meetingError.message}`);
        guardianMeetings.push(...(meetingRows ?? []).filter((meeting) =>
          guardianStudentIds.includes(meeting.student_id)
        ));
      }
    }
    for (let offset = 0; offset < guardianStudentIds.length; offset += 100) {
      for (const studentId of guardianStudentIds.slice(offset, offset + 100)) {
        const organizationId = portal.find((organization) =>
          organization.children.some((student) => student.id === studentId)
        )?.organizationId;
        if (!organizationId) continue;
        const { data: reportCards, error: reportCardError } = await supabase.rpc(
          "education_get_published_guardian_report_cards",
          { p_org_id: organizationId, p_student_id: studentId }
        );
        if (reportCardError) throw new Error(`Could not load published report cards for linked children: ${reportCardError.message}`);
        guardianReportCards.push(...(reportCards ?? []).map((report) => ({
          student_id: studentId,
          ...report,
        })));
      }
    }
    const { data: contactRows, error: contactError } = await supabase.rpc(
      "education_get_guardian_contact_profiles"
    );
    if (contactError) throw new Error(`Could not load guardian contact details: ${contactError.message}`);
    const parsedContacts = educationGuardianContactProfilesSchema.safeParse(contactRows);
    if (!parsedContacts.success) {
      console.error("Think Education guardian contact details returned unexpected data:", parsedContacts.error.flatten());
      throw new Error("Guardian contact details could not be safely displayed.");
    }
    guardianContacts = parsedContacts.data.filter((contact) =>
      guardianOrgIds.includes(contact.org_id)
    );
    for (let offset = 0; offset < guardianStudentIds.length; offset += 100) {
      const { data: scheduleRows, error: scheduleError } = await supabase.rpc(
        "education_get_guardian_schedule",
        { p_student_ids: guardianStudentIds.slice(offset, offset + 100) }
      );
      if (scheduleError) throw new Error(`Could not load exam and event schedules: ${scheduleError.message}`);
      const parsedSchedule = educationGuardianScheduleSchema.safeParse(scheduleRows);
      if (!parsedSchedule.success) {
        console.error("Think Education guardian schedule returned unexpected data:", parsedSchedule.error.flatten());
        throw new Error("Exam and event schedules could not be safely displayed.");
      }
      guardianSchedule.push(...parsedSchedule.data);
    }
    for (let offset = 0; offset < guardianStudentIds.length; offset += 100) {
      const { data: attendanceRows, error: attendanceError } = await supabase.rpc(
        "education_get_guardian_attendance_history",
        {
          p_student_ids: guardianStudentIds.slice(offset, offset + 100),
          p_limit_per_student: 30,
        }
      );
      if (attendanceError) throw new Error(`Could not load attendance history for linked children: ${attendanceError.message}`);
      const parsedAttendance = educationGuardianAttendanceHistorySchema.safeParse(attendanceRows);
      if (!parsedAttendance.success) {
        console.error("Think Education guardian attendance history returned unexpected data:", parsedAttendance.error.flatten());
        throw new Error("Attendance history for linked children could not be safely displayed.");
      }
      guardianAttendanceHistory.push(...parsedAttendance.data);
    }
    for (let offset = 0; offset < guardianStudentIds.length; offset += 100) {
      const { data: paymentRows, error: paymentHistoryError } = await supabase.rpc(
        "education_get_guardian_fee_payment_receipts",
        {
          p_student_ids: guardianStudentIds.slice(offset, offset + 100),
          p_payment_id: null,
          p_limit_per_student: 20,
        }
      );
      if (paymentHistoryError) throw new Error(`Could not load payment history for linked children: ${paymentHistoryError.message}`);
      const parsedPaymentHistory = educationGuardianFeePaymentsSchema.safeParse(paymentRows);
      if (!parsedPaymentHistory.success) {
        console.error("Think Education guardian payment history returned unexpected data:", parsedPaymentHistory.error.flatten());
        throw new Error("Payment history for linked children could not be safely displayed.");
      }
      guardianFeePaymentHistory.push(...parsedPaymentHistory.data);
    }
    if (guardianOrgIds.length && guardianStudentIds.length) {
      const assignmentWindowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      const { data: assignmentRows, error: assignmentError, count: assignmentCount } = await supabase
        .from("education_assignments")
        .select("id, org_id, class_id, title, description, due_on, max_score, status, created_by, created_at, updated_at", { count: "exact" })
        .in("org_id", guardianOrgIds)
        .eq("status", "published")
        .gte("due_on", assignmentWindowStart)
        .order("due_on", { ascending: true })
        .order("id", { ascending: true })
        .range((assignmentPage - 1) * ASSIGNMENTS_PAGE_SIZE, assignmentPage * ASSIGNMENTS_PAGE_SIZE - 1);
      if (assignmentError) throw new Error(`Could not load assignments for linked children: ${assignmentError.message}`);
      assignmentTotalCount = assignmentCount ?? 0;
      const parsedAssignments = educationAssignmentsSchema.safeParse(assignmentRows ?? []);
      if (!parsedAssignments.success) {
        console.error("Think Education guardian assignments returned unexpected data:", parsedAssignments.error.flatten());
        throw new Error("Assignments for linked children could not be safely displayed.");
      }
      assignments = parsedAssignments.data;

      const assignmentIds = assignments.map((assignment) => assignment.id);
      if (assignmentIds.length) {
        const [targetResult, submissionResult, attachmentResult] = await Promise.all([
          supabase.from("education_assignment_targets")
            .select("org_id, assignment_id, student_id, created_at")
            .in("org_id", guardianOrgIds)
            .in("assignment_id", assignmentIds)
            .in("student_id", guardianStudentIds)
            .order("created_at", { ascending: false })
            .limit(200),
          supabase.from("education_assignment_submissions")
            .select("id, org_id, assignment_id, student_id, submission_text, submitted_at, score, feedback, graded_by, graded_at, revision_requested_at, revision_requested_by, revision_request_note, updated_at")
            .in("org_id", guardianOrgIds)
            .in("assignment_id", assignmentIds)
            .in("student_id", guardianStudentIds)
            .order("submitted_at", { ascending: false })
            .limit(200),
          supabase.from("education_assignment_attachments")
            .select("id, org_id, assignment_id, submission_id, kind, file_name, content_type, file_size, storage_path, created_at")
            .in("org_id", guardianOrgIds)
            .in("assignment_id", assignmentIds),
        ]);
        if (targetResult.error) throw new Error(`Could not load linked-child assignment recipients: ${targetResult.error.message}`);
        if (submissionResult.error) throw new Error(`Could not load linked-child submissions: ${submissionResult.error.message}`);
        if (attachmentResult.error) throw new Error(`Could not load linked-child assignment attachments: ${attachmentResult.error.message}`);
        const parsedTargets = educationAssignmentTargetsSchema.safeParse(targetResult.data ?? []);
        if (!parsedTargets.success) {
          console.error("Think Education guardian assignment targets returned unexpected data:", parsedTargets.error.flatten());
          throw new Error("Assignment recipient data for linked children could not be safely displayed.");
        }
        const parsedSubmissions = educationAssignmentSubmissionsSchema.safeParse(submissionResult.data ?? []);
        if (!parsedSubmissions.success) {
          console.error("Think Education guardian submissions returned unexpected data:", parsedSubmissions.error.flatten());
          throw new Error("Submissions for linked children could not be safely displayed.");
        }
        assignmentTargets = parsedTargets.data;
        assignmentSubmissions = parsedSubmissions.data;
        const parsedAttachments = educationAssignmentAttachmentsSchema.safeParse(attachmentResult.data ?? []);
        if (!parsedAttachments.success) {
          console.error("Think Education guardian assignment attachments returned unexpected data:", parsedAttachments.error.flatten());
          throw new Error("Assignment attachments for linked children could not be safely displayed.");
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
          if (result.error) throw new Error(`Could not load assignment revision history for linked children: ${result.error.message}`);
        }
        const parsedVersions = educationAssignmentSubmissionVersionsSchema.safeParse(
          versionResults.flatMap((result) => result.data ?? [])
        );
        if (!parsedVersions.success) {
          console.error("Think Education guardian assignment revision history returned unexpected data:", parsedVersions.error.flatten());
          throw new Error("Assignment revision history for linked children could not be safely displayed.");
        }
        assignmentSubmissionVersions = parsedVersions.data;
      }
    }

    if (portal.length) {
      const { data: currencyConfigRows, error: currencyConfigError } = await supabase.rpc(
        "education_get_guardian_currency_configs"
      );
      if (currencyConfigError) throw new Error(`Could not load guardian currency display settings: ${currencyConfigError.message}`);
      const parsedCurrencyConfigs = guardianCurrencyConfigsSchema.safeParse(currencyConfigRows);
      if (!parsedCurrencyConfigs.success) {
        console.error("Think Education guardian currency settings returned unexpected data:", parsedCurrencyConfigs.error.flatten());
        throw new Error("Guardian currency settings could not be safely displayed.");
      }
      for (const row of parsedCurrencyConfigs.data) {
        if (!guardianOrgIds.includes(row.organization_id)) continue;
        currencyConfigByOrganization.set(row.organization_id, getCurrencyConfigFromSettings({
          currency_code: row.currency_code,
          currency_symbol: row.currency_symbol,
          currency_name: row.currency_name,
          decimal_places: row.decimal_places,
          thousand_separator: row.thousand_separator,
          decimal_separator: row.decimal_separator,
          currency_position: row.currency_position,
        }));
      }
    }

    const { data: feePaymentRows, error: feePaymentError } = await supabase.rpc("education_guardian_paystack_portal_fees");
    if (feePaymentError) throw new Error(`Could not load guardian fee payment status: ${feePaymentError.message}`);
    const parsedFeePaymentRows = guardianFeePaymentDataSchema.safeParse(feePaymentRows);
    if (!parsedFeePaymentRows.success) {
      console.error("Think Education guardian fee payment status returned unexpected data:", parsedFeePaymentRows.error.flatten());
      throw new Error("Guardian fee payment status could not be safely displayed.");
    }
    guardianFeePaymentData = parsedFeePaymentRows.data.filter((fee) =>
      guardianOrgIds.includes(fee.organizationId)
    );

    const { data: communications, error: communicationsError } = await supabase.rpc("education_get_guardian_communications");
    if (communicationsError) throw new Error(`Could not load guardian announcements: ${communicationsError.message}`);
    const parsedCommunications = educationPortalCommunicationsSchema.safeParse(communications);
    if (!parsedCommunications.success) {
      console.error("Think Education guardian announcements returned unexpected data:", parsedCommunications.error.flatten());
      throw new Error("Guardian announcements could not be safely displayed.");
    }
    announcements = parsedCommunications.data.filter((announcement) =>
      !hasOrganizationScope || announcement.organizationId === requestedOrganizationId
    );

    if (guardianOrgIds.length) {
      const { data: notificationRows, error: notificationError } = await supabase.from("education_notifications")
        .select("id, org_id, branch_id, user_id, notification_type, title, message, announcement_id, assignment_id, assignment_event_key, delivery_status, read_at, created_at")
        .eq("user_id", user.id)
        .in("org_id", guardianOrgIds)
        .order("created_at", { ascending: false })
        .limit(30);
      if (notificationError) throw new Error(`Could not load guardian notifications: ${notificationError.message}`);
      const parsedNotifications = educationNotificationsSchema.safeParse(notificationRows ?? []);
      if (!parsedNotifications.success) {
        console.error("Think Education guardian notifications returned unexpected data:", parsedNotifications.error.flatten());
        throw new Error("Guardian notifications could not be safely displayed.");
      }
      notifications = parsedNotifications.data;
    }

    if (guardianOrgIds.length) {
      const { data: preferences, error: preferencesError } = await supabase.from("education_notification_preferences")
        .select("org_id, notification_type, in_app_enabled")
        .eq("user_id", user.id)
        .in("org_id", guardianOrgIds);
      if (preferencesError) throw new Error(`Could not load guardian notification preferences: ${preferencesError.message}`);
      notificationPreferences = preferences ?? [];
    }

    const { data: outboundPreferences, error: outboundPreferencesError } = await supabase
      .rpc("education_announcement_get_delivery_preferences");
    if (outboundPreferencesError) {
      throw new Error(`Could not load announcement delivery preferences: ${outboundPreferencesError.message}`);
    }
    outboundNotificationPreferences = (outboundPreferences ?? []).filter((preference) =>
      guardianOrgIds.includes(preference.org_id)
    );
  }
  const message = messageFor(params);
  const paymentMessage = paymentMessageFor(params);
  const linkedChildren = portal.flatMap((organization) =>
    organization.children.map((student) => ({
      id: student.id,
      fullName: [student.firstName, student.otherNames, student.lastName].filter(Boolean).join(" "),
      organizationName: organization.organizationName,
      campusName: student.campusName,
      announcementName: `${student.firstName} ${student.lastName}`,
    }))
  );
  const requestedStudentId = typeof params.student === "string" ? params.student : "";
  const selectedStudentId = linkedChildren.some((student) => student.id === requestedStudentId)
    ? requestedStudentId
    : "";
  const visiblePortal: EducationGuardianPortal = selectedStudentId
    ? portal.map((organization) => ({
        ...organization,
        children: organization.children.filter((student) => student.id === selectedStudentId),
      })).filter((organization) => organization.children.length > 0)
    : portal;
  const selectedChild = linkedChildren.find((student) => student.id === selectedStudentId);
  const assignmentTotalPages = Math.max(1, Math.ceil(assignmentTotalCount / ASSIGNMENTS_PAGE_SIZE));
  const assignmentPageHref = (page: number) => {
    const query = new URLSearchParams();
    if (requestedOrganizationId) query.set("org", requestedOrganizationId);
    if (selectedStudentId) query.set("student", selectedStudentId);
    query.set("assignmentPage", String(page));
    return `/education-portal?${query.toString()}#assignments`;
  };
  const visibleAnnouncements = selectedChild
    ? announcements.filter((announcement) =>
        announcement.organizationName === selectedChild.organizationName
        && announcement.campusName === selectedChild.campusName
        && announcement.studentName === selectedChild.announcementName
      )
    : announcements;
  const guardianReportCardHref = (organizationId: string, studentId: string) => {
    const query = new URLSearchParams({ org: organizationId, student: studentId });
    return `/education-portal/report-card?${query.toString()}`;
  };
  const formatGuardianMoney = (organizationId: string, amount: number) => {
    const config = currencyConfigByOrganization.get(organizationId);
    if (!config) throw new Error("Currency display settings are unavailable for a linked school.");
    return formatCurrencyAmount(amount, config);
  };

  return <EducationPortalShell
    role="parent"
    title="Parent Dashboard"
    activeItem="Dashboard"
    subtitle="A private view of students connected to your verified guardian profile."
    userEmail={user?.email}
    organizationId={requestedOrganizationId}
  >

      {message && <p role="status" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">{message}</p>}
      {params.profile === "saved" && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Your contact details were updated.</p>}
      {params.profile === "invalid" && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">Check your name, email, and phone number.</p>}
      {params.profile === "denied" && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">This guardian profile is no longer linked to your account.</p>}
      {params.profile === "error" && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">Your contact details could not be updated. Please try again.</p>}
      {paymentMessage && <p role={params.payment === "review" || params.payment === "invalid" ? "alert" : "status"} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">{paymentMessage}</p>}
      {params.preference === "saved" && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Notification preference saved.</p>}
      {params.preference === "denied" && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">This preference could not be changed for the selected school.</p>}
      {params.preference === "error" && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">The preference could not be saved. Please try again.</p>}
      {params.preference === "invalid" && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">The preference selection was invalid.</p>}

      {user && linkedChildren.length > 1 && <form method="get" action="/education-portal" className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {requestedOrganizationId && <input type="hidden" name="org" value={requestedOrganizationId} />}
        <label className="min-w-56 flex-1 text-sm font-medium text-slate-700">
          View child
          <select name="student" defaultValue={selectedStudentId} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal">
            <option value="">All linked children</option>
            {linkedChildren.map((student) => (
              <option key={student.id} value={student.id}>{student.fullName} · {student.organizationName}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
          View dashboard
        </button>
      </form>}

      {user && assignmentTotalPages > 1 && <nav aria-label="Assignment pages" className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
        {assignmentPage > 1
          ? <Link href={assignmentPageHref(assignmentPage - 1)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Previous assignments</Link>
          : <span aria-disabled="true" className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-400">Previous assignments</span>}
        <span className="text-sm text-slate-600">Assignments page {assignmentPage} of {assignmentTotalPages}</span>
        {assignmentPage < assignmentTotalPages
          ? <Link href={assignmentPageHref(assignmentPage + 1)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Next assignments</Link>
          : <span aria-disabled="true" className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-400">Next assignments</span>}
      </nav>}

      {notifications.length > 0 && <section className="space-y-3">
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
                ? getEducationPortalScopedPath("/education-portal", requestedOrganizationId)
                : "/education-portal"} />
              <button type="submit" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Mark read</button>
            </form>}
          </article>)}
        </div>
      </section>}

      {user && portal.length > 0 && <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold">In-app notification preferences</h2>
        <p className="mt-1 text-sm text-slate-500">Choose which school announcements and assignment updates appear in your notification inbox.</p>
        <ul className="mt-3 divide-y divide-slate-100">
          {visiblePortal.flatMap((organization) => ([
            ["announcement", "Announcements"],
            ["assignment", "Assignment updates"],
          ] as const).map(([type, label]) => {
            const enabled = notificationPreferences.find((preference) =>
              preference.org_id === organization.organizationId && preference.notification_type === type
            )?.in_app_enabled !== false;
            return <li key={`${organization.organizationId}-${type}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="text-sm font-medium">{organization.organizationName} · {label}: {enabled ? "Enabled" : "Paused"}</span>
              <form action={setEducationNotificationPreference}>
                <input type="hidden" name="org_id" value={organization.organizationId} />
                <input type="hidden" name="notification_type" value={type} />
                <input type="hidden" name="in_app_enabled" value={String(!enabled)} />
                <input type="hidden" name="return_to" value={requestedOrganizationId
                  ? getEducationPortalScopedPath("/education-portal", requestedOrganizationId)
                  : "/education-portal"} />
                <button type="submit" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">{enabled ? "Pause" : "Enable"}</button>
              </form>
            </li>;
          }))}
        </ul>
      </section>}

      {user && visiblePortal.map((organization) => {
        const contact = guardianContacts.find((profile) => profile.org_id === organization.organizationId);
        if (!contact) return null;
        return <section key={`${organization.organizationId}-contact`} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Guardian contact details · {organization.organizationName}</h2>
          <p className="mt-1 text-sm text-slate-500">Update the contact details attached to your verified guardian profile.</p>
          <form action={updateEducationGuardianContact} className="mt-4 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="org_id" value={organization.organizationId} />
            <label className="text-sm font-medium text-slate-700">First name
              <input name="first_name" required maxLength={100} defaultValue={contact.first_name} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>
            <label className="text-sm font-medium text-slate-700">Last name
              <input name="last_name" required maxLength={100} defaultValue={contact.last_name} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>
            <label className="text-sm font-medium text-slate-700">Email
              <input type="email" name="email" maxLength={254} defaultValue={contact.email ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>
            <label className="text-sm font-medium text-slate-700">Phone
              <input type="tel" name="phone" maxLength={40} defaultValue={contact.phone ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>
            <div className="sm:col-span-2">
              <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">Save contact details</button>
            </div>
          </form>
        </section>;
      })}

      {user && outboundNotificationPreferences.length > 0 && <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Announcement email and SMS preferences</h2>
        <p className="mt-1 text-sm text-slate-500">Each channel is optional and starts off. These settings are independent of your in-app notification inbox.</p>
        <ul className="mt-3 divide-y divide-slate-100">
          {outboundNotificationPreferences.filter((preference) =>
            visiblePortal.some((organization) => organization.organizationId === preference.org_id)
          ).map((preference) => <li key={preference.org_id} className="py-3">
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
                  ? getEducationPortalScopedPath("/education-portal", requestedOrganizationId)
                  : "/education-portal"} />
                <button type="submit" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  {enabled ? `Turn off ${label}` : `Opt in to ${label}`}
                </button>
              </form>)}
            </div>
          </li>)}
        </ul>
      </section>}

      {visibleAnnouncements.length > 0 && <section id="announcements" className="scroll-mt-6 space-y-3">
        <h2 className="text-xl font-semibold">School announcements</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {visibleAnnouncements.map((announcement) => <article key={`${announcement.id}-${announcement.studentName}`} className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-blue-700">{announcement.organizationName} · {announcement.campusName} · For {announcement.studentName}</p>
            <h3 className="mt-1 font-semibold text-slate-950">{announcement.title}</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{announcement.body}</p>
            <time className="mt-3 block text-xs text-slate-500" dateTime={announcement.publishedAt}>Published {new Date(announcement.publishedAt).toLocaleString()}</time>
          </article>)}
        </div>
      </section>}

      {!user ? <section className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <h2 className="text-xl font-semibold">Sign in to your family account</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Use the email address recorded by your school and the temporary password provided by the school.</p>
        <form action={signInToEducationGuardianPortal} className="mt-5 space-y-3">
          {requestedOrganizationId && <input type="hidden" name="org_id" value={requestedOrganizationId} />}
          <label className="block text-sm font-medium text-slate-700">
            Email address
            <input type="email" name="email" required maxLength={254} autoComplete="email" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="block text-sm font-medium text-slate-700">Password
            <input type="password" name="password" required maxLength={256} autoComplete="current-password" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <button type="submit" className="w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Sign in to family portal</button>
        </form>
      </section> : portal.length === 0 ? <section className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-[1.2fr_0.8fr] md:p-8">
        <div>
          <h2 className="text-xl font-semibold">Link your guardian profile</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Use the verified email address already recorded by the school. Your account can only be linked to active guardian profiles with a verified student relationship.
          </p>
          <form action={claimEducationGuardianPortalAccount} className="mt-5">
            {requestedOrganizationId && <input type="hidden" name="org_id" value={requestedOrganizationId} />}
            <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
              Find and link my guardian profile
            </button>
          </form>
        </div>
        <div className="rounded-xl bg-slate-50 p-5">
          <h3 className="font-semibold">Need an account?</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            If you do not have a password yet, ask your school administrator for a one-time temporary password.
          </p>
        </div>
      </section> : <div className="space-y-6">
        {visiblePortal.map((organization) => <section key={`${organization.organizationName}-${organization.guardianFirstName}-${organization.guardianLastName}`} className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-blue-700">{organization.organizationName}</p>
              <h2 className="text-xl font-semibold">Welcome, {organization.guardianFirstName}</h2>
            </div>
            <form action={claimEducationGuardianPortalAccount}>
              {requestedOrganizationId && <input type="hidden" name="org_id" value={requestedOrganizationId} />}
              <button type="submit" className="text-sm font-semibold text-blue-700 hover:text-blue-900">Refresh linked profiles</button>
            </form>
          </div>

          {organization.children.length === 0 ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            No verified student relationships are available for this guardian profile yet. Please contact the school if you believe this is incorrect.
          </div> : <div id="children" className="grid scroll-mt-6 gap-5 lg:grid-cols-2">
            {organization.children.map((student, studentIndex) => <article key={`${organization.organizationName}-${student.id}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">{student.firstName} {student.otherNames ? `${student.otherNames} ` : ""}{student.lastName}</h3>
                    <p className="mt-1 text-sm text-slate-500">{student.studentNumber} · {student.campusName}</p>
                    <p className="mt-1 text-sm text-slate-600">{student.className ?? "No active class"} · {student.status.replaceAll("_", " ")}</p>
                  </div>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><GraduationCap className="h-5 w-5" /></span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 p-5">
                <div id={studentIndex === 0 ? "attendance" : undefined} className="scroll-mt-6 rounded-xl bg-slate-50 p-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><CalendarDays className="h-4 w-4" /> Attendance, 30 days</div>
                  <p className="mt-2 text-lg font-semibold">{student.attendance.present} present</p>
                  <p className="text-xs text-slate-500">{student.attendance.absent} absent · {student.attendance.late} late · {student.attendance.excused} excused</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><Wallet className="h-4 w-4" /> Outstanding fees</div>
                  <p className="mt-2 text-lg font-semibold">{formatGuardianMoney(organization.organizationId, student.feeBalance)}</p>
                  <p className="text-xs text-slate-500">{student.fees.length} open charge{student.fees.length === 1 ? "" : "s"}</p>
                </div>
              </div>

              <div className="space-y-5 px-5 pb-5">
                <section aria-label={`Exam and event schedule for ${student.firstName}`}>
                  <h4 className="flex items-center gap-2 text-sm font-semibold"><CalendarDays className="h-4 w-4 text-blue-700" /> Exam and event schedule</h4>
                  {guardianSchedule.filter((item) => item.student_id === student.id).length ? (
                    <ul className="mt-2 space-y-2">
                      {guardianSchedule.filter((item) => item.student_id === student.id).map((item) => (
                        <li key={`${item.item_type}-${item.item_id}`} className="rounded-lg border border-slate-200 p-3 text-sm">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <span className="font-medium">{item.title}</span>
                            <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium capitalize text-blue-800">{item.item_type}</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-600">
                            {new Date(item.starts_at).toLocaleString()}
                            {item.ends_at ? ` – ${new Date(item.ends_at).toLocaleString()}` : ""}
                            {` · ${item.campus_name}`}
                          </p>
                          {item.detail && <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">{item.detail.slice(0, 500)}</p>}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-2 text-sm text-slate-500">No scheduled examinations or school events are available.</p>}
                </section>

                <section aria-label={`Attendance history for ${student.firstName}`}>
                  <h4 className="text-sm font-semibold">Attendance history · last 90 days</h4>
                  {guardianAttendanceHistory.filter((record) => record.student_id === student.id).length ? (
                    <ul className="mt-2 divide-y divide-slate-100">
                      {guardianAttendanceHistory.filter((record) => record.student_id === student.id).map((record) => (
                        <li key={record.record_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                          <span>
                            <time dateTime={record.attendance_date} className="font-medium">
                              {new Date(`${record.attendance_date}T00:00:00`).toLocaleDateString()}
                            </time>
                            <span className="ml-2 text-slate-500">{record.record_type} · {record.detail}</span>
                          </span>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                            record.status === "present" ? "bg-emerald-50 text-emerald-800"
                              : record.status === "late" ? "bg-amber-50 text-amber-800"
                                : record.status === "absent" ? "bg-red-50 text-red-800"
                                  : "bg-slate-100 text-slate-700"
                          }`}>
                            {record.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-2 text-sm text-slate-500">No attendance records are available for this period.</p>}
                </section>

                <section className="scroll-mt-6">
                  <h4 className="flex items-center gap-2 text-sm font-semibold"><CalendarDays className="h-4 w-4 text-blue-700" /> Weekly timetable</h4>
                  {student.timetable.length ? <ul className="mt-2 divide-y divide-slate-100">
                    {student.timetable.map((entry, index) => <li key={`${entry.weekday}-${entry.startsAt}-${entry.subject}-${index}`} className="flex justify-between gap-3 py-2 text-sm">
                      <span className="font-medium">{WEEKDAYS[entry.weekday - 1]} · {entry.subject}</span>
                      <span className="shrink-0 text-slate-500">{entry.startsAt.slice(0, 5)}–{entry.endsAt.slice(0, 5)}{entry.room ? ` · ${entry.room}` : ""}</span>
                    </li>)}
                  </ul> : <p className="mt-2 text-sm text-slate-500">No published weekly timetable is available.</p>}
                </section>

                <section className="scroll-mt-6">
                  <h4 className="flex items-center gap-2 text-sm font-semibold"><CalendarDays className="h-4 w-4 text-blue-700" /> Parent-teacher meetings</h4>
                  {guardianMeetings.filter((meeting) => meeting.student_id === student.id).length ? (
                    <ul className="mt-2 space-y-2">
                      {guardianMeetings.filter((meeting) => meeting.student_id === student.id).map((meeting) => (
                        <li key={meeting.meeting_id} className="rounded-lg border border-slate-200 p-3 text-sm">
                          <p className="font-medium">{new Date(meeting.starts_at).toLocaleString()} – {new Date(meeting.ends_at).toLocaleTimeString()}</p>
                          {meeting.purpose && <p className="mt-1 text-slate-600">{meeting.purpose}</p>}
                          {meeting.status === "scheduled" && meeting.guardian_id === null && (
                            <form action={bookEducationPTM} className="mt-2">
                              <input type="hidden" name="org_id" value={organization.organizationId} />
                              <input type="hidden" name="meeting_id" value={meeting.meeting_id} />
                              <label className="block text-xs font-medium text-slate-600">
                                Purpose / note
                                <textarea name="purpose" maxLength={500} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-normal" />
                              </label>
                              <button type="submit" className="mt-2 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800">Book this slot</button>
                            </form>
                          )}
                          {meeting.status === "scheduled" && meeting.guardian_id !== null && <p className="mt-2 text-xs font-semibold text-emerald-700">Reserved for a guardian</p>}
                          {meeting.status === "cancelled" && <p className="mt-2 text-xs font-semibold text-slate-500">Cancelled</p>}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-2 text-sm text-slate-500">No upcoming meetings are available.</p>}
                </section>

                <section id={studentIndex === 0 ? "performance" : undefined} className="scroll-mt-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="flex items-center gap-2 text-sm font-semibold"><BookOpen className="h-4 w-4 text-blue-700" /> Published results</h4>
                    {student.results.length > 0 && <Link
                      href={guardianReportCardHref(organization.organizationId, student.id)}
                      className="text-xs font-semibold text-blue-700 hover:text-blue-900"
                    >View / print report card</Link>}
                  </div>
                  {student.results.length ? <ul className="mt-2 divide-y divide-slate-100">
                    {student.results.map((result, index) => <li key={`${result.examination}-${result.subject}-${index}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span><span className="font-medium">{result.subject}</span><span className="block text-xs text-slate-500">{result.examination}</span></span>
                      <span className="shrink-0 text-right font-medium">{result.score}/{result.maximumScore}{result.grade ? ` · ${result.grade}` : ""}</span>
                    </li>)}
                  </ul> : <p className="mt-2 text-sm text-slate-500">No results have been published.</p>}
                  {guardianReportCards.filter((report) => report.student_id === student.id).length > 0 && <div className="mt-4 space-y-3">
                    {guardianReportCards.filter((report) => report.student_id === student.id).map((report) => <article key={report.term_id} className="rounded-xl border border-blue-100 bg-blue-50/40 p-3">
                      <h5 className="font-semibold text-blue-950">{report.term_name}</h5>
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
                </section>

                <section id={studentIndex === 0 ? "fees" : undefined} className="scroll-mt-6">
                  <h4 className="flex items-center gap-2 text-sm font-semibold"><Wallet className="h-4 w-4 text-blue-700" /> Fee charges</h4>
                  {guardianFeePaymentData.some((fee) => fee.organizationId === organization.organizationId && fee.studentId === student.id) ? <ul className="mt-2 divide-y divide-slate-100">
                    {guardianFeePaymentData.filter((fee) => fee.organizationId === organization.organizationId && fee.studentId === student.id).map((fee) => <li key={fee.chargeId} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                      <span><span className="font-medium">{fee.description}</span><span className="block text-xs text-slate-500">{fee.dueOn ? `Due ${fee.dueOn}` : "No due date"}</span>
                        {fee.paymentStatus && <span className="mt-1 block text-xs font-medium capitalize text-slate-600">Payment {fee.paymentStatus}</span>}
                      </span>
                      <span className="shrink-0 text-right">{formatGuardianMoney(organization.organizationId, fee.balance)}<span className="block text-xs text-slate-500">of {formatGuardianMoney(organization.organizationId, fee.amount)}</span>
                        {fee.balance > 0 && user.email_confirmed_at && <form action="/api/education/guardian-fees/checkout" method="post" className="mt-2">
                          <input type="hidden" name="charge_id" value={fee.chargeId} />
                          <button type="submit" className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800">Pay securely</button>
                        </form>}
                      </span>
                    </li>)}
                  </ul> : <p className="mt-2 text-sm text-slate-500">No open fee charges.</p>}
                </section>

                <section aria-label={`Payment history for ${student.firstName}`}>
                  <h4 className="text-sm font-semibold">Payment history · past 12 months</h4>
                  {guardianFeePaymentHistory.filter((payment) => payment.student_id === student.id).length ? (
                    <ul className="mt-2 divide-y divide-slate-100">
                      {guardianFeePaymentHistory.filter((payment) => payment.student_id === student.id).map((payment) => (
                        <li key={payment.payment_id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                          <span>
                            <span className="font-medium">{payment.fee_description}</span>
                            <span className="block text-xs capitalize text-slate-500">
                              {new Date(payment.paid_at).toLocaleDateString()} · {payment.payment_method.replaceAll("_", " ")}
                            </span>
                            {payment.reference && <span className="block text-xs text-slate-500">Reference: {payment.reference}</span>}
                          </span>
                          <span className="text-right font-medium">
                            {formatGuardianMoney(payment.org_id, payment.amount)}
                            <a
                              href={`/education-portal/fee-receipt?paymentId=${encodeURIComponent(payment.payment_id)}${requestedOrganizationId ? `&org=${encodeURIComponent(requestedOrganizationId)}` : ""}`}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 block text-xs font-semibold text-blue-700 hover:text-blue-900"
                            >
                              View receipt
                            </a>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-2 text-sm text-slate-500">No recorded payments in the past 12 months.</p>}
                </section>

                <section id={studentIndex === 0 ? "assignments" : undefined} className="scroll-mt-6">
                  <h4 className="flex items-center gap-2 text-sm font-semibold"><BookOpen className="h-4 w-4 text-blue-700" /> Homework & assignments</h4>
                  {assignments.filter((assignment) => assignmentTargets.some((target) =>
                    target.org_id === organization.organizationId
                    && target.assignment_id === assignment.id
                    && target.student_id === student.id
                  )).length ? <ul className="mt-2 space-y-2">
                    {assignments.filter((assignment) => assignmentTargets.some((target) =>
                      target.org_id === organization.organizationId
                      && target.assignment_id === assignment.id
                      && target.student_id === student.id
                    )).map((assignment) => {
                      const submission = assignmentSubmissions.find((item) =>
                        item.org_id === organization.organizationId
                        && item.assignment_id === assignment.id
                        && item.student_id === student.id
                      );
                      const isOverdue = !submission && assignment.due_on < new Date().toISOString().slice(0, 10);
                      return <li key={assignment.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <span className="font-medium">{assignment.title}</span>
                          <span className="text-xs text-slate-500">Due {new Date(`${assignment.due_on}T00:00:00`).toLocaleDateString()}</span>
                        </div>
                        {assignment.description && <p className="mt-1 whitespace-pre-wrap text-slate-600">{assignment.description}</p>}
                        <EducationAssignmentAttachmentLinks
                          attachments={assignmentAttachments.filter((attachment) =>
                            attachment.org_id === organization.organizationId
                            && attachment.assignment_id === assignment.id
                            && attachment.kind === "assignment"
                          )}
                          label="Teacher resources"
                        />
                        {submission && <EducationAssignmentAttachmentLinks
                          attachments={assignmentAttachments.filter((attachment) =>
                            attachment.submission_id === submission.id
                          )}
                          label={`${student.firstName}'s submitted files`}
                        />}
                        {submission?.graded_at ? (
                          <div className="mt-2 rounded-lg bg-emerald-50 p-2 text-emerald-900">
                            <p className="font-medium">Graded: {submission.score}/{assignment.max_score}</p>
                            {submission.feedback && <p className="mt-1 whitespace-pre-wrap text-emerald-800">{submission.feedback}</p>}
                          </div>
                        ) : (
                          <p className={`mt-2 text-xs font-medium ${isOverdue ? "text-red-700" : "text-slate-500"}`}>
                            {submission ? "Submitted" : isOverdue ? "Overdue · Not submitted" : "Not submitted"}
                          </p>
                        )}
                        {submission?.revision_requested_at && (
                          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                            Teacher requested a revision: {submission.revision_request_note}
                          </p>
                        )}
                        {assignmentSubmissionVersions.some((version) => version.submission_id === submission?.id) && (
                          <details className="mt-2 rounded-lg bg-slate-50 px-2 py-1.5">
                            <summary className="cursor-pointer text-xs font-medium text-slate-700">
                              Previous attempts ({assignmentSubmissionVersions.filter((version) => version.submission_id === submission?.id).length})
                            </summary>
                            <ol className="mt-2 space-y-2">
                              {assignmentSubmissionVersions.filter((version) => version.submission_id === submission?.id).map((version) => (
                                <li key={`${version.submission_id}-${version.version_number}`} className="border-t border-slate-200 pt-2 text-xs text-slate-600">
                                  <p className="font-medium">Attempt {version.version_number} · {new Date(version.submitted_at).toLocaleString()}</p>
                                  <p className="mt-1 whitespace-pre-wrap">{version.submission_text}</p>
                                </li>
                              ))}
                            </ol>
                          </details>
                        )}
                      </li>;
                    })}
                  </ul> : <p className="mt-2 text-sm text-slate-500">No published assignments for this student.</p>}
                </section>
                {user && <GuardianAiAssistant
                  studentId={student.id}
                  childName={[student.firstName, student.otherNames, student.lastName].filter(Boolean).join(" ")}
                />}
              </div>
            </article>)}
          </div>}
        </section>)}
      </div>}

      <footer className="text-center text-xs text-slate-500">
        Student details are shown only for verified relationships linked to this signed-in account.
      </footer>
  </EducationPortalShell>;
}
