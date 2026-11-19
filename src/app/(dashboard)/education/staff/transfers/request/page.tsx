import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRightLeft } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { getProductAppPath } from "@/lib/product-app-routes";
import { createEducationStaffTransfer } from "../../../actions";

export default async function EducationStaffTransferRequestPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_staff", "staff", "transfers", "view")) {
    redirect("/dashboard?accessDenied=think-education.staff-transfers");
  }

  const params = await searchParams;
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const canCreate = await canTabPermission("education_staff", "staff", "transfers", "create");
  const today = new Date().toISOString().slice(0, 10);
  const errorMessage = params.error === "staff"
    ? "No active staff member with that number was found at the source campus."
    : params.error === "pending"
      ? "This staff member already has a pending or approved campus transfer."
      : params.error === "conflict"
        ? "Resolve assigned assets or approved leave that conflict with this transfer before completion."
        : params.error === "invalid"
          ? "Check the staff number, campuses, effective date, and transfer reason."
          : params.error === "save" ? "The staff transfer request could not be saved. Please try again." : null;

  return <main className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
    <header>
      <Link href={getProductAppPath("think-education", "/staff/transfers")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Staff transfer register
      </Link>
      <div className="mt-4 flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><ArrowRightLeft className="h-5 w-5" /></span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">Request staff transfer</h1>
          <p className="mt-1 text-sm text-slate-600">Request a staff move between campuses you are authorized to access.</p>
        </div>
      </div>
    </header>

    {params.created === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Staff transfer request created and awaiting review.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

    {!canCreate
      ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">You have view access but cannot create staff transfer requests.</p>
      : campuses.length < 2
        ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">At least two assigned campuses are required to request a staff transfer.</p>
        : <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm leading-6 text-slate-600">Both campuses must be assigned to your account. The staff campus changes only after approval and audited completion. Active asset assignments and approved leave must be resolved first.</p>
          <form action={createEducationStaffTransfer} className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Staff number
              <input required name="staff_number" maxLength={32} placeholder="Enter the staff number" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
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
            <label className="text-sm font-medium text-slate-700">Effective date
              <input required type="date" name="effective_on" min={today} defaultValue={today} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">Reason for transfer
              <textarea required name="reason" maxLength={1000} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>
            <div className="flex justify-end sm:col-span-2">
              <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Submit transfer request</button>
            </div>
          </form>
        </section>}
  </main>;
}
