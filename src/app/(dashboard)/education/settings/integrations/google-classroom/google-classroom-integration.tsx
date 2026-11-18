"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type GoogleCourse = {
  id: string;
  name: string;
  section: string | null;
  courseState: string;
};

type EducationClass = {
  id: string;
  branch_id: string;
  academic_year_id: string;
  academic_year_name: string;
  name: string;
  level_name: string | null;
  stream_name: string | null;
};

type RosterPreview = {
  matched: Array<{
    googleUserId: string;
    googleName: string;
    email: string;
    studentId: string;
    studentName: string;
    studentNumber: string;
  }>;
  unmatched: Array<{ googleUserId: string; googleName: string; email: string | null }>;
  ambiguous: Array<{ googleUserId: string; googleName: string; email: string }>;
};

type IntegrationData = {
  connected: boolean;
  courses: GoogleCourse[];
  classes: EducationClass[];
  mappings: Array<{ google_course_id: string; class_id: string }>;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as T & { error?: string } | null;
  if (!response.ok) throw new Error(payload?.error ?? "Google Classroom request failed.");
  if (!payload) throw new Error("Google Classroom returned an empty response.");
  return payload;
}

export default function GoogleClassroomIntegration({
  callbackError,
  justConnected,
}: {
  callbackError: string | null;
  justConnected: boolean;
}) {
  const [data, setData] = useState<IntegrationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(callbackError);
  const [notice, setNotice] = useState(justConnected ? "Google Classroom connected." : "");
  const [selectedClasses, setSelectedClasses] = useState<Record<string, string>>({});
  const [previews, setPreviews] = useState<Record<string, RosterPreview>>({});
  const [importResults, setImportResults] = useState<Record<string, {
    inserted_count: number;
    already_enrolled_count: number;
    unmatched_emails: string[];
    ambiguous_emails: string[];
  }>>({});
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await requestJson<IntegrationData>("/api/education/google-classroom");
      setData(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load Google Classroom.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function saveMapping(courseId: string) {
    const classId = selectedClasses[courseId]
      ?? data?.mappings.find((mapping) => mapping.google_course_id === courseId)?.class_id;
    if (!classId) {
      setError("Choose an existing active Education class before saving this mapping.");
      return;
    }
    setBusyAction(`mapping:${courseId}`);
    setError(null);
    try {
      await requestJson("/api/education/google-classroom/mapping", {
        method: "POST",
        body: JSON.stringify({ courseId, classId }),
      });
      setNotice("Course mapping saved.");
      setPreviews((current) => { const updated = { ...current }; delete updated[courseId]; return updated; });
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save this mapping.");
    } finally {
      setBusyAction(null);
    }
  }

  async function previewRoster(courseId: string) {
    setBusyAction(`preview:${courseId}`);
    setError(null);
    setNotice("");
    setImportResults((current) => { const updated = { ...current }; delete updated[courseId]; return updated; });
    try {
      const preview = await requestJson<RosterPreview>("/api/education/google-classroom/roster/preview", {
        method: "POST",
        body: JSON.stringify({ courseId }),
      });
      setPreviews((current) => ({ ...current, [courseId]: preview }));
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Could not preview this roster.");
    } finally {
      setBusyAction(null);
    }
  }

  async function importRoster(courseId: string) {
    setBusyAction(`import:${courseId}`);
    setError(null);
    setNotice("");
    try {
      const response = await requestJson<{
        result: {
          inserted_count: number;
          already_enrolled_count: number;
          unmatched_emails: string[];
          ambiguous_emails: string[];
        };
        preview: RosterPreview;
      }>("/api/education/google-classroom/roster/import", {
        method: "POST",
        body: JSON.stringify({ courseId }),
      });
      setImportResults((current) => ({ ...current, [courseId]: response.result }));
      setPreviews((current) => ({ ...current, [courseId]: response.preview }));
      setNotice("Roster import completed. Existing enrollment records were left unchanged.");
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Could not import this roster.");
    } finally {
      setBusyAction(null);
    }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect Google Classroom? Saved course mappings will also be removed.")) return;
    setBusyAction("disconnect");
    setError(null);
    try {
      await requestJson("/api/education/google-classroom", { method: "DELETE" });
      setData({ connected: false, courses: [], classes: [], mappings: [] });
      setPreviews({});
      setImportResults({});
      setNotice("Google Classroom disconnected. Course mappings were removed.");
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : "Could not disconnect Google Classroom.");
    } finally {
      setBusyAction(null);
    }
  }

  const mappedClassName = (classId: string) => {
    const classroom = data?.classes.find((candidate) => candidate.id === classId);
    return classroom ? `${classroom.name} · ${classroom.academic_year_name}` : "Unavailable class";
  };

  return <main className="mx-auto max-w-5xl space-y-5 p-3 md:p-6">
    <header className="space-y-2">
      <Link href="/education/settings" className="text-sm font-medium text-blue-700 hover:underline">← Institution settings</Link>
      <h1 className="text-2xl font-bold text-slate-950">Google Classroom integration</h1>
      <p className="max-w-3xl text-sm text-slate-600">
        Read courses and class rosters, map each course to an existing Education class, then preview and explicitly import only unambiguous matches to active students at that class campus. Google data never creates student records or changes an existing enrollment.
      </p>
    </header>

    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}

    {loading ? <p className="text-sm text-slate-600">Loading integration status…</p> : data?.connected
      ? <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">Connected</h2>
            <p className="text-sm text-slate-600">Read-only Google Classroom access is active for this organization.</p>
          </div>
          <button type="button" onClick={disconnect} disabled={busyAction !== null} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
            {busyAction === "disconnect" ? "Disconnecting…" : "Disconnect"}
          </button>
        </div>
        {!data.courses.length ? <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No active Google Classroom courses are available to this account.</p>
          : <ul className="space-y-4">
            {data.courses.map((course) => {
              const mapping = data.mappings.find((candidate) => candidate.google_course_id === course.id);
              const preview = previews[course.id];
              const result = importResults[course.id];
              return <li key={course.id} className="space-y-4 rounded-lg border border-slate-200 p-4">
                <div>
                  <h3 className="font-semibold text-slate-900">{course.name}{course.section ? ` · ${course.section}` : ""}</h3>
                  <p className="text-xs text-slate-500">Google course ID: {course.id}</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <select
                    aria-label={`Education class for ${course.name}`}
                    value={selectedClasses[course.id] ?? mapping?.class_id ?? ""}
                    onChange={(event) => {
                      setSelectedClasses((current) => ({ ...current, [course.id]: event.target.value }));
                      setPreviews((current) => { const updated = { ...current }; delete updated[course.id]; return updated; });
                    }}
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">Select an existing Education class</option>
                    {data.classes.map((classroom) => <option key={classroom.id} value={classroom.id}>
                      {classroom.name}{classroom.level_name ? ` · ${classroom.level_name}` : ""}{classroom.stream_name ? ` · ${classroom.stream_name}` : ""} · {classroom.academic_year_name}
                    </option>)}
                  </select>
                  <button type="button" onClick={() => void saveMapping(course.id)} disabled={busyAction !== null || !data.classes.length} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    {busyAction === `mapping:${course.id}` ? "Saving…" : "Save mapping"}
                  </button>
                </div>
                {mapping && <p className="text-sm text-slate-600">Mapped to: {mappedClassName(mapping.class_id)}</p>}
                {mapping && <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void previewRoster(course.id)} disabled={busyAction !== null} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
                    {busyAction === `preview:${course.id}` ? "Previewing…" : "Preview roster"}
                  </button>
                  {preview && preview.matched.length > 0 && <button type="button" onClick={() => void importRoster(course.id)} disabled={busyAction !== null} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    {busyAction === `import:${course.id}` ? "Importing…" : `Import ${preview.matched.length} eligible enrollment${preview.matched.length === 1 ? "" : "s"}`}
                  </button>}
                </div>}
                {preview && <section className="space-y-3 rounded-lg bg-slate-50 p-3 text-sm">
                  <h4 className="font-semibold text-slate-900">Roster preview</h4>
                  <p className="text-slate-600">{preview.matched.length} unambiguous match(es), {preview.unmatched.length} unmatched, {preview.ambiguous.length} ambiguous. No records have changed.</p>
                  {!!preview.matched.length && <ul className="space-y-1">
                    {preview.matched.map((student) => <li key={student.googleUserId} className="text-slate-700">
                      {student.googleName} ({student.email}) → {student.studentName} · {student.studentNumber}
                    </li>)}
                  </ul>}
                  {!!preview.unmatched.length && <div>
                    <p className="font-medium text-amber-800">Unmatched (no active campus student with this email)</p>
                    <ul>{preview.unmatched.map((student) => <li key={student.googleUserId}>{student.googleName} · {student.email ?? "No email provided"}</li>)}</ul>
                  </div>}
                  {!!preview.ambiguous.length && <div>
                    <p className="font-medium text-red-800">Ambiguous (duplicate roster email or multiple active student records)</p>
                    <ul>{preview.ambiguous.map((student) => <li key={student.googleUserId}>{student.googleName} · {student.email}</li>)}</ul>
                  </div>}
                  {result && <p role="status" className="font-medium text-emerald-800">
                    Imported {result.inserted_count}; preserved {result.already_enrolled_count} existing enrollment(s). Unmatched: {result.unmatched_emails.length}; ambiguous: {result.ambiguous_emails.length}.
                  </p>}
                </section>}
              </li>;
            })}
          </ul>}
        <p className="border-t border-slate-200 pt-3 text-xs text-slate-500">
          Google Classroom read-only scopes: courses, rosters, and student profile email addresses for matching. No course, student, or enrollment is written back to Google.
        </p>
      </section>
      : <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
        <h2 className="font-semibold text-slate-900">Not connected</h2>
        <p className="text-sm text-slate-600">Authorize the narrow, read-only Classroom scopes to load courses and rosters. Refresh credentials are encrypted on the server and access tokens are never stored.</p>
        <a href="/api/education/google-classroom/connect" className="inline-flex rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
          Connect Google Classroom
        </a>
      </section>}
  </main>;
}
