import { redirect } from "next/navigation";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublishedPlatformProducts } from "@/lib/supabase/platform-admin";
import { getCurrentProductEntitlement } from "@/lib/supabase/product-entitlements";
import { requestAdditionalProduct } from "./actions";

const accessLabels = {
  full: "Active",
  read_only: "Read-only grace period",
  billing_only: "Expired — billing only",
  blocked: "Not active",
} as const;

const requestLabels = {
  pending: "Awaiting Platform Admin review",
  approved: "Approved — subscription activation is still required",
  declined: "Request declined",
} as const;

export default async function OrganizationProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; requested?: string }>;
}) {
  const params = await searchParams;
  const organization = await getCurrentOrgContext();
  if (!organization) redirect("/login");

  const [products, { data: requests, error: requestsError }] = await Promise.all([
    getPublishedPlatformProducts(),
    createAdminClient()
      .from("organization_product_requests")
      .select("product_slug, request_status, requested_at")
      .eq("organization_id", organization.orgId),
  ]);
  if (requestsError) throw new Error(`Could not load product requests: ${requestsError.message}`);

  const requestBySlug = new Map((requests ?? []).map((request) => [request.product_slug, request]));
  const productAccess = await Promise.all(products.map(async (product) => ({
    ...product,
    entitlement: await getCurrentProductEntitlement(product.slug),
    request: requestBySlug.get(product.slug) ?? null,
  })));

  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">Products and access</h1>
        <p className="mt-2 text-sm text-ledger-500 dark:text-ledger-400">
          Request another product for {organization.orgName}. A request does not activate a subscription or change your current access.
        </p>
      </header>

      {params.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{params.error}</p>}
      {params.requested && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Your product request was submitted for review.</p>}

      <section className="divide-y overflow-hidden rounded-xl border border-ledger-100 bg-white dark:border-ledger-700 dark:bg-ink-900">
        {productAccess.map(({ slug, name, description, entitlement, request }) => (
          <article key={slug} className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="min-w-[220px] flex-1">
              <h2 className="font-semibold text-ink-900 dark:text-white">{name}</h2>
              {description && <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">{description}</p>}
              <p className="mt-2 text-xs text-ledger-500 dark:text-ledger-400">
                Product access: {accessLabels[entitlement.accessMode]}
              </p>
              {request && (
                <p className="mt-1 text-xs text-ledger-500 dark:text-ledger-400">
                  Request: {requestLabels[request.request_status]}
                </p>
              )}
            </div>
            {entitlement.canReadProductData ? (
              <span className="text-sm font-medium text-emerald-700">Already included</span>
            ) : request?.request_status === "pending" ? (
              <span className="text-sm font-medium text-amber-700">Request pending</span>
            ) : request?.request_status === "approved" ? (
              <span className="text-sm font-medium text-emerald-700">Approved — awaiting activation</span>
            ) : organization.role === "owner" ? (
              <form action={requestAdditionalProduct}>
                <input type="hidden" name="productSlug" value={slug} />
                <button type="submit" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
                  {request ? "Request again" : "Request product"}
                </button>
              </form>
            ) : (
              <span className="text-sm text-ledger-500">Contact your organization owner</span>
            )}
          </article>
        ))}
        {productAccess.length === 0 && (
          <p className="p-5 text-sm text-ledger-500">No products are currently available.</p>
        )}
      </section>
    </main>
  );
}
