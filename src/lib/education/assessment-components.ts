import { z } from "zod";

const componentNumberSchema = z.number()
  .finite()
  .nonnegative()
  .max(999999.99);

export const educationAssessmentComponentsSchema = z.array(z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  weightPercentage: z.number().finite().positive().max(100),
  maximumScore: componentNumberSchema.refine((value) => value > 0),
}).strict()).min(1).max(20).superRefine((components, context) => {
  const ids = new Set<string>();
  const names = new Set<string>();
  let totalWeight = 0;
  components.forEach((component, index) => {
    const normalizedName = component.name.toLowerCase();
    if (ids.has(component.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, "id"],
        message: "Component IDs must be unique.",
      });
    }
    if (names.has(normalizedName)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, "name"],
        message: "Component names must be unique.",
      });
    }
    ids.add(component.id);
    names.add(normalizedName);
    totalWeight += component.weightPercentage;
  });
  if (Math.round(totalWeight * 100) !== 10000) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["weightPercentage"],
      message: "Component weights must total exactly 100%.",
    });
  }
});

export type EducationAssessmentComponent = z.infer<typeof educationAssessmentComponentsSchema>[number];

const componentScoreValueSchema = z.union([
  componentNumberSchema,
  z.string().trim().regex(/^\d{1,6}(?:\.\d{1,2})?$/).transform(Number),
]).pipe(componentNumberSchema);

export const educationAssessmentComponentScoresSchema = z.array(z.object({
  componentId: z.string().uuid(),
  score: componentScoreValueSchema,
}).strict()).max(20);

export type EducationAssessmentComponentScore = z.infer<typeof educationAssessmentComponentScoresSchema>[number];

export function createDefaultEducationAssessmentComponentDraft() {
  const candidateId = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `component-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    id: candidateId,
    name: "",
    weightPercentage: 0,
    maximumScore: 100,
  };
}

export function getEducationSubjectComponentDrafts<T extends {
  id: string;
  name: string;
  subject_id?: string;
  weight_percentage?: number | string;
  maximum_score?: number | string;
}>(components: readonly T[], subjectId: string) {
  const subjectComponents = components.filter((component) => component.subject_id === subjectId);
  if (subjectComponents.length > 0) {
    return subjectComponents.map((component) => ({
      id: component.id,
      name: component.name,
      weightPercentage: Number(component.weight_percentage ?? 0),
      maximumScore: Number(component.maximum_score ?? 100),
    }));
  }

  return [createDefaultEducationAssessmentComponentDraft()];
}

export function calculateEducationWeightedScore(
  components: readonly EducationAssessmentComponent[],
  scores: readonly EducationAssessmentComponentScore[],
): number | null {
  const validatedComponents = educationAssessmentComponentsSchema.safeParse(components);
  const validatedScores = educationAssessmentComponentScoresSchema.safeParse(scores);
  if (!validatedComponents.success || !validatedScores.success
    || components.length !== scores.length) return null;

  const scoreById = new Map<string, number>();
  for (const score of scores) {
    if (scoreById.has(score.componentId)) return null;
    scoreById.set(score.componentId, score.score);
  }

  let weightedScore = 0;
  for (const component of components) {
    const score = scoreById.get(component.id);
    if (score === undefined || score > component.maximumScore) return null;
    weightedScore += (score / component.maximumScore) * component.weightPercentage;
  }
  if (scoreById.size !== components.length) return null;
  return Math.round((weightedScore + Number.EPSILON) * 100) / 100;
}
