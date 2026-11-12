import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { summarizeEducationOutcomes } from "@/lib/education/outcomes";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";

const EXPORT_LIMIT = 5000;

function escapeCsv(value: string) {
  const safeValue = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const context = await getCurrentOrgContext();
  if (!context) return new Response("Unauthorized.", { status: 401 });
  const [canViewReport, canExportReport, canViewResults, canExportResults, canViewExaminations] = await Promise.all([
    canTabPermission("education_reports", "reports", "outcomes", "view"),
    canTabPermission("education_reports", "reports", "outcomes", "export"),
    canTabPermission("education_results", "results", "gradebook", "view"),
    canTabPermission("education_results", "results", "gradebook", "export"),
    canTabPermission("education_examinations", "examinations", "schedule", "view"),
  ]);
  if (!canViewReport || !canExportReport || !canViewResults || !canExportResults || !canViewExaminations) {
    return new Response("You do not have permission to export this report.", { status: 403 });
  }

  const url = new URL(request.url);
  const examinationId = url.searchParams.get("examination") ?? "";
  const requestedBranch = url.searchParams.get("branch") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(examinationId)) {
    return new Response("Select a published examination.", { status: 400 });
  }

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  if (requestedBranch && !campusIds.includes(requestedBranch)) {
    return new Response("The selected campus is outside your access.", { status: 403 });
  }
  const branchIds = requestedBranch ? [requestedBranch] : campusIds;
  if (!branchIds.length) {
    return new Response("No published examinations are available in your assigned campuses.", { status: 404 });
  }

  const supabase = await createClient();
  const { data: examination, error: examinationError } = await supabase.from("education_examinations")
    .select("id, branch_id, name")
    .eq("org_id", context.orgId).eq("id", examinationId).eq("status", "published")
    .in("branch_id", branchIds).maybeSingle();
  if (examinationError) {
    console.error("Could not verify published Think Education examination:", examinationError.message);
    return new Response("Could not load the selected examination.", { status: 500 });
  }
  if (!examination) {
    return new Response("The selected examination is unavailable in your assigned campuses.", { status: 404 });
  }

  const { data, count, error } = await supabase.from("education_results")
    .select("branch_id, subject_name, score, maximum_score, grade", { count: "exact" })
    .eq("org_id", context.orgId).eq("examination_id", examination.id).eq("status", "published")
    .order("branch_id").order("subject_name").order("id").range(0, EXPORT_LIMIT - 1);
  if (error) {
    console.error("Could not export Think Education academic outcomes:", error.message);
    return new Response("Could not generate the academic outcomes report.", { status: 500 });
  }
  if ((count ?? 0) > EXPORT_LIMIT) {
    return new Response(
      `This export matches more than ${EXPORT_LIMIT.toLocaleString()} published results. Select a single campus and try again.`,
      { status: 413 },
    );
  }

  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const summaries = summarizeEducationOutcomes((data ?? []).map((result) => ({
    ...result,
    score: Number(result.score),
    maximum_score: Number(result.maximum_score),
  })));
  const header = ["Examination", "Campus", "Subject", "Published result count", "Average percentage", "Grade distribution"];
  const lines = [
    header.map(escapeCsv).join(","),
    ...summaries.map((summary) => [
      examination.name,
      campusNameById.get(summary.branch_id) ?? "Campus",
      summary.subject_name,
      String(summary.result_count),
      summary.average_percentage.toFixed(1),
      Object.entries(summary.grade_counts).map(([grade, gradeCount]) => `${grade}: ${gradeCount}`).join("; "),
    ].map(escapeCsv).join(",")),
  ];

  return new Response(`\uFEFF${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="think-education-academic-outcomes.csv"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
