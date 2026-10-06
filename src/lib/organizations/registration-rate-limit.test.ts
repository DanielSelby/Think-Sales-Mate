import { afterEach, describe, expect, it } from "vitest";
import { getRegistrationIpHash } from "./registration-rate-limit";

const previousSecret = process.env.REGISTRATION_RATE_LIMIT_SECRET;

afterEach(() => {
  if (previousSecret === undefined) delete process.env.REGISTRATION_RATE_LIMIT_SECRET;
  else process.env.REGISTRATION_RATE_LIMIT_SECRET = previousSecret;
});

describe("registration IP rate-limit hashing", () => {
  it("stores an opaque stable hash rather than the raw address", () => {
    process.env.REGISTRATION_RATE_LIMIT_SECRET = "test-only-secret";
    const first = getRegistrationIpHash(" 192.0.2.10 ");
    const second = getRegistrationIpHash("192.0.2.10");

    expect(first).toBe(second);
    expect(first).not.toContain("192.0.2.10");
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("requires a server-side secret when the service key is unavailable", () => {
    delete process.env.REGISTRATION_RATE_LIMIT_SECRET;
    const previousServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => getRegistrationIpHash("192.0.2.10")).toThrow("A secret is required");
    if (previousServiceRoleKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceRoleKey;
  });
});
