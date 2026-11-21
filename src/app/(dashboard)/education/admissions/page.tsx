import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ClipboardList, Plus, Search, UserPlus } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { recordEducationAdmissionOffer, reviewEducationAdmissionDocument, updateEducationAdmissionStatus } from "../actions";
import { EducationSubmitButton } from "../submit-button";

const ADMISSION_STATUSES = ["pending", "under_review", "admitted", "rejected", "enrolled", "withdrawn"] as const;

export default async function EducationAdmissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_admissions", "admissions", "applications", "view")) {
    redirect("/dashboard?accessDenied=think-education.admissions");
  }

  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const defaultOfferExpiry = new Date(`${today}T00:00:00.000Z`);
  defaultOfferExpiry.setUTCDate(defaultOfferExpiry.getUTCDate() + 30);
  const maximumOfferExpiry = new Date(`${today}T00:00:00.000Z`);
  maximumOfferExpiry.setUTCDate(maximumOfferExpiry.getUTCDate() + 365);
  const requestedBranch = typeof params.branch === "string" ? params.branch : "";
  const requestedStatus = typeof params.status === "string" ? params.status : "";
  const requestedSearch = typeof params.search === "string" ? params.search.trim().slice(0, 80) : "";
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  const selectedBranch = campusIds.includes(requestedBranch) ? requestedBranch : "";
  const selectedStatus: (typeof ADMISSION_STATUSES)[number] | "" = ADMISSION_STATUSES.includes(requestedStatus as (typeof ADMISSION_STATUSES)[number])
    ? (requestedStatus as (typeof ADMISSION_STATUSES)[number])
    : "";
  const branchIds = selectedBranch ? [selectedBranch] : campusIds;
  const [canCreate, canEdit, canApproveAction, canCreateStudent, canViewClasses, canCreateGuardian, canExport, canViewAdmissionDocuments, canCreateAdmissionDocuments] = await Promise.all([
    canTabPermission("education_admissions", "admissions", "applications", "create"),
    canTabPermission("education_admissions", "admissions", "applications", "edit"),
    canTabPermission("education_admissions", "admissions", "applications", "approve"),
    canTabPermission("education_students", "students", "list", "create"),
    canTabPermission("education_academics", "academics", "classes", "view"),
    canTabPermission("education_guardians", "guardians", "directory", "create"),
    canTabPermission("education_admissions", "admissions", "applications", "export"),
    canTabPermission("education_documents", "documents", "library", "view"),
    canTabPermission("education_documents", "documents", "library", "create"),
  ]);
  const canApprove = canEdit && canApproveAction;
  const canEnroll = canApprove && canCreateStudent && canViewClasses;
  const supabase = await createClient();
  let admissions: Array<{
    id: string;
    branch_id: string;
    application_number: string;
    applicant_first_name: string;
    applicant_last_name: string;
    applicant_other_names: string | null;
    applicant_email: string | null;
    applicant_phone: string | null;
    applicant_date_of_birth: string | null;
    applicant_gender: string | null;
    applicant_address: string | null;
    guardian_first_name: string | null;
    guardian_last_name: string | null;
    guardian_email: string | null;
    guardian_phone: string | null;
    guardian_relationship: string | null;
    requested_class_id: string | null;
    decision_note: string | null;
    enrolled_student_id: string | null;
    status: string;
    applied_at: string;
  }> = [];
  let classes: Array<{
    id: string;
    branch_id: string;
    academic_year_id: string;
    name: string;
    level_name: string | null;
    stream_name: string | null;
    capacity: number | null;
  }> = [];
  let offers: Array<{
    id: string;
    admission_id: string;
    offer_number: number;
    expires_on: string;
    terms: string;
    status: "offered" | "accepted" | "declined" | "expired" | "withdrawn";
    issued_at: string;
  }> = [];
  let admissionDocuments: Array<{
    id: string;
    admission_id: string;
    branch_id: string;
    title: string;
    file_name: string;
    file_size: number;
    status: "active" | "archived";
    retention_until: string | null;
    verification_status: "not_required" | "pending" | "verified" | "rejected";
    verification_note: string | null;
    verified_at: string | null;
    created_at: string;
  }> = [];
  if (branchIds.length) {
    let admissionsQuery = supabase.from("education_admissions")
      .select("id, branch_id, application_number, applicant_first_name, applicant_last_name, applicant_other_names, applicant_email, applicant_phone, applicant_date_of_birth, applicant_gender, applicant_address, guardian_first_name, guardian_last_name, guardian_email, guardian_phone, guardian_relationship, requested_class_id, decision_note, enrolled_student_id, status, applied_at")
      .eq("org_id", context.orgId).in("branch_id", branchIds)
      .order("applied_at", { ascending: false });
    if (selectedStatus) admissionsQuery = admissionsQuery.eq("status", selectedStatus);
    if (requestedSearch) {
      const safeSearch = requestedSearch.replace(/[^A-Za-z0-9\s_-]/g, "");
      if (safeSearch) {
        const pattern = `%${safeSearch}%`;
        admissionsQuery = admissionsQuery.or(`application_number.ilike.${pattern},applicant_first_name.ilike.${pattern},applicant_last_name.ilike.${pattern},applicant_email.ilike.${pattern},applicant_phone.ilike.${pattern}`);
      }
    }
    const { data, error } = await admissionsQuery;
    if (error) throw new Error(`Could not load Think Education applications: ${error.message}`);
    admissions = data ?? [];
    if (canViewClasses) {
      const { data: activeYears, error: yearsError } = await supabase.from("education_academic_years")
        .select("id").eq("org_id", context.orgId).eq("status", "active");
      if (yearsError) throw new Error(`Could not load active Think Education academic years: ${yearsError.message}`);
      const activeYearIds = (activeYears ?? []).map((year) => year.id);
      if (activeYearIds.length) {
        const { data: classRows, error: classesError } = await supabase.from("education_classes")
          .select("id, branch_id, academic_year_id, name, level_name, stream_name, capacity")
          .eq("org_id", context.orgId).in("branch_id", branchIds)
          .in("academic_year_id", activeYearIds).eq("status", "active").order("name");
        if (classesError) throw new Error(`Could not load Think Education classes for admissions: ${classesError.message}`);
        classes = classRows ?? [];
      }
    }
    const admissionIds = admissions.map((application) => application.id);
    if (admissionIds.length) {
      const { data: offerRows, error: offersError } = await supabase.from("education_admission_offers")
        .select("id, admission_id, offer_number, expires_on, terms, status, issued_at")
        .eq("org_id", context.orgId).in("admission_id", admissionIds)
        .order("offer_number", { ascending: false });
      if (offersError) throw new Error(`Could not load admission offer history: ${offersError.message}`);
      offers = offerRows ?? [];
      if (canViewAdmissionDocuments) {
        const { data: documentRows, error: documentsError } = await supabase.from("education_documents")
          .select("id, admission_id, branch_id, title, file_name, file_size, status, retention_until, verification_status, verification_note, verified_at, created_at")
          .eq("org_id", context.orgId).in("admission_id", admissionIds)
          .order("created_at", { ascending: false });
        if (documentsError) throw new Error(`Could not load applicant document verification: ${documentsError.message}`);
        admissionDocuments = (documentRows ?? []).filter(
          (document): document is typeof document & { admission_id: string } => document.admission_id !== null,
        );
      }
    }
  }
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const classNameById = new Map(classes.map((classroom) => [
    classroom.id,
    `${campusNameById.get(classroom.branch_id) ?? "Campus"} · ${classroom.name}${classroom.level_name ? ` (${classroom.level_name})` : ""}`,
  ]));
  const latestOfferByAdmission = new Map<string, (typeof offers)[number]>();
  for (const offer of offers) {
    if (!latestOfferByAdmission.has(offer.admission_id)) latestOfferByAdmission.set(offer.admission_id, offer);
  }
  const documentsByAdmission = new Map<string, typeof admissionDocuments>();
  for (const document of admissionDocuments) {
    const records = documentsByAdmission.get(document.admission_id) ?? [];
    records.push(document);
    documentsByAdmission.set(document.admission_id, records);
  }
  const getOfferStatus = (offer: (typeof offers)[number] | undefined) =>
    offer?.status === "offered" && offer.expires_on < today ? "expired" : offer?.status ?? "";
  const csvRows = [
    ["Application", "Applicant", "Other names", "Date of birth", "Gender", "Address", "Guardian", "Guardian contact", "Relationship", "Campus", "Class", "Contact", "Applied on", "Status", "Offer status", "Offer expiry", "Admission documents", "Pending document reviews", "Rejected document reviews", "Decision note"],
    ...admissions.map((application) => [
      application.application_number,
      `${application.applicant_first_name} ${application.applicant_last_name}`.trim(),
      application.applicant_other_names ?? "",
      application.applicant_date_of_birth ?? "",
      application.applicant_gender ?? "",
      application.applicant_address ?? "",
      [application.guardian_first_name, application.guardian_last_name].filter(Boolean).join(" "),
      application.guardian_email || application.guardian_phone || "",
      application.guardian_relationship ?? "",
      campusNameById.get(application.branch_id) ?? application.branch_id,
      application.requested_class_id ? classNameById.get(application.requested_class_id) ?? application.requested_class_id : "No class selected",
      application.applicant_email || application.applicant_phone || "—",
      new Date(application.applied_at).toISOString(),
      application.status.replace("_", " "),
      getOfferStatus(latestOfferByAdmission.get(application.id)),
      latestOfferByAdmission.get(application.id)?.expires_on ?? "",
      canViewAdmissionDocuments ? documentsByAdmission.get(application.id)?.length ?? 0 : "",
      canViewAdmissionDocuments ? documentsByAdmission.get(application.id)?.filter((document) => document.verification_status === "pending").length ?? 0 : "",
      canViewAdmissionDocuments ? documentsByAdmission.get(application.id)?.filter((document) => document.verification_status === "rejected").length ?? 0 : "",
      application.decision_note ?? "",
    ]),
  ];
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(csvRows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"))}`;
  const errorMessage = params.error === "duplicate"
    ? "That application number is already in use."
    : params.error === "invalid"
      ? "Check the application number and applicant name. If supplied, email and phone must be valid."
      : params.error === "student-number"
        ? "That student number is already in use, or the student is already enrolled for this year."
        : params.error === "capacity"
          ? "The selected class has reached capacity."
          : params.error === "transition"
            ? "This application cannot make that status change."
            : params.error === "class"
              ? "Choose an active class at the selected campus and academic year."
              : params.error === "not-found"
                ? "The application or class is no longer available."
                : params.error === "offer"
                  ? "Confirm the application is under review and the offer expiry is valid. An active offer cannot be duplicated."
                  : params.error === "save" ? "The application could not be saved. Please try again." : null;
  const documentErrorMessage = params.document_error === "permission"
    ? "Your role does not allow this applicant document action."
    : params.document_error === "campus"
      ? "Choose one of your assigned campuses."
      : params.document_error === "invalid" || params.document_error === "review-invalid"
        ? "Check the applicant document file and details, or provide a reason when rejecting it."
        : params.document_error === "upload"
          ? "The applicant file could not be uploaded. Check the file and try again."
          : params.document_error === "save"
            ? "The applicant document could not be saved or reviewed."
            : params.document_error === "not-found"
              ? "The applicant document was not found or is no longer available."
              : null;

  return <main className="mx-auto w-full max-w-[1680px] space-y-6 p-4 md:p-6 xl:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Admissions</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Track applications and admission decisions across your assigned campuses.</p>
      </div>
      {canCreate && <Link href={getProductAppPath("think-education", "/admissions/new")} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
        <Plus className="h-4 w-4" /> New application
      </Link>}
    </header>

    {params.created === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Application created.</p>}
    {params.updated === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Application status updated.</p>}
    {params.enrolled === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Applicant enrolled and added to the student directory.</p>}
    {params.offer === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Admission offer recorded. Send the offer to the applicant using your approved communication channel.</p>}
    {params.documentsUploaded === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Applicant document uploaded and queued for verification.</p>}
    {params.documentReviewed === "verified" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Applicant document marked verified.</p>}
    {params.documentReviewed === "rejected" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Applicant document marked as needing resubmission.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}
    {documentErrorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{documentErrorMessage}</p>}

    <section data-education-metrics className="grid gap-3 sm:grid-cols-3">
      {[
        { label: "Applications matching filters", value: admissions.length, icon: ClipboardList },
        { label: "Awaiting review in results", value: admissions.filter((item) => item.status === "pending" || item.status === "under_review").length, icon: UserPlus },
        { label: "Admitted in results", value: admissions.filter((item) => item.status === "admitted" || item.status === "enrolled").length, icon: UserPlus },
      ].map(({ label, value, icon: Icon }) => <article key={label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{value.toLocaleString()}</p></div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon className="h-5 w-5" /></span>
      </article>)}
    </section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <form method="get" action={getProductAppPath("think-education", "/admissions")} className="grid gap-3 border-b border-slate-200 bg-slate-50/70 p-4 md:grid-cols-[minmax(220px,1fr)_220px_220px_auto_auto] md:p-5">
        <label className="relative block">
          <span className="sr-only">Search applications</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input name="search" defaultValue={requestedSearch} placeholder="Search applicant or application" className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        </label>
        <select name="branch" defaultValue={selectedBranch} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
          <option value="">All campuses</option>
          {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
        </select>
        <select name="status" defaultValue={selectedStatus} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
          <option value="">All statuses</option>
          {ADMISSION_STATUSES.map((status) => <option key={status} value={status}>{status.replace("_", " ")}</option>)}
        </select>
        <button type="submit" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">Apply filters</button>
        {canExport && admissions.length > 0 && <a href={csvHref} download={`education-admissions-${new Date().toISOString().slice(0, 10)}.csv`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Export CSV</a>}
      </form>
      {campuses.length === 0 ? <div className="p-8 text-center">
        <ClipboardList className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-3 font-semibold text-slate-900">No campus access assigned</h2>
        <p className="mt-1 text-sm text-slate-500">Ask an authorized Think Education administrator to assign your campus scope.</p>
      </div> : admissions.length === 0 ? <div className="p-8 text-center">
        <ClipboardList className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-3 font-semibold text-slate-900">No applications match your filters</h2>
        <p className="mt-1 text-sm text-slate-500">New applications will appear here when they match your current filters.</p>
      </div> : <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <tr><th className="px-4 py-3">Application</th><th className="px-4 py-3">Applicant</th><th className="px-4 py-3">Campus / class</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Applied</th><th className="px-4 py-3">Status &amp; actions</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {admissions.map((application) => {
              const offer = latestOfferByAdmission.get(application.id);
              const hasActiveOffer = offer?.status === "offered" && offer.expires_on >= today;
              return <tr key={application.id} className="align-top transition-colors hover:bg-slate-50/80">
              <td className="whitespace-nowrap px-4 py-3 font-semibold text-blue-800">{application.application_number}</td>
              <td className="px-4 py-3 font-medium text-slate-900">
                {application.applicant_first_name} {application.applicant_other_names} {application.applicant_last_name}
                {(application.applicant_date_of_birth || application.applicant_gender || application.applicant_address || application.guardian_first_name) && <details className="mt-1 font-normal text-slate-600">
                  <summary className="cursor-pointer text-xs font-medium text-blue-700">Additional details</summary>
                  <div className="mt-1 space-y-0.5 text-xs">
                    {application.applicant_date_of_birth && <p>Date of birth: {application.applicant_date_of_birth}</p>}
                    {application.applicant_gender && <p>Gender: {application.applicant_gender}</p>}
                    {application.applicant_address && <p>Address: {application.applicant_address}</p>}
                    {application.guardian_first_name && <p>Guardian: {application.guardian_first_name} {application.guardian_last_name} · {application.guardian_relationship} · {application.guardian_email || application.guardian_phone}</p>}
                  </div>
                </details>}
              </td>
              <td className="px-4 py-3 leading-6 text-slate-600">{campusNameById.get(application.branch_id) ?? "Campus"}<br />{application.requested_class_id ? classNameById.get(application.requested_class_id)?.split(" · ").slice(1).join(" · ") ?? "Class selected" : "No class selected"}</td>
              <td className="px-4 py-3 text-slate-600">{application.applicant_email || application.applicant_phone || "—"}</td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-500">{new Date(application.applied_at).toLocaleDateString()}</td>
              <td className="px-4 py-3">
                <span className="inline-block rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold capitalize text-amber-800">{application.status.replace("_", " ")}</span>
                {application.decision_note && <p className="mt-2 max-w-xs text-xs text-slate-600">{application.decision_note}</p>}
                {offer && <div className="mt-2 max-w-xs rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                  <p className="font-semibold capitalize">Offer {offer.offer_number} · {getOfferStatus(offer)}</p>
                  <p>Expires {offer.expires_on}</p>
                  {offer.terms && <p className="mt-1 whitespace-pre-wrap">{offer.terms}</p>}
                </div>}
                {canViewAdmissionDocuments && <div className="mt-3 max-w-sm space-y-2">
                  <p className="text-xs font-semibold text-slate-700">Applicant documents</p>
                  {!(documentsByAdmission.get(application.id) ?? []).length && <p className="text-xs text-slate-500">No applicant documents uploaded.</p>}
                  {(documentsByAdmission.get(application.id) ?? []).map((document) => {
                    const expired = !!document.retention_until && document.retention_until < today;
                    const downloadable = document.status === "active" && !expired;
                    return <div key={document.id} className="rounded-md border border-slate-200 bg-white p-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-800">{document.title}</p>
                          <p className="text-slate-500">{document.file_name} · {Math.max(1, Math.round(document.file_size / 1024))} KB · {document.verification_status.replace("_", " ")}</p>
                        </div>
                        {downloadable && <Link href={`/api/education/documents/${document.id}/download`} className="font-semibold text-blue-700 hover:text-blue-900">Download</Link>}
                      </div>
                      {document.verification_note && <p className="mt-1 text-amber-800">Review note: {document.verification_note}</p>}
                      {document.verified_at && <p className="mt-1 text-slate-500">Reviewed {new Date(document.verified_at).toLocaleDateString()}</p>}
                      {["under_review", "admitted"].includes(application.status) && document.status === "active" && !expired && canEdit && <div className="mt-2 flex flex-wrap items-end gap-2">
                        <form action={reviewEducationAdmissionDocument}>
                          <input type="hidden" name="document_id" value={document.id} />
                          <input type="hidden" name="verification_status" value="verified" />
                          <EducationSubmitButton pendingLabel="Saving..." className="rounded-md border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-50">Mark verified</EducationSubmitButton>
                        </form>
                        <form action={reviewEducationAdmissionDocument} className="flex items-end gap-1">
                          <input type="hidden" name="document_id" value={document.id} />
                          <input type="hidden" name="verification_status" value="rejected" />
                          <label className="sr-only" htmlFor={`document-note-${document.id}`}>Reason for requesting a replacement</label>
                          <input id={`document-note-${document.id}`} required name="note" maxLength={1000} placeholder="Reason for replacement" className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs" />
                          <EducationSubmitButton pendingLabel="Saving..." className="rounded-md border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-800 hover:bg-rose-50">Needs resubmission</EducationSubmitButton>
                        </form>
                      </div>}
                    </div>;
                  })}
                  {canCreateAdmissionDocuments && canEdit && ["pending", "under_review", "admitted"].includes(application.status) && <form action="/api/education/documents" method="post" encType="multipart/form-data" className="grid gap-1.5 rounded-md border border-blue-100 bg-blue-50 p-2">
                    <input type="hidden" name="branch_id" value={application.branch_id} />
                    <input type="hidden" name="admission_id" value={application.id} />
                    <input type="hidden" name="category" value="admission" />
                    <label className="text-xs font-medium text-slate-700">Document title
                      <input required name="title" maxLength={160} placeholder="e.g. Previous school report" className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs" />
                    </label>
                    <label className="text-xs font-medium text-slate-700">File (PDF, image, Word, or text; max 15 MB)
                      <input required type="file" name="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.txt,application/pdf,image/jpeg,image/png,image/webp,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs" />
                    </label>
                    <button className="justify-self-start rounded-md bg-blue-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-800">Upload for verification</button>
                  </form>}
                </div>}
                {!canViewAdmissionDocuments && <p className="mt-2 text-xs text-slate-500">Document view permission is required to inspect applicant records.</p>}
                {application.enrolled_student_id && <p className="mt-2 text-xs font-medium text-emerald-800">Student record created</p>}
                {(application.status === "pending" && canEdit || application.status === "under_review" && canApprove) && <div className="mt-2 flex flex-wrap gap-2">
                  {application.status === "pending" && canEdit && <form action={updateEducationAdmissionStatus}>
                    <input type="hidden" name="admission_id" value={application.id} /><input type="hidden" name="status" value="under_review" />
                    <EducationSubmitButton pendingLabel="Starting review..." className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">Start review</EducationSubmitButton>
                  </form>}
                  {application.status === "under_review" && canApprove && <>
                    {hasActiveOffer
                      ? <form action={updateEducationAdmissionStatus}>
                        <input type="hidden" name="admission_id" value={application.id} /><input type="hidden" name="status" value="admitted" />
                        <EducationSubmitButton pendingLabel="Updating application..." className="rounded-md bg-emerald-700 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-800">Accept offer and admit</EducationSubmitButton>
                      </form>
                      : <form action={recordEducationAdmissionOffer} className="grid w-56 gap-1.5 rounded-md border border-blue-100 bg-blue-50 p-2">
                        <input type="hidden" name="admission_id" value={application.id} />
                        <label className="text-xs font-medium text-slate-700">Offer expiry
                          <input required type="date" name="expires_on" min={today} max={maximumOfferExpiry.toISOString().slice(0, 10)} defaultValue={defaultOfferExpiry.toISOString().slice(0, 10)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs" />
                        </label>
                        <label className="text-xs font-medium text-slate-700">Offer terms
                          <textarea name="terms" maxLength={2000} rows={2} placeholder="Optional terms" className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs" />
                        </label>
                        <EducationSubmitButton pendingLabel="Recording offer..." className="rounded-md bg-blue-700 px-2 py-1.5 text-xs font-semibold text-white hover:bg-blue-800">{offer ? "Reissue offer" : "Record offer sent"}</EducationSubmitButton>
                        <p className="text-[11px] leading-4 text-slate-600">This records an offer sent outside the system; it does not send an email.</p>
                      </form>}
                    <form action={updateEducationAdmissionStatus} className="flex flex-col gap-1">
                      <input type="hidden" name="admission_id" value={application.id} /><input type="hidden" name="status" value="rejected" />
                      <input required name="decision_note" maxLength={1000} placeholder="Reason required" aria-label="Rejection reason" className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs" />
                      <EducationSubmitButton pendingLabel="Saving decision..." className="rounded-md border border-rose-300 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50">Reject</EducationSubmitButton>
                    </form>
                  </>}
                </div>}
                {application.status === "admitted" && canEnroll && (!application.guardian_first_name || canCreateGuardian) && <form action={updateEducationAdmissionStatus} className="mt-3 grid max-w-xs gap-2">
                  <input type="hidden" name="admission_id" value={application.id} /><input type="hidden" name="status" value="enrolled" />
                  <p className="text-xs text-slate-600">A student number will be generated automatically when enrolling.</p>
                  <label className="text-xs font-medium text-slate-700">Active class
                    <select required name="class_id" defaultValue={application.requested_class_id ?? ""} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs">
                      <option value="" disabled>Select a class</option>
                      {classes.filter((classroom) => classroom.branch_id === application.branch_id).map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}{classroom.level_name ? ` · ${classroom.level_name}` : ""}{classroom.capacity ? ` (${classroom.capacity} capacity)` : ""}</option>)}
                    </select>
                  </label>
                  <EducationSubmitButton
                    disabled={!classes.some((classroom) => classroom.branch_id === application.branch_id)}
                    pendingLabel="Enrolling student..."
                    className="rounded-md bg-blue-700 px-2 py-1.5 text-xs font-semibold text-white enabled:hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    Enroll and create student
                  </EducationSubmitButton>
                </form>}
                {application.status === "admitted" && canEnroll && application.guardian_first_name && !canCreateGuardian && <p className="mt-2 max-w-xs text-xs text-amber-800">Guardian creation permission is required before enrolling this applicant with guardian details.</p>}
                {["pending", "under_review", "admitted"].includes(application.status) && canEdit && <form action={updateEducationAdmissionStatus} className="mt-2 flex flex-col gap-1">
                  <input type="hidden" name="admission_id" value={application.id} /><input type="hidden" name="status" value="withdrawn" />
                  <input required name="decision_note" maxLength={1000} placeholder="Withdrawal reason" aria-label="Withdrawal reason" className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs" />
                  <EducationSubmitButton pendingLabel="Withdrawing..." className="self-start rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">Withdraw</EducationSubmitButton>
                </form>}
              </td>
            </tr>;
            })}
          </tbody>
        </table>
      </div>}
    </section>

  </main>;
}
