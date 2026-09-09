import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { PlatformDatabase } from "@/types/platform-database";

export function createPlatformAdminClient() {
  const key = process.env.PLATFORM_SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("PLATFORM_SUPABASE_SERVICE_ROLE_KEY is not configured.");
  return createClient<PlatformDatabase>(process.env.PLATFORM_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
