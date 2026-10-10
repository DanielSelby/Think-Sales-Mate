import { redirect } from "next/navigation";
import { getUserRegistrationApplications } from "@/lib/organizations/registration";
import { respondToRegistrationRequest } from "@/app/platform-admin/registration-actions";
import { SubmissionConfirmationModal } from "./submission-confirmation-modal";

export const dynamic = "force-dynamic";

export default async function RegistrationStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string; alreadySubmitted?: string }>;
}) {
  const params = await searchParams;
  const { user, applications } = await getUserRegistrationApplications();
  if (!user) redirect("/login");
  if (!applications.length) redirect("/onboarding");

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-900">
      <SubmissionConfirmationModal open={params.submitted === "1"} />
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold">Organization registration</h1>
          <p className="mt-2 text-sm text-slate-600">Workspace access is limited while your registration is reviewed.</p>
        </header>
        {params.alreadySubmitted === "1" && (
          <p role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            Your organization registration was already received. Repeated submissions do not create another organization.
          </p>
        )}
        {applications.map((application) => {
          const informationRequested = application.status === "pending"
            && application.registrationState === "information_requested";
          return (
            <section key={application.organizationId} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div>
                <h2 className="text-lg font-semibold">{application.organizationName}</h2>
                <p className={`mt-2 inline-flex rounded-xl border px-4 py-2 text-sm font-extrabold shadow-[0_4px_0_0_rgba(15,23,42,0.14),0_8px_16px_-8px_rgba(15,23,42,0.25),inset_0_1px_2px_rgba(255,255,255,0.8)] ${
                  application.status === "pending"
                    ? "border-amber-300 bg-gradient-to-b from-amber-100 to-amber-50 text-amber-950"
                    : application.status === "rejected"
                      ? "border-rose-300 bg-gradient-to-b from-rose-100 to-rose-50 text-rose-900"
                      : "border-slate-300 bg-gradient-to-b from-slate-100 to-white text-slate-800"
                }`}>
                  {application.status === "pending"
                    ? informationRequested ? "More information requested" : "Account Is Under Review - Pending Approval"
                    : application.status}
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
