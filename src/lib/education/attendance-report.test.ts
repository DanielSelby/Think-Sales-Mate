import { describe, expect, it } from "vitest";
import { summarizeEducationAttendance } from "./attendance-report";

describe("summarizeEducationAttendance", () => {
  it("groups counts by campus, class, and status without student identifiers", () => {
    expect(summarizeEducationAttendance([
      { branch_id: "campus-b", class_id: "class-2", status: "present" },
      { branch_id: "campus-a", class_id: null, status: "absent" },
      { branch_id: "campus-b", class_id: "class-1", status: "present" },
      { branch_id: "campus-b", class_id: "class-2", status: "present" },
      { branch_id: "campus-b", class_id: "class-2", status: "absent" },
    ])).toEqual([
      { branch_id: "campus-a", class_id: null, status: "absent", record_count: 1 },
      { branch_id: "campus-b", class_id: "class-1", status: "present", record_count: 1 },
      { branch_id: "campus-b", class_id: "class-2", status: "absent", record_count: 1 },
      { branch_id: "campus-b", class_id: "class-2", status: "present", record_count: 2 },
    ]);
  });
});
