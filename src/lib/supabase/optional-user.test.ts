import { describe, expect, it } from "vitest";
import { getOptionalAuthUser } from "./optional-user";

describe("getOptionalAuthUser", () => {
  it("treats a missing session as a signed-out visitor", () => {
    expect(getOptionalAuthUser({
      data: { user: null },
      error: { name: "AuthSessionMissingError", message: "Auth session missing!" },
    }, "the student portal")).toBeNull();
  });

  it("returns an authenticated user", () => {
    const user = { id: "user-1" };
    expect(getOptionalAuthUser({ data: { user }, error: null }, "the student portal")).toBe(user);
  });

  it("surfaces authentication failures other than a missing session", () => {
    expect(() => getOptionalAuthUser({
      data: { user: null },
      error: { name: "AuthRetryableFetchError", message: "Auth service unavailable." },
    }, "the student portal")).toThrow("Could not verify the signed-in account for the student portal");
  });
});
