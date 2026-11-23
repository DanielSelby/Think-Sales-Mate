import Link from "next/link";
import { ArrowLeft, CalendarDays, FileText, GraduationCap, HeartPulse, Users, Wallet } from "lucide-react";
import { StudentConsentForm } from "../student-consent-form";
import { StudentProfileForm } from "../student-profile-form";
import { FeePaymentDialog } from "./fee-payment-dialog";
import { enrollEducationStudentInClass } from "../../actions";
import { EducationSubmitButton } from "../../submit-button";
import { getProductAppPath } from "@/lib/product-app-routes";
import { formatCurrencyAmount, type CurrencyConfig } from "@/lib/currency";
import type { EducationStudentProfile } from "@/lib/education/student-profile";
import { EducationRecordSwitcher, type EducationRecordSwitchOption } from "../../record-switcher";

type ProfileTab =
  | "overview" | "personal" | "academic" | "performance" | "exams"
  | "attendance" | "fees" | "guardians" | "learning" | "behaviour"
  | "health" | "documents" | "communication" | "history";

type EnrollmentRow = {
  id: string;
  status: string;
  enrolled_on: string;
  ended_on: string | null;
  class_name: string;
  year_name: string;
  teacher_name: string | null;
};

type EnrollmentClassOption = {
  id: string;
  label: string;
};

type AttendanceRow = {
  id: string;
  attendance_date: string;
  status: string;
  note: string | null;
  class_name: string | null;
};

type ResultRow = {
  id: string;
  examination_id: string;
  subject_name: string;
  score: number;
  maximum_score: number;
  grade: string | null;
  status: string;
  created_at: string;
};

type ExaminationRow = {
  id: string;
  name: string;
  academic_year_name: string;
  term_name: string | null;
  status: string;
};

type ComponentScoreRow = {
  result_id: string;
  name: string;
  score: number;
  maximum_score: number;
  weight_percentage: number;
};

type FeeChargeRow = {
  id: string;
  description: string;
  amount: number;
  due_on: string | null;
  status: string;
  created_at: string;
  paid: number;
};

type GuardianRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  relationship: string;
  is_primary: boolean;
  status: string;
};

type DocumentRow = {
  id: string;
  title: string;
  category: string;
  file_name: string;
  content_type: string;
  file_size: number;
  verification_status: string;
  created_at: string;
};

type TransferRow = {
  id: string;
  source_branch_id: string;
  destination_branch_id: string;
  effective_on: string;
  reason: string;
  status: string;
  created_at: string;
};

type CommunicationRow = {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  delivery_status: string;
  created_at: string;
};

type ConsentEvent = {
  id: string;
  consent_type: string;
  disclosure_version: string;
  decision: "granted" | "denied" | "withdrawn";
  signer_name: string;
  signer_relationship: string;
  evidence_note: string | null;
  recorded_at: string;
};

type Props = {
  student: EducationStudentProfile & {
    admissionNumber: string | null;
    campusName: string;
    created_at: string;
  };
  studentPhotoUrl: string | null;
  fullName: string;
  selectedTab: ProfileTab;
  recordSwitcher: {
    recordType: "student";
    searchPath: string;
    search: string;
    tab: string;
    records: EducationRecordSwitchOption[];
  };
  permissions: {
    canEditStudent: boolean;
    canViewAcademics: boolean;
    canViewResults: boolean;
    canViewAttendance: boolean;
    canViewFinance: boolean;
    canViewGuardians: boolean;
    canViewDocuments: boolean;
    canViewTransfers: boolean;
  };
  enrollments: EnrollmentRow[];
  canAssignClass: boolean;
  enrollmentClasses: EnrollmentClassOption[];
  enrollmentNotice: string | null;
  enrollmentNoticeIsError: boolean;
  attendance: AttendanceRow[];
  results: ResultRow[];
  examinations: ExaminationRow[];
  componentScores: ComponentScoreRow[];
  charges: FeeChargeRow[];
  guardians: GuardianRow[];
  documents: DocumentRow[];
  transfers: TransferRow[];
  communications: CommunicationRow[];
  consentEvents: ConsentEvent[];
  currencyConfig: CurrencyConfig;
  canRecordFeePayment: boolean;
  paymentRecorded: boolean;
  paymentError: string | null;
  classPosition: { position: number; cohortSize: number; examinationName: string } | null;
  classPositionStatus: string;
};

const TABS: Array<{ id: ProfileTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "personal", label: "Personal" },
  { id: "academic", label: "Academic" },
  { id: "performance", label: "Performance" },
  { id: "exams", label: "Exams" },
  { id: "attendance", label: "Attendance" },
  { id: "fees", label: "Fees" },
  { id: "guardians", label: "Guardians" },
  { id: "learning", label: "Learning" },
  { id: "behaviour", label: "Behaviour" },
  { id: "health", label: "Health" },
  { id: "documents", label: "Documents" },
  { id: "communication", label: "Communication" },
  { id: "history", label: "History" },
];

const cardClass = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
const headingClass = "text-base font-semibold text-slate-950";
const tableHeadClass = "bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString();
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">{children}</p>;
}

function PermissionMessage() {
  return <EmptyState>You do not have permission to view this section.</EmptyState>;
}

export function StudentProfileView(props: Props) {
  const {
    student, studentPhotoUrl, fullName, selectedTab, recordSwitcher, permissions, enrollments,
    canAssignClass, enrollmentClasses, enrollmentNotice, enrollmentNoticeIsError,
    attendance, results, examinations, componentScores, charges, guardians,
    documents, transfers, communications, consentEvents, currencyConfig,
    canRecordFeePayment, paymentRecorded, paymentError,
    classPosition, classPositionStatus,
  } = props;
  const profilePath = getProductAppPath("think-education", `/students/${student.id}`);
  const activeEnrollment = enrollments.find((enrollment) => enrollment.status === "active") ?? null;
  const visibleResults = results.filter((result) => result.status === "published");
  const resultAverage = visibleResults.length
    ? (visibleResults.reduce((total, result) => total + result.score, 0)
      / visibleResults.reduce((total, result) => total + result.maximum_score, 0)) * 100
    : null;
  const attendancePresent = attendance.filter((record) => record.status === "present").length;
  const attendanceRate = attendance.length ? (attendancePresent / attendance.length) * 100 : null;
  const totalBilled = charges.filter((charge) => charge.status === "open").reduce((total, charge) => total + charge.amount, 0);
  const totalPaid = charges.filter((charge) => charge.status === "open").reduce((total, charge) => total + charge.paid, 0);
  const balance = Math.max(0, totalBilled - totalPaid);
  const formatMoney = (amount: number) => formatCurrencyAmount(amount, currencyConfig);
  const examinationById = new Map(examinations.map((examination) => [examination.id, examination]));
  const guardianStatus = (status: string) => status.replaceAll("_", " ");
  const ordinalPosition = (position: number) => {
    const remainder = position % 100;
    const suffix = remainder >= 11 && remainder <= 13 ? "th"
      : position % 10 === 1 ? "st"
        : position % 10 === 2 ? "nd"
          : position % 10 === 3 ? "rd" : "th";
    return `${position}${suffix}`;
  };

  function renderOverview() {
    const recentAttendance = attendance.slice(0, 30).reverse();
    const monthlyCounts = new Map<string, { present: number; total: number }>();
    for (const record of recentAttendance) {
      const month = record.attendance_date.slice(0, 7);
      const current = monthlyCounts.get(month) ?? { present: 0, total: 0 };
      monthlyCounts.set(month, {
        present: current.present + (record.status === "present" ? 1 : 0),
        total: current.total + 1,
      });
    }

    return <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Published average", value: permissions.canViewResults && resultAverage !== null ? `${resultAverage.toFixed(1)}%` : "—", detail: "", icon: GraduationCap },
          { label: "Recent attendance rate", value: permissions.canViewAttendance && attendanceRate !== null ? `${attendanceRate.toFixed(1)}%` : "—", detail: "", icon: CalendarDays },
          { label: "Class position", value: classPosition ? `${ordinalPosition(classPosition.position)} of ${classPosition.cohortSize}` : classPositionStatus, detail: classPosition?.examinationName ?? "", icon: GraduationCap },
          { label: "Outstanding fees", value: permissions.canViewFinance && charges.length ? formatMoney(balance) : "—", detail: "", icon: Wallet },
        ].map(({ label, value, detail, icon: Icon }) => <article key={label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-xl font-bold text-slate-950">{value}</p>{detail && <p className="mt-1 text-xs text-slate-500">Latest published exam: {detail}</p>}</div>
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon className="h-5 w-5" /></span>
        </article>)}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
        <section className={cardClass}>
          <h2 className={headingClass}>Academic summary</h2>
          {permissions.canViewAcademics ? <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div><dt className="text-xs text-slate-500">Current class</dt><dd className="mt-1 font-semibold text-slate-900">{activeEnrollment?.class_name ?? "No enrollment recorded"}</dd></div>
            <div><dt className="text-xs text-slate-500">Academic year</dt><dd className="mt-1 font-semibold text-slate-900">{activeEnrollment?.year_name ?? "—"}</dd></div>
            <div><dt className="text-xs text-slate-500">Class teacher</dt><dd className="mt-1 font-semibold text-slate-900">{activeEnrollment?.teacher_name ?? "Not assigned"}</dd></div>
            <div><dt className="text-xs text-slate-500">Enrollment status</dt><dd className="mt-1 font-semibold capitalize text-slate-900">{activeEnrollment?.status ?? student.status.replaceAll("_", " ")}</dd></div>
          </dl> : <PermissionMessage />}
        </section>

        <section className={cardClass}>
          <div className="flex items-center justify-between gap-2">
            <h2 className={headingClass}>Recent examination results</h2>
            <Link href={`${profilePath}?tab=exams`} className="text-xs font-semibold text-blue-700 hover:underline">View results</Link>
          </div>
          {permissions.canViewResults && visibleResults.length ? <ul className="mt-3 divide-y divide-slate-100">
            {visibleResults.slice(0, 5).map((result) => <li key={result.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <span><span className="block font-medium text-slate-900">{result.subject_name}</span><span className="text-xs text-slate-500">{examinationById.get(result.examination_id)?.name ?? "Examination"}</span></span>
              <span className="text-right font-semibold text-slate-800">{result.score}/{result.maximum_score}{result.grade ? ` · ${result.grade}` : ""}</span>
            </li>)}
          </ul> : <EmptyState>{permissions.canViewResults ? "No published results are available." : "You do not have permission to view results."}</EmptyState>}
        </section>

        <section className={cardClass}>
          <h2 className={headingClass}>Attendance trend</h2>
          {permissions.canViewAttendance && monthlyCounts.size ? <div className="mt-4 space-y-3">
            {[...monthlyCounts.entries()].slice(-6).map(([month, counts]) => {
              const rate = counts.total ? (counts.present / counts.total) * 100 : 0;
              return <div key={month} className="grid grid-cols-[75px_1fr_45px] items-center gap-3 text-xs">
              <span className="text-slate-500">{month}</span>
              <span className="h-2 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-blue-600" style={{ width: `${rate}%` }} /></span>
              <span className="text-right font-medium text-slate-700">{rate.toFixed(0)}%</span>
            </div>;
            })}
            <p className="text-xs text-slate-500">Attendance rates for the latest 30 recorded entries, grouped by month.</p>
          </div> : <EmptyState>{permissions.canViewAttendance ? "No attendance has been recorded." : "You do not have permission to view attendance."}</EmptyState>}
        </section>

        <section className={cardClass}>
          <div className="flex items-center justify-between gap-2">
            <h2 className={headingClass}>Fees & finance</h2>
            {permissions.canViewFinance && <Link href={getProductAppPath("think-education", `/finance/students/${student.id}`)} className="text-xs font-semibold text-blue-700 hover:underline">Open statement</Link>}
          </div>
          {permissions.canViewFinance ? <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <div><p className="text-xs text-slate-500">Charged</p><p className="mt-1 font-semibold">{formatMoney(totalBilled)}</p></div>
            <div><p className="text-xs text-slate-500">Paid</p><p className="mt-1 font-semibold">{formatMoney(totalPaid)}</p></div>
            <div><p className="text-xs text-slate-500">Balance</p><p className="mt-1 font-semibold">{formatMoney(balance)}</p></div>
          </div> : <PermissionMessage />}
        </section>
      </div>

      <section className={cardClass}>
        <h2 className={headingClass}>Student alerts</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {permissions.canViewFinance && balance > 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Outstanding fee balance: {formatMoney(balance)}.</p>}
          {permissions.canViewAttendance && attendanceRate !== null && attendanceRate < 80 && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Attendance below 80% in recorded entries ({attendanceRate.toFixed(1)}%). This is an informational indicator, not an institution-configured alert.</p>}
          {permissions.canViewResults && resultAverage !== null && resultAverage < 50 && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Published result average is {resultAverage.toFixed(1)}%. This is an informational indicator, not an institution-configured alert.</p>}
          {!((permissions.canViewFinance && balance > 0)
            || (permissions.canViewAttendance && attendanceRate !== null && attendanceRate < 80)
            || (permissions.canViewResults && resultAverage !== null && resultAverage < 50))
            && <p className="text-sm text-slate-500">No attention indicators based on the records available to you.</p>}
        </div>
      </section>
    </div>;
  }

  function renderAcademic() {
    if (!permissions.canViewAcademics) return <PermissionMessage />;
    return <div className="space-y-5">
      {enrollmentNotice && <p
        role={enrollmentNoticeIsError ? "alert" : "status"}
        className={`rounded-lg border px-4 py-3 text-sm ${
          enrollmentNoticeIsError
            ? "border-rose-200 bg-rose-50 text-rose-900"
            : "border-emerald-200 bg-emerald-50 text-emerald-900"
        }`}
      >{enrollmentNotice}</p>}
      {canAssignClass && <section className={cardClass}>
        <h2 className={headingClass}>Assign a class</h2>
        <p className="mt-1 text-sm text-slate-500">Enroll this student in an active class for the current academic year at {student.campusName}.</p>
        {student.status !== "active"
          ? <p className="mt-3 text-sm text-amber-800">Only active students can be enrolled.</p>
          : activeEnrollment
            ? <p className="mt-3 text-sm text-slate-600">
              This student is already enrolled in <strong>{activeEnrollment.class_name}</strong> for {activeEnrollment.year_name}. To move them, use{" "}
              <Link href={getProductAppPath("think-education", "/promotion")} className="font-semibold text-blue-700 hover:underline">Promotion &amp; Graduation</Link>
              {" "}after completing the academic year.
            </p>
            : enrollmentClasses.length > 0
              ? <form action={enrollEducationStudentInClass} className="mt-4 flex flex-wrap items-end gap-3">
                <input type="hidden" name="student_id" value={student.id} />
                <label className="min-w-64 flex-1 text-sm font-medium text-slate-700">Class
                  <select required name="class_id" defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
                    <option value="" disabled>Select an active class</option>
                    {enrollmentClasses.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.label}</option>)}
                  </select>
                </label>
                <EducationSubmitButton
                  pendingLabel="Enrolling..."
                  className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
                >
                  Enroll student
                </EducationSubmitButton>
              </form>
              : <p className="mt-3 text-sm text-slate-600">No active classes are available for the current academic year at this campus. Create an active class in Academic Management first.</p>}
      </section>}
      <section className={cardClass}>
        <h2 className={headingClass}>Academic records</h2>
        <p className="mt-1 text-sm text-slate-500">Enrollment history is taken from the student’s recorded academic-year enrollments.</p>
        {enrollments.length ? <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead className={tableHeadClass}><tr><th className="px-3 py-2">Academic year</th><th className="px-3 py-2">Class</th><th className="px-3 py-2">Class teacher</th><th className="px-3 py-2">Enrolled</th><th className="px-3 py-2">Ended</th><th className="px-3 py-2">Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{enrollments.map((row) => <tr key={row.id}>
              <td className="px-3 py-3">{row.year_name}</td><td className="px-3 py-3 font-medium">{row.class_name}</td><td className="px-3 py-3">{row.teacher_name ?? "—"}</td><td className="px-3 py-3">{formatDate(row.enrolled_on)}</td><td className="px-3 py-3">{formatDate(row.ended_on)}</td><td className="px-3 py-3 capitalize">{guardianStatus(row.status)}</td>
            </tr>)}</tbody>
          </table>
        </div> : <EmptyState>No academic enrollment history is recorded.</EmptyState>}
      </section>
      <section className={cardClass}>
        <h2 className={headingClass}>Current placement</h2>
        {activeEnrollment ? <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <p><span className="block text-xs text-slate-500">Class</span><strong className="mt-1 block">{activeEnrollment.class_name}</strong></p>
          <p><span className="block text-xs text-slate-500">Academic year</span><strong className="mt-1 block">{activeEnrollment.year_name}</strong></p>
          <p><span className="block text-xs text-slate-500">Class teacher</span><strong className="mt-1 block">{activeEnrollment.teacher_name ?? "Not assigned"}</strong></p>
        </div> : <EmptyState>No active class enrollment is recorded.</EmptyState>}
      </section>
    </div>;
  }

  function renderPerformance() {
    if (!permissions.canViewResults) return <PermissionMessage />;
    const subjectTotals = new Map<string, { score: number; maximum: number; count: number }>();
    for (const result of visibleResults) {
      const current = subjectTotals.get(result.subject_name) ?? { score: 0, maximum: 0, count: 0 };
      subjectTotals.set(result.subject_name, {
        score: current.score + result.score,
        maximum: current.maximum + result.maximum_score,
        count: current.count + 1,
      });
    }
    return <section className={cardClass}>
      <h2 className={headingClass}>Performance analytics</h2>
      <p className="mt-1 text-sm text-slate-500">Only published results are included. Subject averages are weighted by recorded maximum scores.</p>
      {subjectTotals.size ? <div className="mt-5 space-y-4">
        {[...subjectTotals.entries()].map(([subject, totals]) => {
          const percentage = totals.maximum ? (totals.score / totals.maximum) * 100 : 0;
          return <div key={subject}>
            <div className="mb-1 flex justify-between gap-3 text-sm"><span className="font-medium text-slate-800">{subject}</span><span className="text-slate-600">{percentage.toFixed(1)}% · {totals.count} result(s)</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }} /></div>
          </div>;
        })}
      </div> : <EmptyState>No published assessment results are available for analysis.</EmptyState>}
    </section>;
  }

  function renderExams() {
    if (!permissions.canViewResults) return <PermissionMessage />;
    return <section className={`${cardClass} overflow-x-auto`}>
      <h2 className={headingClass}>Examinations & results</h2>
      {visibleResults.length ? <table className="mt-4 w-full min-w-[720px] text-sm">
        <thead className={tableHeadClass}><tr><th className="px-3 py-2">Examination</th><th className="px-3 py-2">Year / term</th><th className="px-3 py-2">Subject</th><th className="px-3 py-2">Score</th><th className="px-3 py-2">Percent</th><th className="px-3 py-2">Grade</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{visibleResults.map((result) => {
          const exam = examinationById.get(result.examination_id);
          return <tr key={result.id}><td className="px-3 py-3">{exam?.name ?? "Examination"}</td><td className="px-3 py-3">{[exam?.academic_year_name, exam?.term_name].filter(Boolean).join(" · ") || "—"}</td><td className="px-3 py-3">{result.subject_name}</td><td className="px-3 py-3">{result.score}/{result.maximum_score}</td><td className="px-3 py-3">{((result.score / result.maximum_score) * 100).toFixed(1)}%</td><td className="px-3 py-3 font-semibold">{result.grade ?? "—"}</td></tr>;
        })}</tbody>
      </table> : <EmptyState>No published examination results are available. Draft and unpublished scores are intentionally not shown here.</EmptyState>}
      {visibleResults.length === 100 && <p className="mt-3 text-xs text-slate-500">Showing the latest 100 published results. Open the results module for complete history.</p>}
      <p className="mt-4 text-xs text-slate-500">Class and subject rankings are not displayed because ranking rules are not configured in the existing records.</p>
      {componentScores.length > 0 && <details className="mt-5">
        <summary className="cursor-pointer text-sm font-semibold text-blue-700">Assessment component scores</summary>
        <ul className="mt-3 divide-y divide-slate-100">{componentScores.map((item, index) => <li key={`${item.result_id}-${item.name}-${index}`} className="flex justify-between gap-3 py-2 text-sm"><span>{item.name} · {item.weight_percentage}%</span><span>{item.score}/{item.maximum_score}</span></li>)}</ul>
      </details>}
    </section>;
  }

  function renderAttendance() {
    if (!permissions.canViewAttendance) return <PermissionMessage />;
    const counts = new Map<string, number>();
    for (const record of attendance) counts.set(record.status, (counts.get(record.status) ?? 0) + 1);
    return <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-4">
        {["present", "absent", "late", "excused"].map((status) => <article key={status} className={cardClass}>
          <p className="text-sm capitalize text-slate-500">{status}</p><p className="mt-1 text-2xl font-bold text-slate-950">{counts.get(status) ?? 0}</p>
        </article>)}
      </section>
      <section className={`${cardClass} overflow-x-auto`}>
        <h2 className={headingClass}>Attendance history</h2>
        {attendance.length ? <table className="mt-4 w-full min-w-[620px] text-sm">
          <thead className={tableHeadClass}><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Class</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Note</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{attendance.slice(0, 100).map((row) => <tr key={row.id}><td className="px-3 py-3">{formatDate(row.attendance_date)}</td><td className="px-3 py-3">{row.class_name ?? "—"}</td><td className="px-3 py-3 capitalize">{row.status}</td><td className="px-3 py-3 text-slate-600">{row.note ?? "—"}</td></tr>)}</tbody>
        </table> : <EmptyState>No attendance entries are recorded.</EmptyState>}
        {attendance.length === 100 && <p className="mt-3 text-xs text-slate-500">Showing the latest 100 attendance entries. This limit prevents long histories from slowing profile navigation.</p>}
      </section>
    </div>;
  }

  function renderFees() {
    if (!permissions.canViewFinance) return <PermissionMessage />;
    const payableCharges = charges.flatMap((charge) => {
      const chargeBalance = Math.max(0, charge.amount - charge.paid);
      return charge.status === "open" && chargeBalance > 0
        ? [{ id: charge.id, description: charge.description, balance: chargeBalance }]
        : [];
    });
    return <div className="space-y-5">
      {paymentRecorded && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Fee payment recorded. The balance below has been updated.</p>}
      {paymentError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{paymentError}</p>}
      <section className="grid gap-3 sm:grid-cols-3">
        {[["Total billed", totalBilled], ["Total paid", totalPaid], ["Outstanding balance", balance]].map(([label, amount]) => <article key={String(label)} className={cardClass}>
          <p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-xl font-bold text-slate-950">{formatMoney(Number(amount))}</p>
        </article>)}
      </section>
      {canRecordFeePayment && payableCharges.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
          <div>
            <p className="font-semibold text-blue-950">Record a payment for {fullName}</p>
            <p className="mt-0.5 text-sm text-blue-800">{payableCharges.length} outstanding charge{payableCharges.length === 1 ? "" : "s"} available.</p>
          </div>
          <FeePaymentDialog
            charges={payableCharges}
            studentId={student.id}
            studentName={fullName}
            currencyConfig={currencyConfig}
            buttonLabel="Record fee payment"
          />
        </div>
      )}
      <section className={`${cardClass} overflow-x-auto`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className={headingClass}>Fee charges</h2>
          <Link href={getProductAppPath("think-education", `/finance/students/${student.id}`)} className="text-sm font-semibold text-blue-700 hover:underline">Open full finance statement</Link>
        </div>
        {charges.length ? <table className="mt-4 w-full min-w-[680px] text-sm">
          <thead className={tableHeadClass}><tr><th className="px-3 py-2">Charge</th><th className="px-3 py-2">Due date</th><th className="px-3 py-2">Charged</th><th className="px-3 py-2">Paid</th><th className="px-3 py-2">Balance</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Action</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{charges.map((charge) => {
            const chargeBalance = Math.max(0, charge.amount - charge.paid);
            return <tr key={charge.id}>
              <td className="px-3 py-3">{charge.description}</td>
              <td className="px-3 py-3">{formatDate(charge.due_on)}</td>
              <td className="px-3 py-3">{formatMoney(charge.amount)}</td>
              <td className="px-3 py-3">{formatMoney(charge.paid)}</td>
              <td className="px-3 py-3">{formatMoney(chargeBalance)}</td>
              <td className="px-3 py-3 capitalize">{charge.status}</td>
              <td className="px-3 py-3">{canRecordFeePayment && charge.status === "open" && chargeBalance > 0
                ? <FeePaymentDialog
                  chargeId={charge.id}
                  studentId={student.id}
                  studentName={fullName}
                  chargeDescription={charge.description}
                  balance={chargeBalance}
                  currencyConfig={currencyConfig}
                />
                : "—"}</td>
            </tr>;
          })}</tbody>
        </table> : <EmptyState>No fee charges are recorded for this student.</EmptyState>}
        {charges.length === 100 && <p className="mt-3 text-xs text-slate-500">Showing the latest 100 fee charges. Open the full finance statement for complete history.</p>}
      </section>
    </div>;
  }

  function renderGuardians() {
    if (!permissions.canViewGuardians) return <PermissionMessage />;
    return <section className={cardClass}>
      <div className="flex items-center justify-between gap-3">
        <div><h2 className={headingClass}>Guardians & family</h2><p className="mt-1 text-sm text-slate-500">Only verified and pending relationships linked to this student are shown.</p></div>
        <Link href={getProductAppPath("think-education", "/guardians")} className="text-sm font-semibold text-blue-700 hover:underline">Manage guardians</Link>
      </div>
      {guardians.length ? <div className="mt-4 grid gap-3 md:grid-cols-2">
        {guardians.map((guardian) => <article key={guardian.id} className="rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-blue-50 font-semibold text-blue-700">{guardian.first_name[0]}{guardian.last_name[0]}</span>
            <div><h3 className="font-semibold text-slate-900">{guardian.first_name} {guardian.last_name}</h3><p className="text-sm capitalize text-slate-500">{guardian.relationship}{guardian.is_primary ? " · Primary" : ""}</p></div>
          </div>
          <p className="mt-3 text-sm text-slate-600">{guardian.phone ?? "No phone recorded"}</p>
          <p className="text-sm text-slate-600">{guardian.email ?? "No email recorded"}</p>
          <p className="mt-2 text-xs capitalize text-slate-500">Relationship: {guardianStatus(guardian.status)}</p>
        </article>)}
      </div> : <EmptyState>No guardian relationships are linked to this student.</EmptyState>}
    </section>;
  }

  function renderDocuments() {
    if (!permissions.canViewDocuments) return <PermissionMessage />;
    return <section className={cardClass}>
      <div className="flex items-center justify-between gap-3"><h2 className={headingClass}>Documents & certificates</h2><Link href={getProductAppPath("think-education", "/documents")} className="text-sm font-semibold text-blue-700 hover:underline">Open document library</Link></div>
      {documents.length ? <ul className="mt-4 divide-y divide-slate-100">
        {documents.map((document) => <li key={document.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div><p className="font-medium text-slate-900">{document.title}</p><p className="text-xs capitalize text-slate-500">{document.category.replaceAll("_", " ")} · {document.file_name} · {(document.file_size / 1024).toFixed(0)} KB · {formatDate(document.created_at)}</p></div>
          <div className="flex items-center gap-3"><span className="text-xs capitalize text-slate-500">{document.verification_status.replaceAll("_", " ")}</span><Link href={`/api/education/documents/${document.id}/download`} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline"><FileText className="h-4 w-4" />Download</Link></div>
        </li>)}
      </ul> : <EmptyState>No student documents are available in the document library.</EmptyState>}
      {documents.length === 100 && <p className="mt-3 text-xs text-slate-500">Showing the latest 100 document metadata records. Open the document library for complete history.</p>}
    </section>;
  }

  function renderHistory() {
    return <div className="space-y-5">
      <section className={cardClass}>
        <h2 className={headingClass}>Student lifecycle</h2>
        <ol className="mt-4 space-y-4 border-l-2 border-blue-100 pl-5">
          <li><p className="font-semibold text-slate-900">Student record created</p><p className="text-sm text-slate-500">{formatDate(student.created_at)} · {student.status.replaceAll("_", " ")} · {student.campusName}</p></li>
          {enrollments.map((enrollment) => <li key={enrollment.id}><p className="font-semibold text-slate-900">{enrollment.class_name} · {enrollment.year_name}</p><p className="text-sm capitalize text-slate-500">{formatDate(enrollment.enrolled_on)}{enrollment.ended_on ? ` – ${formatDate(enrollment.ended_on)}` : ""} · {enrollment.status}</p></li>)}
          {permissions.canViewTransfers && transfers.map((transfer) => <li key={transfer.id}><p className="font-semibold text-slate-900">Campus transfer {transfer.status}</p><p className="text-sm text-slate-500">{formatDate(transfer.effective_on)} · {transfer.reason}</p></li>)}
        </ol>
      </section>
    </div>;
  }

  function renderContent() {
    switch (selectedTab) {
      case "overview": return renderOverview();
      case "personal": return <div className="space-y-5"><StudentProfileForm student={student} canEdit={permissions.canEditStudent} studentPhotoUrl={studentPhotoUrl} /><StudentConsentForm studentId={student.id} canEdit={permissions.canEditStudent} events={consentEvents} /></div>;
      case "academic": return renderAcademic();
      case "performance": return renderPerformance();
      case "exams": return renderExams();
      case "attendance": return renderAttendance();
      case "fees": return renderFees();
      case "guardians": return renderGuardians();
      case "documents": return renderDocuments();
      case "history": return renderHistory();
      case "learning": return <section className={cardClass}><h2 className={headingClass}>Learning & LMS</h2><EmptyState>No student-level assignment, quiz, course-progress, or classroom activity records are connected to this profile yet. The existing Google Classroom integration handles roster import only.</EmptyState></section>;
      case "behaviour": return <section className={cardClass}><h2 className={headingClass}>Behaviour & discipline</h2><EmptyState>No student behaviour or discipline record system is configured. No records are inferred or displayed.</EmptyState></section>;
      case "health": return <section className={cardClass}><h2 className={headingClass}>Health & welfare</h2><div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><HeartPulse className="h-4 w-4 shrink-0" />Health information is sensitive and is not collected or shown until a restricted health-record workflow is configured.</div><EmptyState>No health or welfare data is stored for this student.</EmptyState></section>;
      case "communication": return <section className={cardClass}><h2 className={headingClass}>Communication & activities</h2>{communications.length ? <ul className="mt-4 divide-y divide-slate-100">{communications.map((item) => <li key={item.id} className="py-3"><p className="font-semibold text-slate-900">{item.title}</p><p className="mt-1 text-sm text-slate-600">{item.message}</p><p className="mt-1 text-xs capitalize text-slate-500">{item.notification_type} · {item.delivery_status} · {formatDate(item.created_at)}</p></li>)}</ul> : <EmptyState>No student-specific communication history is available.</EmptyState>}</section>;
    }
  }

  return <main className="mx-auto w-full max-w-[1500px] space-y-5 p-4 md:p-6 xl:p-8">
    <Link href={getProductAppPath("think-education", "/students")} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-900"><ArrowLeft className="h-4 w-4" /> Students</Link>
    <EducationRecordSwitcher key={student.id} {...recordSwitcher} />
    <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="flex flex-wrap items-center gap-4">
        <span role="img" aria-label={`${fullName} photo`} className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full border border-slate-200 bg-blue-50 bg-cover bg-center text-2xl font-semibold text-blue-700" style={studentPhotoUrl ? { backgroundImage: `url(${JSON.stringify(studentPhotoUrl)})` } : undefined}>
          {!studentPhotoUrl && `${student.first_name[0] ?? ""}${student.last_name[0] ?? ""}`.toUpperCase()}
        </span>
        <div className="min-w-[220px] flex-1">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Student 360° profile</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">{fullName}</h1>
          <p className="mt-1 text-sm text-slate-600">Student ID: {student.student_number}{student.admissionNumber ? ` · Application: ${student.admissionNumber}` : ""}</p>
          <p className="mt-1 text-sm text-slate-600">{activeEnrollment?.class_name ?? "Class not assigned"} · {student.campusName} · {activeEnrollment?.year_name ?? "Academic year not assigned"}</p>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold capitalize text-emerald-800">{student.status.replaceAll("_", " ")}</span>
      </div>
    </header>

    <nav aria-label="Student profile sections" className="-mx-1 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      {TABS.map((tab) => <Link key={tab.id} href={`${profilePath}?tab=${tab.id}`} aria-current={selectedTab === tab.id ? "page" : undefined} className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition ${selectedTab === tab.id ? "bg-blue-700 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`}>{tab.label}</Link>)}
    </nav>

    {selectedTab === "personal" && <div className="grid gap-3 sm:grid-cols-3">
      {[["Student ID", student.student_number], ["Campus", student.campusName], ["Status", student.status.replaceAll("_", " ")]].map(([label, value]) => <article key={label} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-semibold capitalize text-slate-900">{value}</p></article>)}
    </div>}
    {renderContent()}
    {selectedTab === "overview" && permissions.canViewGuardians && guardians.length > 0 && <section className={cardClass}>
      <div className="flex items-center justify-between"><h2 className={headingClass}>Guardians</h2><Users className="h-5 w-5 text-blue-700" /></div>
      <p className="mt-2 text-sm text-slate-600">{guardians.map((guardian) => `${guardian.first_name} ${guardian.last_name} (${guardian.relationship})`).join(" · ")}</p>
    </section>}
  </main>;
}
