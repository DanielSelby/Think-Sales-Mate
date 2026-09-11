import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { SalesForecastingView, type ForecastSale, type ForecastLocation, type ForecastProductSale } from "@/components/reports/sales-forecasting-view";

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default async function SalesForecastingPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; location?: string; horizon?: string };
}) {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const end = searchParams.to ? new Date(`${searchParams.to}T23:59:59`) : new Date();
  const start = searchParams.from ? new Date(`${searchParams.from}T00:00:00`) : new Date(end.getTime() - 90 * 86400000);
  const historyStart = new Date(Math.min(start.getTime(), end.getTime()) - 180 * 86400000);
  const selectedLocation = searchParams.location && searchParams.location !== "all" ? searchParams.location : null;
  const horizon = [7, 30, 60, 90].includes(Number(searchParams.horizon)) ? Number(searchParams.horizon) : 30;

  const supabase = await createClient();
  let salesQuery = supabase
    .from("sales")
    .select("id, sale_number, total, created_at, location_id, customer_name")
    .eq("org_id", context.orgId)
    .gte("created_at", `${dateOnly(historyStart)}T00:00:00`)
    .lte("created_at", `${dateOnly(end)}T23:59:59`)
    .order("created_at", { ascending: true });
  if (context.allowedLocationIds.length && context.branchScope !== "all") salesQuery = salesQuery.in("location_id", context.allowedLocationIds);
  if (selectedLocation) salesQuery = salesQuery.eq("location_id", selectedLocation);

  let locationsQuery = supabase.from("business_locations").select("id, name").eq("org_id", context.orgId).eq("is_active", true).order("name");
  if (context.allowedLocationIds.length && context.branchScope !== "all") locationsQuery = locationsQuery.in("id", context.allowedLocationIds);
  const [{ data: sales }, { data: locations }] = await Promise.all([salesQuery, locationsQuery]);
  const saleRows = (sales ?? []) as ForecastSale[];
  const saleIds = saleRows.map((sale) => sale.id);
  let productSales: ForecastProductSale[] = [];
  if (saleIds.length) {
    const { data: items } = await supabase
      .from("sale_items")
      .select("sale_id, product_id, quantity, line_total, products(name, sku)")
      .eq("org_id", context.orgId)
      .in("sale_id", saleIds);
    productSales = (items ?? []).map((item) => {
      const product = Array.isArray(item.products) ? item.products[0] : item.products;
      return {
        sale_id: item.sale_id,
        product_id: item.product_id,
        quantity: Number(item.quantity),
        line_total: Number(item.line_total),
        product_name: product?.name ?? "Unknown product",
        sku: product?.sku ?? "",
      };
    });
  }

  return (
    <SalesForecastingView
      currency={context.currency}
      sales={saleRows}
      productSales={productSales}
      locations={(locations ?? []) as ForecastLocation[]}
      filters={{ from: dateOnly(start), to: dateOnly(end), location: selectedLocation ?? "all", horizon }}
    />
  );
}
