import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { EDUCATION_DOCUMENT_CATEGORIES } from "@/lib/education/documents";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { archiveEducationDocument, purgeExpiredEducationDocument } from "../actions";

const CATEGORY_LABELS = Object.fromEntries(EDUCATION_DOCUMENT_CATEGORIES);
const MAX_RECORDS = 500;

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function EducationDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_documents", "documents", "library", "view")) {
    redirect("/dashboard?accessDenied=think-education.documents");
  }

  const params = await searchParams;
  const readParam = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
  const requestedBranch = readParam(params.branch);
  const requestedCategory = readParam(params.category);
  const requestedStatus = readParam(params.status);
  const requestedSearch = readParam(params.search).trim().toLowerCase();
  const [canCreate, canEdit, canDelete, canViewStudents, { campuses }] = await Promise.all([
    canTabPermission("education_documents", "documents", "library", "create"),
    canTabPermission("education_documents", "documents", "library", "edit"),
    canTabPermission("education_documents", "documents", "library", "delete"),
    canTabPermission("education_students", "students", "list", "view"),
    getAccessibleEducationCampuses(context.orgId, context.userId),
  ]);
  const campusIds = campuses.map((campus) => campus.id);
  const selectedBranch = campusIds.includes(requestedBranch) ? requestedBranch : "";
  const branchIds = selectedBranch ? [selectedBranch] : campusIds;
  const categoryFilter = (EDUCATION_DOCUMENT_CATEGORIES.some(([value]) => value === requestedCategory)
    ? requestedCategory
    : "") as typeof EDUCATION_DOCUMENT_CATEGORIES[number][0] | "";
  const statusFilter = (["active", "archived"].includes(requestedStatus)
    ? requestedStatus
    : "") as "active" | "archived" | "";
  const supabase = await createClient();
  const [documentsResult, studentsResult] = branchIds.length ? await Promise.all([
    (async () => {
      let query = supabase.from("education_documents")
        .select("id, branch_id, student_id, title, category, file_name, content_type, file_size, retention_until, status, created_at", { count: "exact" })
        .eq("org_id", context.orgId)
        .in("branch_id", branchIds)
        .order("created_at", { ascending: false })
        .limit(MAX_RECORDS);
      if (categoryFilter) query = query.eq("category", categoryFilter);
      if (statusFilter) query = query.eq("status", statusFilter);
      return query;
    })(),
    canCreate && canViewStudents
      ? supabase.from("education_students")
        .select("id, branch_id, student_number, first_name, last_name")
        .eq("org_id", context.orgId)
        .in("branch_id", campusIds)
        .eq("status", "active")
        .order("last_name")
        .limit(MAX_RECORDS)
      : Promise.resolve({ data: [], error: null }),
  ]) : [
    { data: [], count: 0, error: null },
    { data: [], error: null },
  ];
  if (documentsResult.error) throw new Error(`Could not load Think Education documents: ${documentsResult.error.message}`);
  if ((documentsResult.count ?? 0) > MAX_RECORDS) {
    throw new Error("More than 500 documents match this view. Filter to a campus or category to continue.");
  }
  if (studentsResult.error) throw new Error(`Could not load students for document classification: ${studentsResult.error.message}`);

  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const studentById = new Map((studentsResult.data ?? []).map((student) => [student.id, student]));
  const filteredDocuments = (documentsResult.data ?? []).filter((document) => {
    if (!requestedSearch) return true;
    const student = document.student_id ? studentById.get(document.student_id) : null;
    const documentText = `${document.title} ${document.file_name} ${student ? `${student.first_name} ${student.last_name} ${student.student_number}` : ""} ${CATEGORY_LABELS[document.category as keyof typeof CATEGORY_LABELS] ?? document.category}`.toLowerCase();
    return documentText.includes(requestedSearch);
  });
  const exportLimit = 5000;
  const exportRows = filteredDocuments.slice(0, exportLimit);
  const csvRows = [
    ["Title", "Campus", "Category", "Student", "File name", "Status", "Retention until", "Uploaded"],
    ...exportRows.map((document) => {
      const student = document.student_id ? studentById.get(document.student_id) : null;
      return [
        document.title,
        campusNameById.get(document.branch_id) ?? document.branch_id,
        CATEGORY_LABELS[document.category as keyof typeof CATEGORY_LABELS] ?? document.category,
        student ? `${student.first_name} ${student.last_name} (${student.student_number})` : "",
        document.file_name,
        document.status === "archived" ? "Archived" : document.retention_until && document.retention_until < new Date().toISOString().slice(0, 10) ? "Retention expired" : "Active",
        document.retention_until ?? "",
        new Date(document.created_at).toISOString(),
      ];
    }),
  ];
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(csvRows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"))}`;
  const today = new Date().toISOString().slice(0, 10);
  const errorMessage = params.error === "auth"
    ? "Sign in to manage Think Education documents."
    : params.error === "permission"
      ? "Your role does not allow that document action."
      : params.error === "campus"
        ? "Choose one of your assigned campuses."
        : params.error === "student"
          ? "Choose an active student at the selected campus."
          : params.error === "invalid"
            ? "Check the document details, file type, file size, and retention date."
            : params.error === "upload"
              ? "The file could not be uploaded. Check the file and try again."
              : params.error === "save"
                ? "The document record could not be saved."
                : params.error === "transition"
                  ? "This document has already been archived or cannot be changed."
                  : params.error === "retention"
                    ? "Only documents past their retention date can be permanently purged."
                    : params.error === "purge"
                      ? "The expired document could not be permanently removed. It remains inaccessible; retry or contact an administrator."
                      : params.error === "download"
                        ? "A secure download could not be prepared."
                        : params.error === "not-found"
                          ? "The document was not found or is no longer available."
                          : null;

  return <main className="mx-auto max-w-[1400px] space-y-5 p-4 md:p-6">
    <header>
      <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-950"><FileText className="h-6 w-6 text-blue-700" /> Documents &amp; Records</h1>
      <p className="mt-1 text-sm text-slate-600">Store private campus and student documents with expiring downloads and audited access.</p>
    </header>

    {params.uploaded === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Document uploaded securely.</p>}
    {params.archived === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Document archived. Its file remains retained and is no longer downloadable.</p>}
    {params.purged === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Expired document and file permanently removed.</p>}
    {params.error && errorMessage && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{errorMessage}</p>}

    {canCreate && <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-950">Upload a document</h2>
      <p className="mt-1 text-sm text-slate-500">Files are private, limited to 15 MB, and available only to authorized users at the selected campus.</p>
      {!campuses.length ? <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">You need an assigned Think Education campus before uploading documents.</p> : <form action="/api/education/documents" method="post" encType="multipart/form-data" className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">Campus
          <select required name="branch_id" defaultValue={selectedBranch || campuses[0]?.id || ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Category
          <select required name="category" defaultValue="student_record" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            {EDUCATION_DOCUMENT_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700 md:col-span-2">Document title
          <input required name="title" maxLength={160} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        {canViewStudents && <label className="text-sm font-medium text-slate-700 md:col-span-2">Student (optional)
          <select name="student_id" defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="">Institution or campus document</option>
            {(studentsResult.data ?? []).map((student) => <option key={student.id} value={student.id}>
              {student.last_name}, {student.first_name} · {student.student_number} · {campusNameById.get(student.branch_id) ?? "Campus"}
            </option>)}
          </select>
        </label>}
        <label className="text-sm font-medium text-slate-700">Retention until (optional)
          <input type="date" name="retention_until" min={today} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          <span className="mt-1 block text-xs font-normal text-slate-500">After this date, downloads are blocked. Users with delete permission can permanently purge expired files.</span>
        </label>
        <label className="text-sm font-medium text-slate-700">File (PDF, image, Word, or text; max 15 MB)
          <input required type="file" name="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.txt,application/pdf,image/jpeg,image/png,image/webp,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
        </label>
        <div className="md:col-span-2">
          <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">Upload securely</button>
        </div>
      </form>}
    </section>}

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 p-4">
        <div>
          <h2 className="font-semibold text-slate-950">Document library</h2>
          <p className="mt-1 text-sm text-slate-500">Only records for campuses you can access are listed.</p>
        </div>
        <form method="get" className="flex flex-wrap gap-2">
          <input name="search" defaultValue={requestedSearch} placeholder="Search title or student" aria-label="Search documents" className="min-w-[180px] rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <select name="branch" defaultValue={selectedBranch} aria-label="Filter by campus" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">All accessible campuses</option>
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
          <select name="category" defaultValue={categoryFilter} aria-label="Filter by category" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">All categories</option>
            {EDUCATION_DOCUMENT_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select name="status" defaultValue={statusFilter} aria-label="Filter by status" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
          <button type="submit" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">Apply filters</button>
          <Link href={getProductAppPath("think-education", "/documents")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Reset</Link>
          <a href={csvHref} download="education-documents.csv" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Export CSV</a>
        </form>
      </div>
      {filteredDocuments.length > exportLimit && <p className="px-4 pb-2 pt-3 text-xs text-amber-700">Showing the first {exportLimit.toLocaleString()} matching records in the CSV export. Narrow the filters to export the full result set.</p>}
      {!filteredDocuments.length ? <p className="p-6 text-sm text-slate-500">No documents match these filters.</p> : <ul className="divide-y divide-slate-100">
        {filteredDocuments.map((document) => {
          const expired = !!document.retention_until && document.retention_until < today;
          const student = document.student_id ? studentById.get(document.student_id) : null;
          const canPurge = canDelete && expired;
          const canDownload = document.status === "active" && !expired;
          return <li key={document.id} className="flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-slate-950">{document.title}</h3>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${document.status === "active" && !expired ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                  {document.status === "archived" ? "Archived" : expired ? "Retention expired" : "Active"}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {campusNameById.get(document.branch_id) ?? "Campus"} · {CATEGORY_LABELS[document.category as keyof typeof CATEGORY_LABELS] ?? document.category}
                {student && ` · ${student.first_name} ${student.last_name} (${student.student_number})`}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {document.file_name} · {formatFileSize(document.file_size)} · Uploaded {new Date(document.created_at).toLocaleDateString()}
                {document.retention_until && ` · Retention until ${document.retention_until}`}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {canDownload && <Link href={`/api/education/documents/${document.id}/download`} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-3 py-2 text-sm font-medium text-blue-800 hover:bg-blue-50">
                <Download className="h-4 w-4" /> Download
              </Link>}
              {document.status === "active" && canEdit && <form action={archiveEducationDocument}>
                <input type="hidden" name="document_id" value={document.id} />
                <button type="submit" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Archive</button>
              </form>}
              {canPurge && <form action={purgeExpiredEducationDocument}>
                <input type="hidden" name="document_id" value={document.id} />
                <button type="submit" className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">Permanently purge</button>
              </form>}
            </div>
          </li>;
        })}
      </ul>}
    </section>
  </main>;
}
