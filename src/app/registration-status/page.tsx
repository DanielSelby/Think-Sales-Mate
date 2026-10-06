import { redirect } from "next/navigation";
import { getUserRegistrationApplications } from "@/lib/organizations/registration";
import { respondToRegistrationRequest } from "@/app/platform-admin/registration-actions";

export const dynamic = "force-dynamic";

export default async function RegistrationStatusPage() {
  const { user, applications } = await getUserRegistrationApplications();
  if (!user) redirect("/login");
  if (!applications.length) redirect("/onboarding");

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-900">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold">Organization registration</h1>
          <p className="mt-2 text-sm text-slate-600">Workspace access is limited while your registration is reviewed.</p>
        </header>
        {applications.map((application) => {
          const informationRequested = application.status === "pending"
            && application.registrationState === "information_requested";
          return (
            <section key={application.organizationId} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div>
                <h2 className="text-lg font-semibold">{application.organizationName}</h2>
                <p className="mt-1 text-sm font-medium capitalize text-blue-700">
                  {application.status === "pending" ? informationRequested ? "More information requested" : "Pending review" : application.status}
                </p>
              </div>
              {application.messages.map((entry) => (
                <div key={entry.id} className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase text-slate-500">{entry.author_type.replace("_", " ")}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{entry.message}</p>
                </div>
              ))}
              {!application.messages.length && application.registrationNotes && (
                <p className="whitespace-pre-wrap rounded-lg bg-amber-50 p-3 text-sm text-amber-950">{application.registrationNotes}</p>
              )}
              {informationRequested && (
                <form action={respondToRegistrationRequest} className="space-y-3">
                  <input type="hidden" name="organizationId" value={application.organizationId} />
                  <label htmlFor={`response-${application.organizationId}`} className="block text-sm font-medium">Your response</label>
                  <textarea id={`response-${application.organizationId}`} name="message" required maxLength={4000} rows={4} className="w-full rounded-lg border border-slate-300 p-3 text-sm" />
                  <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Send response</button>
                </form>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
