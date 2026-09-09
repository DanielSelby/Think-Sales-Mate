import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { PlatformDatabase } from "@/types/platform-database";

const PLATFORM_COOKIE_NAME = "thinksales-platform-auth";

export async function createPlatformServerClient() {
  const cookieStore = await cookies();
  return createServerClient<PlatformDatabase>(
    process.env.PLATFORM_SUPABASE_URL!,
    process.env.PLATFORM_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { name: PLATFORM_COOKIE_NAME },
      cookies: {
        get(name) {
          return cookieStore.get(name)?.value;
        },
        set(name, value, options) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name, options) {
          cookieStore.set({ name, value: "", ...options });
        },
      },
    },
  );
}
