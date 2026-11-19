import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRightLeft } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { getProductAppPath } from "@/lib/product-app-routes";
import { createClient } from "@/lib/supabase/server";
import { TransferRequestForm } from "./transfer-request-form";

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
  let students: Array<{
    id: string;
    branch_id: string;
    student_number: string;
    first_name: string;
    last_name: string;
    other_names: string | null;
  }> = [];
  if (canCreate && campuses.length > 1) {
    const supabase = await createClient();
    const { data, error, count } = await supabase.from("education_students")
      .select("id, branch_id, student_number, first_name, last_name, other_names", { count: "exact" })
      .eq("org_id", context.orgId)
      .in("branch_id", campuses.map((campus) => campus.id))
      .eq("status", "active")
      .order("last_name")
      .order("first_name")
      .range(0, 4_999);
    if (error) {
      console.error("Could not load active students for transfer search:", error.message);
      throw new Error("Active students for transfer requests could not be loaded.");
    }
    if ((count ?? 0) > 5_000) {
      throw new Error("More than 5,000 active students match your campus access. Narrow your campus access before creating a transfer request.");
    }
    students = data ?? [];
  }
  const today = new Date().toISOString().slice(0, 10);
  const errorMessage = params.error === "student"
    ? "No active student with that name or number was found at the source campus."
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
          <TransferRequestForm campuses={campuses} students={students} today={today} />
        </section>}
  </main>;
}
