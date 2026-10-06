import { createHmac } from "node:crypto";

export function getRegistrationIpHash(ipAddress: string) {
  const secret = process.env.REGISTRATION_RATE_LIMIT_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("A secret is required to hash registration rate-limit IP addresses.");
  return createHmac("sha256", secret).update(ipAddress.trim()).digest("hex");
}
