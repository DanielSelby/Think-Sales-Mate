import { NextResponse, type NextRequest } from "next/server";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";

const BATCH_SIZE = 1000;
const ATTENDANCE_STATUSES = ["present", "absent", "late", "excused"] as const;
type AttendanceStatus = typeof ATTENDANCE_STATUSES[number];

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

  const [canView, canExport, canViewClasses] = await Promise.all([
    canTabPermission("education_attendance", "attendance", "register", "view"),
    canTabPermission("education_attendance", "attendance", "register", "export"),
    canTabPermission("education_academics", "academics", "classes", "view"),
  ]);
  if (!canView || !canExport) {
    return NextResponse.json({ error: "You do not have permission to export attendance." }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const requestedDate = params.get("date") ?? "";
  const attendanceDate = isValidDate(requestedDate) ? requestedDate : new Date().toISOString().slice(0, 10);
  const requestedBranch = params.get("branch") ?? "";
  const search = (params.get("search") ?? "").trim().slice(0, 80);
  const safeSearch = search.replace(/[^A-Za-z0-9\s_-]/g, "");
  const requestedStatus = params.get("status") ?? "";
  const statusFilter = ATTENDANCE_STATUSES.find((status) => status === requestedStatus) ?? "";
  if (requestedStatus && !statusFilter) {
    return NextResponse.json({ error: "The selected attendance status is invalid." }, { status: 400 });
  }
  const requestedClass = params.get("class") ?? "";
  if (requestedClass && !canViewClasses) {
    return NextResponse.json({ error: "You do not have permission to export class attendance filters." }, { status: 403 });
  }
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  if (requestedBranch && !campusIds.includes(requestedBranch)) {
    return NextResponse.json({ error: "The selected campus is outside your access scope." }, { status: 403 });
  }
  const branchIds = requestedBranch ? [requestedBranch] : campusIds;
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const supabase = await createClient();
  let classFilter = "";
  if (requestedClass) {
    if (!branchIds.length) {
      return NextResponse.json({ error: "The selected class is outside your access scope." }, { status: 403 });
    }
    const { data: classroom, error: classError } = await supabase.from("education_classes")
      .select("id")
      .eq("org_id", context.orgId)
      .eq("id", requestedClass)
      .in("branch_id", branchIds)
      .maybeSingle();
    if (classError) throw new Error(`Could not verify the class for attendance export: ${classError.message}`);
    if (!classroom) {
      return NextResponse.json({ error: "The selected class is outside your access scope." }, { status: 403 });
    }
    classFilter = classroom.id;
  }
  const encoder = new TextEncoder();
  let offset = 0;
  let finished = !branchIds.length;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode([
        ["Student ID", "Student", "Campus", "Class", "Attendance status", "Note", "Date"]
          .map(csvCell).join(","),
        "",
      ].join("\n")));
      if (finished) controller.close();
    },
    async pull(controller) {
      if (finished) return;
      try {
        let query = supabase.from("education_students")
          .select("id, student_number, first_name, last_name, branch_id")
          .eq("org_id", context.orgId)
          .in("branch_id", branchIds)
          .eq("status", "active")
          .order("last_name").order("first_name").order("id")
          .range(offset, offset + BATCH_SIZE - 1);
        if (safeSearch) {
          const pattern = `%${safeSearch}%`;
          query = query.or(`student_number.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern}`);
        }
        const { data: students, error: studentsError } = await query;
        if (studentsError) throw new Error(`Could not load students for attendance export: ${studentsError.message}`);
        if (!students?.length) {
          finished = true;
          controller.close();
          return;
        }

        const studentIds = students.map((student) => student.id);
        const { data: records, error: attendanceError } = await supabase.from("education_attendance")
          .select("student_id, status, note")
          .eq("org_id", context.orgId)
          .eq("attendance_date", attendanceDate)
          .in("student_id", studentIds);
        if (attendanceError) throw new Error(`Could not load attendance records for export: ${attendanceError.message}`);

        const attendanceByStudent = new Map<string, { status: AttendanceStatus; note: string | null }>();
        for (const record of records ?? []) {
          if (record.student_id && ATTENDANCE_STATUSES.includes(record.status as AttendanceStatus)) {
            attendanceByStudent.set(record.student_id, { status: record.status as AttendanceStatus, note: record.note });
          }
        }

        const classIdByStudent = new Map<string, string>();
        if (canViewClasses) {
          const { data: enrollments, error: enrollmentError } = await supabase.from("education_student_enrollments")
            .select("student_id, class_id")
            .eq("org_id", context.orgId)
            .in("branch_id", branchIds)
            .in("student_id", studentIds)
            .lte("enrolled_on", attendanceDate)
            .or(`and(status.eq.active,ended_on.is.null),ended_on.gte.${attendanceDate}`)
            .order("enrolled_on", { ascending: false });
          if (enrollmentError) throw new Error(`Could not load student classes for attendance export: ${enrollmentError.message}`);
          for (const enrollment of enrollments ?? []) {
            if (!classIdByStudent.has(enrollment.student_id)) {
              classIdByStudent.set(enrollment.student_id, enrollment.class_id);
            }
          }
        }
        const classIds = [...new Set(classIdByStudent.values())];
        const { data: classRows, error: classError } = classIds.length
          ? await supabase.from("education_classes")
            .select("id, name")
            .eq("org_id", context.orgId)
            .in("id", classIds)
          : { data: [], error: null };
        if (classError) throw new Error(`Could not load student class names for attendance export: ${classError.message}`);
        const classNameById = new Map((classRows ?? []).map((classroom) => [classroom.id, classroom.name]));
        const lines = students.flatMap((student) => {
          const attendance = attendanceByStudent.get(student.id);
          const classId = classIdByStudent.get(student.id) ?? "";
          if (statusFilter && attendance?.status !== statusFilter) return [];
          if (classFilter && classId !== classFilter) return [];
          return [
            student.student_number,
            `${student.first_name} ${student.last_name}`.trim(),
            campusNameById.get(student.branch_id) ?? "Campus",
            canViewClasses ? classNameById.get(classId) ?? "Unassigned" : "Restricted",
            attendance?.status ?? "not_marked",
            attendance?.note ?? "",
            attendanceDate,
          ].map(csvCell).join(",");
        });
        if (lines.length) controller.enqueue(encoder.encode(`${lines.join("\n")}\n`));
        offset += students.length;
        if (students.length < BATCH_SIZE) {
          finished = true;
          controller.close();
        }
      } catch (error) {
        console.error("Could not stream Think Education attendance export:", error);
        finished = true;
        controller.error(error);
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="education-attendance-${attendanceDate}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
