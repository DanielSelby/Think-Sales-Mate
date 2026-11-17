import { describe, expect, it } from "vitest";
import {
  calculateEducationWeightedScore,
  createDefaultEducationAssessmentComponentDraft,
  educationAssessmentComponentScoresSchema,
  educationAssessmentComponentsSchema,
  getEducationSubjectComponentDrafts,
} from "./assessment-components";

const components = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Coursework",
    weightPercentage: 40,
    maximumScore: 20,
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Final exam",
    weightPercentage: 60,
    maximumScore: 100,
  },
];

describe("educationAssessmentComponentsSchema", () => {
  it("requires unique named components whose weights total exactly 100 percent", () => {
    expect(educationAssessmentComponentsSchema.safeParse(components).success).toBe(true);
    expect(educationAssessmentComponentsSchema.safeParse([
      ...components,
      {
        id: "00000000-0000-4000-8000-000000000003",
        name: "Lab",
        weightPercentage: 1,
        maximumScore: 10,
      },
    ]).success).toBe(false);
    expect(educationAssessmentComponentsSchema.safeParse([
      components[0],
      { ...components[1], name: "coursework" },
    ]).success).toBe(false);
  });
});

describe("createDefaultEducationAssessmentComponentDraft", () => {
  it("creates a usable blank component draft so a new subject can be configured immediately", () => {
    const draft = createDefaultEducationAssessmentComponentDraft();

    expect(draft.name).toBe("");
    expect(draft.weightPercentage).toBe(0);
    expect(draft.maximumScore).toBe(100);
    expect(draft.id).toBeTruthy();
  });
});

describe("getEducationSubjectComponentDrafts", () => {
  it("filters saved components to the selected subject and creates a blank draft when no components exist yet", () => {
    const subjectComponents = [
      { id: "cc-1", name: "Coursework", subject_id: "subject-1", weight_percentage: 40, maximum_score: 20 },
      { id: "cc-2", name: "Exam", subject_id: "subject-2", weight_percentage: 60, maximum_score: 100 },
    ];

    expect(getEducationSubjectComponentDrafts(subjectComponents, "subject-1")).toEqual([
      { id: "cc-1", name: "Coursework", weightPercentage: 40, maximumScore: 20 },
    ]);
    expect(getEducationSubjectComponentDrafts([], "subject-3")).toHaveLength(1);
    expect(getEducationSubjectComponentDrafts([], "subject-3")[0]).toMatchObject({
      name: "",
      weightPercentage: 0,
      maximumScore: 100,
    });
  });
});

describe("calculateEducationWeightedScore", () => {
  it("parses numeric scores submitted by component input forms", () => {
    const result = educationAssessmentComponentScoresSchema.safeParse([
      { componentId: components[0].id, score: "15.25" },
    ]);

    expect(result.success).toBe(true);
    if (result.success) expect(result.data[0].score).toBe(15.25);
  });

  it("calculates a rounded weighted percentage across different maximum scores", () => {
    expect(calculateEducationWeightedScore(components, [
      { componentId: components[0].id, score: 15 },
      { componentId: components[1].id, score: 80 },
    ])).toBe(78);
  });

  it("rejects missing, duplicate, unknown, and out-of-range component scores", () => {
    expect(calculateEducationWeightedScore(components, [
      { componentId: components[0].id, score: 15 },
    ])).toBeNull();
    expect(calculateEducationWeightedScore(components, [
      { componentId: components[0].id, score: 15 },
      { componentId: components[0].id, score: 10 },
    ])).toBeNull();
    expect(calculateEducationWeightedScore(components, [
      { componentId: components[0].id, score: 21 },
      { componentId: components[1].id, score: 80 },
    ])).toBeNull();
  });
});
