"use client";

import { useState } from "react";
import { updateEducationDraftResult } from "../actions";
import type {
  EducationAssessmentComponent,
  EducationAssessmentComponentScore,
} from "@/lib/education/assessment-components";

type Props = {
  resultId: string;
  score: number;
  maximumScore: number;
  gradeOverride: string | null;
  components?: EducationAssessmentComponent[];
  componentScores?: EducationAssessmentComponentScore[];
};

export function ResultScoreEditor({
  resultId,
  score,
  maximumScore,
  gradeOverride,
  components = [],
  componentScores = [],
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [scores, setScores] = useState<Record<string, string>>(() =>
    Object.fromEntries(componentScores.map((item) => [item.componentId, String(item.score)]))
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError("");
    setNotice("");
    setIsSaving(true);
    try {
      const result = await updateEducationDraftResult(formData);
      if ("error" in result) {
        setError(result.error ?? "The result could not be updated.");
      } else {
        setNotice("Draft result updated.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  if (!isEditing) {
    return (
      <button type="button" onClick={() => setIsEditing(true)} className="mt-2 text-xs font-semibold text-blue-700 hover:text-blue-900">
        Correct draft
      </button>
    );
  }

  const inputClassName = "mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm";

  return (
    <form onSubmit={handleSubmit} className="mt-2 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <input type="hidden" name="result_id" value={resultId} />
      {components.length
        ? <>
          <input type="hidden" name="component_scores_json" value={JSON.stringify(components.map((component) => ({
            componentId: component.id,
            score: scores[component.id] ?? "",
          })))} />
          {components.map((component) => <label key={component.id} className="text-xs font-medium text-slate-700">
            {component.name} ({component.weightPercentage}% weight · max {component.maximumScore})
            <input required type="number" min="0" max={component.maximumScore} step="0.01" value={scores[component.id] ?? ""} onChange={(event) => setScores((current) => ({ ...current, [component.id]: event.target.value }))} className={inputClassName} />
          </label>)}
        </>
        : <>
          <label className="text-xs font-medium text-slate-700">
            Score
            <input required name="score" type="number" min="0" step="0.01" defaultValue={score} className={inputClassName} />
          </label>
          <label className="text-xs font-medium text-slate-700">
            Maximum score
            <input required name="maximum_score" type="number" min="0.01" step="0.01" defaultValue={maximumScore} className={inputClassName} />
          </label>
        </>}
      <label className="text-xs font-medium text-slate-700">
        Grade override
        <input name="grade_override" maxLength={10} defaultValue={gradeOverride ?? ""} className={inputClassName} />
      </label>
      {error && <p role="alert" className="text-xs font-medium text-red-700">{error}</p>}
      {notice && <p role="status" className="text-xs font-medium text-emerald-700">{notice}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={isSaving} className="rounded bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
          {isSaving ? "Saving..." : "Save"}
        </button>
        <button type="button" onClick={() => setIsEditing(false)} className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">
          Cancel
        </button>
      </div>
    </form>
  );
}
