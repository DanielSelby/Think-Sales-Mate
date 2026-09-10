import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
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
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Server Components cannot always mutate cookies during a session refresh.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // Middleware or a route handler will persist the refreshed session.
          }
        },
      },
    },
  );
}
