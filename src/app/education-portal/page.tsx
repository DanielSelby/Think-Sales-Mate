import Link from "next/link";
import { BookOpen, CalendarDays, GraduationCap, Wallet } from "lucide-react";
import { educationPortalCommunicationsSchema, type EducationPortalCommunication } from "@/lib/education/communications";
import { markEducationNotificationRead } from "@/app/education-notifications/actions";
import { educationGuardianPortalSchema, type EducationGuardianPortal } from "@/lib/education/guardian-portal";
import { educationNotificationsSchema } from "@/lib/education/notifications";
import { setEducationNotificationPreference } from "@/app/education-notifications/actions";
import { createClient } from "@/lib/supabase/server";
import {
  claimEducationGuardianPortalAccount,
  requestEducationGuardianPortalSignIn,
} from "./actions";

export const dynamic = "force-dynamic";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function messageFor(params: Record<string, string | string[] | undefined>) {
  if (params.emailSent === "1") return "If this email can sign in, a secure link has been sent. Check your inbox and spam folder.";
  if (params.signin === "invalid") return "Enter a valid email address.";
  if (params.signin === "configuration") return "Sign-in links are temporarily unavailable. Please contact the school.";
  if (params.signin === "error") return "The sign-in email could not be sent. Please wait a moment and try again.";
  if (params.claim === "linked") return "Your verified guardian profile is now linked to this account.";
  if (params.claim === "verify-email") return "Verify this account’s email address before linking a guardian profile.";
  if (params.claim === "already-linked") return "A guardian profile is already linked to this account for one of the schools.";
  if (params.claim === "not-found") return "No unlinked guardian profile with a verified student relationship matches this verified account email.";
  if (params.claim === "error") return "The guardian profile could not be linked. Please try again or contact the school.";
  return null;
}

export default async function EducationGuardianPortalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(`Could not verify the signed-in account: ${userError.message}`);

  let portal: EducationGuardianPortal = [];
  let announcements: EducationPortalCommunication[] = [];
  let notifications: Awaited<ReturnType<typeof educationNotificationsSchema.parse>> = [];
  let notificationPreferences: Array<{ org_id: string; notification_type: string; in_app_enabled: boolean }> = [];
  if (user) {
    const { data, error } = await supabase.rpc("education_get_guardian_portal");
    if (error) throw new Error(`Could not load the guardian portal: ${error.message}`);
    const parsedPortal = educationGuardianPortalSchema.safeParse(data);
    if (!parsedPortal.success) {
      console.error("Think Education guardian portal returned unexpected data:", parsedPortal.error.flatten());
      throw new Error("The guardian portal data could not be safely displayed.");
    }
    portal = parsedPortal.data;

    const { data: communications, error: communicationsError } = await supabase.rpc("education_get_guardian_communications");
    if (communicationsError) throw new Error(`Could not load guardian announcements: ${communicationsError.message}`);
    const parsedCommunications = educationPortalCommunicationsSchema.safeParse(communications);
    if (!parsedCommunications.success) {
      console.error("Think Education guardian announcements returned unexpected data:", parsedCommunications.error.flatten());
      throw new Error("Guardian announcements could not be safely displayed.");
    }
    announcements = parsedCommunications.data;

    const { data: notificationRows, error: notificationError } = await supabase.from("education_notifications")
      .select("id, org_id, branch_id, user_id, notification_type, title, message, announcement_id, delivery_status, read_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    if (notificationError) throw new Error(`Could not load guardian notifications: ${notificationError.message}`);
    const parsedNotifications = educationNotificationsSchema.safeParse(notificationRows ?? []);
    if (!parsedNotifications.success) {
      console.error("Think Education guardian notifications returned unexpected data:", parsedNotifications.error.flatten());
      throw new Error("Guardian notifications could not be safely displayed.");
    }
    notifications = parsedNotifications.data;

    const guardianOrgIds = portal.map((organization) => organization.organizationId);
    if (guardianOrgIds.length) {
      const { data: preferences, error: preferencesError } = await supabase.from("education_notification_preferences")
        .select("org_id, notification_type, in_app_enabled")
        .eq("user_id", user.id)
        .in("org_id", guardianOrgIds);
      if (preferencesError) throw new Error(`Could not load guardian notification preferences: ${preferencesError.message}`);
      notificationPreferences = preferences ?? [];
    }
  }
  const params = await searchParams;
  const message = messageFor(params);

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="rounded-2xl bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-800 p-6 text-white shadow-lg sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-200">Think Education</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Family Portal</h1>
        <p className="mt-2 max-w-2xl text-sm text-blue-100">
          A private view of students connected to your verified guardian profile.
        </p>
        {user && <p className="mt-4 text-sm text-blue-100">Signed in as {user.email ?? "your account"}</p>}
      </header>

      {message && <p role="status" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">{message}</p>}
      {params.preference === "saved" && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Notification preference saved.</p>}
      {params.preference === "denied" && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">This preference could not be changed for the selected school.</p>}

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
              <input type="hidden" name="return_to" value="/education-portal" />
              <button type="submit" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Mark read</button>
            </form>}
          </article>)}
        </div>
      </section>}

      {user && portal.length > 0 && <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Announcement preferences</h2>
        <p className="mt-1 text-sm text-slate-500">Choose whether published school announcements appear in your in-app notification inbox.</p>
        <ul className="mt-3 divide-y divide-slate-100">
          {portal.map((organization) => {
            const enabled = notificationPreferences.find((preference) =>
              preference.org_id === organization.organizationId && preference.notification_type === "announcement"
            )?.in_app_enabled !== false;
            return <li key={organization.organizationId} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="text-sm font-medium">{organization.organizationName} · {enabled ? "Enabled" : "Paused"}</span>
              <form action={setEducationNotificationPreference}>
                <input type="hidden" name="org_id" value={organization.organizationId} />
                <input type="hidden" name="notification_type" value="announcement" />
                <input type="hidden" name="in_app_enabled" value={String(!enabled)} />
                <input type="hidden" name="return_to" value="/education-portal" />
                <button type="submit" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">{enabled ? "Pause" : "Enable"}</button>
              </form>
            </li>;
          })}
        </ul>
      </section>}

      {announcements.length > 0 && <section className="space-y-3">
        <h2 className="text-xl font-semibold">School announcements</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {announcements.map((announcement) => <article key={`${announcement.id}-${announcement.studentName}`} className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-blue-700">{announcement.organizationName} · {announcement.campusName} · For {announcement.studentName}</p>
            <h3 className="mt-1 font-semibold text-slate-950">{announcement.title}</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{announcement.body}</p>
            <time className="mt-3 block text-xs text-slate-500" dateTime={announcement.publishedAt}>Published {new Date(announcement.publishedAt).toLocaleString()}</time>
          </article>)}
        </div>
      </section>}

      {!user ? <section className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <h2 className="text-xl font-semibold">Sign in to your family account</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Request a secure email link. After signing in, link the verified guardian profile recorded by your school.</p>
        <form action={requestEducationGuardianPortalSignIn} className="mt-5 space-y-3">
          <label className="block text-sm font-medium text-slate-700">
            Email address
            <input type="email" name="email" required maxLength={254} autoComplete="email" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <button type="submit" className="w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Email me a secure sign-in link</button>
        </form>
      </section> : portal.length === 0 ? <section className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-[1.2fr_0.8fr] md:p-8">
        <div>
          <h2 className="text-xl font-semibold">Link your guardian profile</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Use the verified email address already recorded by the school. Your account can only be linked to active guardian profiles with a verified student relationship.
          </p>
          <form action={claimEducationGuardianPortalAccount} className="mt-5">
            <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
              Find and link my guardian profile
            </button>
          </form>
        </div>
        <div className="rounded-xl bg-slate-50 p-5">
          <h3 className="font-semibold">Need an account?</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Request a secure sign-in link using the same email address the school has on file.
          </p>
          <form action={requestEducationGuardianPortalSignIn} className="mt-4 space-y-3">
            <label className="block text-sm font-medium text-slate-700">
              Email address
              <input
                type="email"
                name="email"
                required
                maxLength={254}
                autoComplete="email"
                defaultValue={user.email ?? ""}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal"
              />
            </label>
            <button type="submit" className="w-full rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-sm font-semibold text-blue-800 hover:bg-blue-50">
              Email me a secure sign-in link
            </button>
          </form>
        </div>
      </section> : <div className="space-y-6">
        {portal.map((organization) => <section key={`${organization.organizationName}-${organization.guardianFirstName}-${organization.guardianLastName}`} className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-blue-700">{organization.organizationName}</p>
              <h2 className="text-xl font-semibold">Welcome, {organization.guardianFirstName}</h2>
            </div>
            <form action={claimEducationGuardianPortalAccount}>
              <button type="submit" className="text-sm font-semibold text-blue-700 hover:text-blue-900">Refresh linked profiles</button>
            </form>
          </div>

          {organization.children.length === 0 ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            No verified student relationships are available for this guardian profile yet. Please contact the school if you believe this is incorrect.
          </div> : <div className="grid gap-5 lg:grid-cols-2">
            {organization.children.map((student) => <article key={`${organization.organizationName}-${student.id}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><CalendarDays className="h-4 w-4" /> Attendance, 30 days</div>
                  <p className="mt-2 text-lg font-semibold">{student.attendance.present} present</p>
                  <p className="text-xs text-slate-500">{student.attendance.absent} absent · {student.attendance.late} late · {student.attendance.excused} excused</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><Wallet className="h-4 w-4" /> Outstanding fees</div>
                  <p className="mt-2 text-lg font-semibold">{organization.currencyCode} {student.feeBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  <p className="text-xs text-slate-500">{student.fees.length} open charge{student.fees.length === 1 ? "" : "s"}</p>
                </div>
              </div>

              <div className="space-y-5 px-5 pb-5">
                <section>
                  <h4 className="flex items-center gap-2 text-sm font-semibold"><CalendarDays className="h-4 w-4 text-blue-700" /> Weekly timetable</h4>
                  {student.timetable.length ? <ul className="mt-2 divide-y divide-slate-100">
                    {student.timetable.map((entry, index) => <li key={`${entry.weekday}-${entry.startsAt}-${entry.subject}-${index}`} className="flex justify-between gap-3 py-2 text-sm">
                      <span className="font-medium">{WEEKDAYS[entry.weekday - 1]} · {entry.subject}</span>
                      <span className="shrink-0 text-slate-500">{entry.startsAt.slice(0, 5)}–{entry.endsAt.slice(0, 5)}{entry.room ? ` · ${entry.room}` : ""}</span>
                    </li>)}
                  </ul> : <p className="mt-2 text-sm text-slate-500">No published weekly timetable is available.</p>}
                </section>

                <section>
                  <h4 className="flex items-center gap-2 text-sm font-semibold"><BookOpen className="h-4 w-4 text-blue-700" /> Published results</h4>
                  {student.results.length ? <ul className="mt-2 divide-y divide-slate-100">
                    {student.results.map((result, index) => <li key={`${result.examination}-${result.subject}-${index}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span><span className="font-medium">{result.subject}</span><span className="block text-xs text-slate-500">{result.examination}</span></span>
                      <span className="shrink-0 text-right font-medium">{result.score}/{result.maximumScore}{result.grade ? ` · ${result.grade}` : ""}</span>
                    </li>)}
                  </ul> : <p className="mt-2 text-sm text-slate-500">No results have been published.</p>}
                </section>

                <section>
                  <h4 className="flex items-center gap-2 text-sm font-semibold"><Wallet className="h-4 w-4 text-blue-700" /> Fee charges</h4>
                  {student.fees.length ? <ul className="mt-2 divide-y divide-slate-100">
                    {student.fees.map((fee, index) => <li key={`${fee.description}-${fee.dueOn ?? "no-date"}-${index}`} className="flex justify-between gap-3 py-2 text-sm">
                      <span><span className="font-medium">{fee.description}</span><span className="block text-xs text-slate-500">{fee.dueOn ? `Due ${fee.dueOn}` : "No due date"}</span></span>
                      <span className="shrink-0 text-right">{organization.currencyCode} {fee.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<span className="block text-xs text-slate-500">of {organization.currencyCode} {fee.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
                    </li>)}
                  </ul> : <p className="mt-2 text-sm text-slate-500">No open fee charges.</p>}
                </section>
              </div>
            </article>)}
          </div>}
        </section>)}
      </div>}

      <footer className="text-center text-xs text-slate-500">
        Student details are shown only for verified relationships linked to this signed-in account.
      </footer>
      <p className="text-center text-sm"><Link href="/student-education-portal" className="font-medium text-blue-700 hover:text-blue-900">Student Portal</Link></p>
    </div>
  </main>;
}
