"use client";

import { useEffect, useState } from "react";
import {
  createDefaultEducationAssessmentComponentDraft,
  getEducationSubjectComponentDrafts,
} from "@/lib/education/assessment-components";
import { saveEducationAssessmentComponents } from "../actions";

type SubjectOption = { id: string; name: string };
type ComponentOption = {
  id: string;
  name: string;
  weight_percentage: number;
  maximum_score: number;
  subject_id: string;
};
type ComponentDraft = {
  id: string;
  name: string;
  weightPercentage: number;
  maximumScore: number;
};

type Props = {
  examinationId: string;
  subjects: SubjectOption[];
  components: ComponentOption[];
  lockedSubjectIds: string[];
};

export function AssessmentComponentsManager({
  examinationId,
  subjects,
  components,
  lockedSubjectIds,
}: Props) {
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [drafts, setDrafts] = useState<ComponentDraft[]>(() =>
    getEducationSubjectComponentDrafts(components, subjects[0]?.id ?? "")
  );
  useEffect(() => {
    if (!subjectId) return;
    setDrafts(getEducationSubjectComponentDrafts(components, subjectId));
  }, [components, subjectId]);
  const subject = subjects.find((item) => item.id === subjectId);
  const isLocked = lockedSubjectIds.includes(subjectId);
  const totalWeight = drafts.reduce((total, component) => total + component.weightPercentage, 0);
  const normalizedNames = drafts.map((component) => component.name.trim().toLowerCase());
  const canSave = drafts.length > 0
    && drafts.length <= 20
    && Math.round(totalWeight * 100) === 10000
    && drafts.every((component) => component.name.trim().length > 0
      && component.name.trim().length <= 80
      && component.weightPercentage > 0
      && component.weightPercentage <= 100
      && component.maximumScore > 0
      && component.maximumScore <= 999999.99)
    && new Set(normalizedNames).size === normalizedNames.length;

  function selectSubject(nextSubjectId: string) {
    setSubjectId(nextSubjectId);
    setDrafts(getEducationSubjectComponentDrafts(components, nextSubjectId));
  }

  function updateDraft(index: number, patch: Partial<ComponentDraft>) {
    setDrafts((current) => current.map((component, componentIndex) =>
      componentIndex === index ? { ...component, ...patch } : component
    ));
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-950">Assessment components</h2>
      <p className="mt-1 text-sm text-slate-600">Configure component weights and maximum scores separately for each subject in this examination. Weights must total 100%.</p>
      <label className="mt-4 block max-w-xl text-sm font-medium text-slate-700">Subject
        <select value={subjectId} onChange={(event) => selectSubject(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
          {subjects.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select>
      </label>
      {!subject ? <p className="mt-4 text-sm text-slate-500">Choose an active subject to configure assessment components.</p>
        : isLocked ? <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">This subject’s component weights are locked because a result has already been entered.</p>
          : <form action={saveEducationAssessmentComponents} className="mt-4 space-y-4">
            <input type="hidden" name="examination_id" value={examinationId} />
            <input type="hidden" name="subject_id" value={subjectId} />
            <input type="hidden" name="components_json" value={JSON.stringify(drafts)} />
            <div className="space-y-3">
              {drafts.map((component, index) => <fieldset key={component.id} className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[minmax(160px,1fr)_140px_160px_auto]">
                <legend className="px-1 text-xs font-semibold text-slate-500">Component {index + 1}</legend>
                <label className="text-xs font-medium text-slate-700">Name
                  <input required maxLength={80} value={component.name} onChange={(event) => updateDraft(index, { name: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
                </label>
                <label className="text-xs font-medium text-slate-700">Weight (%)
                  <input required type="number" min="0.01" max="100" step="0.01" value={component.weightPercentage} onChange={(event) => updateDraft(index, { weightPercentage: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
                </label>
                <label className="text-xs font-medium text-slate-700">Maximum score
                  <input required type="number" min="0.01" max="999999.99" step="0.01" value={component.maximumScore} onChange={(event) => updateDraft(index, { maximumScore: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
                </label>
                <button type="button" onClick={() => setDrafts((current) => current.filter((_, currentIndex) => currentIndex !== index))} aria-label={`Remove ${component.name || `component ${index + 1}`}`} className="self-end rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Remove</button>
              </fieldset>)}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className={`text-sm font-semibold ${Math.round(totalWeight * 100) === 10000 ? "text-emerald-700" : "text-amber-700"}`}>
                Total weight: {totalWeight.toFixed(2)}%
              </p>
              <div className="flex gap-2">
                <button type="button" disabled={drafts.length >= 20} onClick={() => setDrafts((current) => [
                  ...current,
                  createDefaultEducationAssessmentComponentDraft(),
                ])} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Add component</button>
                <button type="submit" disabled={!canSave} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">Save components</button>
              </div>
            </div>
          </form>}
    </section>
  );
}
