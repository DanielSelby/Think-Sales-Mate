import { getCurrentOrgContext } from "@/lib/organizations/current";
import { getCurrentProductEntitlement } from "@/lib/supabase/product-entitlements";
import { getOrganizationUsageSummary } from "@/lib/organizations/usage-summary";

const products = [
  { slug: "thinksales-erp", name: "ThinkSales ERP" },
  { slug: "restaurant", name: "Restaurant" },
] as const;

const accessLabels = {
  full: "Active",
  read_only: "Read-only grace period",
  billing_only: "Expired — billing and status only",
  blocked: "Not active",
} as const;

export default async function SubscriptionStatusPage() {
  const organization = await getCurrentOrgContext();
  if (!organization) return null;

  const [entitlements, usage] = await Promise.all([
    Promise.all(products.map(async (product) => ({
      ...product,
      entitlement: await getCurrentProductEntitlement(product.slug),
    }))),
    organization.role === "owner" ? getOrganizationUsageSummary(organization.orgId) : Promise.resolve(null),
  ]);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Product access and subscriptions</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Access depends on your organization&apos;s product subscription and feature grants.
          Contact your organization administrator or platform support to change a subscription.
        </p>
      </header>
      <section className="overflow-hidden rounded-lg border">
        <div className="grid grid-cols-[1fr_auto] gap-4 border-b px-4 py-3 text-sm font-medium">
          <span>Product</span>
          <span>Access</span>
        </div>
        {entitlements.map(({ slug, name, entitlement }) => (
          <div key={slug} className="grid grid-cols-[1fr_auto] gap-4 border-b px-4 py-4 last:border-b-0">
            <div>
              <h2 className="font-medium">{name}</h2>
              <p className="mt-1 text-xs text-muted-foreground">Subscription status: {entitlement.status.replaceAll("_", " ")}</p>
            </div>
            <span className="text-sm">{accessLabels[entitlement.accessMode]}</span>
          </div>
        ))}
      </section>
      {usage && (
        <section className="space-y-4 rounded-lg border p-4">
          <div>
            <h2 className="text-lg font-semibold">Organization usage</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Active and invited members count toward seats. All configured branches count toward the branch limit.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {([
              { label: "Seats", used: usage.members, limit: usage.userLimit },
              { label: "Branches", used: usage.branches, limit: usage.branchLimit },
            ] as const).map(({ label, used, limit }) => (
              <div key={label} className="rounded-md border p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-medium">{label}</h3>
                  <span className="text-sm text-muted-foreground">
                    {used} / {limit ?? "Unlimited"}
                  </span>
                </div>
                {limit !== null && limit > 0 && (
                  <div
                    className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200"
                    role="progressbar"
                    aria-label={`${label} usage`}
                    aria-valuemin={0}
                    aria-valuemax={limit}
                    aria-valuenow={Math.min(used, limit)}
                  >
                    <div
                      className={`h-full rounded-full ${used >= limit ? "bg-red-600" : "bg-emerald-600"}`}
                      style={{ width: `${Math.min(100, Math.round((used / limit) * 100))}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
