import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { derivePaymentStatus } from "@/lib/sales/format";
import { SalesListView, type SaleListRow, type SalesKpis } from "@/components/sales/sales-list-view";

export const metadata = { title: "Sales · SalesMate ERP" };

export default async function SalesPage() {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null; // layout already redirects to /onboarding when there's no org

  const orgId = context.orgId;

  const supabase = await createClient();

  const [{ data: sales }, { data: locations }] = await Promise.all([
    supabase
      .from("sales")
      .select(`
        id, sale_number, customer_name, sale_date, total, amount_paid,
        payment_method, sold_by, status, refunded_amount,
        location:business_locations ( name ),
        items:sale_items ( quantity )
      `)
      .eq("org_id", orgId)
      .order("sale_date", { ascending: false }),
    supabase.from("business_locations").select("name").eq("org_id", orgId).eq("is_active", true),
  ]);

  const currency = context.currency;
  const rawSales = sales ?? [];

  // sold_by has no declared FK relationship on `sales`, so resolve staff
  // names with a separate lookup rather than assuming embedding works.
  const soldByIds = Array.from(new Set(rawSales.map((s) => s.sold_by).filter(Boolean)));
  const { data: staff } = soldByIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", soldByIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const staffNameById = new Map((staff ?? []).map((p) => [p.id, p.full_name ?? "Unknown"]));

  const rows: SaleListRow[] = rawSales.map((s) => ({
    id: s.id,
    saleNumber: s.sale_number,
    customerName: s.customer_name ?? "Walk-in Customer",
    saleDate: s.sale_date,
    locationName: (s.location as { name: string } | null)?.name ?? null,
    soldByName: staffNameById.get(s.sold_by) ?? "—",
    itemCount: (s.items as { quantity: number }[] | null)?.reduce((sum, i) => sum + i.quantity, 0) ?? 0,
    total: s.total,
    amountPaid: s.amount_paid ?? 0,
    paymentMethod: s.payment_method,
    paymentStatus: derivePaymentStatus(s.total, s.amount_paid),
    status: s.status,
    refundedAmount: s.refunded_amount ?? 0,
  }));

  const kpis: SalesKpis = {
    totalOrders: rows.length,
    totalRevenue: rows.reduce((sum, r) => sum + r.total, 0),
    outstandingBalance: rows.reduce((sum, r) => sum + Math.max(0, r.total - r.amountPaid), 0),
    fullyPaidOrders: rows.filter((r) => r.paymentStatus === "paid").length,
    partiallyPaidOrders: rows.filter((r) => r.paymentStatus === "partially_paid").length,
    averageOrderValue: rows.length ? rows.reduce((sum, r) => sum + r.total, 0) / rows.length : 0,
    completedOrders: rows.filter((r) => r.status === "completed").length,
    returnedAmount: rows.reduce((sum, r) => sum + r.refundedAmount, 0),
  };

  const locationNames = Array.from(new Set((locations ?? []).map((l) => l.name)));
  const salesRepNames = Array.from(new Set(rows.map((r) => r.soldByName).filter((n) => n !== "—")));

  return (
    <SalesListView
      sales={rows}
      kpis={kpis}
      currency={currency}
      locations={locationNames}
      salesReps={salesRepNames}
      orgName={context.orgName}
    />
  );
}