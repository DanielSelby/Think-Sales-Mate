import { NextResponse, type NextRequest } from "next/server";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 1000;
const MAX_EXPORT_RESULTS = 50_000;
const RESULT_STATUSES = ["draft", "submitted", "approved", "published"] as const;

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
    canTabPermission("education_results", "results", "gradebook", "view"),
    canTabPermission("education_results", "results", "gradebook", "export"),
  ]);
  if (!canView || !canExport) {
    return NextResponse.json({ error: "You do not have permission to export examination results." }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const examinationId = params.get("examination") ?? "";
  if (!examinationId) {
    return NextResponse.json({ error: "An examination is required for this export." }, { status: 400 });
  }
  const requestedStatus = params.get("status") ?? "";
  if (requestedStatus && !RESULT_STATUSES.includes(requestedStatus as typeof RESULT_STATUSES[number])) {
    return NextResponse.json({ error: "The selected result status is invalid." }, { status: 400 });
  }

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const branchIds = campuses.map((campus) => campus.id);
  if (!branchIds.length) {
    return NextResponse.json({ error: "No accessible Think Education campuses were found." }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: examination, error: examinationError } = await supabase.from("education_examinations")
    .select("id, branch_id")
    .eq("org_id", context.orgId)
    .eq("id", examinationId)
    .in("branch_id", branchIds)
    .maybeSingle();
  if (examinationError) {
    console.error("Could not verify the Think Education result export examination:", examinationError.message);
    return NextResponse.json({ error: "Could not verify the selected examination." }, { status: 500 });
  }
  if (!examination) {
    return NextResponse.json({ error: "The selected examination is outside your access scope." }, { status: 403 });
  }

  const search = (params.get("search") ?? "").trim().slice(0, 80);
  const status = requestedStatus || null;
  const firstPage = await supabase.rpc("education_get_examination_results_page", {
    p_org_id: context.orgId,
    p_examination_id: examination.id,
    p_branch_ids: branchIds,
    p_status: status,
    p_search: search,
    p_limit: PAGE_SIZE,
    p_offset: 0,
  });
  if (firstPage.error) {
    console.error("Could not load Think Education results for export:", firstPage.error.message);
    return NextResponse.json({ error: "Could not load examination results for export." }, { status: 500 });
  }

  const totalCount = firstPage.data?.[0]?.total_count ?? 0;
  if (totalCount > MAX_EXPORT_RESULTS) {
    return NextResponse.json({
      error: `This export contains ${totalCount} results, above the ${MAX_EXPORT_RESULTS} row limit. Filter by status or search and try again.`,
    }, { status: 413 });
  }

  const rows = [csvRow(["Student number", "Student", "Subject", "Score", "Maximum score", "Grade", "Status"])];
  const appendRows = (data: NonNullable<typeof firstPage.data>) => {
    for (const result of data) {
      rows.push(csvRow([
        result.student_number ?? "",
        [result.first_name, result.last_name].filter(Boolean).join(" "),
        result.subject_name,
        String(result.score),
        String(result.maximum_score),
        result.grade ?? "",
        result.status,
      ]));
    }
  };
  appendRows(firstPage.data ?? []);

  for (let offset = PAGE_SIZE; offset < totalCount; offset += PAGE_SIZE) {
    const { data, error } = await supabase.rpc("education_get_examination_results_page", {
      p_org_id: context.orgId,
      p_examination_id: examination.id,
      p_branch_ids: branchIds,
      p_status: status,
      p_search: search,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    });
    if (error) {
      console.error("Could not load a Think Education result export batch:", error.message);
      return NextResponse.json({ error: "Could not load examination results for export." }, { status: 500 });
    }
    appendRows(data ?? []);
  }

  return new NextResponse(`\uFEFF${rows.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="think-education-results-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
