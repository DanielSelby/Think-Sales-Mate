import { cookies } from "next/headers";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { CrmWorkspace, type CrmCustomer, type CrmInvoice, type CrmSale } from "@/components/crm/crm-workspace";

export default async function CrmPage() {
  const activeOrgId = await (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();
  const [{ data: rows }, { data: sales }, { data: invoices }] = await Promise.all([
    supabase.from("customers").select("id, name, email, phone, company, created_at").eq("org_id", context.orgId).order("name"),
    supabase.from("sales").select("customer_name, total, created_at, status").eq("org_id", context.orgId).order("created_at", { ascending: false }),
    supabase.from("invoices").select("customer_name, amount, status, created_at").eq("org_id", context.orgId).order("created_at", { ascending: false })
  ]);
  const rawSales = (sales ?? []) as CrmSale[];
  const rawInvoices = (invoices ?? []) as CrmInvoice[];
  const customers: CrmCustomer[] = (rows ?? []).map((c) => {
    const customerSales = rawSales.filter((sale) => sale.customer_name?.toLowerCase() === c.name.toLowerCase());
    const customerInvoices = rawInvoices.filter((invoice) => invoice.customer_name.toLowerCase() === c.name.toLowerCase());
    return {
      id: c.id, name: c.name, email: c.email, phone: c.phone, company: c.company,
      branch: null, orders: customerSales.length, sales: customerSales.reduce((sum, sale) => sum + Number(sale.total ?? 0), 0),
      outstanding: customerInvoices.filter((invoice) => ["sent", "overdue"].includes(invoice.status)).reduce((sum, invoice) => sum + Number(invoice.amount ?? 0), 0),
      lastActivity: customerSales[0]?.created_at ?? c.created_at
    };
  });

  const canManage = can(context.role, "crm.manage");

  return (
    <div className="mx-auto max-w-[1600px]"><CrmWorkspace customers={customers} sales={rawSales} invoices={rawInvoices} canManage={canManage} currency={context.currency} /></div>
  );
}