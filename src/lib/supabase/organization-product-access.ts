import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getPublishedPlatformProducts } from "@/lib/supabase/platform-admin";
import { shouldShowProductInHub } from "@/lib/product-hub-visibility";

const ASSIGNABLE_SUBSCRIPTION_STATUSES = new Set(["active", "trial", "grace", "expired"]);

export async function getOrganizationAccessibleProductOptions(orgId: string) {
  const admin = createAdminClient();
  const [products, entitlementResult] = await Promise.all([
    getPublishedPlatformProducts(),
    admin.from("organization_product_entitlements")
      .select("product_slug, status")
      .eq("organization_id", orgId),
  ]);
  if (entitlementResult.error) {
    throw new Error(`Could not load product entitlements: ${entitlementResult.error.message}`);
  }

  const entitlementBySlug = new Map(
    (entitlementResult.data ?? []).map((entitlement) => [entitlement.product_slug, entitlement.status]),
  );
  const supabase = await createClient();
  const accessibleProducts = await Promise.all(products.map(async (product) => {
    const status = entitlementBySlug.get(product.slug);
    if (
      !status
      || !shouldShowProductInHub(status)
      || !ASSIGNABLE_SUBSCRIPTION_STATUSES.has(status)
    ) {
      return null;
    }

    const { data: hasReadAccess, error } = await supabase.rpc("has_product_access", {
      p_organization_id: orgId,
      p_product_slug: product.slug,
      p_require_write: false,
    });
    if (error) {
      throw new Error(`Could not verify access to ${product.name}: ${error.message}`);
    }
    return hasReadAccess ? { slug: product.slug, name: product.name } : null;
  }));

  return accessibleProducts.filter((product) => product !== null);
}
