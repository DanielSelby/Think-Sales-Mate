import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Bell, Check, Clock3 } from "lucide-react";
import { markEducationNotificationRead, setEducationNotificationPreference } from "@/app/education-notifications/actions";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { EDUCATION_NOTIFICATION_TYPES, educationNotificationsSchema } from "@/lib/education/notifications";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";

export default async function EducationNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_notifications", "notifications", "inbox", "view")) {
    redirect("/dashboard?accessDenied=think-education.notifications");
  }

  const params = await searchParams;
  const requestedBranch = typeof params.branch === "string" ? params.branch : "";
  const requestedStatus = typeof params.status === "string" ? params.status : "";
  const requestedType = typeof params.type === "string" ? params.type : "";
  const requestedSearch = typeof params.search === "string" ? params.search.trim().slice(0, 80) : "";
  const [canEditPreferences, { campuses }] = await Promise.all([
    canTabPermission("education_notifications", "notifications", "preferences", "edit"),
    getAccessibleEducationCampuses(context.orgId, context.userId),
  ]);
  const campusIds = campuses.map((campus) => campus.id);
  const selectedBranch = campusIds.includes(requestedBranch) ? requestedBranch : "";
  const selectedType = EDUCATION_NOTIFICATION_TYPES.some(([type]) => type === requestedType) ? requestedType : "";
  const selectedStatus = ["delivered", "read"].includes(requestedStatus) ? requestedStatus : "";
  const branchIds = selectedBranch ? [selectedBranch] : campusIds;
  const supabase = await createClient();
  const [notificationsResult, preferencesResult] = await Promise.all([
    branchIds.length
      ? supabase.from("education_notifications")
        .select("id, org_id, branch_id, user_id, notification_type, title, message, announcement_id, delivery_status, read_at, created_at")
        .eq("org_id", context.orgId)
        .eq("user_id", context.userId)
        .in("branch_id", branchIds)
        .order("created_at", { ascending: false })
        .limit(200)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("education_notification_preferences")
      .select("notification_type, in_app_enabled")
      .eq("org_id", context.orgId)
      .eq("user_id", context.userId),
  ]);
  if (notificationsResult.error) throw new Error(`Could not load Think Education notifications: ${notificationsResult.error.message}`);
  if (preferencesResult.error) throw new Error(`Could not load notification preferences: ${preferencesResult.error.message}`);
  const parsedNotifications = educationNotificationsSchema.safeParse(notificationsResult.data ?? []);
  if (!parsedNotifications.success) {
    console.error("Think Education notifications returned unexpected data:", parsedNotifications.error.flatten());
    throw new Error("The notification centre data could not be safely displayed.");
  }
  const notifications = parsedNotifications.data;
  const preferences = new Map((preferencesResult.data ?? []).map((preference) => [
    preference.notification_type,
    preference.in_app_enabled,
  ]));
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const filteredNotifications = notifications.filter((notification) => {
    if (selectedBranch && notification.branch_id !== selectedBranch) return false;
    if (selectedType && notification.notification_type !== selectedType) return false;
    if (selectedStatus && notification.delivery_status !== selectedStatus) return false;
    if (!requestedSearch) return true;
    const haystack = `${notification.title} ${notification.message} ${campusNameById.get(notification.branch_id) ?? ""}`.toLowerCase();
    return haystack.includes(requestedSearch.toLowerCase());
  });
  const csvRows = [
    ["Title", "Campus", "Type", "Status", "Created", "Message"],
    ...filteredNotifications.map((notification) => [
      notification.title,
      campusNameById.get(notification.branch_id) ?? notification.branch_id,
      EDUCATION_NOTIFICATION_TYPES.find(([type]) => type === notification.notification_type)?.[1] ?? notification.notification_type,
      notification.delivery_status,
      new Date(notification.created_at).toISOString(),
      notification.message,
    ]),
  ];
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(csvRows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"))}`;
  const alertMessage = params.notification === "denied"
    ? "You are not authorized to update that notification."
    : params.notification === "not-found"
      ? "The notification is no longer available."
      : params.notification === "error"
        ? "The notification could not be updated. Please try again."
        : params.preference === "saved"
          ? "Notification preference saved."
          : params.preference === "denied"
            ? "You are not linked to this Think Education organization."
            : params.preference === "error"
              ? "The preference could not be saved."
              : params.preference === "invalid"
                ? "The notification preference was invalid."
                : null;

  return <main className="mx-auto max-w-[1200px] space-y-5 p-4 md:p-6">
    <header>
      <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-950"><Bell className="h-6 w-6 text-blue-700" /> Notifications</h1>
      <p className="mt-1 text-sm text-slate-600">Recent in-app alerts for your assigned Think Education campuses.</p>
    </header>

    {alertMessage && <p role="status" className={`rounded-lg border px-4 py-3 text-sm ${params.preference === "saved" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{alertMessage}</p>}

    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <form method="get" action={getProductAppPath("think-education", "/notifications")} className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-[minmax(220px,1fr)_220px_220px_200px_auto]">
        <label className="relative block">
          <span className="sr-only">Search notifications</span>
          <Bell className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input name="search" defaultValue={requestedSearch} placeholder="Search title or message" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        </label>
        <label className="text-sm font-medium text-slate-700">Campus
          <select name="branch" defaultValue={selectedBranch} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All campuses</option>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Type
          <select name="type" defaultValue={selectedType} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All types</option>
            {EDUCATION_NOTIFICATION_TYPES.map(([type, label]) => <option key={type} value={type}>{label}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Status
          <select name="status" defaultValue={selectedStatus} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All statuses</option>
            <option value="delivered">Delivered</option>
            <option value="read">Read</option>
          </select>
        </label>
        <button type="submit" className="self-end rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">Apply filters</button>
      </form>
      <div className="flex items-center justify-between border-b border-slate-100 p-4">
        <div>
          <h2 className="font-semibold text-slate-950">Your inbox</h2>
          <p className="mt-1 text-sm text-slate-500">{filteredNotifications.filter((notification) => notification.delivery_status === "delivered").length} unread · {filteredNotifications.length.toLocaleString()} matching notifications</p>
        </div>
        {filteredNotifications.length > 0 && <a href={csvHref} download={`education-notifications-${new Date().toISOString().slice(0, 10)}.csv`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Export CSV</a>}
      </div>
      {!filteredNotifications.length ? <div className="p-8 text-center">
        <Bell className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-2 font-medium text-slate-800">No matching notifications</p>
        <p className="mt-1 text-sm text-slate-500">Try a different campus, status, or search term.</p>
      </div> : <ul className="divide-y divide-slate-100">
        {filteredNotifications.map((notification) => <li key={notification.id} className="flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5">
          <div className="flex min-w-0 gap-3">
            <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${notification.delivery_status === "delivered" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"}`}>
              {notification.delivery_status === "delivered" ? <Bell className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            </span>
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-950">{notification.title}</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{notification.message}</p>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                <span>{campusNameById.get(notification.branch_id) ?? "Campus"}</span>
                <span aria-hidden="true">·</span>
                <span>{new Date(notification.created_at).toLocaleString()}</span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1">{notification.delivery_status === "read" ? <Check className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}{notification.delivery_status === "read" ? "Read" : "Delivered"}</span>
              </p>
            </div>
          </div>
          {notification.delivery_status === "delivered" && <form action={markEducationNotificationRead}>
            <input type="hidden" name="notification_id" value={notification.id} />
            <input type="hidden" name="return_to" value="/education/notifications" />
            <button type="submit" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Mark read</button>
          </form>}
        </li>)}
      </ul>}
    </section>

    {canEditPreferences && <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-950">In-app notification preferences</h2>
      <p className="mt-1 text-sm text-slate-500">Choose which notification types are placed in your education inbox. Email and SMS delivery are not enabled here.</p>
      <ul className="mt-3 divide-y divide-slate-100">
        {EDUCATION_NOTIFICATION_TYPES.map(([type, label]) => {
          const enabled = preferences.get(type) !== false;
          return <li key={type} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="text-sm font-medium text-slate-800">{label}</p>
              <p className="text-xs text-slate-500">{enabled ? "Enabled" : "Paused"}</p>
            </div>
            <form action={setEducationNotificationPreference}>
              <input type="hidden" name="org_id" value={context.orgId} />
              <input type="hidden" name="notification_type" value={type} />
              <input type="hidden" name="in_app_enabled" value={String(!enabled)} />
              <button type="submit" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                {enabled ? "Pause" : "Enable"}
              </button>
            </form>
          </li>;
        })}
      </ul>
    </section>}
  </main>;
}
