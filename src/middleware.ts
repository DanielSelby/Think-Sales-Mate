import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/signup", "/auth/callback", "/forgot-password", "/order/", "/api/system-logo"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });
  const pathname = request.nextUrl.pathname;

  if (
    pathname.startsWith("/platform-admin")
    || pathname === "/api/platform-admin/upload-theme-artwork"
  ) {
    if (pathname === "/platform-admin/login") {
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set("x-platform-public", "true");
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    return response;
  }

  const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path));
  const checksSignedInDestination = pathname === "/login" || pathname === "/signup";
  if (isPublicPath && !checksSignedInDestination) return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: request.headers } });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        }
      }
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user && !isPublicPath) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && checksSignedInDestination) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|order/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};