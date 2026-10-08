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

  const redirectWithAuthCookies = (url: URL) => {
    const redirectResponse = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  };

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (
    authError
    && (
      authError.status === undefined
      || authError.status === 0
      || authError.status === 408
      || authError.status === 429
      || authError.status >= 500
    )
  ) {
    console.error("Supabase session verification failed:", authError.message);
    return new NextResponse("Unable to verify your session. Please try again.", { status: 503 });
  }

  if (!user && !isPublicPath) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", request.nextUrl.pathname);
    return redirectWithAuthCookies(redirectUrl);
  }

  if (user && checksSignedInDestination) {
    return redirectWithAuthCookies(new URL("/dashboard", request.url));
  }

  if (
    user?.app_metadata?.must_change_password === true
    && pathname !== "/reset-password"
    && !pathname.startsWith("/auth/callback")
  ) {
    return redirectWithAuthCookies(new URL("/reset-password", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|order/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};