import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { isOrganizationSuperAdminMember } from "@/lib/organizations/member-access";
import { getProductLaunchPath } from "@/lib/product-launch-path";
import { shouldShowProductInHub } from "@/lib/product-hub-visibility";
import { getProductHubBranding, getPublishedPlatformProducts } from "@/lib/supabase/platform-admin";
import { reconcileCurrentProductEntitlements } from "@/lib/supabase/product-entitlements";
import { getUserRegistrationApplications } from "@/lib/organizations/registration";
import { getOrganizationExpiryStatus } from "@/lib/organization-access-expiry";
import { OrganizationExpiredScreen } from "@/components/organization/organization-access-expiry";
import { ProductHubClient, type ProductHubItem } from "./product-hub-client";

export const dynamic = "force-dynamic";

export default async function ProductHubPage() {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId, { allowExpired: true });
  if (!context) {
    const { applications } = await getUserRegistrationApplications();
    if (applications.length) redirect("/registration-status");
    redirect("/onboarding");
  }

  if (getOrganizationExpiryStatus(context.organizationAccessExpiresAt).expired) {
    return (
      <OrganizationExpiredScreen
        organizationName={context.orgName}
        expiryDate={context.organizationAccessExpiresAt!}
        organizations={context.memberships.filter((membership) => membership.orgId !== context.orgId)}
      />
    );
  }

  const supabase = await createClient();
  const admin = createAdminClient();
  const isOrgAdmin = isOrganizationSuperAdminMember({
    role: context.role,
    userId: context.userId,
    accessPermissions: context.accessPermissions,
  });
  await reconcileCurrentProductEntitlements();
  const [profileResult, companyProfileResult, notificationResult, catalog, hubBranding, entitlementResult, assignmentResult] = await Promise.all([
    supabase.from("profiles").select("full_name, avatar_url").eq("id", context.userId).maybeSingle(),
    supabase.from("company_profile").select("logo_url").eq("org_id", context.orgId).maybeSingle(),
    supabase.from("notifications").select("id", { count: "exact", head: true })
      .eq("org_id", context.orgId).eq("is_read", false),
    getPublishedPlatformProducts(),
    getProductHubBranding(),
    admin.from("organization_product_entitlements")
      .select("product_slug, status")
      .eq("organization_id", context.orgId),
    isOrgAdmin
      ? Promise.resolve({ data: [], error: null })
      : supabase.from("organization_product_access_assignments")
        .select("product_slug")
        .eq("org_id", context.orgId)
        .eq("user_id", context.userId)
        .eq("is_active", true),
  ]);
  if (profileResult.error) throw new Error(`Could not load your profile: ${profileResult.error.message}`);
  if (companyProfileResult.error) throw new Error(`Could not load your organization logo: ${companyProfileResult.error.message}`);
  if (notificationResult.error) throw new Error(`Could not load notification count: ${notificationResult.error.message}`);
  if (entitlementResult.error) throw new Error(`Could not load product entitlements: ${entitlementResult.error.message}`);
  if (assignmentResult.error) throw new Error(`Could not verify product assignments: ${assignmentResult.error.message}`);

  const entitlementBySlug = new Map((entitlementResult.data ?? []).map((row) => [row.product_slug, row.status]));
  const assignedSlugs = new Set((assignmentResult.data ?? []).map((row) => row.product_slug));
  const items: ProductHubItem[] = [];

  for (const product of catalog) {
    const subscriptionStatus = entitlementBySlug.get(product.slug);
    if (!subscriptionStatus || (!isOrgAdmin && !assignedSlugs.has(product.slug))) continue;
    if (!shouldShowProductInHub(subscriptionStatus)) continue;

    if (subscriptionStatus === "pending") {
      if (isOrgAdmin) {
        items.push({
          ...product,
          imageUrl: hubBranding.productImageUrls[product.slug] ?? null,
          status: "Provisioning",
          launchPath: null,
          canOpen: false,
        });
      }
      continue;
    }

    if (subscriptionStatus !== "active" && subscriptionStatus !== "trial" && subscriptionStatus !== "grace"
      && subscriptionStatus !== "expired") {
      continue;
    }

    const { data: hasReadAccess, error } = await supabase.rpc("has_product_access", {
      p_organization_id: context.orgId,
      p_product_slug: product.slug,
      p_require_write: false,
    });
    if (error) throw new Error(`Could not verify access to ${product.name}: ${error.message}`);

    const launchPath = getProductLaunchPath(product.slug);
    if (hasReadAccess && launchPath) {
      items.push({
        ...product,
        imageUrl: hubBranding.productImageUrls[product.slug] ?? null,
        status: subscriptionStatus === "grace" || subscriptionStatus === "expired" ? "Read-only" : "Active",
        launchPath,
        canOpen: true,
      });
    } else if (isOrgAdmin) {
      items.push({
        ...product,
        imageUrl: hubBranding.productImageUrls[product.slug] ?? null,
        status: "Unavailable",
        launchPath: null,
        canOpen: false,
      });
    }
  }

  return (
    <ProductHubClient
      orgId={context.orgId}
      orgName={context.orgName}
      hubBranding={hubBranding}
      organizations={context.memberships}
      orgLogoUrl={companyProfileResult.data?.logo_url ?? null}
      userName={profileResult.data?.full_name ?? null}
      userEmail={context.userEmail}
      avatarUrl={profileResult.data?.avatar_url ?? null}
      unreadCount={notificationResult.count ?? 0}
      isOrgAdmin={isOrgAdmin}
      products={items}
    />
  );
}
