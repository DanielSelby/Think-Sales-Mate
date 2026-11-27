import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { canTabPermission } from "@/lib/rbac/permissions";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { getProductAppPath } from "@/lib/product-app-routes";
import { createClient } from "@/lib/supabase/server";
import {
  EDUCATION_STUDENT_STATUSES,
  parseEducationStudentGender,
  parseEducationStudentDirectoryResult,
  type EducationStudentDirectoryRow,
} from "@/lib/education/student-directory";
import { StudentDirectoryPrintButton } from "./print-button";

const PAGE_SIZE = 500;
const MAX_PRINT_STUDENTS = 50_000;

export default async function EducationStudentDirectoryPrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  const orgId = context.orgId;

  const [canView, canExport] = await Promise.all([
    canTabPermission("education_students", "students", "list", "view"),
    canTabPermission("education_students", "students", "list", "export"),
  ]);
  if (!canView || !canExport) redirect("/dashboard?accessDenied=think-education.students");

  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search.trim().slice(0, 80) : "";
  const safeSearch = search.replace(/[^A-Za-z0-9\s_-]/g, "");
  const gender = typeof params.gender === "string" ? parseEducationStudentGender(params.gender) : "";
  const requestedStatus = typeof params.status === "string" ? params.status : "active";
  const matchedStatus = requestedStatus === "all"
    ? "all"
    : EDUCATION_STUDENT_STATUSES.find((item) => item === requestedStatus);
  if (!matchedStatus) redirect(getProductAppPath("think-education", "/students"));
  const status: "all" | typeof EDUCATION_STUDENT_STATUSES[number] = matchedStatus;

  const { campuses } = await getAccessibleEducationCampuses(orgId, context.userId);
  const accessibleBranchIds = campuses.map((campus) => campus.id);
  const requestedBranch = typeof params.branch === "string" ? params.branch : "";
  if (requestedBranch && !accessibleBranchIds.includes(requestedBranch)) {
    redirect(getProductAppPath("think-education", "/students"));
  }
  const branchIds = requestedBranch ? [requestedBranch] : accessibleBranchIds;
  if (!branchIds.length) redirect(getProductAppPath("think-education", "/students"));

  const requestedClass = typeof params.class === "string" ? params.class : "";
  const supabase = await createClient();
  let classId = "";
  let className = "";
  if (requestedClass) {
    const { data: classroom, error } = await supabase.from("education_classes")
      .select("id, name")
      .eq("org_id", orgId)
      .in("branch_id", branchIds)
      .eq("id", requestedClass)
      .maybeSingle();
    if (error) throw new Error(`Could not verify the selected student class: ${error.message}`);
    classId = classroom?.id ?? "";
    className = classroom?.name ?? "";
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
    if (error) throw new Error(`Could not load filtered students for printing: ${error.message}`);
    return parseEducationStudentDirectoryResult(data?.[0]);
  }

  const firstPage = await loadPage(0);
  const tooManyStudents = firstPage.totalCount > MAX_PRINT_STUDENTS;
  const students: EducationStudentDirectoryRow[] = tooManyStudents ? [] : [...firstPage.students];
  if (!tooManyStudents) {
    for (let offset = PAGE_SIZE; offset < firstPage.totalCount; offset += PAGE_SIZE) {
      const page = await loadPage(offset);
      students.push(...page.students);
    }
  }

  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const filterSummary = [
    requestedBranch ? campusNameById.get(requestedBranch) : "All accessible campuses",
    classId ? `Class: ${className}` : null,
    gender ? `Gender: ${gender}` : null,
    search ? `Search: "${search}"` : null,
    status === "all" ? "All statuses" : status.replace("_", " "),
  ].filter(Boolean);

  return (
    <main className="student-directory-print mx-auto w-full max-w-[1400px] space-y-6 p-6 text-slate-950">
      <style>{`
        @media print {
          @page { size: landscape; margin: 12mm; }
          body { background: white !important; }
          body * { visibility: hidden !important; }
          .student-directory-print, .student-directory-print * { visibility: visible !important; }
          .student-directory-print { position: absolute; inset: 0; width: 100%; max-width: none; padding: 0; }
          .no-print { display: none !important; }
          thead { display: table-header-group; }
          tr { break-inside: avoid; }
        }
      `}</style>

      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href={getProductAppPath("think-education", "/students")} className="text-sm font-semibold text-blue-700 hover:underline">
          Back to student directory
        </Link>
        {!tooManyStudents && students.length > 0 && <StudentDirectoryPrintButton />}
      </div>

      <header className="border-b border-slate-300 pb-4">
        <h1 className="text-2xl font-bold">Student Directory</h1>
        <p className="mt-1 text-sm text-slate-600">{filterSummary.join(" | ")}</p>
        <p className="mt-2 text-sm font-medium">{firstPage.totalCount.toLocaleString()} students</p>
      </header>

      {tooManyStudents ? (
        <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          This print view is limited to {MAX_PRINT_STUDENTS.toLocaleString()} students. Return to the directory and add filters before printing.
        </p>
      ) : students.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">No students match these filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-y border-slate-400 bg-slate-100">
                <th className="px-2 py-2">Student ID</th>
                <th className="px-2 py-2">Full name</th>
                <th className="px-2 py-2">Gender</th>
                <th className="px-2 py-2">Class</th>
                <th className="px-2 py-2">Campus</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Enrolled</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id} className="border-b border-slate-200">
                  <td className="px-2 py-2">{student.student_number}</td>
                  <td className="px-2 py-2">{[student.first_name, student.other_names, student.last_name].filter(Boolean).join(" ")}</td>
                  <td className="px-2 py-2">{student.gender ?? "-"}</td>
                  <td className="px-2 py-2">{student.class_names.join(", ") || "-"}</td>
                  <td className="px-2 py-2">{campusNameById.get(student.branch_id) ?? "Campus"}</td>
                  <td className="px-2 py-2 capitalize">{student.status.replace("_", " ")}</td>
                  <td className="px-2 py-2">{new Date(student.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
