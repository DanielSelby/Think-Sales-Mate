import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { FraudDetectionView, type FraudAlert, type FraudTrendPoint } from "@/components/fraud/fraud-detection-view";

function range(searchParams?: { from?: string; to?: string }) {
  const now = new Date();
  const from = searchParams?.from ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = searchParams?.to ?? now.toISOString().slice(0, 10);
  return { from, to };
}

export default async function FraudDetectionPage({ searchParams }: { searchParams?: { from?: string; to?: string } }) {
  const context = await getCurrentOrgContext((await cookies()).get("active_org_id")?.value);
  if (!context) redirect("/onboarding");
  if (!can(context.role, "reports.view")) redirect("/dashboard");
  const dates = range(searchParams);
  const supabase = await createClient();
  const [{ data: sales }, { data: purchases }, { data: adjustments }, { data: expenses }, { data: reviewed }] = await Promise.all([
    supabase.from("sales").select("id, sale_number, sale_date, total, discount_amount, customer_name, location_id").eq("org_id", context.orgId).gte("sale_date", dates.from).lte("sale_date", dates.to).order("sale_date", { ascending: false }).limit(1000),
    supabase.from("purchases").select("id, purchase_number, purchase_date, total, supplier_id, location_id").eq("org_id", context.orgId).gte("purchase_date", dates.from).lte("purchase_date", dates.to).order("purchase_date", { ascending: false }).limit(1000),
    supabase.from("stock_adjustments").select("id, adjustment_number, adjustment_date, reason, location_id").eq("org_id", context.orgId).gte("adjustment_date", dates.from).lte("adjustment_date", dates.to).order("adjustment_date", { ascending: false }).limit(1000),
    supabase.from("expenses").select("id, expense_number, expense_date, amount, category, location_id").eq("org_id", context.orgId).gte("expense_date", dates.from).lte("expense_date", dates.to).limit(1000),
    supabase.from("audit_logs").select("entity_id, action").eq("org_id", context.orgId).eq("entity_type", "fraud_alert").in("action", ["fraud_alert.reviewed", "fraud_alert.false_positive"]),
  ]);
  const [{ data: locations }, { data: suppliers }] = await Promise.all([
    supabase.from("business_locations").select("id, name").eq("org_id", context.orgId),
    supabase.from("suppliers").select("id, name").eq("org_id", context.orgId),
  ]);
  const locationById = new Map((locations ?? []).map((row) => [row.id, row.name]));
  const supplierById = new Map((suppliers ?? []).map((row) => [row.id, row.name]));
  const reviewedMap = new Map((reviewed ?? []).map((row) => [row.entity_id, row.action]));
  const alerts: FraudAlert[] = [];
  for (const sale of sales ?? []) {
    const discountRate = sale.total > 0 ? (sale.discount_amount / (sale.total + sale.discount_amount)) * 100 : 0;
    if (discountRate >= 30) alerts.push({ id: `sale-discount-${sale.id}`, type: "Sales", document: `INV-${String(sale.sale_number).padStart(6, "0")}`, description: `Unusual discount applied (${Math.round(discountRate)}%)`, entity: sale.customer_name ?? "Walk-in customer", date: sale.sale_date, amount: sale.total, risk: discountRate >= 50 ? "High" : "Medium", status: "Pending Review", href: `/sales/${sale.id}` });
    if (sale.total >= 10000) alerts.push({ id: `sale-value-${sale.id}`, type: "Sales", document: `INV-${String(sale.sale_number).padStart(6, "0")}`, description: "High value transaction", entity: sale.customer_name ?? "Walk-in customer", date: sale.sale_date, amount: sale.total, risk: "High", status: "Pending Review", href: `/sales/${sale.id}` });
  }
  for (const adjustment of adjustments ?? []) alerts.push({ id: `adjustment-${adjustment.id}`, type: "Inventory", document: `SA-${String(adjustment.adjustment_number).padStart(6, "0")}`, description: adjustment.reason || "Stock adjustment requires review", entity: locationById.get(adjustment.location_id ?? "") ?? "Unassigned location", date: adjustment.adjustment_date, amount: null, risk: "Medium", status: "Pending Review", href: "/inventory/history" });
  for (const expense of expenses ?? []) if (expense.amount >= 10000) alerts.push({ id: `expense-${expense.id}`, type: "Expense", document: `EXP-${String(expense.expense_number).padStart(6, "0")}`, description: `High value expense: ${expense.category}`, entity: locationById.get(expense.location_id ?? "") ?? "Unassigned location", date: expense.expense_date, amount: expense.amount, risk: "High", status: "Pending Review", href: `/expenses/${expense.id}` });
  const activeAlerts = alerts.map((alert) => ({ ...alert, status: reviewedMap.get(alert.id) === "fraud_alert.false_positive" ? "False Positive" : reviewedMap.has(alert.id) ? "Reviewed" : "Pending Review" as FraudAlert["status"] }));
  const trend = buildTrend(activeAlerts, dates.from, dates.to);
  const flaggedAmount = activeAlerts.reduce((sum, alert) => sum + (alert.amount ?? 0), 0);
  return <FraudDetectionView alerts={activeAlerts} trend={trend} currency={context.currency} dates={dates} flaggedAmount={flaggedAmount} canManage={can(context.role, "reports.view")} />;
}

function buildTrend(alerts: FraudAlert[], from: string, to: string): FraudTrendPoint[] {
  const start = new Date(from);
  const end = new Date(to);
  const points: FraudTrendPoint[] = [];
  for (const day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
    const key = day.toISOString().slice(0, 10);
    const suspicious = alerts.filter((alert) => alert.date.slice(0, 10) === key).length;
    points.push({ date: key, suspicious, normal: Math.max(0, 10 - suspicious) });
  }
  return points.slice(-31);
}
