import { NextResponse, type NextRequest } from "next/server";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 500;
const MAX_EXPORT_STUDENTS = 50_000;
const STUDENT_STATUSES = ["active", "on_hold", "graduated", "transferred", "withdrawn", "archived"] as const;

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
    canTabPermission("education_students", "students", "list", "view"),
    canTabPermission("education_students", "students", "list", "export"),
  ]);
  if (!canView || !canExport) {
    return NextResponse.json({ error: "You do not have permission to export student records." }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const requestedBranch = params.get("branch") ?? "";
  const requestedStatus = params.get("status") ?? "active";
  const status = STUDENT_STATUSES.find((item) => item === requestedStatus);
  if (!status) return NextResponse.json({ error: "The selected student status is invalid." }, { status: 400 });

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const accessibleBranchIds = campuses.map((campus) => campus.id);
  if (requestedBranch && !accessibleBranchIds.includes(requestedBranch)) {
    return NextResponse.json({ error: "The selected campus is outside your access scope." }, { status: 403 });
  }
  const branchIds = requestedBranch ? [requestedBranch] : accessibleBranchIds;
  if (!branchIds.length) {
    return NextResponse.json({ error: "No accessible Think Education campuses were found." }, { status: 403 });
  }

  const search = (params.get("search") ?? "").trim().slice(0, 80);
  const safeSearch = search.replace(/[^A-Za-z0-9\s_-]/g, "");
  const supabase = await createClient();
  let countQuery = supabase.from("education_students").select("id", { count: "exact", head: true })
    .eq("org_id", context.orgId).in("branch_id", branchIds).eq("status", status);
  if (safeSearch) {
    const pattern = `%${safeSearch}%`;
    countQuery = countQuery.or(
      `student_number.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern},other_names.ilike.${pattern}`,
    );
  }
  const { count, error: countError } = await countQuery;
  if (countError) {
    console.error("Could not count Think Education students for export:", countError.message);
    return NextResponse.json({ error: "Could not count the student export." }, { status: 500 });
  }

  const studentCount = count ?? 0;
  if (studentCount > MAX_EXPORT_STUDENTS) {
    return NextResponse.json({
      error: `This export contains ${studentCount} students, above the ${MAX_EXPORT_STUDENTS} row limit. Filter by campus, status, or search and try again.`,
    }, { status: 413 });
  }

  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const rows = [csvRow(["Student ID", "Full name", "Campus", "Status", "Enrolled"])];
  for (let offset = 0; offset < studentCount; offset += PAGE_SIZE) {
    let query = supabase.from("education_students")
      .select("student_number, first_name, last_name, other_names, branch_id, status, created_at")
      .eq("org_id", context.orgId).in("branch_id", branchIds).eq("status", status)
      .order("last_name").order("first_name").order("id");
    if (safeSearch) {
      const pattern = `%${safeSearch}%`;
      query = query.or(
        `student_number.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern},other_names.ilike.${pattern}`,
      );
    }
    const { data, error } = await query.range(offset, Math.min(offset + PAGE_SIZE - 1, studentCount - 1));
    if (error) {
      console.error("Could not load Think Education students for export:", error.message);
      return NextResponse.json({ error: "Could not load student records for export." }, { status: 500 });
    }
    for (const student of data ?? []) {
      rows.push(csvRow([
        student.student_number,
        [student.first_name, student.other_names, student.last_name].filter(Boolean).join(" "),
        campusNameById.get(student.branch_id) ?? "",
        student.status.replace("_", " "),
        new Date(student.created_at).toISOString(),
      ]));
    }
  }

  return new NextResponse(`\uFEFF${rows.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="think-education-students-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
