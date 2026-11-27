import { notFound, redirect } from "next/navigation";
import { StudentProfileView } from "./student-profile-view";
import type { EducationStudentProfile } from "@/lib/education/student-profile";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationCurrencyConfig } from "@/lib/currency/settings";
import { getCurrencyConfig } from "@/lib/currency";
import { getProductAppPath } from "@/lib/product-app-routes";
import { EducationRecordSwitcher } from "../../record-switcher";

const PROFILE_TABS = [
  "overview", "personal", "academic", "performance", "exams", "attendance",
  "fees", "guardians", "learning", "behaviour", "health", "documents",
  "communication", "history",
] as const;

type PageProps = {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function EducationStudentProfilePage({ params, searchParams }: PageProps) {
  const [{ studentId }, queryParams] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(studentId)) {
    notFound();
  }

  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");

  const [
    canViewStudents,
    canExportStudents,
    canEditStudent,
    canViewAcademics,
    canViewResults,
    canViewAttendance,
    canViewFinanceCharges,
    canViewFinancePayments,
    canRecordFeePayment,
    canViewGuardians,
    canViewDocuments,
    canCreateDocuments,
    canViewSensitiveDocuments,
    canCreateSensitiveDocuments,
    canEditDocuments,
    canViewTransfers,
    canViewDiscipline,
    { campuses },
  ] = await Promise.all([
    canTabPermission("education_students", "students", "list", "view"),
    canTabPermission("education_students", "students", "list", "export"),
    canTabPermission("education_students", "students", "list", "edit"),
    canTabPermission("education_academics", "academics", "calendar", "view"),
    canTabPermission("education_results", "results", "gradebook", "view"),
    canTabPermission("education_attendance", "attendance", "register", "view"),
    canTabPermission("education_finance", "finance", "charges", "view"),
    canTabPermission("education_finance", "finance", "payments", "view"),
    canTabPermission("education_finance", "finance", "payments", "create"),
    canTabPermission("education_guardians", "guardians", "directory", "view"),
    canTabPermission("education_documents", "documents", "library", "view"),
    canTabPermission("education_documents", "documents", "library", "create"),
    canTabPermission("education_sensitive_documents", "documents", "medical", "view"),
    canTabPermission("education_sensitive_documents", "documents", "medical", "create"),
    canTabPermission("education_documents", "documents", "library", "edit"),
    canTabPermission("education_transfers", "transfers", "requests", "view"),
    canTabPermission("education_discipline", "discipline", "incidents", "view"),
    getAccessibleEducationCampuses(context.orgId, context.userId),
  ]);
  if (!canViewStudents) redirect("/dashboard?accessDenied=think-education.students");

  const campusIds = campuses.map((campus) => campus.id);
  if (!campusIds.length) notFound();
  const supabase = await createClient();
  const { data: studentRow, error: studentError } = await supabase.from("education_students")
    .select("id, student_number, first_name, last_name, other_names, email, phone, date_of_birth, gender, nationality, home_address, branch_id, status, photo_path, created_at")
    .eq("org_id", context.orgId)
    .eq("id", studentId)
    .in("branch_id", campusIds)
    .maybeSingle();
  if (studentError) {
    console.error("Could not load Think Education student profile:", studentError.message);
    throw new Error("The student profile could not be loaded.");
  }
  if (!studentRow) notFound();

  const student: EducationStudentProfile & { created_at: string } = studentRow;
  const selectedTabParam = firstParam(queryParams.tab);
  const selectedTab = PROFILE_TABS.includes(selectedTabParam as typeof PROFILE_TABS[number])
    ? selectedTabParam as typeof PROFILE_TABS[number]
    : "overview";
  const isPopup = firstParam(queryParams.popup) === "1";
  const switchSearch = firstParam(queryParams.switchSearch).trim().slice(0, 80);
  const canViewFinance = canViewFinanceCharges && canViewFinancePayments;
  const campusName = campuses.find((campus) => campus.id === student.branch_id)?.name ?? "Campus";
  const safeSwitchSearch = switchSearch.replace(/[^A-Za-z0-9\s_-]/g, "");
  let switchQuery = supabase.from("education_students")
    .select("id, student_number, first_name, last_name, other_names, branch_id, status")
    .eq("org_id", context.orgId)
    .in("branch_id", campusIds)
    .order("last_name")
    .order("first_name")
    .limit(50);
  if (safeSwitchSearch) {
    const pattern = `%${safeSwitchSearch}%`;
    switchQuery = switchQuery.or(`student_number.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern},other_names.ilike.${pattern}`);
  } else if (switchSearch) {
    switchQuery = switchQuery.eq("id", "00000000-0000-0000-0000-000000000000");
  }
  const { data: studentSwitchRows, error: studentSwitchError } = await switchQuery;
  if (studentSwitchError) throw new Error(`Could not load student profile search results: ${studentSwitchError.message}`);
  const studentSwitchRecords = (studentSwitchRows ?? []).map((row) => ({
    id: row.id,
    label: `${row.student_number} · ${[row.first_name, row.other_names, row.last_name].filter(Boolean).join(" ")} · ${campuses.find((campus) => campus.id === row.branch_id)?.name ?? "Campus"} · ${row.status.replaceAll("_", " ")}`,
    href: `${getProductAppPath("think-education", `/students/${row.id}`)}?tab=${selectedTab}`,
  }));
  const paymentError = firstParam(queryParams.error) === "invalid" || firstParam(queryParams.error) === "payment"
    ? "Payment must be valid and cannot exceed the remaining balance."
    : firstParam(queryParams.error) === "accounting-mapping"
      ? "Configure the required campus account mappings before recording this payment."
      : firstParam(queryParams.error) === "accounting-period"
        ? "This payment date is outside an open accounting period."
        : firstParam(queryParams.error) === "not-found"
          ? "The fee charge could not be found or is no longer available."
        : firstParam(queryParams.error) === "save"
          ? "The payment could not be saved. Please try again."
          : null;
  const documentErrorMessages: Record<string, string> = {
    auth: "Sign in before uploading a document.",
    permission: "Your role does not allow this document action.",
    campus: "Choose one of your assigned campuses.",
    student: "The selected student is not active at this campus.",
    invalid: "Check the document details, file type, file size, and retention date.",
    upload: "The file could not be uploaded. Check the file and try again.",
    save: "The document record could not be saved.",
  };
  const documentError = documentErrorMessages[firstParam(queryParams.documentError)] ?? null;

  const needsAcademics = ["overview", "academic", "performance", "exams", "history", "personal"].includes(selectedTab)
    && canViewAcademics;
  const needsAttendance = ["overview", "attendance"].includes(selectedTab) && canViewAttendance;
  const needsResults = ["overview", "performance", "exams"].includes(selectedTab) && canViewResults;
  const needsFinance = ["overview", "fees"].includes(selectedTab) && canViewFinance;
  const needsGuardians = ["overview", "guardians"].includes(selectedTab) && canViewGuardians;
  const needsDocuments = selectedTab === "documents" && canViewDocuments;
  const needsTransfers = ["history"].includes(selectedTab) && canViewTransfers;
  const needsAdmission = ["overview", "personal", "history"].includes(selectedTab) && canViewAcademics;
  const needsConsent = selectedTab === "personal";
  const attendanceTrendToday = new Date().toISOString().slice(0, 10);
  const attendanceTrendStartDate = `${Number(attendanceTrendToday.slice(0, 4)) - 4}-01-01`;

  async function loadAttendanceTrend() {
    const records: Array<{ attendance_date: string; status: string }> = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase.from("education_attendance")
        .select("attendance_date, status")
        .eq("org_id", context.orgId)
        .eq("student_id", student.id)
        .in("branch_id", campusIds)
        .gte("attendance_date", attendanceTrendStartDate)
        .order("attendance_date", { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (error) return { data: null, error };
      records.push(...(data ?? []));
      if (!data || data.length < pageSize) break;
    }
    return { data: records, error: null };
  }

  async function loadLessonAttendanceTrend() {
    const records: Array<{ attendance_date: string; status: string }> = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase.from("education_lesson_attendance")
        .select("attendance_date, status")
        .eq("org_id", context.orgId)
        .eq("student_id", student.id)
        .in("branch_id", campusIds)
        .gte("attendance_date", attendanceTrendStartDate)
        .order("attendance_date", { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (error) return { data: null, error };
      records.push(...(data ?? []));
      if (!data || data.length < pageSize) break;
    }
    return { data: records, error: null };
  }

  const [{ data: activeEnrollmentRow, error: activeEnrollmentError }, studentPhoto] = await Promise.all([
    supabase.from("education_student_enrollments")
      .select("id, class_id, academic_year_id, status, enrolled_on, ended_on")
      .eq("org_id", context.orgId).eq("student_id", student.id).in("branch_id", campusIds)
      .eq("status", "active").order("enrolled_on", { ascending: false }).limit(1).maybeSingle(),
    student.photo_path
      ? supabase.storage.from("education-student-images").createSignedUrl(student.photo_path, 60 * 60)
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (activeEnrollmentError) throw new Error("The student profile current placement could not be loaded.");
  if (studentPhoto.error) {
    console.error("Could not load Think Education student photo:", studentPhoto.error.message);
    throw new Error("The student photo could not be loaded.");
  }
  const studentPhotoUrl = studentPhoto.data?.signedUrl ?? null;

  const [
    enrollmentResult,
    attendanceResult,
    resultsResult,
    chargesResult,
    guardianRelationshipsResult,
    documentsResult,
    transfersResult,
    admissionResult,
    currencyConfig,
    consentResult,
    attendanceTrendResult,
    lessonAttendanceTrendResult,
  ] = await Promise.all([
    needsAcademics
      ? supabase.from("education_student_enrollments")
        .select("id, class_id, academic_year_id, status, enrolled_on, ended_on")
        .eq("org_id", context.orgId).eq("student_id", student.id).in("branch_id", campusIds)
        .order("enrolled_on", { ascending: false }).limit(200)
      : Promise.resolve({ data: [], error: null }),
    needsAttendance
      ? supabase.from("education_attendance")
        .select("id, class_id, attendance_date, status, note")
        .eq("org_id", context.orgId).eq("student_id", student.id).in("branch_id", campusIds)
        .order("attendance_date", { ascending: false }).limit(selectedTab === "overview" ? 30 : 100)
      : Promise.resolve({ data: [], error: null }),
    needsResults
      ? supabase.from("education_results")
        .select("id, examination_id, subject_name, score, maximum_score, grade, status, created_at")
        .eq("org_id", context.orgId).eq("student_id", student.id).in("branch_id", campusIds)
        .eq("status", "published").order("created_at", { ascending: false }).limit(selectedTab === "overview" ? 10 : 100)
      : Promise.resolve({ data: [], error: null }),
    needsFinance
      ? supabase.from("education_fee_charges")
        .select("id, description, amount, due_on, status, created_at")
        .eq("org_id", context.orgId).eq("student_id", student.id).in("branch_id", campusIds)
        .order("created_at", { ascending: false }).limit(selectedTab === "overview" ? 30 : 100)
      : Promise.resolve({ data: [], error: null }),
    needsGuardians
      ? supabase.from("education_student_guardians")
        .select("id, guardian_id, relationship, is_primary, status")
        .eq("org_id", context.orgId).eq("student_id", student.id).in("branch_id", campusIds)
        .in("status", ["pending", "verified"])
      : Promise.resolve({ data: [], error: null }),
    needsDocuments
      ? supabase.from("education_documents")
        .select("id, title, category, file_name, content_type, file_size, verification_status, retention_until, status, created_at")
        .eq("org_id", context.orgId).eq("student_id", student.id).eq("branch_id", student.branch_id)
        .eq("status", "active").order("created_at", { ascending: false }).limit(100)
      : Promise.resolve({ data: [], error: null }),
    needsTransfers
      ? supabase.from("education_student_transfers")
        .select("id, source_branch_id, destination_branch_id, effective_on, reason, status, created_at")
        .eq("org_id", context.orgId).eq("student_id", student.id)
        .or(`source_branch_id.in.(${campusIds.join(",")}),destination_branch_id.in.(${campusIds.join(",")})`)
        .order("created_at", { ascending: false }).limit(100)
      : Promise.resolve({ data: [], error: null }),
    needsAdmission
      ? supabase.from("education_admissions")
        .select("application_number").eq("org_id", context.orgId).eq("enrolled_student_id", student.id)
        .eq("branch_id", student.branch_id).limit(1).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    needsFinance ? getOrganizationCurrencyConfig() : Promise.resolve(null),
    needsConsent
      ? supabase.from("education_student_consent_events")
        .select("id, consent_type, disclosure_version, decision, signer_name, signer_relationship, evidence_note, recorded_at")
        .eq("org_id", context.orgId).eq("student_id", student.id).eq("branch_id", student.branch_id)
        .order("recorded_at", { ascending: false }).limit(100)
      : Promise.resolve({ data: [], error: null }),
    selectedTab === "overview" && canViewAttendance
      ? loadAttendanceTrend()
      : Promise.resolve({ data: [], error: null }),
    selectedTab === "overview" && canViewAttendance
      ? loadLessonAttendanceTrend()
      : Promise.resolve({ data: [], error: null }),
  ]);

  const queryErrors = [
    ["academic enrollments", enrollmentResult.error],
    ["attendance", attendanceResult.error],
    ["results", resultsResult.error],
    ["fee charges", chargesResult.error],
    ["guardian relationships", guardianRelationshipsResult.error],
    ["student documents", documentsResult.error],
    ["student transfers", transfersResult.error],
    ["student admission", admissionResult.error],
    ["student consent history", consentResult.error],
    ["attendance trend", attendanceTrendResult.error],
    ["lesson attendance trend", lessonAttendanceTrendResult.error],
  ] as const;
  for (const [label, error] of queryErrors) {
    if (error) {
      console.error(`Could not load Think Education ${label}:`, error.message);
      throw new Error(`The student profile ${label} could not be loaded.`);
    }
  }
  const enrollmentRows = [
    ...(activeEnrollmentRow ? [activeEnrollmentRow] : []),
    ...(enrollmentResult.data ?? []).filter((row) => !activeEnrollmentRow || row.id !== activeEnrollmentRow.id),
  ];
  const classIds = [...new Set(enrollmentRows.map((row) => row.class_id))];
  const academicYearIds = [...new Set(enrollmentRows.map((row) => row.academic_year_id))];
  const [{ data: classes, error: classesError }, { data: academicYears, error: academicYearsError }] = classIds.length || academicYearIds.length
    ? await Promise.all([
      classIds.length
        ? supabase.from("education_classes").select("id, name, class_teacher_id").eq("org_id", context.orgId).in("branch_id", campusIds).in("id", classIds)
        : Promise.resolve({ data: [], error: null }),
      academicYearIds.length
        ? supabase.from("education_academic_years").select("id, name").eq("org_id", context.orgId).in("id", academicYearIds)
        : Promise.resolve({ data: [], error: null }),
    ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (classesError) throw new Error(`Could not load classes for the student profile: ${classesError.message}`);
  if (academicYearsError) throw new Error(`Could not load academic years for the student profile: ${academicYearsError.message}`);
  const canAssignClass = canEditStudent && canViewAcademics;
  let activeAcademicYear: { id: string; name: string } | null = null;
  let availableClassRows: Array<{ id: string; name: string }> = [];
  if (canAssignClass && student.status === "active" && !activeEnrollmentRow) {
    const { data: currentYear, error: currentYearError } = await supabase.from("education_academic_years")
      .select("id, name")
      .eq("org_id", context.orgId)
      .eq("status", "active")
      .order("starts_on", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (currentYearError) throw new Error(`Could not load the active academic year for student enrollment: ${currentYearError.message}`);
    activeAcademicYear = currentYear;
    if (currentYear) {
      if (!enrollmentRows.some((row) => row.academic_year_id === currentYear.id)) {
        const { data: currentYearClasses, error: currentYearClassesError } = await supabase.from("education_classes")
          .select("id, name")
          .eq("org_id", context.orgId)
          .eq("branch_id", student.branch_id)
          .eq("academic_year_id", currentYear.id)
          .eq("status", "active")
          .order("name");
        if (currentYearClassesError) throw new Error(`Could not load available classes for student enrollment: ${currentYearClassesError.message}`);
        availableClassRows = currentYearClasses ?? [];
      }
    }
  }
  const enrollmentClasses = availableClassRows.map((classroom) => ({
    id: classroom.id,
    label: `${classroom.name} · ${activeAcademicYear?.name ?? "Active academic year"}`,
  }));
  const teacherIds = [...new Set((classes ?? []).map((item) => item.class_teacher_id).filter((id): id is string => Boolean(id)))];
  const { data: teachers, error: teachersError } = teacherIds.length
    ? await supabase.from("education_staff").select("id, first_name, last_name").eq("org_id", context.orgId).in("branch_id", campusIds).in("id", teacherIds)
    : { data: [], error: null };
  if (teachersError) throw new Error(`Could not load class teachers for the student profile: ${teachersError.message}`);
  const classById = new Map((classes ?? []).map((row) => [row.id, row]));
  const yearById = new Map((academicYears ?? []).map((row) => [row.id, row.name]));
  const teacherById = new Map((teachers ?? []).map((row) => [row.id, `${row.first_name} ${row.last_name}`]));
  const enrollments = enrollmentRows.map((row) => {
    const classroom = classById.get(row.class_id);
    return {
      id: row.id,
      status: row.status,
      enrolled_on: row.enrolled_on,
      ended_on: row.ended_on,
      class_name: classroom?.name ?? "Unknown class",
      year_name: yearById.get(row.academic_year_id) ?? "Unknown academic year",
      teacher_name: classroom?.class_teacher_id ? teacherById.get(classroom.class_teacher_id) ?? null : null,
    };
  });
  const enrollmentNotice = firstParam(queryParams.enrolled) === "1"
    ? "Student enrolled in the selected class."
    : firstParam(queryParams.enrollmentError) === "invalid"
      ? "Select an active class for this student."
      : firstParam(queryParams.enrollmentError) === "exists"
        ? "This student already has an enrollment record for the active academic year."
        : firstParam(queryParams.enrollmentError) === "unavailable"
          ? "The student or class is no longer available at this campus."
          : firstParam(queryParams.enrollmentError) === "inactive"
            ? "The student already has an active enrollment, is inactive, or the class is full. Check the current placement and class capacity."
            : firstParam(queryParams.enrollmentError) === "save"
              ? "The student could not be enrolled. Please try again."
              : null;

  const attendanceClassIds = [...new Set((attendanceResult.data ?? []).map((row) => row.class_id).filter((id): id is string => Boolean(id)))];
  const { data: attendanceClasses, error: attendanceClassesError } = attendanceClassIds.length
    ? await supabase.from("education_classes").select("id, name").eq("org_id", context.orgId).in("branch_id", campusIds).in("id", attendanceClassIds)
    : { data: [], error: null };
  if (attendanceClassesError) throw new Error(`Could not load attendance class names: ${attendanceClassesError.message}`);
  const attendanceClassById = new Map((attendanceClasses ?? []).map((row) => [row.id, row.name]));
  const attendance = (attendanceResult.data ?? []).map((row) => ({
    id: row.id,
    attendance_date: row.attendance_date,
    status: row.status,
    note: row.note,
    class_name: row.class_id ? attendanceClassById.get(row.class_id) ?? null : null,
  }));
  const attendanceTrend = [
    ...(attendanceTrendResult.data ?? []),
    ...(lessonAttendanceTrendResult.data ?? []),
  ];
  const attendanceRateRecords = [
    ...(attendanceResult.data ?? []).map((row) => ({
      attendance_date: row.attendance_date,
      status: row.status,
    })),
    ...(lessonAttendanceTrendResult.data ?? []).slice(0, 30),
  ].sort((left, right) => right.attendance_date.localeCompare(left.attendance_date)).slice(0, 30);

  const resultRows = resultsResult.data ?? [];
  const examinationIds = [...new Set(resultRows.map((row) => row.examination_id))];
  const { data: examinationsData, error: examinationsError } = examinationIds.length
    ? await supabase.from("education_examinations")
      .select("id, name, academic_year_id, term_id, status, starts_at, created_at")
      .eq("org_id", context.orgId).in("branch_id", campusIds).in("id", examinationIds)
    : { data: [], error: null };
  if (examinationsError) throw new Error(`Could not load student examinations: ${examinationsError.message}`);
  const examYearIds = [...new Set((examinationsData ?? []).map((row) => row.academic_year_id))];
  const examTermIds = [...new Set((examinationsData ?? []).map((row) => row.term_id).filter((id): id is string => Boolean(id)))];
  const [{ data: examYears, error: examYearsError }, { data: terms, error: termsError }] = examYearIds.length || examTermIds.length
    ? await Promise.all([
      examYearIds.length
        ? supabase.from("education_academic_years").select("id, name").eq("org_id", context.orgId).in("id", examYearIds)
        : Promise.resolve({ data: [], error: null }),
      examTermIds.length
        ? supabase.from("education_academic_terms").select("id, name").eq("org_id", context.orgId).in("id", examTermIds)
        : Promise.resolve({ data: [], error: null }),
    ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (examYearsError) throw new Error(`Could not load examination academic years: ${examYearsError.message}`);
  if (termsError) throw new Error(`Could not load examination terms: ${termsError.message}`);
  const latestPublishedExam = selectedTab === "overview" && canViewResults && activeEnrollmentRow
    ? (examinationsData ?? [])
      .filter((exam) => exam.status === "published"
        && exam.academic_year_id === activeEnrollmentRow.academic_year_id
        && resultRows.some((result) => result.examination_id === exam.id && result.status === "published"))
      .sort((left, right) =>
        (right.starts_at ?? right.created_at).localeCompare(left.starts_at ?? left.created_at)
      )[0] ?? null
    : null;
  let classPosition: { position: number; cohortSize: number; examinationName: string } | null = null;
  let classPositionStatus = !canViewResults || !canViewAcademics
    ? "Restricted"
    : !activeEnrollmentRow
      ? "No active class"
      : latestPublishedExam
        ? "Ranking available in academic reports"
        : "No published results";
  if (selectedTab === "overview" && canViewResults && canViewAcademics && activeEnrollmentRow) {
    const { data: positionData, error: positionError } = await supabase.rpc(
      "education_get_student_class_position",
      { p_org_id: context.orgId, p_student_id: student.id },
    );
    if (positionError) {
      console.error("Could not load the student class position:", positionError.message);
      classPositionStatus = "Ranking unavailable";
    } else {
      const positionRow = (positionData ?? []).at(0);
      if (positionRow?.student_position && positionRow.cohort_size) {
        classPosition = {
          position: positionRow.student_position,
          cohortSize: positionRow.cohort_size,
          examinationName: positionRow.examination_name,
        };
        classPositionStatus = "";
      }
    }
  }
  const examYearById = new Map((examYears ?? []).map((row) => [row.id, row.name]));
  const termById = new Map((terms ?? []).map((row) => [row.id, row.name]));
  const examinations = (examinationsData ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    academic_year_name: examYearById.get(row.academic_year_id) ?? "Unknown academic year",
    term_name: row.term_id ? termById.get(row.term_id) ?? null : null,
    status: "",
  }));
  const results = resultRows.map((row) => ({
    id: row.id,
    examination_id: row.examination_id,
    subject_name: row.subject_name,
    score: row.score,
    maximum_score: row.maximum_score,
    grade: row.grade,
    status: row.status,
    created_at: row.created_at,
  }));

  const componentResultIds = results.filter((row) => row.status === "published").map((row) => row.id);
  const { data: componentScoreRows, error: componentScoresError } = componentResultIds.length
    ? await supabase.from("education_result_component_scores")
      .select("result_id, component_id, score").eq("org_id", context.orgId).in("result_id", componentResultIds)
    : { data: [], error: null };
  if (componentScoresError) throw new Error(`Could not load assessment component scores: ${componentScoresError.message}`);
  const componentIds = [...new Set((componentScoreRows ?? []).map((row) => row.component_id))];
  const { data: componentRows, error: componentsError } = componentIds.length
    ? await supabase.from("education_assessment_components")
      .select("id, name, maximum_score, weight_percentage").eq("org_id", context.orgId).in("id", componentIds)
    : { data: [], error: null };
  if (componentsError) throw new Error(`Could not load assessment component definitions: ${componentsError.message}`);
  const componentById = new Map((componentRows ?? []).map((row) => [row.id, row]));
  const componentScores = (componentScoreRows ?? []).flatMap((row) => {
    const component = componentById.get(row.component_id);
    return component ? [{
      result_id: row.result_id,
      name: component.name,
      score: row.score,
      maximum_score: component.maximum_score,
      weight_percentage: component.weight_percentage,
    }] : [];
  });

  const chargeRows = chargesResult.data ?? [];
  const chargeIds = chargeRows.map((row) => row.id);
  const { data: paymentRows, error: paymentsError } = canViewFinancePayments && chargeIds.length
    ? await supabase.from("education_fee_payments").select("charge_id, amount")
      .eq("org_id", context.orgId).in("charge_id", chargeIds)
    : { data: [], error: null };
  if (paymentsError) throw new Error(`Could not load student fee payments: ${paymentsError.message}`);
  const paidByCharge = new Map<string, number>();
  for (const payment of paymentRows ?? []) {
    paidByCharge.set(payment.charge_id, (paidByCharge.get(payment.charge_id) ?? 0) + payment.amount);
  }
  const charges = chargeRows.map((row) => ({
    id: row.id,
    description: row.description,
    amount: row.amount,
    due_on: row.due_on,
    status: row.status,
    created_at: row.created_at,
    paid: paidByCharge.get(row.id) ?? 0,
  }));

  const relationships = guardianRelationshipsResult.data ?? [];
  const guardianIds = [...new Set(relationships.map((row) => row.guardian_id))];
  const { data: guardianProfiles, error: guardianProfilesError } = guardianIds.length
    ? await supabase.from("education_guardians").select("id, first_name, last_name, email, phone")
      .eq("org_id", context.orgId).in("id", guardianIds)
    : { data: [], error: null };
  if (guardianProfilesError) throw new Error(`Could not load linked guardian profiles: ${guardianProfilesError.message}`);
  const guardianById = new Map((guardianProfiles ?? []).map((row) => [row.id, row]));
  const guardians = relationships.flatMap((relationship) => {
    const guardian = guardianById.get(relationship.guardian_id);
    return guardian ? [{
      id: relationship.id,
      first_name: guardian.first_name,
      last_name: guardian.last_name,
      email: guardian.email,
      phone: guardian.phone,
      relationship: relationship.relationship,
      is_primary: relationship.is_primary,
      status: relationship.status,
    }] : [];
  });

  const documents = (documentsResult.data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    category: row.category,
    file_name: row.file_name,
    content_type: row.content_type,
    file_size: row.file_size,
    verification_status: row.verification_status,
    retention_until: row.retention_until,
    status: row.status,
    created_at: row.created_at,
  }));
  const communications: Array<{
    id: string;
    title: string;
    message: string;
    notification_type: string;
    delivery_status: string;
    created_at: string;
  }> = [];
  const fullName = [student.first_name, student.other_names, student.last_name].filter(Boolean).join(" ");
  const profileCurrencyConfig = currencyConfig ?? getCurrencyConfig();

  return <StudentProfileView
    student={{ ...student, admissionNumber: admissionResult.data?.application_number ?? null, campusName }}
    studentPhotoUrl={studentPhotoUrl}
    fullName={fullName}
    selectedTab={selectedTab}
    isPopup={isPopup}
    attendanceTrend={attendanceTrend}
    attendanceTrendToday={attendanceTrendToday}
    attendanceRateRecords={attendanceRateRecords}
    recordSwitcher={{
      recordType: "student",
      searchPath: getProductAppPath("think-education", `/students/${student.id}`),
      tab: selectedTab,
      search: switchSearch,
      records: studentSwitchRecords,
    }}
    permissions={{
      canEditStudent,
      canPrintAcademicHistory: canExportStudents,
      canViewAcademics,
      canViewResults,
      canViewAttendance,
      canViewFinance,
      canViewGuardians,
      canViewDocuments,
      canCreateDocuments,
      canViewSensitiveDocuments,
      canCreateSensitiveDocuments,
      canEditDocuments,
      canViewTransfers,
      canViewDiscipline,
    }}
    enrollments={enrollments}
    canAssignClass={canAssignClass}
    enrollmentClasses={enrollmentClasses}
    enrollmentNotice={enrollmentNotice}
    enrollmentNoticeIsError={Boolean(firstParam(queryParams.enrollmentError))}
    attendance={attendance}
    results={results}
    examinations={examinations}
    componentScores={componentScores}
    charges={charges}
    guardians={guardians}
    documents={documents}
    transfers={transfersResult.data ?? []}
    communications={communications}
    consentEvents={consentResult.data ?? []}
    currencyConfig={profileCurrencyConfig}
    canRecordFeePayment={canRecordFeePayment}
    paymentRecorded={firstParam(queryParams.paid) === "1"}
    paymentError={paymentError}
    documentUploaded={firstParam(queryParams.documentUploaded) === "1"}
    documentError={documentError}
    classPosition={classPosition}
    classPositionStatus={classPositionStatus}
  />;
}
