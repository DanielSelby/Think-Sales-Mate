import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { ProductForm } from "@/components/inventory/product-form";
import { createProduct } from "@/app/(dashboard)/inventory/actions";

export default async function NewProductPage({ searchParams }: { searchParams: { error?: string } }) {
  const activeOrgId = await cookies().get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();
  const { data: locationRows } = await supabase
    .from("business_locations")
    .select("id, name")
    .eq("org_id", context.orgId)
    .eq("is_active", true)
    .order("name");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/inventory" className="inline-flex items-center gap-1 text-sm text-ledger-500 hover:text-ink-900 dark:hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to inventory
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink-900 dark:text-white">Add product</h1>
      </div>

      <ProductForm
        action={createProduct}
        locations={(locationRows ?? []).map((l) => ({ id: l.id, name: l.name }))}
        error={searchParams.error}
        submitLabel="Add product"
      />
    </div>
  );
}