import { z } from "zod";

export type EducationGradeBand = {
  label: string;
  minimumPercentage: number;
};

const gradeBandLabelSchema = z.string().trim().min(1).max(10);
const gradeBandThresholdSchema = z.string()
  .trim()
  .regex(/^(?:100(?:\.0{1,2})?|(?:\d|[1-9]\d)(?:\.\d{1,2})?)$/)
  .transform(Number);

export const educationGradeBandInputSchema = z.object({
  label: gradeBandLabelSchema,
  minimumPercentage: gradeBandThresholdSchema,
});

export type EducationGradeBandInput = z.infer<typeof educationGradeBandInputSchema>;

export function getEducationAutomaticGrade(
  score: number,
  maximumScore: number,
  bands: readonly EducationGradeBand[],
): string | null {
  if (!Number.isFinite(score) || !Number.isFinite(maximumScore)
    || maximumScore <= 0 || score < 0 || score > maximumScore
    || bands.length === 0) return null;

  const thresholds = new Set<number>();
  for (const band of bands) {
    if (!band.label.trim() || !Number.isFinite(band.minimumPercentage)
      || band.minimumPercentage < 0 || band.minimumPercentage > 100
      || thresholds.has(band.minimumPercentage)) return null;
    thresholds.add(band.minimumPercentage);
  }
  if (!thresholds.has(0)) return null;

  const percentage = score / maximumScore * 100;
  const matchingBand = [...bands]
    .sort((left, right) => left.minimumPercentage - right.minimumPercentage)
    .filter((band) => band.minimumPercentage <= percentage)
    .at(-1);
  return matchingBand?.label ?? null;
}

export function getEducationResultGrade(
  gradeOverride: string,
  score: number,
  maximumScore: number,
  bands: readonly EducationGradeBand[],
): string | null {
  const normalizedOverride = gradeOverride.trim();
  return normalizedOverride || getEducationAutomaticGrade(score, maximumScore, bands);
}
