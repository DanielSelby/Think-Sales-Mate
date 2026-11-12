import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isOrganizationSuperAdminMember } from "@/lib/organizations/member-access";
import { canonicalRoleKey, isTabVisible, resolveMemberPermissionMatrix } from "@/lib/rbac/permission-matrix";
import { resolveTabRouteAccess } from "@/lib/rbac/tab-route-access";
import {
  getLegacyProductAppPath,
  getRequiredProductSlugs,
  hasAnyRequiredProductAccess,
} from "@/lib/product-entitlement-routes";
import { resolveProductAppRoute } from "@/lib/product-app-routes";
import { getOrganizationExpiryStatus } from "@/lib/organization-access-expiry";
import type { PlatformProductSlug } from "@/types/platform-database";

const PUBLIC_PATHS = ["/login", "/signup", "/auth/callback", "/forgot-password", "/education-portal", "/student-education-portal", "/order/", "/restaurant-order/", "/restaurant-reservation/", "/service-repair/", "/api/restaurant-order/", "/api/system-logo", "/api/cron/product-entitlements", "/api/cron/platform-usage", "/mobile-scan/pair"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });
  const pathname = request.nextUrl.pathname;
  const resolvedAppRoute = resolveProductAppRoute(pathname);
  if (resolvedAppRoute?.kind === "invalid") {
    return new NextResponse("Product application route not found.", { status: 404 });
  }
  const appRoute = resolvedAppRoute?.kind === "valid" ? resolvedAppRoute : null;
  const isApiRequest = pathname.startsWith("/api/") || Boolean(appRoute?.appPath.startsWith("/api/"));
  let verifiedProductOrganizationId: string | null = null;
  const continueWithProductContext = () => {
    if (!appRoute || !verifiedProductOrganizationId) return response;
    const requestHeaders = new Headers(request.headers);
    requestHeaders.delete("x-active-product-slug");
    requestHeaders.delete("x-active-organization-id");
    requestHeaders.set("x-active-product-slug", appRoute.productSlug);
    requestHeaders.set("x-active-organization-id", verifiedProductOrganizationId);
    const rewriteUrl = new URL(appRoute.appPath, request.url);
    rewriteUrl.search = request.nextUrl.search;
    const scopedResponse = NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } });
    response.cookies.getAll().forEach((cookie) => scopedResponse.cookies.set(cookie));
    scopedResponse.cookies.set("active_product_slug", appRoute.productSlug, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
    });
    return scopedResponse;
  };

  if (pathname.startsWith("/service-repair/")) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }

  if (
    pathname === "/education-portal"
    || pathname.startsWith("/education-portal/")
    || pathname === "/student-education-portal"
    || pathname.startsWith("/student-education-portal/")
  ) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

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
    if (isApiRequest) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", request.nextUrl.pathname);
    return redirectWithAuthCookies(redirectUrl);
  }

  if (user && checksSignedInDestination) {
    return redirectWithAuthCookies(new URL("/product-hub", request.url));
  }

  if (
    user?.app_metadata?.must_change_password === true
    && pathname !== "/reset-password"
    && !pathname.startsWith("/auth/callback")
  ) {
    return redirectWithAuthCookies(new URL("/reset-password", request.url));
  }

  if (!appRoute) {
    const canonicalPath = getLegacyProductAppPath(pathname);
    if (canonicalPath) {
      const redirectUrl = new URL(canonicalPath, request.url);
      redirectUrl.search = request.nextUrl.search;
      return redirectWithAuthCookies(redirectUrl);
    }
  }

  const activeOrgId = request.cookies.get("active_org_id")?.value;
  if (user && activeOrgId && pathname !== "/organization-expired") {
    const { data: expiryMember, error: expiryMemberError } = await supabase
      .from("organization_members")
      .select("org_id, organizations!organization_members_org_id_fkey(registration_status)")
      .eq("user_id", user.id)
      .eq("org_id", activeOrgId)
      .eq("status", "active")
      .maybeSingle();
    if (expiryMemberError) {
      console.error("Organization expiry membership lookup failed:", expiryMemberError.message);
      return isApiRequest
        ? NextResponse.json({ error: "Unable to verify organization access." }, { status: 503 })
        : new NextResponse("Unable to verify organization access. Please try again.", { status: 503 });
    }
    const expiryOrganization = Array.isArray(expiryMember?.organizations)
      ? expiryMember.organizations[0]
      : expiryMember?.organizations;
    if (expiryMember && expiryOrganization?.registration_status === "approved") {
      const platformUrl = process.env.PLATFORM_SUPABASE_URL;
      const platformServiceKey = process.env.PLATFORM_SUPABASE_SERVICE_ROLE_KEY;
      if (!platformUrl || !platformServiceKey) {
        console.error("Organization expiry verification is unavailable because Platform Supabase is not configured.");
        return isApiRequest
          ? NextResponse.json({ error: "Unable to verify organization access." }, { status: 503 })
          : new NextResponse("Unable to verify organization access. Please try again.", { status: 503 });
      }

      try {
        const platformQuery = new URL("/rest/v1/platform_organizations", platformUrl);
        platformQuery.searchParams.set("organization_id", `eq.${activeOrgId}`);
        platformQuery.searchParams.set("select", "organization_access_expires_at");
        const platformResponse = await fetch(platformQuery, {
          headers: {
            apikey: platformServiceKey,
            Authorization: `Bearer ${platformServiceKey}`,
          },
          cache: "no-store",
        });
        if (!platformResponse.ok) {
          console.error("Organization expiry lookup failed:", platformResponse.status, platformResponse.statusText);
          return isApiRequest
            ? NextResponse.json({ error: "Unable to verify organization access." }, { status: 503 })
            : new NextResponse("Unable to verify organization access. Please try again.", { status: 503 });
        }
        const platformRows: unknown = await platformResponse.json();
        if (!Array.isArray(platformRows) || platformRows.length !== 1) {
          throw new Error("Platform Admin returned no unique organization expiry record.");
        }
        const platformOrganization: unknown = platformRows[0];
        if (
          typeof platformOrganization !== "object"
          || platformOrganization === null
          || !("organization_access_expires_at" in platformOrganization)
          || (
            platformOrganization.organization_access_expires_at !== null
            && typeof platformOrganization.organization_access_expires_at !== "string"
          )
        ) {
          throw new Error("Platform Admin returned an invalid organization expiry record.");
        }
        const accessExpiry = platformOrganization.organization_access_expires_at;
        if (getOrganizationExpiryStatus(accessExpiry).expired) {
          if (isApiRequest) {
            return NextResponse.json({
              error: "Organization access has expired.",
              organizationAccessExpiresAt: accessExpiry,
            }, { status: 403 });
          }
          return redirectWithAuthCookies(new URL("/organization-expired", request.url));
        }
      } catch (error) {
        console.error("Organization expiry verification failed:", error);
        return isApiRequest
          ? NextResponse.json({ error: "Unable to verify organization access." }, { status: 503 })
          : new NextResponse("Unable to verify organization access. Please try again.", { status: 503 });
      }
    }
  }

  const routePath = appRoute?.appPath ?? pathname;
  const tabAccess = resolveTabRouteAccess(routePath, request.nextUrl.searchParams);
  const pageProducts = getRequiredProductSlugs(routePath);
  if (appRoute && !pageProducts?.includes(appRoute.productSlug)) {
    return new NextResponse("Product application route not found.", { status: 404 });
  }
  const routeProducts = appRoute
    ? [appRoute.productSlug]
    : pageProducts;
  const requiredProducts = routeProducts;
  if (user && (tabAccess || routeProducts || requiredProducts)) {
    const { data: members, error: memberError } = await supabase
      .from("organization_members")
      .select("org_id, role, user_id, access_permissions, organizations!organization_members_org_id_fkey(created_by, registration_status)")
      .eq("user_id", user.id)
      .eq("status", "active");

    if (memberError) {
      console.error("Tab permission member lookup failed:", memberError.message);
      if (isApiRequest) return NextResponse.json({ error: "Unable to verify your access permissions." }, { status: 503 });
      return new NextResponse("Unable to verify your access permissions. Please try again.", { status: 503 });
    }

    const accessibleMembers = (members ?? []).filter((candidate) => {
      const organization = Array.isArray(candidate.organizations) ? candidate.organizations[0] : candidate.organizations;
      return organization?.registration_status === "approved";
    });
    const member = activeOrgId
      ? accessibleMembers.find((candidate) => candidate.org_id === activeOrgId)
      : accessibleMembers[0];
    if (routeProducts && !member) {
      if (isApiRequest) return NextResponse.json({ error: "An approved organization membership is required." }, { status: 403 });
      return redirectWithAuthCookies(new URL("/login", request.url));
    }
    if (member && requiredProducts) {
      const readableProducts = new Set<PlatformProductSlug>();
      for (const productSlug of requiredProducts) {
        const { data: hasAccess, error: entitlementError } = await supabase.rpc("has_product_access", {
          p_organization_id: member.org_id,
          p_product_slug: productSlug,
          p_require_write: request.method !== "GET" && request.method !== "HEAD",
        });
        if (entitlementError) {
          console.error("Product entitlement lookup failed:", entitlementError.message);
          if (isApiRequest) return NextResponse.json({ error: "Unable to verify your product access." }, { status: 503 });
          return new NextResponse("Unable to verify your product access. Please try again.", { status: 503 });
        }
        if (hasAccess) readableProducts.add(productSlug);
      }
      if (!hasAnyRequiredProductAccess(requiredProducts, readableProducts)) {
        if (isApiRequest) return NextResponse.json({ error: "This product is not available for your organization." }, { status: 403 });
        const deniedUrl = new URL("/subscription-status", request.url);
        deniedUrl.searchParams.set("product", requiredProducts.join(","));
        return redirectWithAuthCookies(deniedUrl);
      }
    }

    if (member) {
      const organization = Array.isArray(member.organizations) ? member.organizations[0] : member.organizations;
      const accessPermissions = (member.access_permissions ?? {}) as Record<string, unknown>;
      const isOwner = isOrganizationSuperAdminMember({
        role: member.role,
        userId: member.user_id,
        createdBy: organization?.created_by,
        accessPermissions,
      });

      if (routeProducts && !isOwner) {
        const { data: assignments, error: assignmentError } = await supabase
          .from("organization_product_access_assignments")
          .select("product_slug")
          .eq("org_id", member.org_id)
          .eq("user_id", user.id)
          .eq("is_active", true);
        if (assignmentError) {
          console.error("Product assignment lookup failed:", assignmentError.message);
          if (isApiRequest) return NextResponse.json({ error: "Unable to verify your product assignments." }, { status: 503 });
          return new NextResponse("Unable to verify your product assignments. Please try again.", { status: 503 });
        }
        const assignedProducts = new Set((assignments ?? []).map((assignment) => assignment.product_slug));
        if (!routeProducts.some((productSlug) => assignedProducts.has(productSlug))) {
          if (isApiRequest) return NextResponse.json({ error: "You are not assigned to this product." }, { status: 403 });
          const deniedUrl = new URL("/product-hub", request.url);
          deniedUrl.searchParams.set("accessDenied", "product");
          return redirectWithAuthCookies(deniedUrl);
        }
      }

      if (appRoute) verifiedProductOrganizationId = member.org_id;
      if (!tabAccess) return continueWithProductContext();
      if (!isOwner) {
        let permissionAccess = accessPermissions;
        let roleKey = canonicalRoleKey(
          typeof accessPermissions.role_key === "string" ? accessPermissions.role_key : member.role
        );
        let roleTemplate: unknown;
        let hasRoleTemplate = false;
        if (appRoute) {
          const { data: productPermission, error: productPermissionError } = await (supabase as any)
            .from("organization_member_product_permissions")
            .select("role_key, permissions_mode, permissions")
            .eq("org_id", member.org_id)
            .eq("user_id", user.id)
            .eq("product_slug", appRoute.productSlug)
            .maybeSingle();
          if (productPermissionError || !productPermission) {
            console.error("Product permission lookup failed:", productPermissionError?.message ?? "No product permission profile exists.");
            return new NextResponse("Unable to verify your product permissions. Please try again.", { status: 503 });
          }
          permissionAccess = productPermission;
          roleKey = canonicalRoleKey(productPermission.role_key);
          if (productPermission.permissions_mode !== "custom") {
            const { data: productTemplate, error: productTemplateError } = await (supabase as any)
              .from("organization_product_role_templates")
              .select("permissions")
              .eq("org_id", member.org_id)
              .eq("product_slug", appRoute.productSlug)
              .eq("role_key", roleKey)
              .maybeSingle();
            if (productTemplateError) {
              console.error("Product role template lookup failed:", productTemplateError.message);
              return new NextResponse("Unable to verify your product permissions. Please try again.", { status: 503 });
            }
            roleTemplate = productTemplate?.permissions;
            hasRoleTemplate = productTemplate !== null;
          }
        } else if (accessPermissions.permissions_mode !== "custom") {
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
          permissionAccess,
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
      if (!tabAccess) return response;
      const deniedUrl = new URL("/dashboard", request.url);
      deniedUrl.searchParams.set("accessDenied", `${tabAccess.module}.${tabAccess.page}.${tabAccess.tab}`);
      return redirectWithAuthCookies(deniedUrl);
    }
  }

  return continueWithProductContext();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|order/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};