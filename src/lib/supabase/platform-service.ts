import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { PlatformDatabase } from "@/types/platform-database";

export function createPlatformServiceClient() {
  const url = process.env.PLATFORM_SUPABASE_URL;
  const serviceKey = process.env.PLATFORM_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Platform support storage is not configured.");
  }
  return createClient<PlatformDatabase>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
