import Link from "next/link";
import { redirect } from "next/navigation";
import { canAccessLocation } from "@/lib/organizations/location-access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getEnabledOrganizationModules } from "@/lib/supabase/platform-admin";
import { formatMoney } from "@/lib/currency";
import type { Json } from "@/types/database";

type Summary = {
  order_count: number;
  completed_count: number;
  cancelled_count: number;
  gross_sales: number;
  collected_payments: number;
  average_order: number;
};

function isSummary(value: Json): value is Json & { summary: Summary } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const summary = value.summary;
  if (typeof summary !== "object" || summary === null || Array.isArray(summary)) return false;
  return ["order_count", "completed_count", "cancelled_count", "gross_sales", "collected_payments", "average_order"]
    .every((key) => typeof summary[key] === "number");
}

function money(value: number, currency: string) {
  return formatMoney(value, currency);
}

export default async function RestaurantDashboardPage() {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!(await getEnabledOrganizationModules(context.orgId)).includes("Restaurant")) {
    redirect("/dashboard?moduleDisabled=Restaurant");
  }
  if (!(await canTabPermission("restaurant", "operations", "reports", "view"))) {
    redirect("/dashboard?accessDenied=restaurant.operations");
  }
  const supabase = await createClient();
  const { data: locationRows, error: locationsError } = await supabase.from("business_locations")
    .select("id, name").eq("org_id", context.orgId).eq("is_active", true).order("name");
  if (locationsError) throw new Error(`Could not load Restaurant branches: ${locationsError.message}`);
  const locations = (locationRows ?? []).filter((location) => canAccessLocation(context, location.id));
  const locationIds = locations.map((location) => location.id);
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 29);
  const admin = createAdminClient();
  const [
    { data: reportResult, error: reportError },
    { data: marginRows, error: marginError },
    { data: activeOrders, error: ordersError },
    { count: activeMenuCount, error: menuError },
    { data: packagedItems, error: packagedItemsError },
    { data: packagedStock, error: packagedStockError },
    { data: ingredientStock, error: ingredientStockError },
  ] = await Promise.all([
    admin.rpc("get_restaurant_report", {
      p_org_id: context.orgId,
      p_location_ids: locationIds,
      p_start_at: start.toISOString(),
      p_end_at: end.toISOString(),
    }),
    admin.rpc("get_restaurant_item_margins", {
      p_org_id: context.orgId,
      p_location_ids: locationIds,
      p_start_at: start.toISOString(),
      p_end_at: end.toISOString(),
    }),
    locationIds.length
      ? supabase.from("restaurant_orders").select("id, order_number, status, order_type, created_at, location_id")
        .eq("org_id", context.orgId).in("location_id", locationIds)
        .in("status", ["pending_payment", "new", "confirmed", "preparing", "ready", "served"])
        .order("created_at", { ascending: false }).limit(12)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("restaurant_menu_items").select("id", { count: "exact", head: true })
      .eq("org_id", context.orgId).eq("is_active", true),
    supabase.from("restaurant_menu_items").select("id, name").eq("org_id", context.orgId)
      .eq("is_active", true).eq("item_type", "packaged"),
    locationIds.length
      ? supabase.from("restaurant_packaged_item_stock").select("location_id, menu_item_id, quantity, minimum_quantity")
        .eq("org_id", context.orgId).in("location_id", locationIds)
      : Promise.resolve({ data: [], error: null }),
    locationIds.length
      ? supabase.from("restaurant_ingredient_stock").select("location_id, ingredient_id, quantity, minimum_quantity")
        .eq("org_id", context.orgId).in("location_id", locationIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const queryError = reportError ?? marginError ?? ordersError ?? menuError ?? packagedItemsError ?? packagedStockError ?? ingredientStockError;
  if (queryError) throw new Error(`Could not load Restaurant dashboard: ${queryError.message}`);
  if (!isSummary(reportResult)) throw new Error("The Restaurant dashboard report returned invalid data.");

  const packagedLowStock = locations.flatMap((location) => (packagedItems ?? []).flatMap((item) => {
    const stock = packagedStock?.find((entry) => entry.location_id === location.id && entry.menu_item_id === item.id);
    const quantity = Number(stock?.quantity ?? 0);
    const minimum = Number(stock?.minimum_quantity ?? 0);
    return quantity <= minimum ? [{ location, item, quantity, minimum }] : [];
  }));
  const ingredientLowStock = (ingredientStock ?? []).filter((stock) => Number(stock.quantity) <= Number(stock.minimum_quantity)).length;
  const summary = reportResult.summary;
  const cards = [
    { label: "Sales (last 30 days)", value: money(summary.gross_sales, context.currency) },
    { label: "Payments collected", value: money(summary.collected_payments, context.currency) },
    { label: "Orders (last 30 days)", value: String(summary.order_count) },
    { label: "Average order", value: money(summary.average_order, context.currency) },
    { label: "Active menu items", value: String(activeMenuCount ?? 0) },
    { label: "Open orders", value: String(activeOrders?.length ?? 0) },
  ];

  return <main className="restaurant-management-page mx-auto max-w-[1500px] space-y-6 p-4 md:p-6">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">Restaurant operations</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">Restaurant Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">Sales, service activity, and stock health across your accessible branches.</p>
      </div>
      <nav aria-label="Restaurant dashboard actions" className="flex flex-wrap gap-2">
        <Link href="/restaurant/pos" className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white">Open POS</Link>
        <Link href="/restaurant/close-day" className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold">Close of day</Link>
        <Link href="/restaurant?view=reports" className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold">Restaurant reports</Link>
        <Link href="/restaurant/packaged-items" className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold">Packaged stock</Link>
      </nav>
    </header>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => <article key={card.label} className="rounded-xl border bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-500">{card.label}</p><p className="mt-2 text-2xl font-bold text-slate-950">{card.value}</p>
      </article>)}
    </section>
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
      <div className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold text-slate-950">Orders needing attention</h2><Link href="/restaurant" className="text-sm font-semibold text-orange-700">View all</Link></div>
        {(activeOrders ?? []).length === 0 ? <p className="rounded-xl border bg-white p-5 text-sm text-slate-600">No active orders right now.</p> : <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Order</th><th className="p-3">Branch</th><th className="p-3">Type</th><th className="p-3">Status</th><th className="p-3">Started</th></tr></thead>
            <tbody className="divide-y">{(activeOrders ?? []).map((order) => <tr key={order.id}>
              <td className="p-3"><Link href="/restaurant" className="font-semibold text-orange-700">#{order.order_number}</Link></td>
              <td className="p-3">{locations.find((location) => location.id === order.location_id)?.name ?? "Branch"}</td>
              <td className="p-3">{order.order_type.replace("_", " ")}</td>
              <td className="p-3 capitalize">{order.status.replace("_", " ")}</td>
              <td className="p-3">{new Date(order.created_at).toLocaleString()}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </div>
      <aside className="space-y-3">
        <h2 className="text-lg font-bold text-slate-950">Stock alerts</h2>
        <article className="rounded-xl border bg-white p-4">
          <p className="text-sm text-slate-500">Packaged items at or below minimum stock</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">{packagedLowStock.length}</p>
          {packagedLowStock.length > 0 && <ul className="mt-3 divide-y">
            {packagedLowStock.slice(0, 5).map(({ location, item, quantity, minimum }) => <li key={`${location.id}:${item.id}`} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0"><strong className="block truncate">{item.name}</strong><span className="text-xs text-slate-500">{location.name}</span></span>
              <span className="shrink-0 text-right text-xs font-semibold text-amber-700">{quantity} / {minimum} min</span>
            </li>)}
          </ul>}
          <Link href="/restaurant/packaged-items" className="mt-3 inline-block text-sm font-semibold text-orange-700">Review stock and reorder</Link>
        </article>
        <article className="rounded-xl border bg-white p-4">
          <p className="text-sm text-slate-500">Ingredients at or below minimum</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">{ingredientLowStock}</p>
          <Link href="/restaurant?view=ingredients" className="mt-3 inline-block text-sm font-semibold text-orange-700">Manage ingredients</Link>
        </article>
        <article className="rounded-xl border bg-orange-50 p-4 text-sm text-orange-950">
          <strong>Dedicated Restaurant workspace</strong>
          <p className="mt-1">Restaurant sales remain separate from ERP sales and inventory. Financial postings continue to follow the configured accounting mappings.</p>
        </article>
      </aside>
    </section>
    <section className="space-y-3">
      <div><h2 className="text-lg font-bold text-slate-950">Menu item margin · last 30 days</h2><p className="text-xs text-slate-500">Estimates use received packaged purchase costs and current recipe ingredient costs. Review cost setup before using this for accounting decisions.</p></div>
      {(marginRows ?? []).length === 0 ? <p className="rounded-xl border bg-white p-4 text-sm text-slate-600">No Restaurant item sales in this period.</p> : <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Item</th><th className="p-3">Type</th><th className="p-3 text-right">Qty</th><th className="p-3 text-right">Sales</th><th className="p-3 text-right">Est. cost</th><th className="p-3 text-right">Gross profit</th><th className="p-3 text-right">Margin</th></tr></thead>
          <tbody className="divide-y">{(marginRows ?? []).map((row) => <tr key={row.menu_item_id ?? row.item_name}>
            <td className="p-3 font-medium">{row.item_name}</td><td className="p-3 capitalize">{row.item_type ?? "unknown"}</td>
            <td className="p-3 text-right">{Number(row.quantity_sold)}</td><td className="p-3 text-right">{money(Number(row.sales), context.currency)}</td>
            <td className="p-3 text-right">{money(Number(row.estimated_cost), context.currency)}</td>
            <td className="p-3 text-right font-semibold">{money(Number(row.gross_profit), context.currency)}</td><td className="p-3 text-right">{Number(row.margin_percent).toFixed(1)}%</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </main>;
}
