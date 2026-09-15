import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  const supabase = await createClient();
  const [{ data: products }, { data: customers }, { data: locations }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, sku, barcode, unit_price")
      .eq("org_id", context.orgId)
      .eq("is_active", true)
      .order("name")
      .limit(200),
    supabase
      .from("customers")
      .select("id, name, phone")
      .eq("org_id", context.orgId)
      .order("name")
      .limit(200),
    supabase
      .from("business_locations")
      .select("id, name")
      .eq("org_id", context.orgId)
      .eq("is_active", true)
      .order("name")
      .limit(100),
  ]);

  return NextResponse.json({
    products: products ?? [],
    customers: customers ?? [],
    locations: locations ?? [],
    fetchedAt: new Date().toISOString(),
  });
}
