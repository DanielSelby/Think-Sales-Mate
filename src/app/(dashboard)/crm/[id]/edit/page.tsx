import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { CustomerForm } from "@/components/crm/customer-form";
import { updateCustomer } from "@/app/(dashboard)/crm/actions";

export default async function EditCustomerPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("id, name, email, phone, company, notes")
    .eq("id", params.id)
    .eq("org_id", context.orgId)
    .single();

  if (!customer) notFound();

  const boundUpdate = updateCustomer.bind(null, customer.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/crm" className="inline-flex items-center gap-1 text-sm text-ledger-500 hover:text-ink-900 dark:hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to customers
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink-900 dark:text-white">Edit {customer.name}</h1>
      </div>

      <CustomerForm action={boundUpdate} initialValues={customer} error={searchParams.error} submitLabel="Save changes" />
    </div>
  );
}
