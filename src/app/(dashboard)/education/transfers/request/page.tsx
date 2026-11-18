import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRightLeft } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { getProductAppPath } from "@/lib/product-app-routes";
import { createEducationStudentTransfer } from "../../actions";

export default async function EducationStudentTransferRequestPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_transfers", "transfers", "requests", "view")) {
    redirect("/dashboard?accessDenied=think-education.transfers");
  }

  const params = await searchParams;
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const canCreate = await canTabPermission("education_transfers", "transfers", "requests", "create");
  const today = new Date().toISOString().slice(0, 10);
  const errorMessage = params.error === "student"
    ? "No active student with that number was found at the source campus."
    : params.error === "source"
      ? "The student is no longer at the selected source campus."
      : params.error === "invalid"
        ? "Check the student number, campuses, effective date, and transfer reason."
        : params.error === "save" ? "The transfer request could not be saved. Please try again." : null;

  return <main className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
    <header>
      <Link href={getProductAppPath("think-education", "/transfers")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Transfer register
      </Link>
      <div className="mt-4 flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><ArrowRightLeft className="h-5 w-5" /></span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">Request student transfer</h1>
          <p className="mt-1 text-sm text-slate-600">Request a move between campuses you are authorized to access.</p>
        </div>
      </div>
    </header>

    {params.created === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Transfer request created and awaiting review.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

    {!canCreate
      ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">You have view access but cannot create transfer requests.</p>
      : campuses.length < 2
        ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">At least two assigned campuses are required to request a transfer.</p>
        : <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm leading-6 text-slate-600">The student stays at the source campus while the request is pending or approved. Their campus changes only after an authorized user completes the transfer on or after its effective date.</p>
          <form action={createEducationStudentTransfer} className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Student number
              <input required name="student_number" maxLength={32} pattern="[A-Za-z0-9._/-]+" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>
            <label className="text-sm font-medium text-slate-700">Effective date
              <input required type="date" name="effective_on" min={today} defaultValue={today} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>
            <label className="text-sm font-medium text-slate-700">Source campus
              <select required name="source_branch_id" defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
                <option value="" disabled>Select source campus</option>
                {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">Destination campus
              <select required name="destination_branch_id" defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
                <option value="" disabled>Select destination campus</option>
                {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">Reason for transfer
              <textarea required name="reason" maxLength={500} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>
            <div className="flex justify-end sm:col-span-2">
              <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Submit transfer request</button>
            </div>
          </form>
        </section>}
  </main>;
}
