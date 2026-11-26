import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpen, GraduationCap } from "lucide-react";
import { EducationPortalShell } from "@/components/education/education-portal-shell";
import { getOptionalAuthUser } from "@/lib/supabase/optional-user";
import { createClient } from "@/lib/supabase/server";
import { educationGuardianPortalSchema } from "@/lib/education/guardian-portal";
import { getEducationPortalScopedPath, isEducationOrganizationId } from "@/lib/education/portal-auth";
import { GuardianReportCardPrintButton } from "./print-button";
import {
  getEducationInstitutionDisplayName,
  getEducationInstitutionLogoUrl,
} from "@/lib/education/institution-branding";
import { acknowledgeEducationReportCard } from "../actions";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

export default async function GuardianReportCardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const organizationId = isEducationOrganizationId(params.org) ? params.org.toLowerCase() : "";
  const studentId = typeof params.student === "string" ? params.student : "";
  if (!organizationId || !studentId) redirect("/education-portal");

  const supabase = await createClient();
  const user = getOptionalAuthUser(await supabase.auth.getUser(), "the family report card");
  if (!user) {
    redirect(`/education-portal?org=${encodeURIComponent(organizationId)}`);
  }

  const { data, error } = await supabase.rpc("education_get_guardian_portal");
  if (error) throw new Error(`Could not load linked student details for the family report card: ${error.message}`);
  const parsedPortal = educationGuardianPortalSchema.safeParse(data);
  if (!parsedPortal.success) {
    console.error("Think Education guardian portal returned unexpected report-card data:", parsedPortal.error.flatten());
    throw new Error("The family report card could not be safely displayed.");
  }

  const organization = parsedPortal.data.find((item) => item.organizationId === organizationId);
  const student = organization?.children.find((child) => child.id === studentId);
  if (!organization || !student) redirect("/education-portal");

  const { data: reportCards, error: reportCardError } = await supabase.rpc(
    "education_get_published_guardian_report_cards",
    { p_org_id: organizationId, p_student_id: studentId }
  );
  if (reportCardError) throw new Error(`Could not load published report-card comments: ${reportCardError.message}`);

  const results = [...student.results].sort((left, right) =>
    right.publishedAt.localeCompare(left.publishedAt)
      || left.examination.localeCompare(right.examination)
      || left.subject.localeCompare(right.subject)
  );
  const overallScore = results.reduce((total, result) => total + result.score, 0);
  const overallMaximum = results.reduce((total, result) => total + result.maximumScore, 0);
  const overallPercentage = overallMaximum > 0 ? (overallScore / overallMaximum) * 100 : null;
  const backHref = getEducationPortalScopedPath("/education-portal", organizationId);
  const [{ data: institution }, { data: companyProfile }] = await Promise.all([
    supabase.from("education_institution_settings")
      .select("institution_name, institution_code, institution_logo_url")
      .eq("org_id", organizationId)
      .maybeSingle(),
    supabase.from("company_profile")
      .select("logo_url")
      .eq("org_id", organizationId)
      .maybeSingle(),
  ]);
  const institutionName = getEducationInstitutionDisplayName(institution?.institution_name, organization.organizationName);
  const institutionLogoUrl = getEducationInstitutionLogoUrl(
    institution?.institution_logo_url,
    companyProfile?.logo_url,
  );

  return <EducationPortalShell
    role="parent"
    title="Student report card"
    activeItem="Academic Performance"
    subtitle={`${student.firstName} ${student.lastName} · ${organization.organizationName}`}
    userEmail={user.email}
    organizationId={organizationId}
  >
    <div className="guardian-report-card space-y-5">
      <style>{`
        @media print {
          @page { margin: 12mm; }
          body { background: white !important; }
          body * { visibility: hidden !important; }
          .guardian-report-card, .guardian-report-card * { visibility: visible !important; }
          .guardian-report-card { position: absolute; inset: 0; width: 100%; padding: 0; }
          .report-card-controls { display: none !important; }
        }
      `}</style>

      <div className="report-card-controls flex flex-wrap items-center justify-between gap-3">
        <Link href={`${backHref}#performance`} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-900">
          <ArrowLeft className="h-4 w-4" /> Back to family portal
        </Link>
        {results.length > 0 && <GuardianReportCardPrintButton />}
      </div>
      {params.acknowledgement === "saved" && <p role="status" className="report-card-controls rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Report-card acknowledgement saved.</p>}
      {params.acknowledgement && params.acknowledgement !== "saved" && <p role="alert" className="report-card-controls rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">The report-card acknowledgement could not be completed.</p>}

      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <header className="border-b border-slate-200 pb-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {institutionLogoUrl
                ? <img src={institutionLogoUrl} alt="" className="h-14 w-14 rounded-lg border border-slate-200 object-contain p-1" />
                : null}
              <div>
                <p className="text-lg font-bold text-slate-950">{institutionName}</p>
                {institution?.institution_code && <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{institution.institution_code}</p>}
              </div>
            </div>
            <p className="text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Official report card</p>
          </div>
          <h2 className="mt-1 text-2xl font-bold text-slate-950">
            {[student.firstName, student.otherNames, student.lastName].filter(Boolean).join(" ")}
          </h2>
          <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
            <p>Student number: <strong className="text-slate-900">{student.studentNumber}</strong></p>
            <p>Campus: <strong className="text-slate-900">{student.campusName}</strong></p>
            <p>Class: <strong className="text-slate-900">{student.className ?? "Not assigned"}</strong></p>
          </div>
          <p className="mt-2 text-xs text-slate-500">Generated {new Date().toLocaleDateString()} · Published results only</p>
        </header>

        <section className="mt-5">
          <h3 className="flex items-center gap-2 font-semibold text-slate-900">
            <BookOpen className="h-4 w-4 text-blue-700" /> Academic results
          </h3>
          {results.length > 0 && <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Overall weighted percentage</p>
            <p className="mt-1 text-2xl font-bold text-slate-950">{overallPercentage === null ? "—" : `${overallPercentage.toFixed(1)}%`}</p>
            <p className="mt-1 text-xs text-slate-500">Calculated across the published result entries shown on this card.</p>
          </div>}
          {results.length ? <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Examination</th>
                  <th className="px-3 py-2">Subject</th>
                  <th className="px-3 py-2">Score</th>
                  <th className="px-3 py-2">Percent</th>
                  <th className="px-3 py-2">Grade</th>
                  <th className="px-3 py-2">Published</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {results.map((result, index) => <tr key={`${result.examination}-${result.subject}-${result.publishedAt}-${index}`}>
                  <td className="px-3 py-2">{result.examination}</td>
                  <td className="px-3 py-2 font-medium">{result.subject}</td>
                  <td className="px-3 py-2">{result.score} / {result.maximumScore}</td>
                  <td className="px-3 py-2">{result.maximumScore > 0
                    ? `${((result.score / result.maximumScore) * 100).toFixed(1)}%`
                    : "—"}</td>
                  <td className="px-3 py-2 font-semibold">{result.grade ?? "—"}</td>
                  <td className="px-3 py-2">{formatDate(result.publishedAt)}</td>
                </tr>)}
              </tbody>
            </table>
          </div> : <div className="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
            No results have been published for this student.
          </div>}
          <p className="mt-3 text-xs text-slate-500">Results are shown by examination. No combined term average or class ranking is calculated.</p>
        </section>

        {(reportCards ?? []).length > 0 && <section className="mt-5 border-t border-slate-200 pt-4">
          <h3 className="font-semibold text-slate-900">Published report-card comments</h3>
          <div className="mt-3 space-y-3">
            {(reportCards ?? []).map((report) => <article key={report.term_id} className="rounded-xl border border-blue-100 bg-blue-50/40 p-4">
              <h4 className="font-semibold text-blue-950">{report.term_name}</h4>
              <p className="mt-1 text-xs text-slate-500">
                {new Date(`${report.starts_on}T00:00:00`).toLocaleDateString()} – {new Date(`${report.ends_on}T00:00:00`).toLocaleDateString()}
              </p>
              {report.teacher_comment && <p className="mt-3 text-sm"><strong>Class teacher:</strong> {report.teacher_comment}</p>}
              {report.principal_comment && <p className="mt-2 text-sm"><strong>Principal / head teacher:</strong> {report.principal_comment}</p>}
              <p className="mt-2 text-xs font-medium text-emerald-700">
                Published{report.published_at ? ` ${new Date(report.published_at).toLocaleDateString()}` : ""}
              </p>
              {report.acknowledged_at
                ? <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                  Acknowledged {new Date(report.acknowledged_at).toLocaleString()}
                  {report.acknowledgement_comment ? ` · ${report.acknowledgement_comment}` : ""}
                </p>
                : <form action={acknowledgeEducationReportCard} className="mt-3">
                  <input type="hidden" name="org_id" value={organizationId} />
                  <input type="hidden" name="report_card_id" value={report.report_card_id} />
                  <label className="block text-xs font-medium text-slate-700">
                    Acknowledgement note (optional)
                    <textarea name="comment" maxLength={2000} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
                  </label>
                  <button type="submit" className="mt-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800">
                    Acknowledge report card
                  </button>
                </form>}
            </article>)}
          </div>
        </section>}

        <section className="mt-5 border-t border-slate-200 pt-4">
          <h3 className="flex items-center gap-2 font-semibold text-slate-900">
            <GraduationCap className="h-4 w-4 text-blue-700" /> Attendance summary · 30 days
          </h3>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([
              ["Present", student.attendance.present, "bg-emerald-50 text-emerald-900"],
              ["Absent", student.attendance.absent, "bg-red-50 text-red-900"],
              ["Late", student.attendance.late, "bg-amber-50 text-amber-900"],
              ["Excused", student.attendance.excused, "bg-slate-100 text-slate-800"],
            ] as const).map(([label, count, className]) => <div key={label} className={`rounded-lg p-3 ${className}`}>
              <p className="text-xs font-medium">{label}</p>
              <p className="mt-1 text-xl font-bold">{count}</p>
            </div>)}
          </div>
        </section>
      </article>
    </div>
  </EducationPortalShell>;
}
