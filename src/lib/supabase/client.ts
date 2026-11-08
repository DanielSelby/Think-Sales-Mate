import { createBrowserClient } from "@supabase/ssr";
import { resolveProductAppRoute } from "@/lib/product-app-routes";
import type { Database } from "@/types/database";

export function createClient() {
  const appRoute = typeof window === "undefined"
    ? null
    : resolveProductAppRoute(window.location.pathname);
  const activeProductSlug = appRoute?.kind === "valid" ? appRoute.productSlug : null;

  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: activeProductSlug ? { "x-active-product-slug": activeProductSlug } : {},
      },
    }
  );
}
