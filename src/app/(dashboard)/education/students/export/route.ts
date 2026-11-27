import { NextResponse, type NextRequest } from "next/server";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  EDUCATION_STUDENT_STATUSES,
  parseEducationStudentGender,
  parseEducationStudentDirectoryResult,
} from "@/lib/education/student-directory";

const PAGE_SIZE = 500;
const MAX_EXPORT_STUDENTS = 50_000;

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
  const orgId = context.orgId;

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
  const matchedStatus = requestedStatus === "all"
    ? "all"
    : EDUCATION_STUDENT_STATUSES.find((item) => item === requestedStatus);
  if (!matchedStatus) return NextResponse.json({ error: "The selected student status is invalid." }, { status: 400 });
  const status: "all" | typeof EDUCATION_STUDENT_STATUSES[number] = matchedStatus;

  const { campuses } = await getAccessibleEducationCampuses(orgId, context.userId);
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
  const gender = parseEducationStudentGender(params.get("gender") ?? "");
  const requestedClass = params.get("class") ?? "";
  const supabase = await createClient();
  let classId = "";
  if (requestedClass) {
    const { data: classroom, error: classError } = await supabase.from("education_classes")
      .select("id")
      .eq("org_id", orgId)
      .in("branch_id", branchIds)
      .eq("id", requestedClass)
      .maybeSingle();
    if (classError) {
      console.error("Could not verify the Think Education class export filter:", classError.message);
      return NextResponse.json({ error: "Could not verify the selected class." }, { status: 500 });
    }
    if (!classroom) {
      return NextResponse.json({ error: "The selected class is outside your access scope." }, { status: 403 });
    }
    classId = classroom?.id ?? "";
  }

  async function loadPage(offset: number) {
    const { data, error } = await supabase.rpc("education_student_directory_page", {
      p_org_id: orgId,
      p_branch_ids: branchIds,
      p_search: safeSearch,
      p_gender: gender,
      p_class_id: classId || null,
      p_status: status,
      p_page_size: PAGE_SIZE,
      p_offset: offset,
    });
    if (error) {
      console.error("Could not load Think Education students for export:", error.message);
      throw new Error("Could not load student records for export.");
    }
    return parseEducationStudentDirectoryResult(data?.[0]);
  }

  let firstPage: ReturnType<typeof parseEducationStudentDirectoryResult>;
  try {
    firstPage = await loadPage(0);
  } catch (error) {
    console.error("Could not load Think Education student export:", error);
    return NextResponse.json({ error: "Could not load student records for export." }, { status: 500 });
  }
  const studentCount = firstPage.totalCount;
  if (studentCount > MAX_EXPORT_STUDENTS) {
    return NextResponse.json({
      error: `This export contains ${studentCount} students, above the ${MAX_EXPORT_STUDENTS} row limit. Filter by campus, class, gender, status, or search and try again.`,
    }, { status: 413 });
  }

  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const rows = [csvRow(["Student ID", "Full name", "Gender", "Nationality", "Class", "Campus", "Status", "Enrolled"])];
  for (let offset = 0; offset < studentCount; offset += PAGE_SIZE) {
    let page = firstPage;
    if (offset > 0) {
      try {
        page = await loadPage(offset);
      } catch (error) {
        console.error("Could not load a Think Education student export page:", error);
        return NextResponse.json({ error: "Could not load student records for export." }, { status: 500 });
      }
    }
    const pageStudentIds = page.students.map((student) => student.id);
    let nationalityRows: Array<{ id: string; nationality: string | null }> = [];
    if (pageStudentIds.length) {
      const { data, error: nationalityError } = await supabase.from("education_students")
        .select("id, nationality")
        .eq("org_id", orgId)
        .in("branch_id", branchIds)
        .in("id", pageStudentIds);
      if (nationalityError) {
        console.error("Could not load Think Education student nationalities for export:", nationalityError.message);
        return NextResponse.json({ error: "Could not load student records for export." }, { status: 500 });
      }
      nationalityRows = data ?? [];
    }
    if (nationalityRows.length !== pageStudentIds.length) {
      console.error("Student export nationality lookup did not match the authorized directory rows.");
      return NextResponse.json({ error: "Could not load student records for export." }, { status: 500 });
    }
    const nationalityByStudentId = new Map(
      nationalityRows.map((student) => [student.id, student.nationality ?? ""]),
    );
    for (const student of page.students) {
      const nationality = nationalityByStudentId.get(student.id);
      if (nationality === undefined) {
        console.error("Student export did not include a nationality lookup for a directory row.");
        return NextResponse.json({ error: "Could not load student records for export." }, { status: 500 });
      }
      rows.push(csvRow([
        student.student_number,
        [student.first_name, student.other_names, student.last_name].filter(Boolean).join(" "),
        student.gender ?? "",
        nationality,
        student.class_names.join(", "),
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
