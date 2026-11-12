import { describe, expect, it } from "vitest";
import { educationNotificationSchema } from "./notifications";

const notification = {
  id: "92235979-07d6-4f82-b29a-9d0b55076442",
  org_id: "92235979-07d6-4f82-b29a-9d0b55076442",
  branch_id: "52235979-07d6-4f82-b29a-9d0b55076442",
  user_id: "32235979-07d6-4f82-b29a-9d0b55076442",
  notification_type: "announcement",
  title: "Term opening",
  message: "School opens Monday.",
  announcement_id: "12235979-07d6-4f82-b29a-9d0b55076442",
  delivery_status: "delivered",
  read_at: null,
  created_at: "2026-09-01T10:00:00Z",
};

describe("Think Education notifications", () => {
  it("accepts delivered and read notification records with matching read timestamps", () => {
    expect(educationNotificationSchema.safeParse(notification).success).toBe(true);
    expect(educationNotificationSchema.safeParse({
      ...notification,
      delivery_status: "read",
      read_at: "2026-09-01T10:05:00Z",
    }).success).toBe(true);
  });

  it("rejects malformed or contradictory notification delivery state", () => {
    expect(educationNotificationSchema.safeParse({
      ...notification,
      delivery_status: "read",
      read_at: null,
    }).success).toBe(false);
    expect(educationNotificationSchema.safeParse({
      ...notification,
      branch_id: "not-a-uuid",
    }).success).toBe(false);
  });
});
