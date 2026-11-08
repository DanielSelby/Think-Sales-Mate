import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { isPlatformProductSlug } from "@/types/platform-database";
import type { Database } from "@/types/database";

export async function createClient() {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const productHeader = requestHeaders.get("x-active-product-slug");
  const productCookie = cookieStore.get("active_product_slug")?.value;
  const activeProductSlug = productHeader && isPlatformProductSlug(productHeader)
    ? productHeader
    : productCookie && isPlatformProductSlug(productCookie) ? productCookie : null;

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: activeProductSlug ? { "x-active-product-slug": activeProductSlug } : {},
      },
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Called from a Server Component — safe to ignore when
            // middleware is also refreshing the session.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // Same as above.
          }
        }
      }
    }
  );
}