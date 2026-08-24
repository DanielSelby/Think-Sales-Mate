import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";

export default async function ProductHistoryRedirectPage() {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();

  // Find the first active product in the organization
  const { data: firstProduct } = await supabase
    .from("products")
    .select("id")
    .eq("org_id", context.orgId)
    .eq("is_active", true)
    .order("name")
    .limit(1)
    .maybeSingle();

  if (firstProduct) {
    redirect(`/inventory/${firstProduct.id}`);
  }

  // If no products exist yet, redirect to sample Samsung S23 demo view
  redirect("/inventory/samsung-s23-demo");
}
