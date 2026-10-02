"use client";

import Link from "next/link";
import * as XLSX from "xlsx";
import {
  ArrowDownToLine, ArrowUpFromLine, Check, ChevronLeft, ChevronRight,
  Eye, FileSpreadsheet, FileText, FolderTree, Layers3, Pencil, Plus, Search, Tag,
  ToggleLeft, ToggleRight, Trash2, X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createProductCategory, deleteProductCategory, importProductCategories,
  setProductCategoryStatus, updateProductCategory, type ProductCategoryInput,
} from "@/app/(dashboard)/inventory/categories/actions";

export interface CategoryProductUsage {
  id: string;
  name: string;
  sku: string;
  stock: number;
  stockValue: number;
}

export interface ProductCategoryRow {
  id: string;
  name: string;
  code: string;
  description: string | null;
  status: "active" | "inactive";
  icon: string | null;
  color: string | null;
  parentId: string | null;
  parentName: string | null;
  displayOrder: number;
  createdBy: string | null;
  createdByName: string;
  createdAt: string;
  productCount: number;
  totalQuantity: number;
  stockValue: number;
  salesValue: number;
  lastSaleDate: string | null;
  products: CategoryProductUsage[];
}

interface CategoryInputState {
  name: string;
  code: string;
  description: string;
  status: "active" | "inactive";
  icon: string;
  color: string;
  parentId: string;
  displayOrder: string;
}

const blankForm: CategoryInputState = {
  name: "", code: "", description: "", status: "active", icon: "", color: "#2563eb", parentId: "", displayOrder: "0",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
}

export function ProductCategoriesManager({
  categories,
  kpis,
  permissions,
  currency,
}: {
  categories: ProductCategoryRow[];
  kpis: { total: number; active: number; inactive: number; productsAssigned: number; uncategorized: number };
  permissions: { create: boolean; edit: boolean; delete: boolean; import: boolean; export: boolean };
  currency: string;
}) {
  const router = useRouter();
  const importRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createdDateFilter, setCreatedDateFilter] = useState("all");
  const [creatorFilter, setCreatorFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [editing, setEditing] = useState<ProductCategoryRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CategoryInputState>(blankForm);
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<ProductCategoryRow | null>(null);
  const [deleting, setDeleting] = useState<ProductCategoryRow | null>(null);
  const [moveTarget, setMoveTarget] = useState("");
  const [importing, setImporting] = useState(false);

  function notify(text: string, error = false) {
    setNotice({ text, error });
    window.setTimeout(() => setNotice(null), 5000);
  }

  const creators = useMemo(() => Array.from(new Set(categories.map((category) => category.createdByName).filter((name) => name !== "—"))).sort(), [categories]);
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    const now = new Date();
    return categories.filter((category) => {
      if (statusFilter !== "all" && category.status !== statusFilter) return false;
      if (creatorFilter !== "all" && category.createdByName !== creatorFilter) return false;
      if (productFilter === "assigned" && category.productCount === 0) return false;
      if (productFilter === "empty" && category.productCount !== 0) return false;
      if (createdDateFilter !== "all") {
        const createdAt = new Date(category.createdAt);
        if (createdDateFilter === "month" && (createdAt.getMonth() !== now.getMonth() || createdAt.getFullYear() !== now.getFullYear())) return false;
        if (createdDateFilter === "year" && createdAt.getFullYear() !== now.getFullYear()) return false;
      }
      return !search
        || `${category.name} ${category.code} ${category.description ?? ""} ${category.parentName ?? ""}`.toLocaleLowerCase().includes(search);
    });
  }, [categories, query, statusFilter, createdDateFilter, creatorFilter, productFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visiblePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((visiblePage - 1) * pageSize, visiblePage * pageSize);
  const categoryCodeSuggestion = `CAT-${String(Math.max(0, ...categories.map((item) => Number(item.code.match(/^CAT-(\d+)$/i)?.[1] ?? 0))) + 1).padStart(3, "0")}`;

  function openCreate() {
    setEditing(null);
    setForm({ ...blankForm, code: categoryCodeSuggestion });
    setFormOpen(true);
  }

  function openEdit(category: ProductCategoryRow) {
    setEditing(category);
    setFormOpen(true);
    setForm({
      name: category.name,
      code: category.code,
      description: category.description ?? "",
      status: category.status,
      icon: category.icon ?? "",
      color: category.color ?? "#2563eb",
      parentId: category.parentId ?? "",
      displayOrder: String(category.displayOrder),
    });
  }

  async function saveCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const input: ProductCategoryInput = {
      name: form.name,
      code: form.code,
      description: form.description || null,
      status: form.status,
      icon: form.icon || null,
      color: form.color || null,
      parentId: form.parentId || null,
      displayOrder: Number(form.displayOrder) || 0,
    };
    const result = editing
      ? await updateProductCategory(editing.id, input)
      : await createProductCategory(input);
    setSaving(false);
    if (!result.ok) {
      notify(result.error ?? "Could not save category.", true);
      router.refresh();
      return;
    }
    setFormOpen(false);
    setEditing(null);
    setNotice({ text: editing ? "Category updated." : "Category created." });
    router.refresh();
  }

  async function toggleStatus(category: ProductCategoryRow) {
    const nextStatus = category.status === "active" ? "inactive" : "active";
    const result = await setProductCategoryStatus(category.id, nextStatus);
    if (!result.ok) {
      notify(result.error ?? "Could not update category status.", true);
      router.refresh();
      return;
    }
    notify(`${category.name} ${nextStatus === "active" ? "activated" : "deactivated"}.`);
    router.refresh();
  }

  async function confirmDelete() {
    if (!deleting) return;
    const result = await deleteProductCategory(deleting.id, deleting.productCount > 0 ? moveTarget : undefined);
    if (!result.ok) {
      notify(result.error ?? "Could not delete category.", true);
      router.refresh();
      return;
    }
    notify(`${deleting.name} deleted.`);
    setDeleting(null);
    setMoveTarget("");
    router.refresh();
  }

  function exportCategories(format: "csv" | "xlsx") {
    const data = filtered.map((category) => ({
      "Category Name": category.name,
      "Category Code": category.code,
      Description: category.description ?? "",
      "Parent Category": category.parentName ?? "",
      Products: category.productCount,
      "Created By": category.createdByName,
      "Created Date": formatDate(category.createdAt),
      Status: category.status,
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data), "Product Categories");
    XLSX.writeFile(workbook, `product-categories-${new Date().toISOString().slice(0, 10)}.${format}`);
  }

  function exportPdf() {
    window.print();
  }

  function downloadTemplate() {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Category Name", "Description", "Parent Category", "Status"],
      ["Electronics", "Electronic products", "", "Active"],
      ["Phones", "Mobile phones", "Electronics", "Active"],
    ]), "Categories");
    XLSX.writeFile(workbook, "product-categories-template.xlsx");
  }

  async function handleImportFile(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
      const rows = records.map((record) => {
        const normalized = new Map(Object.entries(record).map(([key, value]) => [key.trim().toLowerCase(), String(value ?? "").trim()]));
        return {
          name: normalized.get("category name") ?? normalized.get("name") ?? "",
          description: normalized.get("description") ?? "",
          parentName: normalized.get("parent category") ?? normalized.get("parent") ?? "",
          status: normalized.get("status") ?? "active",
        };
      });
      if (rows.some((row) => !row.name)) {
        notify("The import file has a row with no Category Name.", true);
      } else {
        const result = await importProductCategories(rows);
        if (!result.ok) {
          notify(result.error ?? "Could not import categories.", true);
          router.refresh();
        }
        else {
          notify(`${rows.length} category row(s) processed.`);
          router.refresh();
        }
      }
    } catch (error) {
      notify(error instanceof Error ? `Could not read import file: ${error.message}` : "Could not read import file.", true);
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = "";
    }
  }

  function clearFilters() {
    setQuery("");
    setStatusFilter("all");
    setCreatedDateFilter("all");
    setCreatorFilter("all");
    setProductFilter("all");
    setPage(1);
  }

  const selectClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-blue-500 dark:border-ledger-700 dark:bg-ink-900 dark:text-white";

  return (
    <main className="product-categories-page mx-auto max-w-[1680px] space-y-4 pb-10">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#dce8f2] bg-white p-4 shadow-sm dark:border-ledger-700 dark:bg-ink-900">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--theme-primary)] text-white"><Tag className="h-5 w-5" /></span>
          <div>
            <div className="mb-1 text-[11px] font-medium text-slate-500"><Link href="/inventory" className="hover:underline">Inventory</Link><span className="mx-1.5">›</span><span className="text-[var(--theme-primary)]">Product Categories</span></div>
            <h1 className="text-xl font-bold text-[#12345a] dark:text-white">Product Categories</h1>
            <p className="text-xs text-slate-500">Manage the categories used to organize your products.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {permissions.import && <><button type="button" disabled={importing} onClick={() => importRef.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-ledger-700 dark:bg-ink-900 dark:text-white"><ArrowUpFromLine className="h-4 w-4" />{importing ? "Importing…" : "Import Categories"}</button><button type="button" onClick={downloadTemplate} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-ledger-700 dark:bg-ink-900 dark:text-white">Import Template</button></>}
          {permissions.export && <details className="relative"><summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-ledger-700 dark:bg-ink-900 dark:text-white"><ArrowDownToLine className="h-4 w-4" />Export Categories</summary><div className="absolute right-0 z-20 mt-1 w-40 rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-ledger-700 dark:bg-ink-900"><button type="button" onClick={() => exportCategories("xlsx")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-white/5"><FileSpreadsheet className="h-4 w-4" />Excel</button><button type="button" onClick={() => exportCategories("csv")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-white/5"><FileText className="h-4 w-4" />CSV</button><button type="button" onClick={exportPdf} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-white/5"><FileText className="h-4 w-4" />Print / PDF</button></div></details>}
          {permissions.create && <button type="button" onClick={openCreate} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--theme-primary)] px-4 text-xs font-semibold text-white shadow-sm hover:brightness-105"><Plus className="h-4 w-4" />Add Category</button>}
          <input ref={importRef} type="file" accept=".csv,.xls,.xlsx" className="hidden" onChange={(event) => void handleImportFile(event.target.files?.[0])} />
        </div>
      </header>

      {notice && <div role="status" className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${notice.error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{notice.text}<button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notification"><X className="h-4 w-4" /></button></div>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi icon={<Layers3 />} label="Total Categories" value={kpis.total} tone="blue" />
        <Kpi icon={<Check />} label="Active Categories" value={kpis.active} tone="green" />
        <Kpi icon={<ToggleLeft />} label="Inactive Categories" value={kpis.inactive} tone="red" />
        <Kpi icon={<FolderTree />} label="Products Assigned" value={kpis.productsAssigned} tone="purple" />
        <Kpi icon={<Tag />} label="Uncategorized Products" value={kpis.uncategorized} tone="amber" />
      </section>

      <section className="product-category-filters grid gap-3 rounded-2xl border border-[#dce8f2] bg-white p-3 shadow-sm dark:border-ledger-700 dark:bg-ink-900 md:grid-cols-2 xl:grid-cols-7">
        <label className="relative text-[10px] font-semibold text-slate-500 xl:col-span-2"><span className="sr-only">Search Category</span><Search className="absolute left-3 top-[13px] h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search categories..." className={`product-category-search ${selectClass} pl-9`} /></label>
        <label className="text-[10px] font-semibold text-slate-500">Status<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} className={selectClass}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
        <label className="text-[10px] font-semibold text-slate-500">Created Date<select value={createdDateFilter} onChange={(event) => { setCreatedDateFilter(event.target.value); setPage(1); }} className={selectClass}><option value="all">All dates</option><option value="month">This month</option><option value="year">This year</option></select></label>
        <label className="text-[10px] font-semibold text-slate-500">Created By<select value={creatorFilter} onChange={(event) => { setCreatorFilter(event.target.value); setPage(1); }} className={selectClass}><option value="all">All users</option>{creators.map((creator) => <option key={creator} value={creator}>{creator}</option>)}</select></label>
        <label className="text-[10px] font-semibold text-slate-500">Products<select value={productFilter} onChange={(event) => { setProductFilter(event.target.value); setPage(1); }} className={selectClass}><option value="all">All products</option><option value="assigned">Has products</option><option value="empty">No products</option></select></label>
        <button type="button" onClick={clearFilters} className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-ledger-700 dark:text-ledger-200 dark:hover:bg-white/5"><X className="h-3.5 w-3.5" />Clear Filters</button>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#dce8f2] bg-white shadow-sm dark:border-ledger-700 dark:bg-ink-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-ledger-700">
          <div><h2 className="font-bold text-[#12345a] dark:text-white">Product Categories</h2><p className="text-[11px] text-slate-500">Manage category details and product assignments.</p></div>
          <span className="text-[11px] text-slate-500">Showing {pageRows.length ? (visiblePage - 1) * pageSize + 1 : 0}–{Math.min(visiblePage * pageSize, filtered.length)} of {filtered.length} categories</span>
        </div>
        <div className="overflow-x-auto">
          <table className="product-category-grid w-full min-w-[1100px] text-left text-xs">
            <thead className="bg-[#f2f7fc] text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:bg-ink-950 dark:text-ledger-400"><tr>
              <th className="px-4 py-3">Category Name</th><th className="px-4 py-3">Category Code</th><th className="px-4 py-3">Description</th><th className="px-4 py-3">Parent Category</th><th className="px-4 py-3 text-center">Products</th><th className="px-4 py-3">Created By</th><th className="px-4 py-3">Created Date</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-ledger-700">
              {pageRows.map((category) => <tr key={category.id} className="hover:bg-blue-50/40 dark:hover:bg-white/[0.025]">
                <td className="px-4 py-3"><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg text-white" style={{ backgroundColor: category.color || "var(--theme-primary)" }}><Tag className="h-3.5 w-3.5" /></span><span className="font-semibold text-[#12345a] dark:text-white">{category.name}</span></div></td>
                <td className="px-4 py-3 font-mono text-slate-600 dark:text-ledger-300">{category.code}</td>
                <td className="max-w-[220px] truncate px-4 py-3 text-slate-500" title={category.description ?? ""}>{category.description || "—"}</td>
                <td className="px-4 py-3 text-slate-500">{category.parentName ?? "—"}</td>
                <td className="px-4 py-3 text-center font-semibold">{category.productCount}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-ledger-300">{category.createdByName}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDate(category.createdAt)}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${category.status === "active" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{category.status === "active" ? "Active" : "Inactive"}</span></td>
                <td className="px-4 py-3"><div className="flex justify-end gap-1">
                  <IconButton label={`View ${category.name}`} onClick={() => setViewing(category)}><Eye /></IconButton>
                  {permissions.edit && <IconButton label={`Edit ${category.name}`} onClick={() => openEdit(category)}><Pencil /></IconButton>}
                  {permissions.edit && <IconButton label={`${category.status === "active" ? "Deactivate" : "Activate"} ${category.name}`} onClick={() => void toggleStatus(category)}>{category.status === "active" ? <ToggleRight className="text-emerald-600" /> : <ToggleLeft />}</IconButton>}
                  {permissions.delete && <IconButton label={`Delete ${category.name}`} onClick={() => { setDeleting(category); setMoveTarget(""); }}><Trash2 className="text-rose-600" /></IconButton>}
                </div></td>
              </tr>)}
              {pageRows.length === 0 && <tr><td colSpan={9} className="px-4 py-14 text-center text-slate-500">No product categories match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs dark:border-ledger-700">
          <label className="flex items-center gap-2 text-slate-500">Rows per page<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="h-8 rounded-md border border-slate-200 bg-white px-2 dark:border-ledger-700 dark:bg-ink-950"><option>10</option><option>25</option><option>50</option></select></label>
          <div className="flex items-center gap-1"><button type="button" aria-label="Previous page" disabled={visiblePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-md border border-slate-200 p-1.5 disabled:opacity-40 dark:border-ledger-700"><ChevronLeft className="h-4 w-4" /></button><span className="px-2">{visiblePage} / {totalPages}</span><button type="button" aria-label="Next page" disabled={visiblePage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="rounded-md border border-slate-200 p-1.5 disabled:opacity-40 dark:border-ledger-700"><ChevronRight className="h-4 w-4" /></button></div>
        </div>
      </section>

      {formOpen && (
        <Modal title={editing ? "Edit Product Category" : "Add Product Category"} onClose={() => setFormOpen(false)} light>
          <form onSubmit={(event) => void saveCategory(event)} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Category Name"><input required autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={selectClass} placeholder="e.g. Electronics" /></Field>
              <Field label="Category Code"><input required value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} className={selectClass} placeholder="CAT-001" /></Field>
            </div>
            <Field label="Description"><textarea rows={2} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={`${selectClass} h-auto py-2`} placeholder="Optional category description" /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Parent Category"><select value={form.parentId} onChange={(event) => setForm({ ...form, parentId: event.target.value })} className={selectClass}><option value="">None (top-level)</option>{categories.filter((category) => category.id !== editing?.id).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
              <Field label="Status"><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as "active" | "inactive" })} className={selectClass}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Category Icon (optional)"><input value={form.icon} onChange={(event) => setForm({ ...form, icon: event.target.value })} className={selectClass} placeholder="Icon key, e.g. package" /></Field>
              <Field label="Color Tag (optional)"><div className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-2"><input type="color" value={form.color || "#2563eb"} onChange={(event) => setForm({ ...form, color: event.target.value })} className="h-7 w-8 border-0 bg-transparent" /><input value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} className="min-w-0 flex-1 bg-transparent text-xs text-slate-700" /></div></Field>
            </div>
            <Field label="Display Order"><input type="number" value={form.displayOrder} onChange={(event) => setForm({ ...form, displayOrder: event.target.value })} className={selectClass} /></Field>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-ledger-700"><button type="button" onClick={() => setFormOpen(false)} className="h-9 rounded-lg border border-slate-200 px-4 text-xs font-semibold dark:border-ledger-700">Cancel</button><button type="submit" disabled={saving} className="h-9 rounded-lg bg-[var(--theme-primary)] px-4 text-xs font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : editing ? "Save Changes" : "Create Category"}</button></div>
          </form>
        </Modal>
      )}

      {viewing && <Modal title={viewing.name} onClose={() => setViewing(null)}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat label="Products" value={viewing.productCount} /><Stat label="Total Quantity" value={viewing.totalQuantity} /><Stat label="Stock Value" value={formatMoney(viewing.stockValue, currency)} /><Stat label="Sales Value" value={formatMoney(viewing.salesValue, currency)} /></div>
        <div className="mt-4 flex flex-wrap justify-between gap-2 text-xs text-slate-500"><span>Category Code: <b className="font-mono text-slate-700 dark:text-white">{viewing.code}</b></span><span>Last Sale: <b className="text-slate-700 dark:text-white">{formatDate(viewing.lastSaleDate)}</b></span></div>
        <h3 className="mt-5 border-b border-slate-100 pb-2 text-sm font-bold text-[#12345a] dark:border-ledger-700 dark:text-white">Products Using This Category</h3>
        <div className="mt-2 max-h-72 overflow-auto"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-50 dark:bg-ink-950"><tr><th className="p-2">Product</th><th className="p-2">SKU</th><th className="p-2 text-right">Stock</th><th className="p-2 text-right">Stock Value</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-ledger-700">{viewing.products.map((product) => <tr key={product.id}><td className="p-2"><Link href={`/inventory/${product.id}`} className="font-semibold text-blue-700 hover:underline dark:text-blue-300">{product.name}</Link></td><td className="p-2 font-mono text-slate-500">{product.sku}</td><td className="p-2 text-right">{product.stock}</td><td className="p-2 text-right">{formatMoney(product.stockValue, currency)}</td></tr>)}{viewing.products.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-slate-500">No products are assigned to this category.</td></tr>}</tbody></table></div>
      </Modal>}

      {deleting && <Modal title="Delete Product Category" onClose={() => setDeleting(null)}>
        <p className="text-sm text-slate-600 dark:text-ledger-300">{deleting.productCount > 0 ? `This category is assigned to ${deleting.productCount} products. Choose another active category to move those products to before deletion.` : `Delete “${deleting.name}”? This category has no assigned products.`}</p>
        {deleting.productCount > 0 && <Field label="Move Products To"><select value={moveTarget} onChange={(event) => setMoveTarget(event.target.value)} className={selectClass}><option value="">Select destination category</option>{categories.filter((category) => category.id !== deleting.id && category.status === "active").map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>}
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setDeleting(null)} className="h-9 rounded-lg border border-slate-200 px-4 text-xs font-semibold dark:border-ledger-700">Cancel</button><button type="button" disabled={deleting.productCount > 0 && !moveTarget} onClick={() => void confirmDelete()} className="h-9 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white disabled:opacity-50">{deleting.productCount > 0 ? "Move Products & Delete" : "Delete Category"}</button></div>
      </Modal>}
    </main>
  );
}

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "blue" | "green" | "red" | "purple" | "amber" }) {
  const colors = {
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300",
    green: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300",
    red: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300",
    purple: "bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-300",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300",
  };
  return <div className="rounded-2xl border border-[#e5edf5] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-ledger-700 dark:bg-ink-900"><div className="flex items-center gap-3"><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${colors[tone]}`}>{icon}</span><div><p className="text-[11px] font-medium text-slate-500">{label}</p><p className="text-xl font-bold text-[#12345a] dark:text-white">{value.toLocaleString()}</p></div></div></div>;
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" title={label} aria-label={label} onClick={onClick} className="rounded-md border border-slate-200 p-1 text-[var(--theme-primary)] hover:bg-slate-50 [&_svg]:h-3.5 [&_svg]:w-3.5 dark:border-ledger-700 dark:hover:bg-white/5">{children}</button>;
}

function Modal({ title, onClose, children, light = false }: { title: string; onClose: () => void; children: React.ReactNode; light?: boolean }) {
  return <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-label={title} className={`my-8 w-full max-w-2xl rounded-2xl border p-5 shadow-2xl ${light ? "border-slate-200 bg-white" : "border-slate-200 bg-white dark:border-ledger-700 dark:bg-ink-900"}`}><header className={`mb-4 flex items-center justify-between border-b pb-3 ${light ? "border-slate-100" : "border-slate-100 dark:border-ledger-700"}`}><h2 className={`text-base font-bold ${light ? "text-[#12345a]" : "text-[#12345a] dark:text-white"}`}>{title}</h2><button type="button" aria-label="Close dialog" onClick={onClose} className={`rounded-lg p-1 text-slate-500 ${light ? "hover:bg-slate-100" : "hover:bg-slate-100 dark:hover:bg-white/5"}`}><X className="h-4 w-4" /></button></header>{children}</section></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5 text-xs font-semibold text-slate-600 dark:text-ledger-300">{label}{children}</label>;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-ledger-700 dark:bg-ink-950"><p className="text-[10px] text-slate-500">{label}</p><p className="mt-1 text-sm font-bold text-[#12345a] dark:text-white">{value}</p></div>;
}
