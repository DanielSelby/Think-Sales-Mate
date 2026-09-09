"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { PlatformDatabase } from "@/types/platform-database";

export function createPlatformClient() {
  return createBrowserClient<PlatformDatabase>(
    process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_URL ?? process.env.PLATFORM_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_ANON_KEY ?? process.env.PLATFORM_SUPABASE_ANON_KEY!,
    { cookieOptions: { name: "thinksales-platform-auth" } },
  );
}
