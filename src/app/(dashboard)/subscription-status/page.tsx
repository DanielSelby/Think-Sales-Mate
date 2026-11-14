import { getCurrentOrgContext } from "@/lib/organizations/current";
import { getCurrentProductEntitlement } from "@/lib/supabase/product-entitlements";
import { getOrganizationUsageSummary } from "@/lib/organizations/usage-summary";
import { Activity, Building2, CreditCard, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const products = [
  { slug: "thinksales-erp", name: "ThinkSales ERP" },
  { slug: "restaurant", name: "Restaurant" },
  { slug: "think-service-repairs", name: "Think Service & Repairs" },
] as const;

const accessLabels = {
  full: "Active",
  read_only: "Read-only grace period",
  billing_only: "Expired — billing and status only",
  blocked: "Not active",
} as const;

const accessStyles = {
  full: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  read_only: "bg-amber-50 text-amber-700 ring-amber-200",
  billing_only: "bg-rose-50 text-rose-700 ring-rose-200",
  blocked: "bg-slate-100 text-slate-600 ring-slate-200",
} as const;

const planLabels = {
  trial: "Trial",
  starter: "Starter",
  growth: "Growth",
  enterprise: "Enterprise",
} as const;

export default async function SubscriptionStatusPage() {
  const organization = await getCurrentOrgContext();
  if (!organization) return null;

  const supabase = await createClient();
  const [{ data: organizationPlan, error: planError }, entitlements, usage] = await Promise.all([
    supabase.from("organizations").select("plan").eq("id", organization.orgId).single(),
    Promise.all(products.map(async (product) => ({
      ...product,
      entitlement: await getCurrentProductEntitlement(product.slug),
    }))),
    organization.role === "owner" ? getOrganizationUsageSummary(organization.orgId) : Promise.resolve(null),
  ]);
  if (planError) throw new Error(`Could not load organization plan: ${planError.message}`);
  const activeProductCount = entitlements.filter(({ entitlement }) => entitlement.accessMode === "full").length;

  return (
    <div className="workspace-subscription-page mx-auto max-w-5xl space-y-6 p-1 sm:p-3">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
            <CreditCard className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Account overview</p>
            <h1 className="mt-1 text-2xl font-semibold">Product access and subscriptions</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Access depends on your organization&apos;s product subscription and feature grants.
          Contact your organization administrator or platform support to change a subscription.
            </p>
          </div>
        </div>
      </header>
      <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700">
            <CreditCard className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Current organization plan</p>
            <h2 className="mt-1 text-xl font-semibold">{planLabels[organizationPlan.plan]}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {activeProductCount} {activeProductCount === 1 ? "product" : "products"} currently have full access.
            </p>
          </div>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
          {organizationPlan.plan === "trial" ? "Trial plan" : "Plan active"}
        </span>
      </section>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[1fr_auto] gap-4 border-b bg-slate-50 px-5 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">
          <span>Product</span>
          <span>Access</span>
        </div>
        {entitlements.map(({ slug, name, entitlement }) => (
          <div key={slug} className="grid grid-cols-[1fr_auto] items-center gap-4 border-b px-5 py-4 last:border-b-0">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-50 text-slate-500">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div>
                <h2 className="font-semibold">{name}</h2>
                <p className="mt-1 text-xs text-muted-foreground">Subscription status: {entitlement.status.replaceAll("_", " ")}</p>
              </div>
            </div>
            <span className={`rounded-full px-3 py-1 text-right text-xs font-semibold ring-1 ring-inset ${accessStyles[entitlement.accessMode]}`}>
              {accessLabels[entitlement.accessMode]}
            </span>
          </div>
        ))}
      </section>
      {usage && (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-700">
              <Activity className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold">Organization usage</h2>
              <p className="mt-1 text-sm text-muted-foreground">
              Active and invited members count toward seats. All configured branches count toward the branch limit.
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {([
              { label: "Seats", used: usage.members, limit: usage.userLimit, icon: CreditCard },
              { label: "Branches", used: usage.branches, limit: usage.branchLimit, icon: Building2 },
            ] as const).map(({ label, used, limit, icon: Icon }) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 font-semibold"><Icon className="h-4 w-4 text-slate-500" />{label}</h3>
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
      <section className="flex flex-col gap-4 rounded-2xl border border-blue-100 bg-blue-50/70 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Need another product?</p>
          <h2 className="mt-1 text-lg font-semibold">Manage product access</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Review available products or contact Support for subscription and billing questions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/settings/products" className="inline-flex h-10 items-center rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800">
            Product requests
          </Link>
          <Link href="/support" className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Contact support
          </Link>
        </div>
      </section>
    </div>
  );
}
