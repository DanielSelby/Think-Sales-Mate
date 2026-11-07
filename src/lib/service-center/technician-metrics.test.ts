import { describe, expect, it } from "vitest";
import { calculateTechnicianMetrics } from "./technician-metrics";

describe("calculateTechnicianMetrics", () => {
  it("calculates current assigned workload and completion duration from recorded history", () => {
    const metrics = calculateTechnicianMetrics(
      [
        { id: "job-1", status: "closed", created_at: "2026-11-01T10:00:00.000Z" },
        { id: "job-2", status: "in_progress", created_at: "2026-11-05T10:00:00.000Z" },
        { id: "job-3", status: "cancelled", created_at: "2026-11-05T10:00:00.000Z" },
      ],
      [{ job_id: "job-1", created_at: "2026-11-03T10:00:00.000Z" }],
    );

    expect(metrics).toEqual({
      totalJobs: 3,
      completedJobs: 1,
      openJobs: 1,
      cancelledJobs: 1,
      completionRate: 50,
      averageResolutionDays: 2,
      completionEvents: 1,
    });
  });

  it("does not invent a completion rate or resolution time without source records", () => {
    expect(calculateTechnicianMetrics([], [])).toEqual({
      totalJobs: 0,
      completedJobs: 0,
      openJobs: 0,
      cancelledJobs: 0,
      completionRate: null,
      averageResolutionDays: null,
      completionEvents: 0,
    });
  });

  it("ignores completion events that are invalid or not linked to the technician's current job set", () => {
    const metrics = calculateTechnicianMetrics(
      [{ id: "job-1", status: "in_progress", created_at: "2026-11-01T10:00:00.000Z" }],
      [
        { job_id: "job-1", created_at: "not-a-date" },
        { job_id: "other-job", created_at: "2026-11-02T10:00:00.000Z" },
      ],
    );

    expect(metrics.averageResolutionDays).toBeNull();
    expect(metrics.completionEvents).toBe(0);
  });
});
