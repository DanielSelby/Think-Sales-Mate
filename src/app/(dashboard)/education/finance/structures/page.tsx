import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  Archive,
  BookOpen,
  CheckCircle2,
  CircleDollarSign,
  GraduationCap,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { EducationFormDialog } from "@/components/education/education-form-dialog";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { formatCurrencyAmount } from "@/lib/currency";
import { getOrganizationCurrencyConfig } from "@/lib/currency/settings";
import { getProductAppPath } from "@/lib/product-app-routes";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  applyEducationFeeSchedule,
  archiveEducationFeeSchedule,
  createEducationFeeSchedule,
} from "../../actions";

const PAGE_SIZE = 50;

type SearchParams = Record<string, string | string[] | undefined>;

function getSingleParam(params: SearchParams, key: string) {
  return typeof params[key] === "string" ? params[key] as string : "";
}

function getStructuresHref(params: {
  branch?: string;
  year?: string;
  classId?: string;
  search?: string;
  page?: number;
  structure?: string;
}) {
  const query = new URLSearchParams();
  if (params.branch) query.set("branch", params.branch);
  if (params.year) query.set("year", params.year);
  if (params.classId) query.set("class", params.classId);
  if (params.search) query.set("search", params.search);
  if (params.page && params.page > 1) query.set("page", String(params.page));
  if (params.structure) query.set("structure", params.structure);
  const suffix = query.toString();
  return `${getProductAppPath("think-education", "/finance/structures")}${suffix ? `?${suffix}` : ""}`;
}

export default async function EducationFeeStructuresPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_finance", "finance", "charges", "view")) {
    redirect("/dashboard?accessDenied=think-education.fee-structures");
  }

  const params = await searchParams;
  const requestedBranch = getSingleParam(params, "branch");
  const requestedYear = getSingleParam(params, "year");
  const requestedClass = getSingleParam(params, "class");
  const search = getSingleParam(params, "search").trim().slice(0, 100);
  const page = Math.min(1_000_000, Math.max(1, Number.parseInt(getSingleParam(params, "page"), 10) || 1));
  const requestedStructure = getSingleParam(params, "structure");

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  const selectedBranch = campusIds.includes(requestedBranch) ? requestedBranch : "";
  const branchIds = selectedBranch ? [selectedBranch] : campusIds;
  const supabase = await createClient();
  const [yearsResult, currencyConfig, canCreate, canEdit, canViewStudents, canViewAcademics] = await Promise.all([
    supabase.from("education_academic_years")
      .select("id, name, status")
      .eq("org_id", context.orgId)
      .order("starts_on", { ascending: false }),
    getOrganizationCurrencyConfig(),
    canTabPermission("education_finance", "finance", "charges", "create"),
    canTabPermission("education_finance", "finance", "charges", "edit"),
    canTabPermission("education_students", "students", "list", "view"),
    canTabPermission("education_academics", "academics", "calendar", "view"),
  ]);
  if (yearsResult.error) throw new Error(`Could not load academic years for fee structures: ${yearsResult.error.message}`);

  const years = yearsResult.data ?? [];
  const yearIds = years.map((year) => year.id);
  const selectedYear = yearIds.includes(requestedYear) ? requestedYear : "";
  const availableYears = years.filter((year) => year.status === "planned" || year.status === "active");
  const createBranchId = selectedBranch || campuses[0]?.id || "";
  const createYearId = availableYears.some((year) => year.id === selectedYear)
    ? selectedYear
    : availableYears[0]?.id ?? "";
  const canPrepareStructure = canCreate && canViewStudents && canViewAcademics;

  const [classesResult, schedulesResult, studentCountResult] = branchIds.length ? await Promise.all([
    supabase.from("education_classes")
      .select("id, branch_id, academic_year_id, name")
      .eq("org_id", context.orgId)
      .in("branch_id", branchIds)
      .eq("status", "active")
      .order("name"),
    (() => {
      let query = supabase.from("education_fee_schedules")
        .select("id, branch_id, class_id, academic_year_id, description, amount, due_on, status, created_at", { count: "exact" })
        .eq("org_id", context.orgId)
        .in("branch_id", branchIds)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
      if (selectedYear) query = query.eq("academic_year_id", selectedYear);
      if (requestedClass) query = query.eq("class_id", requestedClass);
      if (search) query = query.ilike("description", `%${search}%`);
      return query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    })(),
    canPrepareStructure && createBranchId
      ? supabase.from("education_students")
        .select("id", { count: "exact", head: true })
        .eq("org_id", context.orgId)
        .in("branch_id", branchIds)
        .eq("status", "active")
      : Promise.resolve({ count: 0, error: null }),
  ]) : [
    { data: [], error: null },
    { data: [], count: 0, error: null },
    { count: 0, error: null },
  ];

  if (classesResult.error) throw new Error(`Could not load classes for fee structures: ${classesResult.error.message}`);
  if (schedulesResult.error) throw new Error(`Could not load fee structures: ${schedulesResult.error.message}`);
  if (studentCountResult.error) throw new Error(`Could not count active students: ${studentCountResult.error.message}`);

  const classes = classesResult.data ?? [];
  const schedules = schedulesResult.data ?? [];
  const totalScheduleCount = schedulesResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalScheduleCount / PAGE_SIZE));
  const classById = new Map(classes.map((classroom) => [classroom.id, classroom]));
  const campusById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const yearById = new Map(years.map((year) => [year.id, year.name]));
  const groups = new Map<string, {
    key: string;
    branchId: string;
    classId: string;
    yearId: string;
    items: typeof schedules;
  }>();

  for (const schedule of schedules) {
    const key = `${schedule.branch_id}:${schedule.class_id}:${schedule.academic_year_id}`;
    const existing = groups.get(key);
    if (existing) existing.items.push(schedule);
    else groups.set(key, {
      key,
      branchId: schedule.branch_id,
      classId: schedule.class_id,
      yearId: schedule.academic_year_id,
      items: [schedule],
    });
  }

  const structures = [...groups.values()];
  const selectedStructure = structures.find((structure) => structure.key === requestedStructure)
    ?? structures[0]
    ?? null;
  const scheduleCountOnPage = schedules.length;
  const activeScheduleCount = schedules.filter((schedule) => schedule.status === "active").length;
  const feeTotalOnPage = schedules
    .filter((schedule) => schedule.status === "active")
    .reduce((total, schedule) => total + Number(schedule.amount), 0);
  const selectedClass = createBranchId && createYearId
    ? classes.filter((classroom) => classroom.branch_id === createBranchId && classroom.academic_year_id === createYearId)
    : [];
  const formatMoney = (amount: number) => formatCurrencyAmount(amount, currencyConfig);

  const pageHref = (nextPage: number) => getStructuresHref({
    branch: selectedBranch,
    year: selectedYear,
    classId: requestedClass,
    search,
    page: nextPage,
    structure: selectedStructure?.key,
  });
  if (page > totalPages) redirect(pageHref(totalPages));
  const errorCode = getSingleParam(params, "error");
  const errorMessage = errorCode === "invalid"
    ? "Check the selected campus, academic year, class, description, due date, and amount."
    : errorCode === "schedule"
      ? "The schedule is no longer active or the academic year is no longer open."
      : errorCode === "not-found"
        ? "That fee schedule could not be found."
        : errorCode === "accounting-mapping"
          ? "Configure the required accounting account mappings before posting charges."
          : errorCode === "accounting-period"
            ? "The transaction date is outside an open accounting period."
        : errorCode === "schedule-archive-invalid"
          ? "Enter a reason of at least 3 characters to archive the fee item."
          : errorCode === "schedule-archive-blocked"
            ? "That schedule can no longer be archived."
        : errorCode === "save"
          ? "The fee schedule could not be saved. Please try again."
          : null;

  return <main className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <Link href={getProductAppPath("think-education", "/finance")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
          <ArrowLeft className="h-4 w-4" /> Fees &amp; Finance
        </Link>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Fees &amp; Finance <span className="px-1">›</span> Class Fee Structures</p>
        <div className="mt-2 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-700 text-white"><BookOpen className="h-5 w-5" /></span>
          <div>
            <h1 className="text-2xl font-bold text-slate-950">Class Fee Structures</h1>
            <p className="mt-0.5 text-sm text-slate-600">Manage class schedules and review fee items before posting charges.</p>
          </div>
        </div>
      </div>
      {canPrepareStructure && campuses.length > 0 && createBranchId && createYearId && selectedClass.length > 0 && <EducationFormDialog
        buttonLabel="Create Structure"
        title="Create class fee schedule"
        description="Add a class fee item to the selected academic year. Posting charges is a separate, idempotent action."
      >
        <form action={createEducationFeeSchedule} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="return_to" value="structures" />
          <label className="text-sm font-medium text-slate-700">Campus
            <span className="mt-1 block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-normal text-slate-700">{campusById.get(createBranchId)}</span>
            <input type="hidden" name="branch_id" value={createBranchId} />
          </label>
          <label className="text-sm font-medium text-slate-700">Academic year
            <span className="mt-1 block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-normal text-slate-700">{yearById.get(createYearId)}</span>
            <input type="hidden" name="academic_year_id" value={createYearId} />
          </label>
          <label className="text-sm font-medium text-slate-700">Class
            <select required name="class_id" defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
              <option value="" disabled>Select a class</option>
              {selectedClass.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">Fee description
            <input required name="description" maxLength={160} placeholder="e.g. Term tuition" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-medium text-slate-700">Amount per student ({currencyConfig.symbol})
            <input required name="amount" type="number" min="0.01" step="0.01" max="9999999999.99" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-medium text-slate-700">Due date
            <input name="due_on" type="date" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <div className="flex justify-end sm:col-span-2">
            <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
              <Plus className="h-4 w-4" /> Save fee item
            </button>
          </div>
        </form>
      </EducationFormDialog>}
    </header>

    {getSingleParam(params, "scheduleCreated") === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Fee schedule created.</p>}
    {typeof params.applied === "string" && /^\d+$/.test(params.applied) && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{params.applied} student charge(s) posted.</p>}
    {getSingleParam(params, "scheduleArchived") === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Schedule archived. Existing student charges are unchanged.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
      {errorMessage}
      {(errorCode === "accounting-mapping" || errorCode === "accounting-period") && <> <Link href={getProductAppPath("think-education", errorCode === "accounting-mapping" ? "/accounting/settings" : "/accounting/periods")} className="font-semibold underline">Open accounting setup</Link></>}
    </p>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        { label: "Classes in view", value: String(structures.length), icon: GraduationCap, tone: "bg-blue-50 text-blue-700" },
        { label: "Students in view", value: canPrepareStructure ? String(studentCountResult.count ?? 0) : "—", icon: Users, tone: "bg-indigo-50 text-indigo-700" },
        { label: "Active fees in view", value: formatMoney(feeTotalOnPage), icon: CircleDollarSign, tone: "bg-amber-50 text-amber-700" },
        { label: "Active fee items", value: String(activeScheduleCount), icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-700" },
      ].map(({ label, value, icon: Icon, tone }) => <article key={label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-xl font-bold text-slate-950">{value}</p></div>
        <span className={`grid h-10 w-10 place-items-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span>
      </article>)}
    </section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <form method="get" action={getProductAppPath("think-education", "/finance/structures")} className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1.4fr_auto]">
        <label className="text-xs font-semibold text-slate-600">Academic Year
          <select name="year" defaultValue={selectedYear} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800">
            <option value="">All years</option>
            {years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">Campus
          <select name="branch" defaultValue={selectedBranch} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800">
            <option value="">All assigned campuses</option>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">Class
          <select name="class" defaultValue={requestedClass} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-800">
            <option value="">All classes</option>
            {classes.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">Search fee items
          <span className="mt-1 flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-slate-400">
            <Search className="h-4 w-4 shrink-0" />
            <input name="search" defaultValue={search} placeholder="Search fee descriptions..." className="min-w-0 flex-1 border-0 bg-transparent text-sm font-normal text-slate-800 outline-none" />
          </span>
        </label>
        <button type="submit" className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <Search className="h-4 w-4" /> Filter
        </button>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-xs">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              {["Class", "Campus", "Academic Year", "Term", "Fee Items", "Total (Compulsory)", "Total (Optional)", "Currency", "Status", "Actions"].map((heading) =>
                <th key={heading} className="px-3 py-3 font-semibold">{heading}</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {structures.map((structure) => {
              const classroom = classById.get(structure.classId);
              const activeItems = structure.items.filter((item) => item.status === "active");
              const total = activeItems.reduce((sum, item) => sum + Number(item.amount), 0);
              const allArchived = structure.items.every((item) => item.status !== "active");
              const hasArchived = structure.items.some((item) => item.status !== "active");
              const status = allArchived ? "Archived" : hasArchived ? "Mixed" : "Active";
              const selected = structure.key === selectedStructure?.key;
              const rowHref = getStructuresHref({
                branch: selectedBranch,
                year: selectedYear,
                classId: requestedClass,
                search,
                page,
                structure: structure.key,
              });
              return <tr key={structure.key} className={selected ? "bg-blue-50/70" : "hover:bg-slate-50"}>
                <td className="px-3 py-3 font-semibold text-slate-900">{classroom?.name ?? "Class"}</td>
                <td className="px-3 py-3">{campusById.get(structure.branchId) ?? "Campus"}</td>
                <td className="px-3 py-3">{yearById.get(structure.yearId) ?? "Academic year"}</td>
                <td className="px-3 py-3 text-slate-500">Not configured</td>
                <td className="px-3 py-3">{structure.items.length}</td>
                <td className="px-3 py-3">{formatMoney(total)}</td>
                <td className="px-3 py-3">{formatMoney(0)}</td>
                <td className="px-3 py-3">{currencyConfig.symbol}</td>
                <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${status === "Active" ? "bg-emerald-100 text-emerald-800" : status === "Archived" ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-800"}`}>{status}</span></td>
                <td className="px-3 py-3"><Link href={rowHref} className="font-semibold text-blue-700 hover:text-blue-900">View</Link></td>
              </tr>;
            })}
            {structures.length === 0 && <tr><td colSpan={10} className="px-4 py-12 text-center">
              <BookOpen className="mx-auto h-9 w-9 text-slate-300" />
              <p className="mt-3 font-semibold text-slate-800">No fee structures found</p>
              <p className="mt-1 text-sm text-slate-500">Adjust the filters or create a schedule for an active class.</p>
            </td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm">
        <p className="text-slate-500">Showing {scheduleCountOnPage ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, totalScheduleCount)} of {totalScheduleCount} fee items</p>
        <div className="flex gap-2">
          {page > 1 && <Link href={pageHref(page - 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">Previous</Link>}
          {page < totalPages && <Link href={pageHref(page + 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">Next</Link>}
        </div>
      </div>
    </section>

    {selectedStructure && <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div>
            <h2 className="font-semibold text-slate-950">{classById.get(selectedStructure.classId)?.name ?? "Class"} — Fee Structure Details</h2>
            <p className="mt-1 text-sm text-slate-500">{campusById.get(selectedStructure.branchId) ?? "Campus"} · {yearById.get(selectedStructure.yearId) ?? "Academic year"}</p>
          </div>
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
            {selectedStructure.items.some((item) => item.status === "active") ? "Active" : "Archived"}
          </span>
        </div>
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-3">
          <div className="rounded-lg bg-blue-50 p-3"><p className="text-xs text-blue-700">Fee Items</p><p className="mt-1 text-xl font-bold text-blue-950">{selectedStructure.items.length}</p></div>
          <div className="rounded-lg bg-emerald-50 p-3"><p className="text-xs text-emerald-700">Compulsory Total</p><p className="mt-1 text-xl font-bold text-emerald-950">{formatMoney(selectedStructure.items.filter((item) => item.status === "active").reduce((sum, item) => sum + Number(item.amount), 0))}</p></div>
          <div className="rounded-lg bg-violet-50 p-3"><p className="text-xs text-violet-700">Optional Total</p><p className="mt-1 text-xl font-bold text-violet-950">{formatMoney(0)}</p></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead className="bg-slate-50 text-slate-700"><tr>
              {["Fee Item", "Amount", "Frequency", "Type", "Due Date", "Status"].map((heading) => <th key={heading} className="px-3 py-3 font-semibold">{heading}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {selectedStructure.items.map((item) => <tr key={item.id}>
                <td className="px-3 py-3 font-medium text-slate-900">{item.description}</td>
                <td className="px-3 py-3">{formatMoney(Number(item.amount))}</td>
                <td className="px-3 py-3">Once per academic year</td>
                <td className="px-3 py-3">Compulsory</td>
                <td className="px-3 py-3">{item.due_on ?? "Not set"}</td>
                <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 font-semibold ${item.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{item.status === "active" ? "Active" : "Archived"}</span></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>

      <aside className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="font-semibold text-slate-900">Quick Actions</h3>
        {selectedStructure.items.filter((item) => item.status === "active").map((item) => <div key={item.id} className="space-y-2 border-t border-slate-100 pt-3">
          {canCreate && <form action={applyEducationFeeSchedule}>
            <input type="hidden" name="schedule_id" value={item.id} />
            <input type="hidden" name="return_to" value="structures" />
            <button type="submit" className="w-full rounded-lg bg-blue-800 px-3 py-2 text-left text-sm font-semibold text-white hover:bg-blue-900">Post “{item.description}” to students</button>
          </form>}
          {canEdit && <details className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-slate-700"><Archive className="h-4 w-4" /> Archive fee item</summary>
            <form action={archiveEducationFeeSchedule} className="mt-3 space-y-2">
              <input type="hidden" name="schedule_id" value={item.id} />
              <input type="hidden" name="return_to" value="structures" />
              <label className="block text-xs font-medium text-slate-600">Reason
                <input required name="reason" minLength={3} maxLength={500} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
              </label>
              <button type="submit" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Confirm archive</button>
            </form>
          </details>}
        </div>)}
        <Link href={getProductAppPath("think-education", "/finance")} className="block rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-center text-sm font-semibold text-blue-800 hover:bg-blue-100">
          Open fee charges &amp; payments
        </Link>
        {!canPrepareStructure && canCreate && <p className="text-xs text-amber-800">Student directory and academic calendar view access is required to create schedules.</p>}
      </aside>
    </section>}
  </main>;
}
