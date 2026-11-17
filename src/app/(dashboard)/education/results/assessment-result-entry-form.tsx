"use client";

import { useState } from "react";
import { createEducationResult } from "../actions";

type SubjectOption = { id: string; name: string };
type ComponentOption = {
  id: string;
  name: string;
  weight_percentage: number;
  maximum_score: number;
  subject_id: string;
};

type Props = {
  examinationId: string;
  examinationName: string;
  subjects: SubjectOption[];
  components: ComponentOption[];
};

export function AssessmentResultEntryForm({
  examinationId,
  examinationName,
  subjects,
  components,
}: Props) {
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [scores, setScores] = useState<Record<string, string>>({});
  const selectedComponents = components.filter((component) => component.subject_id === subjectId);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-950">Enter result</h2>
      <p className="mt-1 text-sm text-slate-500">Add a score for a student in {examinationName}. Student numbers are checked against this examination’s campus.</p>
      <form action={createEducationResult} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <input type="hidden" name="examination_id" value={examinationId} />
        <label className="text-sm font-medium text-slate-700">Student number
          <input required name="student_number" maxLength={32} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Subject
          <select required name="subject_id" value={subjectId} onChange={(event) => setSubjectId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
          </select>
        </label>
        {selectedComponents.length
          ? <div className="sm:col-span-2 lg:col-span-5">
            <p className="mb-2 text-sm font-semibold text-slate-800">Weighted components</p>
            <input type="hidden" name="component_scores_json" value={JSON.stringify(selectedComponents.map((component) => ({
              componentId: component.id,
              score: scores[component.id] ?? "",
            })))} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {selectedComponents.map((component) => <label key={component.id} className="text-sm font-medium text-slate-700">
                {component.name} <span className="text-xs font-normal text-slate-500">({Number(component.weight_percentage).toFixed(2)}% weight · max {component.maximum_score})</span>
                <input required name={`component_score_${component.id}`} type="number" min="0" max={component.maximum_score} step="0.01" value={scores[component.id] ?? ""} onChange={(event) => setScores((current) => ({ ...current, [component.id]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>)}
            </div>
          </div>
          : <>
            <label className="text-sm font-medium text-slate-700">Score
              <input required name="score" type="number" min={0} step="0.01" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>
            <label className="text-sm font-medium text-slate-700">Maximum score
              <input required name="maximum_score" type="number" min="0.01" step="0.01" defaultValue={100} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>
          </>}
        <label className="text-sm font-medium text-slate-700">Grade override (optional)
          <input name="grade_override" maxLength={10} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <div className="sm:col-span-2 lg:col-span-5"><button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Save result</button></div>
      </form>
    </section>
  );
}
