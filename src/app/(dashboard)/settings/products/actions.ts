"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { parseRequestedProductSlugs, ProductSelectionError } from "@/lib/organizations/product-registration";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublishedPlatformProducts } from "@/lib/supabase/platform-admin";
import { getCurrentProductEntitlement } from "@/lib/supabase/product-entitlements";

function redirectWithError(message: string): never {
  redirect(`/settings/products?error=${encodeURIComponent(message)}`);
}

export async function requestAdditionalProduct(formData: FormData): Promise<void> {
  const organization = await getCurrentOrgContext();
  if (!organization) redirect("/login");
  if (organization.role !== "owner") {
    redirectWithError("Only the organization owner can request additional products.");
  }

  const application = createAdminClient();
  const { data: organizationRecord, error: organizationError } = await application
    .from("organizations")
    .select("id, created_by, registration_status")
    .eq("id", organization.orgId)
    .single();
  if (organizationError) throw new Error(`Could not verify organization ownership: ${organizationError.message}`);
  if (organizationRecord.created_by !== organization.userId || organizationRecord.registration_status !== "approved") {
    redirectWithError("Only the approved organization owner can request additional products.");
  }

  const products = await getPublishedPlatformProducts();
  let productSlug;
  try {
    [productSlug] = parseRequestedProductSlugs(
      [formData.get("productSlug") ?? ""],
      products.map((product) => product.slug),
    );
  } catch (error) {
    if (error instanceof ProductSelectionError) redirectWithError(error.message);
    throw error;
  }

  const entitlement = await getCurrentProductEntitlement(productSlug);
  if (entitlement.canReadProductData) {
    redirectWithError("Your organization already has access to this product.");
  }

  const { data: requestStatus, error: requestError } = await application.rpc("request_organization_product", {
    p_organization_id: organization.orgId,
    p_product_slug: productSlug,
  });
  if (requestError) throw new Error(`Could not submit the product request: ${requestError.message}`);
  if (requestStatus === "approved") {
    redirectWithError("This product request is already approved. Subscription activation is still required.");
  }
  if (requestStatus !== "pending") {
    throw new Error(`Could not submit the product request: unexpected status "${requestStatus}".`);
  }

  revalidatePath("/settings/products");
  redirect(`/settings/products?requested=${encodeURIComponent(productSlug)}`);
}
