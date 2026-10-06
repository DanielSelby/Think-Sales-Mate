import { redirect } from "next/navigation";
import Link from "next/link";
import { getPlatformAdmin, platformRoleCan } from "@/lib/platform-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPlatformAdminClient } from "@/lib/supabase/platform-admin";
import {
  reviewOrganizationRegistrationForm,
  retryRegistrationEmail,
  saveRegistrationNotificationSettings,
  sendRegistrationTestEmail,
} from "@/app/platform-admin/registration-actions";

export const dynamic = "force-dynamic";

export default async function OrganizationRegistrationsPage() {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/platform-admin/login");
  if (!platformRoleCan(admin.role, "manage_platform")) redirect("/platform-admin");

  const platform = createPlatformAdminClient();
  const [{ data: applications, error: applicationsError }, { data: setting, error: settingError }, { data: deliveries, error: deliveriesError }] = await Promise.all([
    platform.from("platform_organizations")
      .select("id, organization_id, name, owner_email, registration_state, registration_notes, info_requested_at, created_at")
      .eq("status", "pending")
      .in("registration_state", ["pending", "information_requested"])
      .order("created_at", { ascending: true }),
    platform.from("platform_settings").select("value").eq("key", "registration_notification_emails").maybeSingle(),
    platform.from("platform_registration_deliveries")
      .select("id, organization_id, recipient, subject, status, error, attempts, updated_at")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (applicationsError || settingError || deliveriesError) {
    throw new Error(`Could not load registration administration: ${applicationsError?.message ?? settingError?.message ?? deliveriesError?.message}`);
  }

  const organizationIds = (applications ?? []).map((application) => application.organization_id);
  const app = createAdminClient();
  const { data: messages, error: messagesError } = organizationIds.length
    ? await app.from("organization_registration_messages")
      .select("organization_id, author_type, message, created_at")
      .in("organization_id", organizationIds)
      .order("created_at", { ascending: true })
    : { data: [], error: null };
  if (messagesError) throw new Error(`Could not load owner registration responses: ${messagesError.message}`);

  const configuredRecipients = Array.isArray(setting?.value?.recipients)
    ? setting.value.recipients.filter((recipient): recipient is string => typeof recipient === "string").join(", ")
    : "";

  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6 text-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/platform-admin" className="text-sm font-medium text-blue-700">← Platform Admin</Link>
          <h1 className="mt-3 text-2xl font-bold">Organization registrations</h1>
          <p className="mt-1 text-sm text-slate-600">Review applications, request details, and manage registration email delivery.</p>
        </div>
      </div>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Notification settings</h2>
        <p className="text-sm text-slate-600">Comma-separated recipients. If empty, PLATFORM_ADMIN_NOTIFICATION_EMAILS is used when configured.</p>
        <form action={saveRegistrationNotificationSettings} className="flex flex-wrap gap-3">
          <input name="recipients" defaultValue={configuredRecipients} aria-label="Notification recipients" placeholder="admin@example.com, owner@example.com" className="min-w-[280px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Save recipients</button>
        </form>
        <form action={sendRegistrationTestEmail} className="flex flex-wrap gap-3">
          <input name="recipient" type="email" required placeholder="Test recipient email" className="min-w-[240px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Send test email</button>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Pending applications ({applications?.length ?? 0})</h2>
        {!applications?.length && <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">No registrations are awaiting review.</p>}
        {applications?.map((application) => (
          <article key={application.id} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <h3 className="font-semibold">{application.name}</h3>
                <p className="text-sm text-slate-600">{application.owner_email ?? "Owner email unavailable"}</p>
                <p className="mt-1 text-xs capitalize text-blue-700">{application.registration_state.replaceAll("_", " ")}</p>
              </div>
              <time className="text-xs text-slate-500">{new Date(application.created_at).toLocaleString()}</time>
            </div>
            {messages?.filter((message) => message.organization_id === application.organization_id).map((message, index) => (
              <div key={`${message.created_at}-${index}`} className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase text-slate-500">{message.author_type.replaceAll("_", " ")}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{message.message}</p>
              </div>
            ))}
            <form action={reviewOrganizationRegistrationForm} className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
              <input type="hidden" name="id" value={application.id} />
              <textarea name="reason" rows={2} placeholder="Decision reason or requested information" className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-4" />
              <button name="decision" value="approve" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Approve</button>
              <button name="decision" value="request_information" className="rounded-lg border border-amber-400 px-4 py-2 text-sm font-semibold text-amber-900">Request information</button>
              <button name="decision" value="reject" className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white">Reject</button>
            </form>
          </article>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recent email delivery history</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-600"><tr><th className="p-3">Recipient</th><th className="p-3">Subject</th><th className="p-3">Status</th><th className="p-3">Attempts</th><th className="p-3">Details</th><th className="p-3">Action</th></tr></thead>
            <tbody>
              {deliveries?.map((delivery) => (
                <tr key={delivery.id} className="border-t border-slate-100">
                  <td className="p-3">{delivery.recipient}</td><td className="p-3">{delivery.subject}</td>
                  <td className="p-3 capitalize">{delivery.status}</td><td className="p-3">{delivery.attempts}</td>
                  <td className="max-w-xs truncate p-3 text-slate-600">{delivery.error ?? new Date(delivery.updated_at).toLocaleString()}</td>
                  <td className="p-3">{delivery.status === "failed" && <form action={retryRegistrationEmail}><input type="hidden" name="deliveryId" value={delivery.id} /><button className="font-semibold text-blue-700">Retry</button></form>}</td>
                </tr>
              ))}
              {!deliveries?.length && <tr><td colSpan={6} className="p-4 text-slate-500">No registration emails have been sent.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
