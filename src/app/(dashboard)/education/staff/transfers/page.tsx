import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRightLeft, Check, Plus, Truck, X } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { createEducationStaffTransfer, transitionEducationStaffTransfer } from "../../actions";

type StaffTransfer = {
  id: string;
  staff_id: string;
  source_branch_id: string;
  destination_branch_id: string;
  effective_on: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "completed";
  requested_by: string;
  review_note: string | null;
  created_at: string;
};

const PAGE_SIZE = 50;

export default async function EducationStaffTransfersPage({
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
  const campusIds = campuses.map((campus) => campus.id);
  const requestedBranch = typeof params.branch === "string" ? params.branch : "";
  const branchId = campusIds.includes(requestedBranch) ? requestedBranch : "";
  const branchIds = branchId ? [branchId] : campusIds;
  const [canCreate, canApproveAction, canEdit] = await Promise.all([
    canTabPermission("education_staff", "staff", "transfers", "create"),
    canTabPermission("education_staff", "staff", "transfers", "approve"),
    canTabPermission("education_staff", "staff", "transfers", "edit"),
  ]);
  const canApprove = canApproveAction && canEdit;
  const parsedPage = Number.parseInt(typeof params.page === "string" ? params.page : "1", 10);
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, 2001) : 1;
  const supabase = await createClient();
  let transfers: StaffTransfer[] = [];
  let totalCount = 0;
  if (branchIds.length) {
    const filter = branchIds.join(",");
    const { data, count, error } = await supabase.from("education_staff_transfers")
      .select("id, staff_id, source_branch_id, destination_branch_id, effective_on, reason, status, requested_by, review_note, created_at", { count: "exact" })
      .eq("org_id", context.orgId)
      .or(`source_branch_id.in.(${filter}),destination_branch_id.in.(${filter})`)
      .order("created_at", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (error) throw new Error(`Could not load Think Education staff transfers: ${error.message}`);
    transfers = data ?? [];
    totalCount = count ?? 0;
  }

  const staffIds = Array.from(new Set(transfers.map((transfer) => transfer.staff_id)));
  const staffNameById = new Map<string, { number: string; name: string }>();
  if (staffIds.length) {
    const { data, error } = await supabase.from("education_staff")
      .select("id, staff_number, first_name, last_name")
      .eq("org_id", context.orgId).in("id", staffIds);
    if (error) throw new Error(`Could not load staff for campus transfers: ${error.message}`);
    for (const staff of data ?? []) {
      staffNameById.set(staff.id, {
        number: staff.staff_number,
        name: `${staff.first_name} ${staff.last_name}`,
      });
    }
  }
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const today = new Date().toISOString().slice(0, 10);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pageHref = (nextPage: number) => {
    const query = new URLSearchParams({ page: String(nextPage) });
    if (branchId) query.set("branch", branchId);
    return `${getProductAppPath("think-education", "/staff/transfers")}?${query.toString()}`;
  };
  if (page > totalPages) redirect(pageHref(totalPages));
  const errorMessage = params.error === "staff"
    ? "No active staff member with that number was found at the source campus."
    : params.error === "pending"
      ? "This staff member already has a pending or approved campus transfer."
      : params.error === "conflict"
        ? "Resolve assigned assets or approved leave that conflict with this transfer before completion."
        : params.error === "transition"
          ? "This transfer is no longer eligible for that action."
          : params.error === "invalid"
            ? "Check the staff number, campuses, effective date, and transfer reason."
            : params.error === "save" ? "The staff transfer could not be saved. Please try again." : null;

  return <main className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <Link href={getProductAppPath("think-education", "/staff")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
          <ArrowLeft className="h-4 w-4" /> Staff Management
        </Link>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-950"><ArrowRightLeft className="h-6 w-6 text-blue-700" /> Staff Campus Transfers</h1>
        <p className="mt-1 text-sm text-slate-600">Request and process audited staff moves between campuses you can access.</p>
      </div>
      {canCreate && campuses.length > 1 && <a href="#new-transfer" className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
        <Plus className="h-4 w-4" /> Request transfer
      </a>}
    </header>

    {params.created === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Staff transfer request created and awaiting review.</p>}
    {params.updated === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Staff transfer processed. The campus assignment update and its historical schedule handling were audited.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

    <section className="grid gap-3 sm:grid-cols-4">
      {[
        { label: "Transfer requests", value: totalCount, icon: ArrowRightLeft },
        { label: "Pending review", value: transfers.filter((item) => item.status === "pending").length, icon: Truck },
        { label: "Approved", value: transfers.filter((item) => item.status === "approved").length, icon: Check },
        { label: "Completed", value: transfers.filter((item) => item.status === "completed").length, icon: Check },
      ].map(({ label, value, icon: Icon }) => <article key={label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{value.toLocaleString()}</p></div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon className="h-5 w-5" /></span>
      </article>)}
    </section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <form method="get" action={getProductAppPath("think-education", "/staff/transfers")} className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-4">
        <label className="min-w-[220px] flex-1 text-sm font-medium text-slate-700">Campus
          <select name="branch" defaultValue={branchId} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">All accessible campuses</option>{campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <button type="submit" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Apply filter</button>
      </form>

      {transfers.length === 0 ? <div className="p-8 text-center">
        <Truck className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-3 font-semibold text-slate-900">No staff transfer requests</h2>
        <p className="mt-1 text-sm text-slate-500">Both campuses must be assigned to your account to request or process a transfer.</p>
      </div> : <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Staff member</th><th className="px-4 py-3">From</th><th className="px-4 py-3">To</th><th className="px-4 py-3">Effective</th><th className="px-4 py-3">Reason</th><th className="px-4 py-3">Status / actions</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{transfers.map((transfer) => {
            const staff = staffNameById.get(transfer.staff_id);
            const hasBothCampuses = campuses.some((campus) => campus.id === transfer.source_branch_id)
              && campuses.some((campus) => campus.id === transfer.destination_branch_id);
            return <tr key={transfer.id} className="align-top">
              <td className="px-4 py-3"><span className="block font-semibold text-slate-900">{staff?.name ?? "Staff member"}</span><span className="text-xs text-slate-500">{staff?.number ?? "—"}</span></td>
              <td className="px-4 py-3 text-slate-600">{campusNameById.get(transfer.source_branch_id) ?? "Campus"}</td>
              <td className="px-4 py-3 text-slate-600">{campusNameById.get(transfer.destination_branch_id) ?? "Campus"}</td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-600">{transfer.effective_on}</td>
              <td className="max-w-[260px] px-4 py-3 text-slate-600">{transfer.reason}</td>
              <td className="px-4 py-3">
                <span className="inline-block rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">{transfer.status}</span>
                {transfer.review_note && <p className="mt-1 max-w-[220px] text-xs text-slate-600">{transfer.review_note}</p>}
                {hasBothCampuses && transfer.status === "pending" && canApprove && transfer.requested_by !== context.userId && <div className="mt-2 flex gap-2">
                  <form action={transitionEducationStaffTransfer}>
                    <input type="hidden" name="transfer_id" value={transfer.id} /><input type="hidden" name="status" value="approved" />
                    <button className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-800"><Check className="h-3 w-3" />Approve</button>
                  </form>
                  <form action={transitionEducationStaffTransfer} className="flex items-center gap-1">
                    <input type="hidden" name="transfer_id" value={transfer.id} /><input type="hidden" name="status" value="rejected" />
                    <label className="sr-only" htmlFor={`review-note-${transfer.id}`}>Reason for rejection</label>
                    <input required id={`review-note-${transfer.id}`} name="review_note" maxLength={1000} placeholder="Rejection reason" className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs" />
                    <button className="inline-flex items-center gap-1 rounded-md border border-rose-300 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"><X className="h-3 w-3" />Reject</button>
                  </form>
                </div>}
                {hasBothCampuses && transfer.status === "approved" && canEdit && transfer.effective_on <= today && <form action={transitionEducationStaffTransfer} className="mt-2">
                  <input type="hidden" name="transfer_id" value={transfer.id} /><input type="hidden" name="status" value="completed" />
                  <button className="rounded-md bg-blue-700 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-800">Complete transfer</button>
                </form>}
              </td>
            </tr>;
          })}</tbody>
        </table>
      </div>}
      {totalPages > 1 && <nav aria-label="Staff transfer pages" className="flex items-center justify-between border-t border-slate-100 p-4">
        {page > 1 ? <Link href={pageHref(page - 1)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Previous</Link> : <span />}
        <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
        {page < totalPages ? <Link href={pageHref(page + 1)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Next</Link> : <span />}
      </nav>}
    </section>

    {canCreate && campuses.length > 1 && <section id="new-transfer" className="scroll-mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-950">Request staff campus transfer</h2>
      <p className="mt-1 text-sm text-slate-500">Both campuses must be assigned to your account. The staff campus changes only after approval and audited completion. Active asset assignments and approved leave must be resolved first.</p>
      <form action={createEducationStaffTransfer} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-sm font-medium text-slate-700">Staff number
          <input required name="staff_number" maxLength={32} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Source campus
          <select required name="source_branch_id" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">{campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select>
        </label>
        <label className="text-sm font-medium text-slate-700">Destination campus
          <select required name="destination_branch_id" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">{campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select>
        </label>
        <label className="text-sm font-medium text-slate-700">Effective date
          <input required type="date" name="effective_on" min={today} defaultValue={today} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Reason
          <input required name="reason" maxLength={1000} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <div className="sm:col-span-2 lg:col-span-5"><button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Create transfer request</button></div>
      </form>
    </section>}
  </main>;
}
