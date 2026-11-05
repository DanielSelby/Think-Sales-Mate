import { redirect } from "next/navigation";
import Link from "next/link";
import { Box, Info, Plus, ShieldCheck } from "lucide-react";
import { getPlatformAdmin, platformRoleCan } from "@/lib/platform-auth";
import { platformRoleCanAccessPage } from "@/lib/platform-admin-pages";
import { createPlatformServerClient } from "@/lib/supabase/platform-server";
import PlatformNotificationBell from "../notification-bell";
import PlatformAdminSignOutButton from "../sign-out-button";
import { retryProductEntitlementEvent } from "../actions";
import {
  ProductCatalogDashboard,
  type CatalogProduct,
} from "./product-catalog-dashboard";

export const dynamic = "force-dynamic";
const PRODUCT_ACCESS_STATUSES = new Set(["active", "trial", "grace"]);

async function fetchAllPages<T>(
  loadPage: (start: number, end: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
    count: number | null;
  }>,
  description: string,
): Promise<T[]> {
  const pageSize = 1000;
  const firstPage = await loadPage(0, pageSize - 1);
  if (firstPage.error) throw new Error(`Could not load ${description}: ${firstPage.error.message}`);
  const rows = [...(firstPage.data ?? [])];
  const totalCount = firstPage.count ?? rows.length;

  for (let start = pageSize; start < totalCount; start += pageSize) {
    const page = await loadPage(start, Math.min(start + pageSize - 1, totalCount - 1));
    if (page.error) throw new Error(`Could not load ${description}: ${page.error.message}`);
    rows.push(...(page.data ?? []));
  }
  if (rows.length !== totalCount) {
    throw new Error(`Could not load all ${description}: expected ${totalCount} rows but received ${rows.length}.`);
  }
  return rows;
}

function chunks<T>(values: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size)
  );
}

export default async function PlatformProductCatalogPage() {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/platform-admin/login");
  if (!platformRoleCanAccessPage(admin.role, admin.page_permissions, "Feature Access")) redirect("/platform-admin");

  const supabase = await createPlatformServerClient();
  const [
    { data: productRows, error: productsError },
    { data: moduleRows, error: modulesError },
    { data: pendingEntitlementEvents, error: eventsError },
    { count: activeOrganizations, error: organizationsError },
    subscriptions,
    { data: notifications, error: notificationsError },
  ] = await Promise.all([
    supabase
      .from("platform_products")
      .select("slug, name, description, is_published, created_at")
      .order("name"),
    supabase
      .from("platform_product_features")
      .select("product_slug, module")
      .order("module"),
    supabase
      .from("platform_entitlement_outbox")
      .select("id, organization_id, product_slug, version, attempts, next_attempt_at, last_error, created_at")
      .is("processed_at", null)
      .order("next_attempt_at", { ascending: true })
      .limit(50),
    supabase
      .from("platform_organizations")
      .select("id", { count: "exact", head: true })
      .eq("registration_state", "approved")
      .in("status", ["active", "trial"]),
    fetchAllPages((start, end) => supabase
      .from("platform_organization_subscriptions")
      .select("organization_id, product_slug, status, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("organization_id")
      .order("product_slug")
      .range(start, end), "product subscriptions"),
    supabase
      .from("platform_notifications")
      .select("id, severity, title, message, created_at, read_at")
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (productsError) throw new Error(`Could not load product catalog: ${productsError.message}`);
  if (modulesError) throw new Error(`Could not load product module mappings: ${modulesError.message}`);
  if (eventsError) throw new Error(`Could not load entitlement synchronization status: ${eventsError.message}`);
  if (organizationsError) throw new Error(`Could not count active organizations: ${organizationsError.message}`);
  if (notificationsError) throw new Error(`Could not load Platform Admin notifications: ${notificationsError.message}`);

  const organizationIds = Array.from(new Set(subscriptions.map((subscription) => subscription.organization_id)));
  const organizationBatches = await Promise.all(chunks(organizationIds, 100).map((ids) =>
    supabase
      .from("platform_organizations")
      .select("organization_id, name")
      .in("organization_id", ids)
  ));
  const failedOrganizationBatch = organizationBatches.find((batch) => batch.error);
  if (failedOrganizationBatch?.error) {
    throw new Error(`Could not load product organization associations: ${failedOrganizationBatch.error.message}`);
  }
  const organizationNameById = new Map(organizationBatches.flatMap((batch) =>
    (batch.data ?? []).map((organization) => [organization.organization_id, organization.name] as const)
  ));
  const modulesByProduct = new Map<string, string[]>();
  for (const row of moduleRows ?? []) {
    const modules = modulesByProduct.get(row.product_slug) ?? [];
    modules.push(row.module);
    modulesByProduct.set(row.product_slug, modules);
  }
  const subscriptionsByProduct = new Map<string, typeof subscriptions>();
  for (const subscription of subscriptions) {
    const productSubscriptions = subscriptionsByProduct.get(subscription.product_slug) ?? [];
    productSubscriptions.push(subscription);
    subscriptionsByProduct.set(subscription.product_slug, productSubscriptions);
  }

  const products: CatalogProduct[] = (productRows ?? []).map((product) => {
    const productSubscriptions = subscriptionsByProduct.get(product.slug) ?? [];
    const subscriptionsWithAccess = productSubscriptions.filter((subscription) =>
      PRODUCT_ACCESS_STATUSES.has(subscription.status)
    );
    return {
      ...product,
      modules: (modulesByProduct.get(product.slug) ?? []).map((module) =>
        module.replace(`${product.name}:`, "").replace(/^Think Service & Repairs:/, "")
      ),
      organizations: Array.from(new Set(subscriptionsWithAccess.map((subscription) =>
        organizationNameById.get(subscription.organization_id) ?? subscription.organization_id
      ))).sort((left, right) => left.localeCompare(right)),
    };
  });
  const canManage = platformRoleCan(admin.role, "manage_platform");
  const summary = {
    totalProducts: products.length,
    activeOrganizations: activeOrganizations ?? 0,
    totalSubscriptions: subscriptions.length,
    activeSubscriptions: subscriptions.filter((subscription) => subscription.status === "active").length,
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4">
          <Link href="/platform-admin" className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-white">
              <ShieldCheck aria-hidden="true" className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold uppercase tracking-wide text-blue-700">Think Digital Solutions</span>
              <span className="block truncate text-sm font-bold text-slate-950">Platform Administration</span>
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            <PlatformNotificationBell initialNotifications={notifications ?? []} />
            <div className="hidden text-right sm:block">
              <p className="max-w-40 truncate text-sm font-semibold text-slate-900">{admin.display_name}</p>
              <p className="text-xs capitalize text-slate-500">{admin.role.replaceAll("_", " ")}</p>
            </div>
            <PlatformAdminSignOutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:py-8">
        <nav aria-label="Breadcrumb" className="text-sm">
          <Link href="/platform-admin" className="font-medium text-blue-700 hover:text-blue-900">Platform Admin</Link>
          <span className="mx-2 text-slate-400" aria-hidden="true">/</span>
          <span className="text-slate-600">Product Catalog</span>
        </nav>

        <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-700 sm:flex">
              <Box aria-hidden="true" className="h-7 w-7" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Product Catalog</h1>
              <p className="mt-1 text-sm text-slate-600">
                Manage all software products available on the Think Digital Solutions platform.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <button
              type="button"
              disabled
              title="Adding a product requires application and entitlement integration."
              className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl border border-violet-300 bg-white px-4 py-2.5 text-sm font-semibold text-violet-700 opacity-70"
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              Add product
            </button>
            <p className="max-w-xs text-left text-xs text-slate-500 sm:text-right">
              New products require application integration and entitlement mappings.
            </p>
          </div>
        </section>

        <aside className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3.5 text-sm text-blue-950">
          <Info aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
          <p>
            Products are managed centrally and published products may be requested during organization registration.
            Publishing does not activate subscriptions or grant organization access; unpublishing does not revoke existing access.
          </p>
        </aside>

        <ProductCatalogDashboard products={products} summary={summary} canManage={canManage} />

        <section aria-labelledby="entitlement-events-heading" className="space-y-4 border-t border-slate-200 pt-6">
          <div>
            <h2 id="entitlement-events-heading" className="text-xl font-bold text-slate-950">Entitlement synchronization</h2>
            <p className="mt-1 text-sm text-slate-600">
              Pending projection events waiting to synchronize to the application database, including recent failures. Showing up to 50 events.
            </p>
          </div>
          {pendingEntitlementEvents?.length ? pendingEntitlementEvents.map((event) => (
            <article key={event.id} className="space-y-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{event.product_slug} · version {event.version}</h3>
                  <p className="text-xs text-slate-500">
                    Organization {event.organization_id} · {event.attempts} attempt(s) · next attempt {new Date(event.next_attempt_at).toLocaleString()}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${event.last_error ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}>
                  {event.last_error ? "Failed" : "Waiting"}
                </span>
              </div>
              {event.last_error && (
                <p className="break-words rounded-lg bg-red-50 p-3 text-sm text-red-800">{event.last_error}</p>
              )}
              {canManage && event.last_error && (
                <form action={retryProductEntitlementEvent}>
                  <input type="hidden" name="eventId" value={event.id} />
                  <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
                    Retry now
                  </button>
                </form>
              )}
            </article>
          )) : (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
              No pending entitlement events.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
