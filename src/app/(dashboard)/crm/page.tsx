import Link from "next/link";
import { cookies } from "next/headers";
import { Plus } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { CustomersTable, type CustomerRow } from "@/components/crm/customers-table";

export default async function CrmPage() {
  const activeOrgId = await cookies().get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("customers")
    .select("id, name, email, phone, company")
    .eq("org_id", context.orgId)
    .order("name");

  const customers: CustomerRow[] = (rows ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    company: c.company
  }));

  const canManage = can(context.role, "crm.manage");
  const canCreate = can(context.role, "crm.create");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">Customers</h1>
          <p className="text-sm text-ledger-500 dark:text-ledger-400">
            {customers.length} customer{customers.length === 1 ? "" : "s"} tracked for {context.orgName}.
          </p>
        </div>
        {canCreate && (
          <Link href="/crm/new">
            <Button>
              <Plus className="h-4 w-4" />
              Add customer
            </Button>
          </Link>
        )}
      </div>

      <CustomersTable customers={customers} canManage={canManage} />
    </div>
  );
}