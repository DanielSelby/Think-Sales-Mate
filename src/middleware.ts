import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isOrganizationSuperAdminMember } from "@/lib/organizations/member-access";
import { canonicalRoleKey, isTabVisible, resolveMemberPermissionMatrix } from "@/lib/rbac/permission-matrix";
import { resolveTabRouteAccess } from "@/lib/rbac/tab-route-access";

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

  const tabAccess = resolveTabRouteAccess(pathname, request.nextUrl.searchParams);
  const activeOrgId = request.cookies.get("active_org_id")?.value;
  if (user && tabAccess) {
    const { data: members, error: memberError } = await supabase
      .from("organization_members")
      .select("org_id, role, user_id, access_permissions, organizations(created_by, registration_status)")
      .eq("user_id", user.id)
      .eq("status", "active");

    if (memberError) {
      console.error("Tab permission member lookup failed:", memberError.message);
      return new NextResponse("Unable to verify your access permissions. Please try again.", { status: 503 });
    }

    const accessibleMembers = (members ?? []).filter((candidate) => {
      const organization = Array.isArray(candidate.organizations) ? candidate.organizations[0] : candidate.organizations;
      return organization?.registration_status === "approved";
    });
    const member = accessibleMembers.find((candidate) => candidate.org_id === activeOrgId) ?? accessibleMembers[0];
    if (member) {
      const organization = Array.isArray(member.organizations) ? member.organizations[0] : member.organizations;
      const accessPermissions = (member.access_permissions ?? {}) as Record<string, unknown>;
      const isOwner = isOrganizationSuperAdminMember({
        role: member.role,
        userId: member.user_id,
        createdBy: organization?.created_by,
        accessPermissions,
      });

      if (!isOwner) {
        const roleKey = canonicalRoleKey(
          typeof accessPermissions.role_key === "string" ? accessPermissions.role_key : member.role
        );
        let roleTemplate: unknown;
        let hasRoleTemplate = false;
        if (accessPermissions.permissions_mode !== "custom") {
          const { data: template, error: templateError } = await supabase
            .from("organization_role_templates")
            .select("permissions")
            .eq("org_id", member.org_id)
            .eq("role_key", roleKey)
            .maybeSingle();
          if (templateError) {
            console.error("Tab permission template lookup failed:", templateError.message);
            return new NextResponse("Unable to verify your access permissions. Please try again.", { status: 503 });
          }
          roleTemplate = template?.permissions;
          hasRoleTemplate = template !== null;
        }

        const permissionMatrix = resolveMemberPermissionMatrix(
          accessPermissions,
          roleTemplate,
          hasRoleTemplate,
          roleKey
        );
        if (!isTabVisible(permissionMatrix, tabAccess.module, tabAccess.page, tabAccess.tab)) {
          const deniedUrl = new URL("/dashboard", request.url);
          deniedUrl.searchParams.set("accessDenied", `${tabAccess.module}.${tabAccess.page}.${tabAccess.tab}`);
          return redirectWithAuthCookies(deniedUrl);
        }
      }
    } else {
      const deniedUrl = new URL("/dashboard", request.url);
      deniedUrl.searchParams.set("accessDenied", `${tabAccess.module}.${tabAccess.page}.${tabAccess.tab}`);
      return redirectWithAuthCookies(deniedUrl);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|order/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};