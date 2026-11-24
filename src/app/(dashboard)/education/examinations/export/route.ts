import { NextResponse, type NextRequest } from "next/server";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 1000;
const MAX_EXPORT_EXAMINATIONS = 50_000;
const EXAMINATION_STATUSES = ["draft", "scheduled", "in_progress", "completed", "results_pending", "published", "cancelled"] as const;

function csvCell(value: string): string {
  const safeValue = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replace(/"/g, '""')}"`;
}

function csvRow(values: string[]): string {
  return values.map(csvCell).join(",");
}

export async function GET(request: NextRequest) {
  const context = await getCurrentOrgContext();
  if (!context) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });

  const [canView, canExport] = await Promise.all([
    canTabPermission("education_examinations", "examinations", "schedule", "view"),
    canTabPermission("education_examinations", "examinations", "schedule", "export"),
  ]);
  if (!canView || !canExport) {
    return NextResponse.json({ error: "You do not have permission to export examinations." }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const requestedBranch = params.get("branch") ?? "";
  const requestedYear = params.get("year") ?? "";
  const requestedStatus = params.get("status") ?? "";
  if (requestedStatus && !EXAMINATION_STATUSES.some((status) => status === requestedStatus)) {
    return NextResponse.json({ error: "The selected examination status is invalid." }, { status: 400 });
  }
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const accessibleBranchIds = campuses.map((campus) => campus.id);
  if (requestedBranch && !accessibleBranchIds.includes(requestedBranch)) {
    return NextResponse.json({ error: "The selected campus is outside your access scope." }, { status: 403 });
  }
  const branchIds = requestedBranch ? [requestedBranch] : accessibleBranchIds;
  if (!branchIds.length) {
    return NextResponse.json({ error: "No accessible Think Education campuses were found." }, { status: 403 });
  }

  const supabase = await createClient();
  if (requestedYear) {
    const { data: year, error } = await supabase.from("education_academic_years")
      .select("id")
      .eq("org_id", context.orgId)
      .eq("id", requestedYear)
      .maybeSingle();
    if (error) {
      console.error("Could not verify the Think Education examination export year:", error.message);
      return NextResponse.json({ error: "Could not verify the academic year filter." }, { status: 500 });
    }
    if (!year) return NextResponse.json({ error: "The selected academic year was not found." }, { status: 400 });
  }

  const search = (params.get("search") ?? "").trim().slice(0, 80);
  const firstPage = await supabase.rpc("education_get_examinations_page", {
    p_org_id: context.orgId,
    p_branch_ids: branchIds,
    p_branch_id: requestedBranch || null,
    p_academic_year_id: requestedYear || null,
    p_status: requestedStatus || null,
    p_search: search,
    p_limit: PAGE_SIZE,
    p_offset: 0,
  });
  if (firstPage.error) {
    console.error("Could not load Think Education examinations for export:", firstPage.error.message);
    return NextResponse.json({ error: "Could not load examinations for export." }, { status: 500 });
  }

  const totalCount = firstPage.data?.[0]?.total_count ?? 0;
  if (totalCount > MAX_EXPORT_EXAMINATIONS) {
    return NextResponse.json({
      error: `This export contains ${totalCount} examinations, above the ${MAX_EXPORT_EXAMINATIONS} row limit. Filter by campus, academic year, status, or search and try again.`,
    }, { status: 413 });
  }

  const rows = [csvRow(["Examination", "Type", "Academic year", "Term", "Campus", "Start", "End", "Status"])];
  const appendRows = (data: NonNullable<typeof firstPage.data>) => {
    for (const exam of data) {
      rows.push(csvRow([
        exam.name,
        exam.examination_type.replace("_", " "),
        exam.academic_year_name ?? "",
        exam.term_name ?? "",
        exam.campus_name ?? "",
        exam.starts_at ? new Date(exam.starts_at).toISOString() : "",
        exam.ends_at ? new Date(exam.ends_at).toISOString() : "",
        exam.status.replace("_", " "),
      ]));
    }
  };
  appendRows(firstPage.data ?? []);

  for (let offset = PAGE_SIZE; offset < totalCount; offset += PAGE_SIZE) {
    const { data, error } = await supabase.rpc("education_get_examinations_page", {
      p_org_id: context.orgId,
      p_branch_ids: branchIds,
      p_branch_id: requestedBranch || null,
      p_academic_year_id: requestedYear || null,
      p_status: requestedStatus || null,
      p_search: search,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    });
    if (error) {
      console.error("Could not load an examination export batch:", error.message);
      return NextResponse.json({ error: "Could not load examinations for export." }, { status: 500 });
    }
    appendRows(data ?? []);
  }

  return new NextResponse(`\uFEFF${rows.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="think-education-examinations-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
