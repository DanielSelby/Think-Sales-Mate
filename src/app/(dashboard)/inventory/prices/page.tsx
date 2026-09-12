import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { PriceManagementView, type PriceProduct } from "@/components/inventory/price-management-view";

export const metadata = { title: "Product Price Management · ThinkSales Pro" };

export default async function PriceManagementPage() {
  const context = await getCurrentOrgContext((await cookies()).get("active_org_id")?.value);
  if (!context) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("id, name, sku, barcode, category, brand, unit_price, cost_price, wholesale_price, vip_price, special_price, stock_quantity, image_urls, updated_at")
    .eq("org_id", context.orgId)
    .eq("is_active", true)
    .order("name");

  const products: PriceProduct[] = (data ?? []).map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    category: product.category,
    brand: product.brand,
    sellingPrice: Number(product.unit_price ?? 0),
    costPrice: Number(product.cost_price ?? 0),
    wholesalePrice: product.wholesale_price == null ? null : Number(product.wholesale_price),
    vipPrice: product.vip_price == null ? null : Number(product.vip_price),
    specialPrice: product.special_price == null ? null : Number(product.special_price),
    stockQuantity: Number(product.stock_quantity ?? 0),
    imageUrl: product.image_urls?.[0] ?? null,
    updatedAt: product.updated_at,
  }));

  return <PriceManagementView products={products} currency={context.currency} canManage={context.role === "owner" || context.role === "admin" || context.role === "manager"} />;
}
