import { Suspense } from "react";
import { AccountingDashboard } from "@/components/accounting/accounting-dashboard";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import type { AccountsPayableItem } from "@/types/accounting";
import type { AccountsReceivableItem } from "@/types/accounting";

export const metadata = {
  title: "Accounting & Financial Management | ThinkSales Pro",
  description: "Enterprise double-entry accounting, General Ledger, Chart of Accounts, and Financial Reports.",
};

export default async function AccountingPage() {
  const context = await getCurrentOrgContext();
  let initialPayables: AccountsPayableItem[] = [];
  let initialBranches: string[] = [];
  let initialReceivables: AccountsReceivableItem[] = [];
  let initialAuditLogs: { userName: string; action: string; module: string; createdAt: string }[] = [];
  let initialPayments: { id: string; invoiceId: string; amount: number; paymentMethod: string; paymentDate: string; recordedBy: string }[] = [];
  if (context) {
    const db = await createClient();
    const { data: locations } = await db.from("business_locations").select("name").eq("org_id", context.orgId).eq("is_active", true).order("name");
    initialBranches = (locations ?? []).map((location) => location.name);
    const [{ data: auditLogs }, { data: payments }] = await Promise.all([
      db.from("audit_logs").select("actor_id, action, entity_type, created_at").eq("org_id", context.orgId).order("created_at", { ascending: false }).limit(100),
      db.from("customer_credit_payments").select("id, invoice_id, amount, payment_method, payment_date, recorded_by").eq("org_id", context.orgId).order("payment_date", { ascending: false }),
    ]);
    initialAuditLogs = (auditLogs ?? []).map((log) => ({ userName: log.actor_id ?? "—", action: log.action, module: log.entity_type, createdAt: log.created_at }));
    const recorderIds = [...new Set((payments ?? []).map((payment) => payment.recorded_by).filter(Boolean))];
    const { data: recorderProfiles } = recorderIds.length
      ? await db.from("profiles").select("id, full_name").in("id", recorderIds)
      : { data: [] };
    const recorderNames = new Map((recorderProfiles ?? []).map((profile) => [profile.id, profile.full_name]));
    initialPayments = (payments ?? []).map((payment) => ({
      id: payment.id,
      invoiceId: payment.invoice_id,
      amount: Number(payment.amount),
      paymentMethod: payment.payment_method,
      paymentDate: payment.payment_date,
      recordedBy: recorderNames.get(payment.recorded_by) ?? payment.recorded_by ?? "—",
    }));
    const { data: sales } = await db
      .from("sales")
      .select("id, sale_number, customer_id, customer_name, sale_date, total, amount_paid, location:business_locations(name)")
      .eq("org_id", context.orgId)
      .in("status", ["completed", "returned"])
      .order("sale_date", { ascending: false });
    const payableToday = new Date();
    const paymentsByInvoice = new Map<string, number>();
    for (const payment of payments ?? []) {
      paymentsByInvoice.set(payment.invoice_id, (paymentsByInvoice.get(payment.invoice_id) ?? 0) + Number(payment.amount ?? 0));
    }
    initialReceivables = (sales ?? []).map((sale) => {
      const issueDate = sale.sale_date;
      const dueDate = issueDate;
      const totalAmount = Number(sale.total ?? 0);
      const invoiceNumber = `SALE-${sale.sale_number}`;
      const paidAmount = Math.min(totalAmount, (sale.amount_paid == null ? 0 : Number(sale.amount_paid)) + (paymentsByInvoice.get(invoiceNumber) ?? 0));
      const outstandingAmount = Math.max(0, totalAmount - paidAmount);
      const daysOutstanding = Math.max(0, Math.floor((payableToday.getTime() - new Date(dueDate).getTime()) / 86400000));
      const status: AccountsReceivableItem["status"] = outstandingAmount === 0
        ? "paid"
        : daysOutstanding > 120 ? "120+"
          : daysOutstanding > 90 ? "61-90"
            : daysOutstanding > 60 ? "61-90"
              : daysOutstanding > 30 ? "31-60"
                : daysOutstanding > 0 ? "1-30" : "current";
      const location = Array.isArray(sale.location) ? sale.location[0] : sale.location;
      return {
        id: sale.id,
        customerId: sale.customer_id ?? undefined,
        customerName: sale.customer_name ?? "Walk-in Customer",
        invoiceNumber,
        issueDate,
        dueDate,
        totalAmount,
        paidAmount,
        outstandingAmount,
        daysOutstanding,
        status,
        branch: location?.name ?? "Unassigned",
      };
    });
    const { data } = await db
      .from("purchases")
      .select("id, purchase_number, purchase_date, invoice_number, total, paid_amount, expected_delivery_date, payment_method, location_id, supplier:suppliers(name), location:business_locations(name)")
      .eq("org_id", context.orgId)
      .neq("status", "cancelled")
      .order("purchase_date", { ascending: false });
    const today = new Date();
    initialPayables = (data ?? []).map((purchase) => {
      const dueDate = purchase.expected_delivery_date ?? purchase.purchase_date;
      const outstandingAmount = Math.max(0, Number(purchase.total ?? 0) - Number(purchase.paid_amount ?? 0));
      const daysOutstanding = Math.max(0, Math.floor((today.getTime() - new Date(dueDate).getTime()) / 86400000));
      const status: AccountsPayableItem["status"] = outstandingAmount === 0
        ? "paid"
        : daysOutstanding > 60
          ? "over-60"
          : daysOutstanding > 30
            ? "31-60"
            : daysOutstanding > 0
              ? "1-30"
              : "current";
      const supplier = Array.isArray(purchase.supplier) ? purchase.supplier[0] : purchase.supplier;
      const location = Array.isArray(purchase.location) ? purchase.location[0] : purchase.location;
      return {
        id: purchase.id,
        supplierName: supplier?.name ?? "Unknown supplier",
        billNumber: purchase.invoice_number ?? `PUR-${purchase.purchase_number}`,
        billDate: purchase.purchase_date,
        dueDate,
        totalAmount: Number(purchase.total ?? 0),
        paidAmount: Number(purchase.paid_amount ?? 0),
        outstandingAmount,
        daysOutstanding,
        status,
        branch: location?.name ?? "Unassigned",
        paymentMethod: purchase.payment_method ?? undefined,
      };
    });
  }
  return (
    <Suspense
      fallback={
        <div className="flex h-96 items-center justify-center">
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            <span>Loading ThinkSales Pro Accounting System...</span>
          </div>
        </div>
      }
    >
      <AccountingDashboard initialPayables={initialPayables} initialBranches={initialBranches} initialReceivables={initialReceivables} initialAuditLogs={initialAuditLogs} initialPayments={initialPayments} />
    </Suspense>
  );
}