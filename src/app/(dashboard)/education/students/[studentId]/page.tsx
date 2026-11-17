import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StudentProfileForm } from "../student-profile-form";
import { StudentConsentForm } from "../student-consent-form";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { getProductAppPath } from "@/lib/product-app-routes";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ studentId: string }>;
};

export default async function EducationStudentProfilePage({ params }: PageProps) {
  const { studentId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(studentId)) {
    notFound();
  }

  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");

  const [canView, canEdit] = await Promise.all([
    canTabPermission("education_students", "students", "list", "view"),
    canTabPermission("education_students", "students", "list", "edit"),
  ]);
  if (!canView) redirect("/dashboard?accessDenied=think-education.students");

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const branchIds = campuses.map((campus) => campus.id);
  if (!branchIds.length) notFound();

  const supabase = await createClient();
  const { data: student, error } = await supabase.from("education_students")
    .select("id, student_number, first_name, last_name, other_names, email, phone, date_of_birth, gender, home_address, branch_id, status")
    .eq("org_id", context.orgId)
    .eq("id", studentId)
    .in("branch_id", branchIds)
    .maybeSingle();
  if (error) {
    console.error("Could not load Think Education student profile:", error.message);
    throw new Error("The student profile could not be loaded.");
  }
  if (!student) notFound();

  const { data: consentEvents, error: consentError } = await supabase.from("education_student_consent_events")
    .select("id, consent_type, disclosure_version, decision, signer_name, signer_relationship, evidence_note, recorded_at")
    .eq("org_id", context.orgId)
    .eq("student_id", student.id)
    .order("recorded_at", { ascending: false });
  if (consentError) {
    console.error("Could not load Think Education student consent history:", consentError.message);
    throw new Error("The student consent history could not be loaded.");
  }

  const campusName = campuses.find((campus) => campus.id === student.branch_id)?.name ?? "Campus";
  const fullName = [student.first_name, student.other_names, student.last_name].filter(Boolean).join(" ");

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <Link href={getProductAppPath("think-education", "/students")} className="text-sm font-semibold text-blue-700 hover:text-blue-900">
        Back to students
      </Link>
      <header className="rounded-2xl border border-slate-200 bg-white p-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Student profile</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">{fullName}</h1>
        <p className="mt-2 text-sm text-slate-600">{student.student_number} · {campusName} · {student.status.replaceAll("_", " ")}</p>
      </header>
      <StudentProfileForm student={student} canEdit={canEdit} />
      <StudentConsentForm studentId={student.id} canEdit={canEdit} events={consentEvents ?? []} />
    </main>
  );
}
