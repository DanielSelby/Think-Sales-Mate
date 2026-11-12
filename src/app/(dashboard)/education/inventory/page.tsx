import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Boxes, Package, TrendingDown } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import {
  adjustEducationInventoryStock,
  assignEducationAsset,
  createEducationAsset,
  createEducationInventoryItem,
  returnEducationAsset,
  setEducationAssetStatus,
} from "../actions";

const DATA_LIMIT = 1000;

const ASSET_STATUS_LABELS = {
  available: "Available",
  assigned: "Assigned",
  maintenance: "Maintenance",
  retired: "Retired",
} as const;

const ASSET_CONDITIONS = ["new", "good", "fair", "poor"] as const;

export default async function EducationInventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  const [canViewStock, canCreateStock, canEditStock, canViewAssets, canCreateAssets, canEditAssets, canViewStudents, canViewStaff, { campuses }] = await Promise.all([
    canTabPermission("education_inventory_assets", "inventory", "stock", "view"),
    canTabPermission("education_inventory_assets", "inventory", "stock", "create"),
    canTabPermission("education_inventory_assets", "inventory", "stock", "edit"),
    canTabPermission("education_inventory_assets", "inventory", "assets", "view"),
    canTabPermission("education_inventory_assets", "inventory", "assets", "create"),
    canTabPermission("education_inventory_assets", "inventory", "assets", "edit"),
    canTabPermission("education_students", "students", "list", "view"),
    canTabPermission("education_staff", "staff", "directory", "view"),
    getAccessibleEducationCampuses(context.orgId, context.userId),
  ]);
  if (!canViewStock && !canViewAssets) redirect("/dashboard?accessDenied=think-education.inventory");
  const params = await searchParams;
  const requestedBranch = typeof params.branch === "string" ? params.branch : "";
  const campusIds = campuses.map((campus) => campus.id);
  const selectedBranch = campusIds.includes(requestedBranch) ? requestedBranch : "";
  const branchIds = selectedBranch ? [selectedBranch] : campusIds;
  const supabase = await createClient();

  const [itemsResult, movementsResult, assetsResult, assignmentsResult] = branchIds.length ? await Promise.all([
    canViewStock
      ? supabase.from("education_inventory_items")
        .select("id, branch_id, sku, name, category, unit, quantity_on_hand, reorder_level, status", { count: "exact" })
        .eq("org_id", context.orgId).in("branch_id", branchIds).eq("status", "active")
        .order("name").range(0, DATA_LIMIT - 1)
      : Promise.resolve({ data: [], count: 0, error: null }),
    canViewStock
      ? supabase.from("education_inventory_movements")
        .select("id, branch_id, item_id, movement_type, quantity_change, quantity_after, reason, created_at", { count: "exact" })
        .eq("org_id", context.orgId).in("branch_id", branchIds)
        .order("created_at", { ascending: false }).limit(50)
      : Promise.resolve({ data: [], count: 0, error: null }),
    canViewAssets
      ? supabase.from("education_assets")
        .select("id, branch_id, asset_tag, name, category, serial_number, purchase_date, condition, status", { count: "exact" })
        .eq("org_id", context.orgId).in("branch_id", branchIds)
        .order("name").range(0, DATA_LIMIT - 1)
      : Promise.resolve({ data: [], count: 0, error: null }),
    canViewAssets
      ? supabase.from("education_asset_assignments")
        .select("id, branch_id, asset_id, student_id, staff_id, assigned_on", { count: "exact" })
        .eq("org_id", context.orgId).in("branch_id", branchIds).is("returned_on", null)
        .order("assigned_on", { ascending: false }).range(0, DATA_LIMIT - 1)
      : Promise.resolve({ data: [], count: 0, error: null }),
  ]) : [
    { data: [], count: 0, error: null },
    { data: [], count: 0, error: null },
    { data: [], count: 0, error: null },
    { data: [], count: 0, error: null },
  ];

  if (itemsResult.error) throw new Error(`Could not load campus stock: ${itemsResult.error.message}`);
  if (movementsResult.error) throw new Error(`Could not load stock movement history: ${movementsResult.error.message}`);
  if (assetsResult.error) throw new Error(`Could not load the asset register: ${assetsResult.error.message}`);
  if (assignmentsResult.error) throw new Error(`Could not load asset assignments: ${assignmentsResult.error.message}`);
  if ((itemsResult.count ?? 0) > DATA_LIMIT || (assetsResult.count ?? 0) > DATA_LIMIT
    || (assignmentsResult.count ?? 0) > DATA_LIMIT) {
    throw new Error("Inventory and asset results exceed 1,000 records. Filter to one campus to view the data.");
  }

  const items = itemsResult.data ?? [];
  const movements = movementsResult.data ?? [];
  const assets = assetsResult.data ?? [];
  const assignments = assignmentsResult.data ?? [];
  const studentIds = [...new Set(assignments.flatMap((assignment) => assignment.student_id ? [assignment.student_id] : []))];
  const staffIds = [...new Set(assignments.flatMap((assignment) => assignment.staff_id ? [assignment.staff_id] : []))];
  const [{ data: students, error: studentsError }, { data: staff, error: staffError }] = await Promise.all([
    studentIds.length && canViewStudents
      ? supabase.from("education_students").select("id, student_number, first_name, last_name")
        .eq("org_id", context.orgId).in("id", studentIds)
      : Promise.resolve({ data: [], error: null }),
    staffIds.length && canViewStaff
      ? supabase.from("education_staff").select("id, staff_number, first_name, last_name")
        .eq("org_id", context.orgId).in("id", staffIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (studentsError) throw new Error(`Could not load student asset assignees: ${studentsError.message}`);
  if (staffError) throw new Error(`Could not load staff asset assignees: ${staffError.message}`);

  const itemById = new Map(items.map((item) => [item.id, item]));
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const studentById = new Map((students ?? []).map((student) => [student.id, student]));
  const staffById = new Map((staff ?? []).map((member) => [member.id, member]));
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const assignmentByAssetId = new Map(assignments.map((assignment) => [assignment.asset_id, assignment]));
  const lowStockCount = items.filter((item) => item.quantity_on_hand <= item.reorder_level).length;
  const errorMessage = params.error === "invalid"
    ? "Enter valid item or asset details and quantities."
    : params.error === "duplicate-sku"
      ? "That stock SKU already exists at the selected campus."
      : params.error === "duplicate-asset"
        ? "That asset tag or serial number already exists at the selected campus."
        : params.error === "stock-transition"
          ? "This stock change is invalid, would make on-hand stock negative, or the item is archived."
          : params.error === "assignee"
            ? "No active student or staff member with that ID was found at this campus."
            : params.error === "asset-transition"
              ? "Only available assets can be assigned, and assigned assets must be returned before status changes."
              : params.error === "not-found"
                ? "The selected inventory or asset record could not be found."
                : params.error === "save"
                  ? "The inventory or asset update could not be saved. Please try again."
                  : null;

  return <main className="mx-auto max-w-[1400px] space-y-5 p-4 md:p-6">
    <header>
      <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-950">Inventory & Assets</h1>
      <p className="mt-1 text-sm text-slate-600">Track campus consumable stock and physical assets independently from shared ERP inventory.</p>
    </header>

    {params.stock === "created" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Inventory item added with an opening balance.</p>}
    {params.stock === "updated" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Stock movement recorded.</p>}
    {params.asset === "created" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Asset registered.</p>}
    {params.asset === "assigned" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Asset assignment recorded.</p>}
    {params.asset === "returned" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Asset return recorded.</p>}
    {params.asset === "updated" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Asset status and condition updated.</p>}
    {params.error && errorMessage && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{errorMessage}</p>}

    <form method="get" action={getProductAppPath("think-education", "/inventory")} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <label className="min-w-60 text-sm font-medium text-slate-700">Campus
        <select name="branch" defaultValue={selectedBranch} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
          <option value="">All assigned campuses</option>
          {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
        </select>
      </label>
      <button type="submit" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">Apply campus filter</button>
    </form>

    {canViewStock && <section className="space-y-5">
      {canCreateStock && <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-950">Add a stock item</h2>
        {!campuses.length ? <p className="mt-3 text-sm text-slate-500">You need an assigned campus before recording stock.</p> : <form action={createEducationInventoryItem} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-medium text-slate-700">Campus
            <select required name="branch_id" defaultValue={selectedBranch || campuses[0]?.id || ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
              {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">SKU
            <input required name="sku" maxLength={40} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-medium text-slate-700">Item name
            <input required name="name" maxLength={160} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-medium text-slate-700">Category
            <input required name="category" maxLength={80} placeholder="Stationery, cleaning..." className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-medium text-slate-700">Unit
            <input required name="unit" maxLength={24} placeholder="each, box, ream..." className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-medium text-slate-700">Opening quantity
            <input required name="initial_quantity" type="number" min="0" step="1" defaultValue="0" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-medium text-slate-700">Low-stock alert at
            <input required name="reorder_level" type="number" min="0" step="1" defaultValue="0" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <div className="flex items-end"><button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Add stock item</button></div>
        </form>}
      </section>}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-4">
          <Boxes className="h-5 w-5 text-blue-700" />
          <h2 className="font-semibold text-slate-950">Campus stock</h2>
          <span className="text-sm text-slate-500">{items.length} items</span>
          {lowStockCount > 0 && <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800"><TrendingDown className="h-3.5 w-3.5" /> {lowStockCount} at/below reorder level</span>}
        </div>
        {items.length ? <div className="divide-y divide-slate-100">
          {items.map((item) => <article key={item.id} className="space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950">{item.name} <span className="text-xs font-normal text-slate-500">({item.sku})</span></p>
                <p className="mt-1 text-sm text-slate-600">{item.category} · {campusNameById.get(item.branch_id)}</p>
              </div>
              <p className={`text-lg font-semibold ${item.quantity_on_hand <= item.reorder_level ? "text-amber-800" : "text-slate-950"}`}>
                {item.quantity_on_hand} {item.unit} <span className="text-xs font-normal text-slate-500">· reorder at {item.reorder_level}</span>
              </p>
            </div>
            {canEditStock && <form action={adjustEducationInventoryStock} className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-4">
              <input type="hidden" name="item_id" value={item.id} />
              <label className="text-xs font-medium text-slate-700">Movement
                <select name="movement_type" defaultValue="receipt" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal">
                  <option value="receipt">Receive stock (+)</option>
                  <option value="issue">Issue stock (-)</option>
                  <option value="adjustment">Adjustment (+/-)</option>
                </select>
              </label>
              <label className="text-xs font-medium text-slate-700">Quantity
                <input required name="quantity" type="number" step="1" min="-999999999" max="999999999" defaultValue="1" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal" />
              </label>
              <label className="text-xs font-medium text-slate-700">Reason
                <input required name="reason" maxLength={300} placeholder="Delivery, classroom issue, count correction..." className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal" />
              </label>
              <div className="flex items-end"><button type="submit" className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-50">Record movement</button></div>
            </form>}
          </article>)}
        </div> : <p className="p-6 text-center text-sm text-slate-500">No stock items have been added to the selected campuses.</p>}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4">
          <h2 className="font-semibold text-slate-950">Recent stock movements</h2>
          <p className="mt-1 text-sm text-slate-500">Latest 50 campus stock receipts, issues, and adjustments.</p>
        </div>
        {movements.length ? <div className="divide-y divide-slate-100">
          {movements.map((movement) => {
            const item = itemById.get(movement.item_id);
            return <article key={movement.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium text-slate-950">{item?.name ?? "Inventory item"} · {movement.movement_type}</p>
                <p className="mt-1 text-sm text-slate-500">{campusNameById.get(movement.branch_id)} · {movement.reason} · {new Date(movement.created_at).toLocaleString()}</p>
              </div>
              <p className="text-sm font-semibold text-slate-800">{movement.quantity_change > 0 ? "+" : ""}{movement.quantity_change} · balance {movement.quantity_after} {item?.unit ?? ""}</p>
            </article>;
          })}
        </div> : <p className="p-6 text-center text-sm text-slate-500">No stock movements have been recorded.</p>}
      </section>
    </section>}

    {canViewAssets && <section className="space-y-5">
      {canCreateAssets && <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-950">Register an asset</h2>
        {!campuses.length ? <p className="mt-3 text-sm text-slate-500">You need an assigned campus before registering assets.</p> : <form action={createEducationAsset} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-medium text-slate-700">Campus
            <select required name="branch_id" defaultValue={selectedBranch || campuses[0]?.id || ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
              {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">Asset tag
            <input required name="asset_tag" maxLength={40} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-medium text-slate-700">Asset name
            <input required name="name" maxLength={160} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-medium text-slate-700">Category
            <input required name="category" maxLength={80} placeholder="Computer, furniture, lab equipment..." className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-medium text-slate-700">Serial number (optional)
            <input name="serial_number" maxLength={100} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-medium text-slate-700">Purchase date
            <input name="purchase_date" type="date" max={new Date().toISOString().slice(0, 10)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="text-sm font-medium text-slate-700">Condition
            <select name="condition" defaultValue="good" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
              {ASSET_CONDITIONS.map((condition) => <option key={condition} value={condition}>{condition}</option>)}
            </select>
          </label>
          <div className="flex items-end"><button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Register asset</button></div>
        </form>}
      </section>}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 p-4">
          <Package className="h-5 w-5 text-blue-700" />
          <h2 className="font-semibold text-slate-950">Asset register</h2>
          <span className="text-sm text-slate-500">{assets.length} assets</span>
        </div>
        {assets.length ? <div className="divide-y divide-slate-100">
          {assets.map((asset) => {
            const assignment = assignmentByAssetId.get(asset.id);
            const assignedStudent = assignment?.student_id ? studentById.get(assignment.student_id) : null;
            const assignedStaff = assignment?.staff_id ? staffById.get(assignment.staff_id) : null;
            const assignee = assignedStudent
              ? `${assignedStudent.first_name} ${assignedStudent.last_name} · ${assignedStudent.student_number}`
              : assignedStaff ? `${assignedStaff.first_name} ${assignedStaff.last_name} · ${assignedStaff.staff_number}`
                : assignment ? "Assignee details restricted" : "";
            return <article key={asset.id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">{asset.name} <span className="text-xs font-normal text-slate-500">({asset.asset_tag})</span></p>
                  <p className="mt-1 text-sm text-slate-600">{asset.category} · {campusNameById.get(asset.branch_id)} · {asset.condition}{asset.serial_number ? ` · SN ${asset.serial_number}` : ""}{asset.purchase_date ? ` · Purchased ${asset.purchase_date}` : ""}</p>
                  {assignee && <p className="mt-1 text-sm text-slate-500">Assigned to {assignee} · Since {assignment?.assigned_on}</p>}
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${asset.status === "available" ? "bg-emerald-50 text-emerald-700" : asset.status === "assigned" ? "bg-blue-50 text-blue-700" : asset.status === "maintenance" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{ASSET_STATUS_LABELS[asset.status]}</span>
              </div>
              {canEditAssets && asset.status === "available" && <div className="grid gap-3 sm:grid-cols-2">
                {(canViewStudents || canViewStaff) && <form action={assignEducationAsset} className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-3">
                  <input type="hidden" name="asset_id" value={asset.id} />
                  <label className="text-xs font-medium text-slate-700">Assign to
                    <select name="assignee_type" defaultValue={canViewStudents ? "student" : "staff"} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal">
                      {canViewStudents && <option value="student">Student</option>}
                      {canViewStaff && <option value="staff">Staff</option>}
                    </select>
                  </label>
                  <label className="text-xs font-medium text-slate-700">Student/staff number
                    <input required name="assignee_number" maxLength={80} autoComplete="off" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal" />
                  </label>
                  <div className="flex items-end"><button type="submit" className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-50">Assign asset</button></div>
                </form>}
                <form action={setEducationAssetStatus} className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-3">
                  <input type="hidden" name="asset_id" value={asset.id} />
                  <label className="text-xs font-medium text-slate-700">Status
                    <select name="status" defaultValue="maintenance" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal">
                      <option value="maintenance">Maintenance</option>
                      <option value="retired">Retired</option>
                    </select>
                  </label>
                  <label className="text-xs font-medium text-slate-700">Condition
                    <select name="condition" defaultValue={asset.condition} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal">
                      {ASSET_CONDITIONS.map((condition) => <option key={condition} value={condition}>{condition}</option>)}
                    </select>
                  </label>
                  <div className="flex items-end"><button type="submit" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Update asset</button></div>
                </form>
              </div>}
              {canEditAssets && asset.status === "maintenance" && <form action={setEducationAssetStatus} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="asset_id" value={asset.id} />
                <input type="hidden" name="status" value="available" />
                <label className="text-xs font-medium text-slate-700">Mark available with condition
                  <select name="condition" defaultValue={asset.condition} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal">
                    {ASSET_CONDITIONS.map((condition) => <option key={condition} value={condition}>{condition}</option>)}
                  </select>
                </label>
                <button type="submit" className="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50">Complete maintenance</button>
              </form>}
              {canEditAssets && asset.status === "assigned" && assignment && <form action={returnEducationAsset}>
                <input type="hidden" name="assignment_id" value={assignment.id} />
                <button type="submit" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Return asset</button>
              </form>}
            </article>;
          })}
        </div> : <p className="p-6 text-center text-sm text-slate-500">No assets have been registered at the selected campuses.</p>}
      </section>
    </section>}
  </main>;
}
