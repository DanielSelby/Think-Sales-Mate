import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, Eye, GraduationCap, Search, Users } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission, canTabPermission } from "@/lib/rbac/permissions";
import { isOrganizationSuperAdminMember } from "@/lib/organizations/member-access";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import { getOrganizationCurrencyConfig } from "@/lib/currency/settings";
import { formatCurrencyAmount } from "@/lib/currency";
import {
  EDUCATION_STUDENT_STATUSES,
  EDUCATION_STUDENT_GENDERS,
  parseEducationStudentGender,
  parseEducationStudentDirectoryResult,
  type EducationStudentDirectoryRow,
  type EducationStudentGender,
  type EducationStudentStatus,
} from "@/lib/education/student-directory";
import { createEducationStudent } from "../actions";
import { EducationRecordModal } from "@/components/education/education-record-modal";
import { EducationImportModal } from "@/components/education/education-import-modal";
import { StudentFilters } from "./student-filters";
import { StudentDirectoryActions } from "./student-directory-actions";

const PAGE_SIZE_OPTIONS = ["50", "10", "100", "all"] as const;
type PageSize = typeof PAGE_SIZE_OPTIONS[number];
const ALL_STUDENTS_LIMIT = 250;

export default async function EducationStudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canTabPermission("education_students", "students", "list", "view")) {
    redirect("/dashboard?accessDenied=think-education.students");
  }

  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search.trim().slice(0, 80) : "";
  const requestedStatus = typeof params.status === "string" ? params.status : "";
  const status = requestedStatus === "all"
    ? "all"
    : EDUCATION_STUDENT_STATUSES.find((item) => item === requestedStatus) ?? "active";
  const gender = typeof params.gender === "string" ? parseEducationStudentGender(params.gender) : "";
  const requestedPageSize = typeof params.pageSize === "string" ? params.pageSize : "";
  const pageSize = PAGE_SIZE_OPTIONS.find((item) => item === requestedPageSize) ?? "50";
  const requestedBranch = typeof params.branch === "string" ? params.branch : "";
  const requestedClass = typeof params.class === "string" ? params.class : "";
  const requestedPage = Number.parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1;
  const currentPage = pageSize === "all" ? 1 : Math.min(1_000_000, Math.max(1, requestedPage));
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const allowedBranchIds = campuses.map((campus) => campus.id);
  const selectedBranch = allowedBranchIds.includes(requestedBranch) ? requestedBranch : "";
  const branchIds = selectedBranch ? [selectedBranch] : allowedBranchIds;
  const [canCreate, canImportCapability, canExport] = await Promise.all([
    canTabPermission("education_students", "students", "list", "create"),
    canPermission("education_students", "import"),
    canTabPermission("education_students", "students", "list", "export"),
  ]);
  const canImport = canImportCapability && canCreate;
  const canCreateAccount = isOrganizationSuperAdminMember({
    role: context.role,
    userId: context.userId,
    accessPermissions: context.accessPermissions,
  });
  const supabase = await createClient();
  const safeSearch = search.replace(/[^A-Za-z0-9\s_-]/g, "");
  let classes: Array<{ id: string; name: string; branch_id: string }> = [];
  if (branchIds.length) {
    const { data: classRows, error: classesError } = await supabase.from("education_classes")
      .select("id, name, branch_id")
      .eq("org_id", context.orgId)
      .in("branch_id", branchIds)
      .order("name");
    if (classesError) throw new Error(`Could not load student directory classes: ${classesError.message}`);
    classes = classRows ?? [];
  }
  const selectedClass = classes.some((classroom) => classroom.id === requestedClass) ? requestedClass : "";

  let totalCount = 0;
  let students: EducationStudentDirectoryRow[] = [];
  let statusCounts = Object.fromEntries(EDUCATION_STUDENT_STATUSES.map((item) => [item, 0])) as Record<EducationStudentStatus, number>;
  let genderCounts = Object.fromEntries(EDUCATION_STUDENT_GENDERS.map((item) => [item, 0])) as Record<EducationStudentGender, number>;
  if (branchIds.length) {
    const numericPageSize = pageSize === "all" ? ALL_STUDENTS_LIMIT : Number(pageSize);
    const { data, error } = await supabase.rpc("education_student_directory_page", {
      p_org_id: context.orgId,
      p_branch_ids: branchIds,
      p_search: safeSearch,
      p_gender: gender,
      p_class_id: selectedClass || null,
      p_status: status,
      p_page_size: numericPageSize,
      p_offset: pageSize === "all" ? 0 : (currentPage - 1) * numericPageSize,
    });
    if (error) throw new Error(`Could not load Think Education student directory: ${error.message}`);
    const directory = parseEducationStudentDirectoryResult(data?.[0]);
    totalCount = directory.totalCount;
    students = directory.students;
    statusCounts = directory.statusCounts;
    genderCounts = directory.genderCounts;
  }

  const [canViewFinanceCharges, canViewFinancePayments] = await Promise.all([
    canTabPermission("education_finance", "finance", "charges", "view"),
    canTabPermission("education_finance", "finance", "payments", "view"),
  ]);
  const canViewBalances = canViewFinanceCharges && canViewFinancePayments;
  const [canViewAttendance, canViewResults, canViewGuardians, canEditStudent] = await Promise.all([
    canTabPermission("education_attendance", "attendance", "register", "view"),
    canTabPermission("education_results", "results", "gradebook", "view"),
    canTabPermission("education_guardians", "guardians", "directory", "view"),
    canTabPermission("education_students", "students", "list", "edit"),
  ]);
  const currencyConfig = canViewBalances ? await getOrganizationCurrencyConfig() : null;
  const studentPhotoUrlById = new Map<string, string>();
  const studentIdByPhotoPath = new Map(students.flatMap((student) =>
    student.photo_path ? [[student.photo_path, student.id] as const] : []
  ));
  const studentPhotoPaths = [...studentIdByPhotoPath.keys()];
  for (let offset = 0; offset < studentPhotoPaths.length; offset += 100) {
    const { data: signedPhotos, error: signedPhotosError } = await supabase.storage
      .from("education-student-images")
      .createSignedUrls(studentPhotoPaths.slice(offset, offset + 100), 60 * 60);
    if (signedPhotosError) {
      console.error("Could not load Think Education student directory photos:", signedPhotosError.message);
      throw new Error("Student profile photos could not be loaded.");
    }
    for (const photo of signedPhotos ?? []) {
      const studentId = photo.path ? studentIdByPhotoPath.get(photo.path) : undefined;
      if (photo.error) {
        console.error("Could not load a Think Education student directory photo:", photo.error);
      } else if (studentId && photo.signedUrl) {
        studentPhotoUrlById.set(studentId, photo.signedUrl);
      }
    }
  }

  const studentIds = students.map((student) => student.id);
  const outstandingByStudent = new Map<string, number>();
  if (canViewBalances && studentIds.length) {
    const { data: balances, error: balancesError } = await supabase.rpc(
      "education_get_student_outstanding_balances",
      {
        p_org_id: context.orgId,
        p_branch_ids: branchIds,
        p_student_ids: studentIds,
      },
    );
    if (balancesError) throw new Error(`Could not load student fee balances: ${balancesError.message}`);
    for (const balance of balances ?? []) {
      outstandingByStudent.set(balance.student_id, Number(balance.outstanding));
    }
  }

  const numericPageSize = pageSize === "all" ? Math.min(totalCount, ALL_STUDENTS_LIMIT) : Number(pageSize);
  const totalPages = pageSize === "all" ? 1 : Math.max(1, Math.ceil(totalCount / numericPageSize));
  const branchNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const exportParams = new URLSearchParams();
  if (search) exportParams.set("search", search);
  if (gender) exportParams.set("gender", gender);
  if (status !== "active") exportParams.set("status", status);
  if (selectedBranch) exportParams.set("branch", selectedBranch);
  if (selectedClass) exportParams.set("class", selectedClass);
  const exportQuery = exportParams.toString();
  const csvHref = `${getProductAppPath("think-education", "/students/export")}${exportQuery ? `?${exportQuery}` : ""}`;
  const printHref = `${getProductAppPath("think-education", "/students/print")}${exportQuery ? `?${exportQuery}` : ""}`;
  const queryForPage = (page: number) => {
    const next = new URLSearchParams();
    if (search) next.set("search", search);
    if (gender) next.set("gender", gender);
    if (status !== "active") next.set("status", status);
    if (selectedBranch) next.set("branch", selectedBranch);
    if (selectedClass) next.set("class", selectedClass);
    if (pageSize !== "50") next.set("pageSize", pageSize);
    next.set("page", String(page));
    return `${getProductAppPath("think-education", "/students")}?${next.toString()}`;
  };
  if (currentPage > totalPages) redirect(queryForPage(totalPages));
  const errorMessage = params.error === "duplicate"
    ? "That student number is already in use in this organization."
    : params.error === "invalid"
      ? "Check the student number, name, and email fields and try again."
      : params.error === "save" ? "The student record could not be saved. Please try again." : null;

  return <main className="mx-auto w-full max-w-[1680px] space-y-6 p-4 md:p-6 xl:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Student Management</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">View and manage student records across your authorized campuses.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {canImport && campuses.length > 0 && <EducationImportModal entity="students" label="students" columns={[
          { key: "campus", label: "Campus", required: true },
          { key: "student_number", label: "Student Number" },
          { key: "first_name", label: "First Name", required: true },
          { key: "last_name", label: "Last Name", required: true },
          { key: "other_names", label: "Other Names" },
          { key: "email", label: "Email" },
          { key: "phone", label: "Phone" },
          { key: "date_of_birth", label: "Date of Birth" },
          { key: "gender", label: "Gender" },
          { key: "nationality", label: "Nationality" },
          { key: "home_address", label: "Home Address" },
        ]} />}
        {canCreate && campuses.length > 0 && <EducationRecordModal
          title="Add student"
          description="Student numbers are generated automatically. Nationality is optional. Optionally provision a linked login."
          buttonLabel="Add student"
          submitLabel="Save student"
          action={createEducationStudent}
          canCreateAccount={canCreateAccount}
          accountRole="education_student"
          fields={[
            { name: "branch_id", label: "Campus", type: "select", required: true, options: campuses.map((campus) => ({ value: campus.id, label: campus.name })) },
            { name: "first_name", label: "First name", required: true, maxLength: 100 },
            { name: "last_name", label: "Last name", required: true, maxLength: 100 },
            { name: "other_names", label: "Other names", maxLength: 100 },
            { name: "email", label: "Email", type: "email", maxLength: 254 },
            { name: "phone", label: "Phone", type: "tel", maxLength: 32 },
            { name: "date_of_birth", label: "Date of birth", type: "date" },
            { name: "gender", label: "Gender", type: "select", options: EDUCATION_STUDENT_GENDERS.map((value) => ({ value, label: value })) },
            { name: "nationality", label: "Nationality", maxLength: 100 },
            { name: "home_address", label: "Home address", maxLength: 500 },
            { name: "student_photo", label: "Student photo", type: "file", accept: "image/jpeg,image/png,image/webp" },
          ]}
        />}
      </div>
    </header>

    {params.created === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Student record created.</p>}
    {errorMessage && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errorMessage}</p>}

    <section data-education-metrics className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {[
        { label: "Students matching filters", value: totalCount.toLocaleString(), icon: Users },
        { label: "Campuses in your access", value: campuses.length.toLocaleString(), icon: GraduationCap },
        { label: "Students on this page", value: students.length.toLocaleString(), icon: Search },
        { label: "Male students", value: genderCounts.Male.toLocaleString(), icon: Users },
        { label: "Female students", value: genderCounts.Female.toLocaleString(), icon: Users },
      ].map(({ label, value, icon: Icon }) => <article key={label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{value}</p></div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon className="h-5 w-5" /></span>
      </article>)}
    </section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <StudentFilters
        key={`${search}:${gender}:${selectedBranch}:${selectedClass}:${status}:${pageSize}`}
        action={getProductAppPath("think-education", "/students")}
        search={search}
        gender={gender}
        branch={selectedBranch}
        classId={selectedClass}
        classes={classes.map((classroom) => ({
          id: classroom.id,
          name: `${classroom.name} - ${campuses.find((campus) => campus.id === classroom.branch_id)?.name ?? "Campus"}`,
        }))}
        status={status}
        statusCounts={statusCounts}
        pageSize={pageSize}
        campuses={campuses}
        canExport={canExport && totalCount > 0}
        csvHref={csvHref}
        printHref={printHref}
        exportFilename={`education-students-${new Date().toISOString().slice(0, 10)}.csv`}
      />

      {pageSize === "all" && totalCount > students.length && <p role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Showing the first {students.length.toLocaleString()} of {totalCount.toLocaleString()} matching students. Export CSV downloads the complete filtered result.
      </p>}

      {campuses.length === 0 ? <div className="p-8 text-center">
        <GraduationCap className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-3 font-semibold text-slate-900">No campus access assigned</h2>
        <p className="mt-1 text-sm text-slate-500">Ask an authorized Think Education administrator to assign your campus scope.</p>
      </div> : students.length === 0 ? <div className="p-8 text-center">
        <GraduationCap className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-3 font-semibold text-slate-900">No students found</h2>
        <p className="mt-1 text-sm text-slate-500">Try changing the search or filters, or add a student if you have permission.</p>
      </div> : <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <tr><th className="px-4 py-3">Student ID</th><th className="px-4 py-3">Full name</th><th className="px-4 py-3">Class</th>{canViewBalances && <th className="px-4 py-3">Outstanding balance</th>}<th className="px-4 py-3">Campus</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Enrolled</th><th className="px-4 py-3">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {students.map((student) => <tr key={student.id} className="transition-colors hover:bg-slate-50/80">
              <td className="whitespace-nowrap px-4 py-3 font-semibold text-blue-800"><Link href={getProductAppPath("think-education", `/students/${student.id}`)} className="hover:underline">{student.student_number}</Link></td>
              <td className="px-4 py-3 font-medium text-slate-900"><Link href={getProductAppPath("think-education", `/students/${student.id}`)} className="inline-flex items-center gap-3 hover:text-blue-800 hover:underline">
                <span
                  role="img"
                  aria-label={`${student.first_name} ${student.last_name} photo`}
                  className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-slate-200 bg-blue-50 bg-cover bg-center text-xs font-semibold text-blue-700"
                  style={studentPhotoUrlById.get(student.id) ? { backgroundImage: `url(${JSON.stringify(studentPhotoUrlById.get(student.id))})` } : undefined}
                >
                  {!studentPhotoUrlById.has(student.id) && `${student.first_name[0] ?? ""}${student.last_name[0] ?? ""}`.toUpperCase()}
                </span>
                <span>{[student.first_name, student.other_names, student.last_name].filter(Boolean).join(" ")}</span>
              </Link></td>
              <td className="px-4 py-3 text-slate-600">{student.class_names.join(", ") || "—"}</td>
              {canViewBalances && <td className={`whitespace-nowrap px-4 py-3 font-semibold ${(outstandingByStudent.get(student.id) ?? 0) > 0 ? "text-rose-700" : "text-emerald-700"}`}>
                {currencyConfig ? formatCurrencyAmount(outstandingByStudent.get(student.id) ?? 0, currencyConfig) : "—"}
              </td>}
              <td className="px-4 py-3 text-slate-600">{branchNameById.get(student.branch_id) ?? "Campus"}</td>
              <td className="px-4 py-3"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold capitalize text-emerald-800">{student.status.replace("_", " ")}</span></td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-500">{new Date(student.created_at).toLocaleDateString()}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1">
                  <Link
                    href={getProductAppPath("think-education", `/students/${student.id}`)}
                    aria-label={`View ${student.first_name} ${student.last_name}`}
                    title="View student"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  ><Eye className="h-4 w-4" /></Link>
                  <StudentDirectoryActions
                    studentName={[student.first_name, student.other_names, student.last_name].filter(Boolean).join(" ")}
                    profileHref={getProductAppPath("think-education", `/students/${student.id}`)}
                    actions={[
                      ...(canViewBalances ? [{ tab: "fees" as const, label: "Fee summary" }] : []),
                      ...(canViewAttendance ? [{ tab: "attendance" as const, label: "Attendance report" }] : []),
                      ...(canViewResults ? [{ tab: "exams" as const, label: "Exams & results" }] : []),
                      ...(canViewGuardians ? [{ tab: "guardians" as const, label: "Linked parents" }] : []),
                      ...(canEditStudent ? [{ tab: "personal" as const, label: "Edit student" }] : []),
                    ]}
                  />
                </div>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>}

      {totalCount > 0 && <footer className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
        <span className="text-slate-500">Showing {((currentPage - 1) * numericPageSize) + 1}–{Math.min(currentPage * numericPageSize, totalCount)} of {totalCount.toLocaleString()}</span>
        <div className="flex items-center gap-2">
          {currentPage > 1 && <Link href={queryForPage(currentPage - 1)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 font-medium text-slate-700"><ArrowLeft className="h-4 w-4" /> Previous</Link>}
          <span className="text-slate-600">{currentPage} / {totalPages}</span>
          {currentPage < totalPages && <Link href={queryForPage(currentPage + 1)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 font-medium text-slate-700">Next <ArrowRight className="h-4 w-4" /></Link>}
        </div>
      </footer>}
    </section>

  </main>;
}
