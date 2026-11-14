import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRightLeft, Check, Plus, Truck, X } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { createEducationStudentTransfer, transitionEducationStudentTransfer } from "../actions";

type TransferRow = {
  id: string;
  student_id: string;
  source_branch_id: string;
  destination_branch_id: string;
  effective_on: string;
  reason: string;
  status: string;
  created_at: string;
};

export default async function EducationTransfersPage({
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
  const readParam = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const statusFilter = readParam(params.status);
  const campusFilter = readParam(params.campus);
  const searchFilter = readParam(params.student).trim().toLowerCase();
  const validStatuses = new Set(["all", "pending", "approved", "rejected", "completed"]);
  const normalizedStatus = validStatuses.has(statusFilter) ? statusFilter : "all";
  const normalizedCampus = campuses.some((campus) => campus.id === campusFilter) ? campusFilter : "all";
  const branchIds = campuses.map((campus) => campus.id);
  const [canCreate, canEdit, canApproveAction] = await Promise.all([
    canTabPermission("education_transfers", "transfers", "requests", "create"),
    canTabPermission("education_transfers", "transfers", "requests", "edit"),
    canTabPermission("education_transfers", "transfers", "requests", "approve"),
  ]);
  const canApprove = canEdit && canApproveAction;
  const supabase = await createClient();
  let transfers: TransferRow[] = [];
  if (branchIds.length) {
    const branchFilter = branchIds.join(",");
    const { data, error } = await supabase.from("education_student_transfers")
      .select("id, student_id, source_branch_id, destination_branch_id, effective_on, reason, status, created_at")
      .eq("org_id", context.orgId)
      .or(`source_branch_id.in.(${branchFilter}),destination_branch_id.in.(${branchFilter})`)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Could not load Think Education transfers: ${error.message}`);
    transfers = data ?? [];
  }
  const studentIds = Array.from(new Set(transfers.map((transfer) => transfer.student_id)));
  const studentNameById = new Map<string, { number: string; name: string }>();
  if (studentIds.length) {
    const { data, error } = await supabase.from("education_students")
      .select("id, student_number, first_name, last_name")
      .eq("org_id", context.orgId).in("id", studentIds);
    if (error) throw new Error(`Could not load students for Think Education transfers: ${error.message}`);
    for (const student of data ?? []) studentNameById.set(student.id, {
      number: student.student_number,
      name: `${student.first_name} ${student.last_name}`,
    });
  }
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const visibleTransfers = transfers.filter((transfer) => {
    if (normalizedStatus !== "all" && transfer.status !== normalizedStatus) return false;
    if (normalizedCampus !== "all" && transfer.source_branch_id !== normalizedCampus && transfer.destination_branch_id !== normalizedCampus) return false;
    if (!searchFilter) return true;
    const student = studentNameById.get(transfer.student_id);
    const studentText = `${student?.name ?? ""} ${student?.number ?? ""}`.toLowerCase();
    return studentText.includes(searchFilter);
  });
  const exportLimit = 5000;
  const exportRows = visibleTransfers.slice(0, exportLimit);
  const csvRows = [
    ["Student number", "Student name", "Source campus", "Destination campus", "Effective date", "Reason", "Status", "Created"],
    ...exportRows.map((transfer) => {
      const student = studentNameById.get(transfer.student_id);
      return [
        student?.number ?? "",
        student?.name ?? "",
        campusNameById.get(transfer.source_branch_id) ?? transfer.source_branch_id,
        campusNameById.get(transfer.destination_branch_id) ?? transfer.destination_branch_id,
        transfer.effective_on,
        transfer.reason,
        transfer.status,
        transfer.created_at,
      ];
    }),
  ];
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(csvRows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"))}`;
  const today = new Date().toISOString().slice(0, 10);
  const errorMessage = params.error === "student"
    ? "No active student with that number was found at the source campus."
    : params.error === "source"
      ? "The student is no longer at the selected source campus."
      : params.error === "transition"
        ? "That transfer is no longer in a state that allows this action, or its effective date has not arrived."
        : params.error === "invalid"
          ? "Check the student number, campuses, effective date, and transfer reason."
          : params.error === "save" ? "The transfer could not be saved. Please try again." : null;

  return <main className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Student Transfers</h1>
        <p className="mt-1 text-sm text-slate-600">Request and process student moves between campuses you are authorized to access.</p>
      </div>
      {canCreate && campuses.length > 1 && <a href="#new-transfer" className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
        <Plus className="h-4 w-4" /> Request transfer
      </a>}
    </header>

    {params.created === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Transfer request created and awaiting review.</p>}
    {params.updated === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Transfer processed. Completion is audited and updates the student’s campus enrollment.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

    <section data-education-metrics className="grid gap-3 sm:grid-cols-4">
      {[
        { label: "Transfer requests", value: visibleTransfers.length, icon: ArrowRightLeft },
        { label: "Pending review", value: visibleTransfers.filter((item) => item.status === "pending").length, icon: Truck },
        { label: "Approved", value: visibleTransfers.filter((item) => item.status === "approved").length, icon: Check },
        { label: "Completed", value: visibleTransfers.filter((item) => item.status === "completed").length, icon: Check },
      ].map(({ label, value, icon: Icon }) => <article key={label} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{value.toLocaleString()}</p></div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon className="h-5 w-5" /></span>
      </article>)}
    </section>

    <section aria-label="Transfer workflow" className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 md:flex md:items-center md:justify-between md:gap-6">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Transfer workflow</h2>
        <p className="mt-1 text-sm text-slate-600">Requests are reviewed before completion. Completing an approved transfer updates the student’s campus enrollment on its effective date.</p>
      </div>
      <p className="mt-3 shrink-0 text-sm font-medium text-blue-900 md:mt-0">
        {visibleTransfers.filter((transfer) => transfer.status === "rejected").length.toLocaleString()} rejected
      </p>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <form method="get" className="grid gap-3 md:grid-cols-4 lg:flex-1">
          <label className="text-sm font-medium text-slate-700">Search student
            <input defaultValue={searchFilter} name="student" placeholder="Name or number" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-medium text-slate-700">Campus
            <select name="campus" defaultValue={normalizedCampus} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
              <option value="all">All campuses</option>
              {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">Status
            <select name="status" defaultValue={normalizedStatus} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="completed">Completed</option>
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Apply filters</button>
            <Link href={getProductAppPath("think-education", "/transfers")} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Reset</Link>
          </div>
        </form>
        {visibleTransfers.length > 0 && <a href={csvHref} download="student-transfers.csv" className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Export CSV</a>}
      </div>
      {visibleTransfers.length > exportLimit && <p className="mt-3 text-xs text-amber-700">Showing the first {exportLimit.toLocaleString()} matching transfers in the CSV export. Narrow the filters to include the full set.</p>}
    </section>

    <section aria-label="Transfer requests" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {visibleTransfers.length === 0 ? <div className="p-8 text-center">
        <Truck className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-3 font-semibold text-slate-900">No transfer requests match these filters</h2>
        <p className="mt-1 text-sm text-slate-500">Use a different campus, status, or student search to find the transfer register entries you need.</p>
      </div> : <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">From</th><th className="px-4 py-3">To</th><th className="px-4 py-3">Effective date</th><th className="px-4 py-3">Reason</th><th className="px-4 py-3">Status / actions</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{visibleTransfers.map((transfer) => {
            const student = studentNameById.get(transfer.student_id);
            const hasBothCampuses = campuses.some((campus) => campus.id === transfer.source_branch_id)
              && campuses.some((campus) => campus.id === transfer.destination_branch_id);
            return <tr key={transfer.id} className="align-top transition-colors hover:bg-slate-50/70">
              <td className="px-4 py-3"><span className="block font-semibold text-slate-900">{student?.name ?? "Student"}</span><span className="text-xs text-slate-500">{student?.number ?? "—"}</span></td>
              <td className="px-4 py-3 text-slate-600">{campusNameById.get(transfer.source_branch_id) ?? "Campus"}</td>
              <td className="px-4 py-3 text-slate-600">{campusNameById.get(transfer.destination_branch_id) ?? "Campus"}</td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-600">{transfer.effective_on}</td>
              <td className="max-w-[260px] px-4 py-3 text-slate-600">{transfer.reason}</td>
              <td className="px-4 py-3">
                <span className="inline-block rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">{transfer.status}</span>
                {hasBothCampuses && transfer.status === "pending" && canApprove && <div className="mt-2 flex gap-2">
                  <form action={transitionEducationStudentTransfer}>
                    <input type="hidden" name="transfer_id" value={transfer.id} /><input type="hidden" name="status" value="approved" />
                    <button className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-800"><Check className="h-3 w-3" />Approve</button>
                  </form>
                  <form action={transitionEducationStudentTransfer}>
                    <input type="hidden" name="transfer_id" value={transfer.id} /><input type="hidden" name="status" value="rejected" />
                    <button className="inline-flex items-center gap-1 rounded-md border border-rose-300 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"><X className="h-3 w-3" />Reject</button>
                  </form>
                </div>}
                {hasBothCampuses && transfer.status === "approved" && canEdit && transfer.effective_on <= today && <form action={transitionEducationStudentTransfer} className="mt-2">
                  <input type="hidden" name="transfer_id" value={transfer.id} /><input type="hidden" name="status" value="completed" />
                  <button className="rounded-md bg-blue-700 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-800">Complete transfer</button>
                </form>}
              </td>
            </tr>;
          })}</tbody>
        </table>
      </div>}
    </section>

    {canCreate && campuses.length > 1 && <section id="new-transfer" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-950">Request student transfer</h2>
      <p className="mt-1 text-sm text-slate-500">Both campuses must be assigned to your account. The student’s current enrollment changes only after approval and audited completion.</p>
      <form action={createEducationStudentTransfer} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-sm font-medium text-slate-700">Student number
          <input required name="student_number" maxLength={32} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
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
          <input required name="reason" maxLength={500} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <div className="sm:col-span-2 lg:col-span-5"><button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Create transfer request</button></div>
      </form>
    </section>}
  </main>;
}
