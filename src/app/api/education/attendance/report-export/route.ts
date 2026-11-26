import { NextResponse, type NextRequest } from "next/server";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import {
  parseEducationAttendanceReportResult,
  type EducationAttendanceStatus,
} from "@/lib/education/attendance-report";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 500;
const MAX_EXPORT_RECORDS = 50_000;
const ATTENDANCE_STATUSES: EducationAttendanceStatus[] = ["present", "absent", "late", "excused"];

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const context = await getCurrentOrgContext();
  if (!context) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  const orgId = context.orgId;

  const [canView, canExport, canViewClasses] = await Promise.all([
    canTabPermission("education_attendance", "attendance", "register", "view"),
    canTabPermission("education_attendance", "attendance", "register", "export"),
    canTabPermission("education_academics", "academics", "classes", "view"),
  ]);
  if (!canView || !canExport) {
    return NextResponse.json({ error: "You do not have permission to export attendance reports." }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  if (!isValidDate(from) || !isValidDate(to) || from > to) {
    return NextResponse.json({ error: "Choose a valid attendance date range." }, { status: 400 });
  }

  const requestedStatus = params.get("status") ?? "";
  const status = requestedStatus ? ATTENDANCE_STATUSES.find((item) => item === requestedStatus) : "all";
  if (!status) return NextResponse.json({ error: "The selected attendance status is invalid." }, { status: 400 });

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  const requestedBranch = params.get("branch") ?? "";
  if (requestedBranch && !campusIds.includes(requestedBranch)) {
    return NextResponse.json({ error: "The selected campus is outside your access scope." }, { status: 403 });
  }
  const branchIds = requestedBranch ? [requestedBranch] : campusIds;
  if (!branchIds.length) {
    return NextResponse.json({ error: "No accessible Think Education campuses were found." }, { status: 403 });
  }

  const requestedClass = params.get("class") ?? "";
  if (requestedClass && !canViewClasses) {
    return NextResponse.json({ error: "You do not have permission to export class attendance filters." }, { status: 403 });
  }
  const supabase = await createClient();
  let classId = "";
  if (requestedClass) {
    const { data: classroom, error } = await supabase.from("education_classes")
      .select("id")
      .eq("org_id", orgId)
      .in("branch_id", branchIds)
      .eq("id", requestedClass)
      .maybeSingle();
    if (error) {
      console.error("Could not verify the class for attendance report export:", error.message);
      return NextResponse.json({ error: "Could not verify the selected class." }, { status: 500 });
    }
    if (!classroom) {
      return NextResponse.json({ error: "The selected class is outside your access scope." }, { status: 403 });
    }
    classId = classroom?.id ?? "";
  }

  const search = (params.get("search") ?? "").trim().slice(0, 80);
  const safeSearch = search.replace(/[^A-Za-z0-9\s_-]/g, "");
  async function loadPage(offset: number) {
    const { data, error } = await supabase.rpc("education_get_attendance_report_page", {
      p_org_id: orgId,
      p_branch_ids: branchIds,
      p_from: from,
      p_to: to,
      p_search: safeSearch,
      p_class_id: classId || null,
      p_status: status,
      p_page_size: PAGE_SIZE,
      p_offset: offset,
    });
    if (error) {
      console.error("Could not load attendance report rows for export:", error.message);
      throw new Error("Could not load attendance report rows for export.");
    }
    return parseEducationAttendanceReportResult(data?.[0]);
  }

  let firstPage: ReturnType<typeof parseEducationAttendanceReportResult>;
  try {
    firstPage = await loadPage(0);
  } catch (error) {
    console.error("Could not start Think Education attendance report export:", error);
    return NextResponse.json({ error: "Could not load attendance report rows for export." }, { status: 500 });
  }
  if (firstPage.totalCount > MAX_EXPORT_RECORDS) {
    return NextResponse.json({
      error: `This export contains ${firstPage.totalCount.toLocaleString()} records, above the ${MAX_EXPORT_RECORDS.toLocaleString()} row limit. Narrow the date range or add filters.`,
    }, { status: 413 });
  }

  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const lines = [[
    "Date",
    "Student ID",
    "Student",
    "Campus",
    "Attendance status",
    "Note",
  ].map(csvCell).join(",")];
  for (let offset = 0; offset < firstPage.totalCount; offset += PAGE_SIZE) {
    let page = firstPage;
    if (offset > 0) {
      try {
        page = await loadPage(offset);
      } catch (error) {
        console.error("Could not load an attendance report export page:", error);
        return NextResponse.json({ error: "Could not load attendance report rows for export." }, { status: 500 });
      }
    }
    for (const row of page.rows) {
      lines.push([
        row.attendance_date,
        row.student_number,
        [row.first_name, row.other_names, row.last_name].filter(Boolean).join(" "),
        campusNameById.get(row.branch_id) ?? "Campus",
        row.status,
        row.note ?? "",
      ].map(csvCell).join(","));
    }
  }

  return new NextResponse(`\uFEFF${lines.join("\r\n")}`, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="education-attendance-${from}-to-${to}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
