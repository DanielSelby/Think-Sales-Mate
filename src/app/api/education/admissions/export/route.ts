import { NextResponse, type NextRequest } from "next/server";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";

const BATCH_SIZE = 1000;
const MAX_EXPORT_ROWS = 100_000;
const ADMISSION_STATUSES = ["pending", "under_review", "admitted", "rejected", "enrolled", "withdrawn"] as const;

async function collectPages<T>(
  loadPage: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
) {
  const rows: T[] = [];
  for (let offset = 0; offset <= MAX_EXPORT_ROWS; offset += BATCH_SIZE) {
    const { data, error } = await loadPage(offset, offset + BATCH_SIZE - 1);
    if (error) return { rows, error: error.message, exceededLimit: false };
    if (offset === MAX_EXPORT_ROWS && data?.length) {
      return { rows, error: null, exceededLimit: true };
    }
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < BATCH_SIZE) break;
  }
  return { rows, error: null, exceededLimit: false };
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const context = await getCurrentOrgContext();
  if (!context) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  const [canView, canExport] = await Promise.all([
    canTabPermission("education_admissions", "admissions", "applications", "view"),
    canTabPermission("education_admissions", "admissions", "applications", "export"),
  ]);
  if (!canView || !canExport) {
    return NextResponse.json({ error: "You do not have permission to export applications." }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const requestedBranch = params.get("branch") ?? "";
  const requestedStatus = params.get("status") ?? "";
  const search = (params.get("search") ?? "").trim().slice(0, 80);
  const safeSearch = search.replace(/[^A-Za-z0-9\s_-]/g, "");
  const status = ADMISSION_STATUSES.find((candidate) => candidate === requestedStatus);
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  if (requestedBranch && !campusIds.includes(requestedBranch)) {
    return NextResponse.json({ error: "The selected campus is outside your access scope." }, { status: 403 });
  }
  const branchIds = requestedBranch ? [requestedBranch] : campusIds;
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const [canViewClasses, canViewAdmissionDocuments] = await Promise.all([
    canTabPermission("education_academics", "academics", "classes", "view"),
    canTabPermission("education_documents", "documents", "library", "view"),
  ]);
  const supabase = await createClient();

  const applicationsResult = await collectPages((from, to) => {
    let query = supabase.from("education_admissions")
      .select("id, branch_id, application_number, applicant_first_name, applicant_last_name, applicant_other_names, applicant_email, applicant_phone, applicant_date_of_birth, applicant_gender, applicant_address, guardian_first_name, guardian_last_name, guardian_email, guardian_phone, guardian_relationship, requested_class_id, decision_note, status, applied_at")
      .eq("org_id", context.orgId).in("branch_id", branchIds)
      .order("applied_at", { ascending: false }).order("id", { ascending: false });
    if (status) query = query.eq("status", status);
    if (safeSearch) {
      const pattern = `%${safeSearch}%`;
      query = query.or(`application_number.ilike.${pattern},applicant_first_name.ilike.${pattern},applicant_last_name.ilike.${pattern},applicant_email.ilike.${pattern},applicant_phone.ilike.${pattern}`);
    }
    return branchIds.length ? query.range(from, to) : Promise.resolve({ data: [], error: null });
  });
  if (applicationsResult.error) {
    console.error("Could not export Think Education admissions:", applicationsResult.error);
    return NextResponse.json({ error: "Could not export admission applications." }, { status: 500 });
  }
  if (applicationsResult.exceededLimit) {
    return NextResponse.json({ error: "Admission export exceeds the 100,000 record limit." }, { status: 413 });
  }
  const applications = applicationsResult.rows;
  const admissionIds = applications.map((application) => application.id);
  const latestOfferByAdmission = new Map<string, { offer_number: number; expires_on: string; status: string }>();
  const documentCountsByAdmission = new Map<string, { total: number; pending: number; rejected: number }>();
  for (let start = 0; start < admissionIds.length; start += 100) {
    const ids = admissionIds.slice(start, start + 100);
    const offersResult = await collectPages((from, to) => supabase.from("education_admission_offers")
      .select("id, admission_id, offer_number, expires_on, status")
      .eq("org_id", context.orgId).in("admission_id", ids)
      .order("offer_number", { ascending: false }).order("id", { ascending: false })
      .range(from, to));
    if (offersResult.error) {
      console.error("Could not load admission offer history for export:", offersResult.error);
      return NextResponse.json({ error: "Could not export admission offers." }, { status: 500 });
    }
    if (offersResult.exceededLimit) {
      return NextResponse.json({ error: "Admission offer history exceeds the export limit." }, { status: 413 });
    }
    for (const offer of offersResult.rows) {
      if (!latestOfferByAdmission.has(offer.admission_id)) {
        latestOfferByAdmission.set(offer.admission_id, offer);
      }
    }

    if (canViewAdmissionDocuments) {
      const documentsResult = await collectPages((from, to) => supabase.from("education_documents")
        .select("admission_id, verification_status")
        .eq("org_id", context.orgId).in("admission_id", ids)
        .range(from, to));
      if (documentsResult.error) {
        console.error("Could not load admission documents for export:", documentsResult.error);
        return NextResponse.json({ error: "Could not export applicant document counts." }, { status: 500 });
      }
      if (documentsResult.exceededLimit) {
        return NextResponse.json({ error: "Applicant document history exceeds the export limit." }, { status: 413 });
      }
      for (const document of documentsResult.rows) {
        if (!document.admission_id) continue;
        const counts = documentCountsByAdmission.get(document.admission_id) ?? { total: 0, pending: 0, rejected: 0 };
        counts.total += 1;
        if (document.verification_status === "pending") counts.pending += 1;
        if (document.verification_status === "rejected") counts.rejected += 1;
        documentCountsByAdmission.set(document.admission_id, counts);
      }
    }
  }

  const classNameById = new Map<string, string>();
  if (canViewClasses && branchIds.length) {
    const { data: activeYears, error: yearsError } = await supabase.from("education_academic_years")
      .select("id").eq("org_id", context.orgId).eq("status", "active");
    if (yearsError) {
      console.error("Could not load academic years for admissions export:", yearsError.message);
      return NextResponse.json({ error: "Could not export class names." }, { status: 500 });
    }
    const activeYearIds = (activeYears ?? []).map((year) => year.id);
    if (activeYearIds.length) {
      const classResult = await collectPages((from, to) => supabase.from("education_classes")
        .select("id, branch_id, name, level_name")
        .eq("org_id", context.orgId).in("branch_id", branchIds)
        .in("academic_year_id", activeYearIds).eq("status", "active")
        .order("name").order("id").range(from, to));
      if (classResult.error) {
        console.error("Could not load classes for admissions export:", classResult.error);
        return NextResponse.json({ error: "Could not export class names." }, { status: 500 });
      }
      if (classResult.exceededLimit) {
        return NextResponse.json({ error: "Class records exceed the export limit." }, { status: 413 });
      }
      for (const classroom of classResult.rows) {
        classNameById.set(classroom.id, `${campusNameById.get(classroom.branch_id) ?? "Campus"} · ${classroom.name}${classroom.level_name ? ` (${classroom.level_name})` : ""}`);
      }
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const csvRows = [
    ["Application", "Applicant", "Other names", "Date of birth", "Gender", "Address", "Guardian", "Guardian contact", "Relationship", "Campus", "Class", "Contact", "Applied on", "Status", "Offer status", "Offer expiry", "Admission documents", "Pending document reviews", "Rejected document reviews", "Decision note"],
    ...applications.map((application) => {
      const offer = latestOfferByAdmission.get(application.id);
      const offerStatus = offer?.status === "offered" && offer.expires_on < today ? "expired" : offer?.status ?? "";
      const documentCounts = documentCountsByAdmission.get(application.id);
      return [
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
        offerStatus,
        offer?.expires_on ?? "",
        canViewAdmissionDocuments ? documentCounts?.total ?? 0 : "",
        canViewAdmissionDocuments ? documentCounts?.pending ?? 0 : "",
        canViewAdmissionDocuments ? documentCounts?.rejected ?? 0 : "",
        application.decision_note ?? "",
      ];
    }),
  ];
  const csv = csvRows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="education-admissions-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
