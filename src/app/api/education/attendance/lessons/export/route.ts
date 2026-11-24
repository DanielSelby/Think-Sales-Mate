import { NextResponse, type NextRequest } from "next/server";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import {
  getEducationISOWeekday,
  isValidEducationAttendanceDate,
} from "@/lib/education/lesson-attendance";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";

const BATCH_SIZE = 1000;
const ATTENDANCE_STATUSES = ["present", "absent", "late", "excused"] as const;
type AttendanceStatus = typeof ATTENDANCE_STATUSES[number];

function csvCell(value: unknown) {
  const text = String(value ?? "");
  const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const context = await getCurrentOrgContext();
  if (!context) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });

  const [canViewAttendance, canExportAttendance, canViewTimetables, canViewStudents] = await Promise.all([
    canTabPermission("education_attendance", "attendance", "register", "view"),
    canTabPermission("education_attendance", "attendance", "register", "export"),
    canTabPermission("education_timetables", "timetables", "schedule", "view"),
    canTabPermission("education_students", "students", "list", "view"),
  ]);
  if (!canViewAttendance || !canExportAttendance || !canViewTimetables || !canViewStudents) {
    return NextResponse.json({ error: "You do not have permission to export lesson attendance." }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const requestedDate = params.get("date") ?? "";
  const attendanceDate = isValidEducationAttendanceDate(requestedDate)
    ? requestedDate
    : new Date().toISOString().slice(0, 10);
  const lessonId = params.get("lesson") ?? "";
  const requestedBranch = params.get("branch") ?? "";
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  if (requestedBranch && !campusIds.includes(requestedBranch)) {
    return NextResponse.json({ error: "The selected campus is outside your access scope." }, { status: 403 });
  }
  const branchIds = requestedBranch ? [requestedBranch] : campusIds;
  if (!lessonId || !branchIds.length) {
    return NextResponse.json({ error: "A valid scheduled lesson is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const weekday = getEducationISOWeekday(attendanceDate);
  const { data: lesson, error: lessonError } = await supabase.from("education_timetable_entries")
    .select("id, branch_id, class_id, academic_year_id, subject_name")
    .eq("org_id", context.orgId)
    .in("branch_id", branchIds)
    .eq("id", lessonId)
    .eq("weekday", weekday)
    .eq("status", "active")
    .maybeSingle();
  if (lessonError) {
    console.error("Could not verify lesson for attendance export:", lessonError.message);
    return NextResponse.json({ error: "Could not load the selected lesson." }, { status: 500 });
  }
  if (!lesson) return NextResponse.json({ error: "The selected lesson is unavailable." }, { status: 404 });

  const { data: classroom, error: classError } = await supabase.from("education_classes")
    .select("name")
    .eq("org_id", context.orgId)
    .eq("branch_id", lesson.branch_id)
    .eq("id", lesson.class_id)
    .maybeSingle();
  if (classError) {
    console.error("Could not load class for attendance export:", classError.message);
    return NextResponse.json({ error: "Could not load the selected class." }, { status: 500 });
  }

  const campusName = campuses.find((campus) => campus.id === lesson.branch_id)?.name ?? "Campus";
  const className = classroom?.name ?? "Class";
  const encoder = new TextEncoder();
  let offset = 0;
  let finished = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode([
        ["Student ID", "Student", "Subject", "Class", "Attendance status", "Note", "Date"]
          .map(csvCell).join(","),
        "",
      ].join("\n")));
    },
    async pull(controller) {
      if (finished) return;
      try {
        const { data: enrollments, error: enrollmentsError } = await supabase.from("education_student_enrollments")
          .select("student_id")
          .eq("org_id", context.orgId)
          .eq("branch_id", lesson.branch_id)
          .eq("class_id", lesson.class_id)
          .eq("academic_year_id", lesson.academic_year_id)
          .eq("status", "active")
          .lte("enrolled_on", attendanceDate)
          .or(`ended_on.is.null,ended_on.gte.${attendanceDate}`)
          .order("student_id")
          .range(offset, offset + BATCH_SIZE - 1);
        if (enrollmentsError) throw new Error(`Could not load the lesson roster for export: ${enrollmentsError.message}`);
        if (!enrollments?.length) {
          finished = true;
          controller.close();
          return;
        }

        const studentIds = [...new Set(enrollments.map((enrollment) => enrollment.student_id))];
        const [{ data: students, error: studentsError }, { data: attendance, error: attendanceError }] = await Promise.all([
          supabase.from("education_students")
            .select("id, student_number, first_name, last_name")
            .eq("org_id", context.orgId)
            .eq("branch_id", lesson.branch_id)
            .eq("status", "active")
            .in("id", studentIds)
            .order("last_name").order("first_name"),
          supabase.from("education_lesson_attendance")
            .select("student_id, status, note")
            .eq("org_id", context.orgId)
            .eq("timetable_entry_id", lesson.id)
            .eq("attendance_date", attendanceDate)
            .in("student_id", studentIds),
        ]);
        if (studentsError) throw new Error(`Could not load students for lesson attendance export: ${studentsError.message}`);
        if (attendanceError) throw new Error(`Could not load lesson attendance records for export: ${attendanceError.message}`);

        const attendanceByStudent = new Map<string, { status: AttendanceStatus; note: string | null }>();
        for (const record of attendance ?? []) {
          if (record.student_id && ATTENDANCE_STATUSES.includes(record.status as AttendanceStatus)) {
            attendanceByStudent.set(record.student_id, { status: record.status as AttendanceStatus, note: record.note });
          }
        }
        const lines = (students ?? []).map((student) => {
          const record = attendanceByStudent.get(student.id);
          return [
            student.student_number,
            `${student.first_name} ${student.last_name}`.trim(),
            lesson.subject_name,
            className,
            record?.status ?? "not_marked",
            record?.note ?? "",
            attendanceDate,
          ].map(csvCell).join(",");
        });
        if (lines.length) controller.enqueue(encoder.encode(`${lines.join("\n")}\n`));
        offset += enrollments.length;
        if (enrollments.length < BATCH_SIZE) {
          finished = true;
          controller.close();
        }
      } catch (error) {
        console.error("Could not stream Think Education lesson attendance export:", error);
        finished = true;
        controller.error(error);
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="education-lesson-attendance-${attendanceDate}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
