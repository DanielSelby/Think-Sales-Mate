import { redirect } from "next/navigation";
import Link from "next/link";
import { getPlatformAdmin, platformRoleCan } from "@/lib/platform-auth";
import { platformRoleCanAccessPage } from "@/lib/platform-admin-pages";
import { createPlatformServerClient } from "@/lib/supabase/platform-server";
import { retryProductEntitlementEvent, updatePlatformProductCatalog } from "../actions";

export const dynamic = "force-dynamic";

export default async function PlatformProductCatalogPage() {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/platform-admin/login");
  if (!platformRoleCanAccessPage(admin.role, admin.page_permissions, "Feature Access")) redirect("/platform-admin");

  const supabase = await createPlatformServerClient();
  const [
    { data: products, error: productsError },
    { data: pendingEntitlementEvents, error: eventsError },
  ] = await Promise.all([
    supabase
      .from("platform_products")
      .select("slug, name, description, is_published")
      .order("name"),
    supabase
      .from("platform_entitlement_outbox")
      .select("id, organization_id, product_slug, version, attempts, next_attempt_at, last_error, created_at")
      .is("processed_at", null)
      .order("next_attempt_at", { ascending: true })
      .limit(50),
  ]);
  if (productsError) throw new Error(`Could not load product catalog: ${productsError.message}`);
  if (eventsError) throw new Error(`Could not load entitlement synchronization status: ${eventsError.message}`);
  const canManage = platformRoleCan(admin.role, "manage_platform");

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6 text-slate-900">
      <header>
        <Link href="/platform-admin" className="text-sm font-medium text-blue-700">← Platform Admin</Link>
        <h1 className="mt-3 text-2xl font-bold">Product catalog</h1>
        <p className="mt-1 text-sm text-slate-600">
          Published products are offered during organization registration and can be requested by existing owners.
          Unpublishing only removes the product from new requests; it does not cancel subscriptions or revoke current access.
          This screen manages the currently integrated products; adding a new product still requires application and entitlement mappings.
        </p>
      </header>

      <section className="space-y-4">
        {products.map((product) => (
          <form
            key={product.slug}
            action={updatePlatformProductCatalog}
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"
          >
            <input type="hidden" name="slug" value={product.slug} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">{product.name}</h2>
                <p className="text-xs text-slate-500">{product.slug}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${product.is_published ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>
                {product.is_published ? "Published" : "Unpublished"}
              </span>
            </div>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Display name</span>
              <input
                name="name"
                required
                maxLength={120}
                defaultValue={product.name}
                disabled={!canManage}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Description</span>
              <textarea
                name="description"
                maxLength={1000}
                rows={3}
                defaultValue={product.description}
                disabled={!canManage}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
              />
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <span>Registration availability</span>
              <select
                name="isPublished"
                defaultValue={String(product.is_published)}
                disabled={!canManage}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
              >
                <option value="true">Published</option>
                <option value="false">Unpublished</option>
              </select>
            </label>
            {canManage && (
              <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
                Save product
              </button>
            )}
          </form>
        ))}
        {!products.length && (
          <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">No products are configured.</p>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-bold">Entitlement synchronization</h2>
          <p className="mt-1 text-sm text-slate-600">
            Pending projection events waiting to synchronize to the application database, including recent failures.
            Showing up to 50 events.
          </p>
        </div>
        {pendingEntitlementEvents?.length ? pendingEntitlementEvents.map((event) => (
          <article key={event.id} className="space-y-2 rounded-xl border border-slate-200 bg-white p-5">
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
    </main>
  );
}
