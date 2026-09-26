import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { canPermission } from "@/lib/rbac/permissions";
import { ProductCategoriesManager, type ProductCategoryRow } from "@/components/inventory/product-categories-manager";

export const metadata = { title: "Product Categories · ThinkSales Pro" };

export default async function ProductCategoriesPage() {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;
  if (!await canPermission("product_categories", "view")) {
    return <div className="mx-auto max-w-2xl rounded-xl border border-dashed border-ledger-200 bg-white p-10 text-center dark:border-ledger-700 dark:bg-ink-900"><p className="text-sm text-ledger-500">You do not have permission to view product categories.</p></div>;
  }

  const supabase = await createClient();
  const [{ data: categories, error: categoryError }, { data: products, error: productError }, branchStockResult] = await Promise.all([
    supabase.from("product_categories").select("id, name, code, description, status, icon, color, parent_id, display_order, created_by, created_at").eq("org_id", context.orgId).order("display_order").order("name"),
    supabase.from("products").select("id, name, sku, category, product_category_id, stock_quantity, cost_price, location_id").eq("org_id", context.orgId).neq("status", "merged").order("name").limit(10000),
    context.isBranchScoped && context.allowedLocationIds.length
      ? supabase.from("product_stock_levels").select("product_id, location_id, quantity").eq("org_id", context.orgId).in("location_id", context.allowedLocationIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (categoryError) throw new Error(`Unable to load product categories: ${categoryError.message}`);
  if (productError) throw new Error(`Unable to load products: ${productError.message}`);
  if (branchStockResult.error) throw new Error(`Unable to load branch product stock: ${branchStockResult.error.message}`);

  const branchStockByProduct = new Map<string, number>();
  const branchProductIds = new Set<string>();
  if (context.isBranchScoped) {
    for (const level of branchStockResult.data ?? []) {
      branchProductIds.add(level.product_id);
      branchStockByProduct.set(level.product_id, (branchStockByProduct.get(level.product_id) ?? 0) + Number(level.quantity ?? 0));
    }
  }
  const visibleProducts = (products ?? [])
    .filter((product) => !context.isBranchScoped
      || branchProductIds.has(product.id)
      || (product.location_id !== null && context.allowedLocationIds.includes(product.location_id)))
    .map((product) => ({
      ...product,
      stock_quantity: context.isBranchScoped
        ? branchStockByProduct.get(product.id) ?? 0
        : product.stock_quantity,
    }));
  const productIds = visibleProducts.map((product: { id: string }) => product.id);
  const [{ data: sales, error: salesError }, { data: profiles, error: profilesError }] = await Promise.all([
    productIds.length
      ? supabase.from("sale_items").select("product_id, line_total, created_at, sales:sale_id(status, location_id, sale_date)").eq("org_id", context.orgId).in("product_id", productIds)
      : { data: [], error: null },
    supabase.from("profiles").select("id, full_name"),
  ]);
  if (salesError) throw new Error(`Unable to load category sales statistics: ${salesError.message}`);
  if (profilesError) throw new Error(`Unable to load category creators: ${profilesError.message}`);

  const profileNames = new Map((profiles ?? []).map((profile: { id: string; full_name: string | null }) => [profile.id, profile.full_name ?? "Unknown"]));
  const categoryById = new Map((categories ?? []).map((category: { id: string; name: string }) => [category.id, category.name]));
  const productsByCategory = new Map<string, typeof visibleProducts>();
  for (const product of visibleProducts) {
    const categoryId = product.product_category_id
      ?? (categories ?? []).find((category: { name: string }) => category.name.toLowerCase() === String(product.category ?? "").trim().toLowerCase())?.id;
    if (!categoryId) continue;
    const assigned = productsByCategory.get(categoryId) ?? [];
    assigned.push(product);
    productsByCategory.set(categoryId, assigned);
  }

  const salesByProduct = new Map<string, { value: number; lastSale: string | null }>();
  for (const row of sales ?? []) {
    const sale = Array.isArray(row.sales) ? row.sales[0] : row.sales;
    if (!sale || sale.status === "cancelled") continue;
    if (context.isBranchScoped && !context.allowedLocationIds.includes(sale.location_id)) continue;
    const current = salesByProduct.get(row.product_id) ?? { value: 0, lastSale: null };
    current.value += Number(row.line_total ?? 0);
    const saleDate = sale.sale_date ?? row.created_at;
    if (!current.lastSale || saleDate > current.lastSale) current.lastSale = saleDate;
    salesByProduct.set(row.product_id, current);
  }

  const rows: ProductCategoryRow[] = (categories ?? []).map((category: {
    id: string; name: string; code: string; description: string | null; status: "active" | "inactive";
    icon: string | null; color: string | null; parent_id: string | null; display_order: number;
    created_by: string | null; created_at: string;
  }) => {
    const assigned = productsByCategory.get(category.id) ?? [];
    const salesStats = assigned.reduce((summary, product) => {
      const stats = salesByProduct.get(product.id);
      summary.salesValue += stats?.value ?? 0;
      if (stats?.lastSale && (!summary.lastSale || stats.lastSale > summary.lastSale)) summary.lastSale = stats.lastSale;
      return summary;
    }, { salesValue: 0, lastSale: null as string | null });
    return {
      id: category.id,
      name: category.name,
      code: category.code,
      description: category.description,
      status: category.status,
      icon: category.icon,
      color: category.color,
      parentId: category.parent_id,
      parentName: category.parent_id ? categoryById.get(category.parent_id) ?? null : null,
      displayOrder: category.display_order,
      createdBy: category.created_by,
      createdByName: category.created_by ? profileNames.get(category.created_by) ?? "—" : "—",
      createdAt: category.created_at,
      productCount: assigned.length,
      totalQuantity: assigned.reduce((sum, product) => sum + Number(product.stock_quantity ?? 0), 0),
      stockValue: assigned.reduce((sum, product) => sum + Number(product.stock_quantity ?? 0) * Number(product.cost_price ?? 0), 0),
      salesValue: salesStats.salesValue,
      lastSaleDate: salesStats.lastSale,
      products: assigned.map((product) => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        stock: Number(product.stock_quantity ?? 0),
        stockValue: Number(product.stock_quantity ?? 0) * Number(product.cost_price ?? 0),
      })),
    };
  });
  const totalAssigned = rows.reduce((sum, row) => sum + row.productCount, 0);
  const uncategorizedProducts = visibleProducts.filter((product: { product_category_id: string | null; category: string | null }) =>
    !product.product_category_id && !product.category?.trim(),
  ).length;

  return (
    <ProductCategoriesManager
      categories={rows}
      kpis={{
        total: rows.length,
        active: rows.filter((category) => category.status === "active").length,
        inactive: rows.filter((category) => category.status === "inactive").length,
        productsAssigned: totalAssigned,
        uncategorized: uncategorizedProducts,
      }}
      permissions={{
        create: !context.isBranchScoped && await canPermission("product_categories", "create"),
        edit: !context.isBranchScoped && await canPermission("product_categories", "edit"),
        delete: !context.isBranchScoped && await canPermission("product_categories", "delete"),
        import: !context.isBranchScoped && await canPermission("product_categories", "import"),
        export: !context.isBranchScoped && await canPermission("product_categories", "export"),
      }}
      currency={context.currency}
    />
  );
}
