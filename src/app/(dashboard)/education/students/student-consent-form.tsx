"use client";

import { useState } from "react";
import { recordEducationStudentConsent } from "@/app/(dashboard)/education/actions";

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
  studentId: string;
  canEdit: boolean;
  events: ConsentEvent[];
};

export function StudentConsentForm({ studentId, canEdit, events }: Props) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError("");
    setNotice("");
    setIsSaving(true);
    try {
      const result = await recordEducationStudentConsent(new FormData(form));
      if ("error" in result) {
        setError(result.error ?? "The consent record could not be saved.");
      } else {
        form.reset();
        setNotice("Consent event recorded.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  const inputClassName = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Consent history</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Record decisions against a disclosure maintained by your institution. This form does not provide legal consent wording.
        </p>
      </div>

      {canEdit && <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="student_id" value={studentId} />
        <label className="text-sm font-medium text-slate-700">
          Consent category key
          <input required name="consent_type" maxLength={80} pattern="[a-z0-9][a-z0-9._-]{0,79}" placeholder="photo.media" className={inputClassName} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Disclosure version/reference
          <input required name="disclosure_version" maxLength={120} className={inputClassName} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Decision
          <select required name="decision" defaultValue="granted" className={inputClassName}>
            <option value="granted">Granted</option>
            <option value="denied">Denied</option>
            <option value="withdrawn">Withdrawn</option>
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Signer name
          <input required name="signer_name" maxLength={150} className={inputClassName} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Signer relationship to student
          <input required name="signer_relationship" maxLength={80} className={inputClassName} />
        </label>
        <label className="text-sm font-medium text-slate-700 sm:col-span-2">
          Evidence reference or note (optional)
          <textarea name="evidence_note" maxLength={500} rows={2} className={inputClassName} />
        </label>
        {error && <p role="alert" className="text-sm font-medium text-red-700 sm:col-span-2">{error}</p>}
        {notice && <p role="status" className="text-sm font-medium text-emerald-700 sm:col-span-2">{notice}</p>}
        <div className="sm:col-span-2">
          <button type="submit" disabled={isSaving} className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">
            {isSaving ? "Recording..." : "Record consent event"}
          </button>
        </div>
      </form>}

      {events.length ? <ol className="divide-y divide-slate-100">
        {events.map((item) => <li key={item.id} className="grid gap-1 py-3 text-sm sm:grid-cols-[1fr_auto]">
          <div>
            <p className="font-semibold capitalize text-slate-900">{item.consent_type.replace(/[._-]/g, " ")} · {item.decision}</p>
            <p className="text-slate-600">Disclosure {item.disclosure_version} · {item.signer_name} ({item.signer_relationship})</p>
            {item.evidence_note && <p className="mt-1 text-slate-500">{item.evidence_note}</p>}
          </div>
          <time className="text-xs text-slate-500">{new Date(item.recorded_at).toLocaleString()}</time>
        </li>)}
      </ol> : <p className="text-sm text-slate-500">No consent events have been recorded.</p>}
    </section>
  );
}
