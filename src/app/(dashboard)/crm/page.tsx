import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { isTabVisible, loadPermissionMatrix } from "@/lib/rbac/permissions";
import { getCustomerOutstandingBalances } from "@/lib/sales/customer-outstanding";
import { CrmWorkspace, type CrmCustomer, type CrmInvoice, type CrmSale } from "@/components/crm/crm-workspace";

export default async function CrmPage() {
  const activeOrgId = await (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();
  const permissionMatrix = await loadPermissionMatrix(context.orgId, context.role, context.accessPermissions);
  const visibleCrmTabs = context.role === "owner"
    ? ["customers", "leads", "activities", "reports"]
    : ["customers", "leads", "activities", "reports"].filter((tab) =>
        isTabVisible(permissionMatrix, "crm", "crm", tab)
      );
  if (visibleCrmTabs.length === 0) {
    return <div role="alert" className="rounded-xl border border-dashed border-ledger-200 bg-white p-8 text-center text-sm text-ledger-500 dark:border-slate-700 dark:bg-ink-900 dark:text-ledger-400">You don’t have access to CRM.</div>;
  }
  const [{ data: rows }, { data: sales }, { data: invoices }, balances] = await Promise.all([
    supabase.from("customers").select("id, name, email, phone, company, created_at").eq("org_id", context.orgId).order("name"),
    (() => { let q = supabase.from("sales").select("customer_id, customer_name, total, created_at, status, location_id").eq("org_id", context.orgId); return context.isBranchScoped ? q.in("location_id", context.allowedLocationIds).order("created_at", { ascending: false }) : q.order("created_at", { ascending: false }); })(),
    supabase.from("invoices").select("customer_name, amount, status, created_at").eq("org_id", context.orgId).order("created_at", { ascending: false }),
    getCustomerOutstandingBalances(
      supabase,
      context.orgId,
      context.isBranchScoped ? context.allowedLocationIds : undefined,
      undefined,
      false
    ),
  ]);
  const rawSales = (sales ?? []) as CrmSale[];
  // Invoices currently have no location_id column, so scoped users must not
  // receive organization-wide invoice totals.
  const rawInvoices = (context.isBranchScoped ? [] : invoices ?? []) as CrmInvoice[];
  const customers: CrmCustomer[] = (rows ?? []).map((c) => {
    const customerSales = rawSales.filter((sale) =>
      sale.customer_id
        ? sale.customer_id === c.id
        : sale.customer_name?.trim().toLocaleLowerCase() === c.name.trim().toLocaleLowerCase()
    );
    const outstanding = (balances.byCustomerId.get(c.id) ?? 0) +
      (balances.byCustomerName.get(c.name.trim().toLocaleLowerCase()) ?? 0);
    return {
      id: c.id, name: c.name, email: c.email, phone: c.phone, company: c.company,
      branch: null, orders: customerSales.length, sales: customerSales.reduce((sum, sale) => sum + Number(sale.total ?? 0), 0),
      outstanding,
      lastActivity: customerSales.reduce<string>((latest, sale) =>
        Date.parse(sale.created_at) > Date.parse(latest) ? sale.created_at : latest, c.created_at)
    };
  });

  const canManage = can(context.role, "crm.manage");

  return (
    <div className="mx-auto max-w-[1600px]"><CrmWorkspace customers={customers} sales={rawSales} invoices={rawInvoices} canManage={canManage} currency={context.currency} visibleTabs={visibleCrmTabs} /></div>
  );
}