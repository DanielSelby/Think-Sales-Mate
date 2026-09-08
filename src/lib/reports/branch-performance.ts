import { createClient } from "@/lib/supabase/server";

export type BranchMetric = {
  id: string;
  name: string;
  city: string | null;
  sales: number;
  grossProfit: number;
  stockValue: number;
  orders: number;
  customers: number;
  margin: number;
  change: number;
  trend: number[];
};

function change(current: number, previous: number) {
  return previous ? Math.round(((current - previous) / previous) * 1000) / 10 : current ? 100 : 0;
}

export async function getBranchPerformance(orgId: string, from: string, to: string) {
  const supabase = await createClient();
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T23:59:59`);
  const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
  const previousFrom = new Date(start.getTime() - days * 86400000).toISOString().slice(0, 10);
  const previousTo = new Date(start.getTime() - 86400000).toISOString().slice(0, 10);
  const [{ data: locations }, { data: sales }, { data: previousSales }, { data: stock }] = await Promise.all([
    supabase.from("business_locations").select("id, name, city").eq("org_id", orgId).eq("is_active", true).order("name"),
    supabase.from("sales").select("id, total, customer_id, customer_name, location_id, sale_date").eq("org_id", orgId).eq("status", "completed").gte("sale_date", from).lte("sale_date", to),
    supabase.from("sales").select("total, location_id").eq("org_id", orgId).eq("status", "completed").gte("sale_date", previousFrom).lte("sale_date", previousTo),
    supabase.from("product_stock_levels").select("location_id, quantity, products(unit_price, cost_price)").eq("org_id", orgId),
  ]);
  const saleIds = (sales ?? []).map((sale) => sale.id);
  const { data: saleItems } = saleIds.length
    ? await supabase.from("sale_items").select("sale_id, product_id, quantity").in("sale_id", saleIds)
    : { data: [] };
  const productIds = [...new Set((saleItems ?? []).map((item) => item.product_id))];
  const { data: products } = productIds.length
    ? await supabase.from("products").select("id, cost_price, unit_price").in("id", productIds)
    : { data: [] };
  const costByProduct = new Map((products ?? []).map((product) => [product.id, product.cost_price ?? product.unit_price * 0.6]));
  const rows = (locations ?? []).map((location) => {
    const branchSales = (sales ?? []).filter((sale) => sale.location_id === location.id);
    const branchPrevious = (previousSales ?? []).filter((sale) => sale.location_id === location.id).reduce((sum, sale) => sum + sale.total, 0);
    const ids = new Set(branchSales.map((sale) => sale.customer_id ?? sale.customer_name).filter(Boolean));
    const branchStock = (stock ?? []).filter((item) => item.location_id === location.id);
    const stockValue = branchStock.reduce((sum, item) => {
      const product = Array.isArray(item.products) ? item.products[0] : item.products;
      return sum + item.quantity * (product?.unit_price ?? 0);
    }, 0);
    const salesTotal = branchSales.reduce((sum, sale) => sum + sale.total, 0);
    const branchSaleIds = new Set(branchSales.map((sale) => sale.id));
    const cost = (saleItems ?? []).filter((item) => branchSaleIds.has(item.sale_id)).reduce((sum, item) => sum + item.quantity * (costByProduct.get(item.product_id) ?? 0), 0);
    const trend = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(start.getTime() + Math.floor((index * days) / 7) * 86400000).toISOString().slice(0, 10);
      return branchSales.filter((sale) => sale.sale_date.slice(0, 10) === day).reduce((sum, sale) => sum + sale.total, 0);
    });
    return {
      id: location.id, name: location.name, city: location.city, sales: salesTotal,
      grossProfit: salesTotal - cost, stockValue, orders: branchSales.length, customers: ids.size,
      margin: salesTotal ? Math.round(((salesTotal - cost) / salesTotal) * 1000) / 10 : 0,
      change: change(salesTotal, branchPrevious), trend,
    };
  });
  return { rows, from, to };
}
