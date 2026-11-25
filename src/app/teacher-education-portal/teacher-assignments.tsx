import { BookOpen, ClipboardCheck } from "lucide-react";
import type {
  EducationAssignment,
  EducationAssignmentAttachment,
  EducationAssignmentSubmission,
  EducationAssignmentSubmissionVersion,
  EducationAssignmentTarget,
} from "@/lib/education/assignments";
import type { EducationTeacherPortal } from "@/lib/education/teacher-portal";
import {
  createEducationAssignment,
  gradeEducationAssignmentSubmission,
  requestEducationAssignmentRevision,
} from "./actions";
import { EducationAssignmentAttachmentLinks } from "@/components/education/assignment-attachment-links";

type TeacherAssignmentsProps = {
  teachers: EducationTeacherPortal;
  assignments: EducationAssignment[];
  attachments: EducationAssignmentAttachment[];
  targets: EducationAssignmentTarget[];
  submissions: EducationAssignmentSubmission[];
  versions: EducationAssignmentSubmissionVersion[];
};

function formatDueDate(dueOn: string) {
  return new Date(`${dueOn}T00:00:00`).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function TeacherAssignments({ teachers, assignments, attachments, targets, submissions, versions }: TeacherAssignmentsProps) {
  const assignmentsById = new Map(assignments.map((assignment) => [assignment.id, assignment]));
  const studentNames = new Map(
    teachers.flatMap((teacher) => teacher.classes.flatMap((classroom) =>
      classroom.students.map((student) => [student.id, `${student.firstName} ${student.lastName}`] as const)
    ))
  );
  const targetsByAssignment = new Map<string, EducationAssignmentTarget[]>();
  for (const target of targets) {
    const current = targetsByAssignment.get(target.assignment_id) ?? [];
    current.push(target);
    targetsByAssignment.set(target.assignment_id, current);
  }
  const submissionsByAssignment = new Map<string, EducationAssignmentSubmission[]>();
  for (const submission of submissions) {
    const current = submissionsByAssignment.get(submission.assignment_id) ?? [];
    current.push(submission);
    submissionsByAssignment.set(submission.assignment_id, current);
  }
  const versionsBySubmission = new Map<string, EducationAssignmentSubmissionVersion[]>();
  for (const version of versions) {
    const current = versionsBySubmission.get(version.submission_id) ?? [];
    current.push(version);
    versionsBySubmission.set(version.submission_id, current);
  }
  const gradedPercentages = submissions.flatMap((submission) => {
    const assignment = assignmentsById.get(submission.assignment_id);
    return submission.graded_at && submission.score !== null && assignment
      ? [submission.score / assignment.max_score * 100]
      : [];
  });
  const pendingReviewCount = submissions.filter((submission) => !submission.graded_at).length;
  const lateSubmissionCount = submissions.filter((submission) => {
    const assignment = assignmentsById.get(submission.assignment_id);
    return assignment && submission.submitted_at.slice(0, 10) > assignment.due_on;
  }).length;
  const submissionRate = targets.length ? Math.round(submissions.length / targets.length * 100) : 0;
  const averageScore = gradedPercentages.length
    ? Math.round(gradedPercentages.reduce((total, percentage) => total + percentage, 0) / gradedPercentages.length)
    : null;

  return (
    <section className="space-y-5">
      <header className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
          <BookOpen className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Homework & Assignments</h2>
          <p className="mt-1 text-sm text-slate-600">Create class assignments, review submissions, and return grades to students.</p>
        </div>
      </header>

      <div aria-label="Assignment analytics for loaded records" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
        {[
          ["Assignments", assignments.length],
          ["Students assigned", targets.length],
          ["Submitted", submissions.length],
          ["Awaiting grade", pendingReviewCount],
          ["Late submissions", lateSubmissionCount],
          ["Submission rate", `${submissionRate}%`],
          ["Average graded score", averageScore === null ? "—" : `${averageScore}%`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      {teachers.flatMap((teacher) => teacher.classes.map((classroom) => {
        const classAssignments = assignments.filter((assignment) =>
          assignment.org_id === teacher.organizationId && assignment.class_id === classroom.id
        );
        return (
          <article key={`${teacher.organizationId}-${classroom.id}`} className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
            <section>
              <p className="text-xs font-medium text-indigo-700">{teacher.organizationName} · {teacher.campusName}</p>
              <h3 className="mt-1 font-semibold text-slate-900">{classroom.name}{classroom.levelName ? ` · ${classroom.levelName}` : ""}</h3>
              <p className="mt-1 text-sm text-slate-500">{classroom.streamName ?? "Class"} · {classroom.students.length} students</p>
              <form action={createEducationAssignment} className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4">
                <input type="hidden" name="org_id" value={teacher.organizationId} />
                <input type="hidden" name="class_id" value={classroom.id} />
                <h4 className="text-sm font-semibold text-slate-800">Create assignment</h4>
                <label className="block text-xs font-medium text-slate-600">
                  Title
                  <input name="title" required maxLength={160} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900" />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Instructions
                  <textarea name="description" rows={3} maxLength={10000} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900" />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs font-medium text-slate-600">
                    Due date
                    <input type="date" name="due_on" required className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm font-normal text-slate-900" />
                  </label>
                  <label className="block text-xs font-medium text-slate-600">
                    Maximum score
                    <input type="number" name="max_score" required min="0.01" max="10000" step="0.01" defaultValue="100" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm font-normal text-slate-900" />
                  </label>
                </div>
                <fieldset>
                  <legend className="text-xs font-medium text-slate-600">Assign to students</legend>
                  {classroom.students.length ? (
                    <div className="mt-2 max-h-36 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
                      {classroom.students.map((student) => (
                        <label key={student.id} className="flex items-center gap-2 rounded px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">
                          <input type="checkbox" name="student_id" value={student.id} defaultChecked className="rounded border-slate-300 text-indigo-700 focus:ring-indigo-600" />
                          {student.firstName} {student.lastName}
                        </label>
                      ))}
                    </div>
                  ) : <p className="mt-2 text-xs text-slate-500">This class has no students to assign.</p>}
                </fieldset>
                <button type="submit" disabled={!classroom.students.length} className="w-full rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50">
                  Publish assignment
                </button>
              </form>
            </section>

            <section>
              <h4 className="flex items-center gap-2 font-semibold text-slate-900">
                <ClipboardCheck className="h-4 w-4 text-indigo-700" aria-hidden="true" />
                Class assignments
              </h4>
              {classAssignments.length ? (
                <div className="mt-3 space-y-3">
                  {classAssignments.map((assignment) => {
                    const assignmentTargets = targetsByAssignment.get(assignment.id) ?? [];
                    const assignmentSubmissions = submissionsByAssignment.get(assignment.id) ?? [];
                    return (
                      <article key={assignment.id} className="rounded-xl border border-slate-200 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <h5 className="font-semibold text-slate-900">{assignment.title}</h5>
                            {assignment.description && <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-slate-600">{assignment.description}</p>}
                          </div>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">Due {formatDueDate(assignment.due_on)}</span>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          {assignmentSubmissions.length} of {assignmentTargets.length} submitted · Maximum {assignment.max_score}
                        </p>
                        <EducationAssignmentAttachmentLinks
                          attachments={attachments.filter((attachment) =>
                            attachment.assignment_id === assignment.id && attachment.kind === "assignment"
                          )}
                          label="Assignment resources"
                        />
                        <form action="/api/education/assignment-attachments" method="post" encType="multipart/form-data" className="mt-2 flex flex-wrap items-end gap-2">
                          <input type="hidden" name="kind" value="assignment" />
                          <input type="hidden" name="assignment_id" value={assignment.id} />
                          <label className="min-w-52 flex-1 text-xs font-medium text-slate-600">
                            Add a resource (max 10 MB)
                            <input type="file" name="attachment" required accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.txt" className="mt-1 block w-full text-sm font-normal text-slate-700" />
                          </label>
                          <button type="submit" className="rounded-lg border border-indigo-300 px-3 py-2 text-xs font-semibold text-indigo-800 hover:bg-indigo-50">Upload resource</button>
                        </form>
                        {assignmentSubmissions.length > 0 && (
                          <ul className="mt-3 divide-y divide-slate-100">
                            {assignmentSubmissions.map((submission) => (
                              <li key={submission.id} className="py-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-sm font-medium text-slate-800">{studentNames.get(submission.student_id) ?? "Student"}</p>
                                  <p className="text-xs text-slate-500">
                                    Submitted {new Date(submission.submitted_at).toLocaleString()}
                                    {submission.submitted_at.slice(0, 10) > assignment.due_on ? " · Late" : ""}
                                  </p>
                                </div>
                                <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">{submission.submission_text}</p>
                                <EducationAssignmentAttachmentLinks
                                  attachments={attachments.filter((attachment) =>
                                    attachment.submission_id === submission.id
                                  )}
                                  label="Student attachments"
                                />
                                {submission.graded_at ? (
                                  <div className="mt-2 text-sm font-medium text-emerald-800">
                                    <p>Grade: {submission.score}/{assignment.max_score}</p>
                                    {submission.feedback && <p className="mt-1 font-normal text-slate-600">{submission.feedback}</p>}
                                    {submission.revision_requested_at ? (
                                      <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 font-normal text-amber-900">
                                        Revision requested: {submission.revision_request_note}
                                      </p>
                                    ) : (
                                      <form action={requestEducationAssignmentRevision} className="mt-3 space-y-2">
                                        <input type="hidden" name="submission_id" value={submission.id} />
                                        <label className="block text-xs font-medium text-slate-600">
                                          Request a revision
                                          <textarea name="note" required maxLength={2000} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-normal text-slate-900" />
                                        </label>
                                        <button type="submit" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100">Return for revision</button>
                                      </form>
                                    )}
                                  </div>
                                ) : (
                                  <form action={gradeEducationAssignmentSubmission} className="mt-3 flex flex-wrap items-end gap-2">
                                    <input type="hidden" name="submission_id" value={submission.id} />
                                    <label className="text-xs font-medium text-slate-600">
                                      Score
                                      <input type="number" name="score" required min="0" max={assignment.max_score} step="0.01" className="mt-1 block w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-normal text-slate-900" />
                                    </label>
                                    <label className="min-w-40 flex-1 text-xs font-medium text-slate-600">
                                      Feedback
                                      <input name="feedback" maxLength={4000} className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-normal text-slate-900" />
                                    </label>
                                    <button type="submit" className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800">Save grade</button>
                                  </form>
                                )}
                                {(versionsBySubmission.get(submission.id) ?? []).length > 0 && (
                                  <details className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
                                    <summary className="cursor-pointer text-xs font-semibold text-slate-700">Previous attempts ({versionsBySubmission.get(submission.id)?.length})</summary>
                                    <ol className="mt-2 space-y-2">
                                      {(versionsBySubmission.get(submission.id) ?? []).map((version) => (
                                        <li key={`${version.submission_id}-${version.version_number}`} className="border-t border-slate-200 pt-2 text-xs text-slate-600">
                                          <p className="font-medium">Attempt {version.version_number} · {new Date(version.submitted_at).toLocaleString()}</p>
                                          <p className="mt-1 whitespace-pre-wrap">{version.submission_text}</p>
                                          {version.score !== null && <p className="mt-1">Grade: {version.score}{version.feedback ? ` · ${version.feedback}` : ""}</p>}
                                        </li>
                                      ))}
                                    </ol>
                                  </details>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-3 rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">No assignments have been published for this class.</p>
              )}
            </section>
          </article>
        );
      }))}
      {teachers.every((teacher) => teacher.classes.length === 0) && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">No classes are assigned to your teacher profile yet.</p>
      )}
    </section>
  );
}
