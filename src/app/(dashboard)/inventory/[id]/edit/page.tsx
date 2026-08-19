import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { ProductForm } from "@/components/inventory/product-form";
import { updateProduct, getCategoryAndBrandOptions } from "@/app/(dashboard)/inventory/actions";

export default async function EditProductPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();
  const [{ data: product }, { data: locationRows }, { categories, brands }] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, sku, name, description, category, brand, supplier, barcode, hsn_code, location_id, unit, product_type, unit_price, cost_price, wholesale_price, mrp, tax_rate, warranty_months, expiry_date, stock_quantity, low_stock_threshold, track_inventory, allow_sale, allow_purchase, allow_negative_stock, has_variants, is_active, tags, image_urls"
      )
      .eq("id", id)
      .eq("org_id", context.orgId)
      .single(),
    supabase.from("business_locations").select("id, name").eq("org_id", context.orgId).eq("is_active", true).order("name"),
    getCategoryAndBrandOptions()
  ]);

  if (!product) notFound();

  const boundUpdate = updateProduct.bind(null, product.id);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link href="/inventory" className="inline-flex items-center gap-1 text-sm text-ledger-500 hover:text-ink-900 dark:hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to inventory
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink-900 dark:text-white">Edit {product.name}</h1>
      </div>

      <ProductForm
        action={boundUpdate}
        initialValues={product}
        locations={(locationRows ?? []).map((l) => ({ id: l.id, name: l.name }))}
        categories={categories}
        brands={brands}
        error={resolvedSearchParams.error}
        submitLabel="Save changes"
      />
    </div>
  );
}