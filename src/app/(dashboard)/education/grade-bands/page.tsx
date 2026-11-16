import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import {
  createEducationGradeBand,
  deleteEducationGradeBand,
  updateEducationGradeBand,
} from "../actions";

type EducationGradeBandRow = {
  id: string;
  label: string;
  minimum_percentage: number;
};

export default async function EducationGradeBandsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_academics", "academics", "calendar", "view")) {
    redirect("/dashboard?accessDenied=think-education.grade-bands");
  }

  const params = await searchParams;
  const { hasOrganizationScope } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const [canCreate, canEdit] = await Promise.all([
    hasOrganizationScope && await canTabPermission("education_academics", "academics", "calendar", "create"),
    hasOrganizationScope && await canTabPermission("education_academics", "academics", "calendar", "edit"),
  ]);
  const supabase = await createClient();
  const { data, error } = await supabase.from("education_grade_bands")
    .select("id, label, minimum_percentage")
    .eq("org_id", context.orgId)
    .order("minimum_percentage");
  if (error) throw new Error(`Could not load the Think Education grade scale: ${error.message}`);
  const bands: EducationGradeBandRow[] = data ?? [];

  const errorMessage = params.error === "duplicate"
    ? "Another grade band already uses that minimum percentage."
    : params.error === "invalid"
      ? "Enter a grade label and a minimum percentage from 0 to 100 (up to two decimal places)."
      : params.error === "not-found"
        ? "That grade band is no longer available. Refresh and try again."
        : params.error === "save"
          ? "The grade band could not be saved. Please try again."
          : null;

  return <main className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
    <header>
      <Link href={getProductAppPath("think-education", "/results")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Results &amp; Report Cards
      </Link>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Organization Grade Bands</h1>
      <p className="mt-1 text-sm text-slate-600">Set percentage thresholds shared by all campuses. Each threshold is inclusive up to, but not including, the next threshold.</p>
    </header>

    {params.created === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Grade band added.</p>}
    {params.updated === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Grade bands updated.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

    {!hasOrganizationScope && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      The grade scale is organization-wide. You can view the scale, but changes require explicit organization-wide access.
    </p>}
    {!bands.some((band) => Number(band.minimum_percentage) === 0) && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      Automatic grade assignment is inactive until a band starts at 0%. Existing overrides are preserved.
    </p>}

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="font-bold text-slate-950">Current scale</h2>
        <p className="mt-1 text-sm text-slate-500">A result receives the grade with the greatest minimum percentage not exceeding its score percentage. A complete scale begins at 0%.</p>
      </div>
      {bands.length === 0 ? <p className="p-6 text-sm text-slate-500">No grade bands are configured.</p> : <ul className="divide-y divide-slate-100">
        {bands.map((band) => <li key={band.id} className="flex flex-wrap items-end gap-3 p-4">
          {canEdit ? <form action={updateEducationGradeBand} className="flex min-w-0 flex-1 flex-wrap items-end gap-3">
            <input type="hidden" name="band_id" value={band.id} />
            <label className="min-w-[7rem] flex-1 text-sm font-medium text-slate-700">Grade label
              <input required name="label" maxLength={10} defaultValue={band.label} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>
            <label className="w-40 text-sm font-medium text-slate-700">Minimum percentage
              <input required name="minimum_percentage" type="number" min={0} max={100} step="0.01" defaultValue={band.minimum_percentage} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>
            <button type="submit" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">Save</button>
          </form> : <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
            <p className="font-semibold text-slate-900">{band.label}</p>
            <p className="text-sm tabular-nums text-slate-600">{Number(band.minimum_percentage).toFixed(2)}%</p>
          </div>}
          {canEdit && <form action={deleteEducationGradeBand}>
            <input type="hidden" name="band_id" value={band.id} />
            <button type="submit" className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">Remove</button>
          </form>}
        </li>)}
      </ul>}
    </section>

    {canCreate && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-bold text-slate-950">Add grade band</h2>
      <form action={createEducationGradeBand} className="mt-4 flex flex-wrap items-end gap-3">
        <label className="min-w-[7rem] flex-1 text-sm font-medium text-slate-700">Grade label
          <input required name="label" maxLength={10} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="w-44 text-sm font-medium text-slate-700">Minimum percentage
          <input required name="minimum_percentage" type="number" min={0} max={100} step="0.01" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
          <Plus className="h-4 w-4" /> Add band
        </button>
      </form>
    </section>}
  </main>;
}
