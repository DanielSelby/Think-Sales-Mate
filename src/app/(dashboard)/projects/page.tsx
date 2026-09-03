import Link from "next/link";
import { cookies } from "next/headers";
import { Plus } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { ProjectsTable, type ProjectRow } from "@/components/projects/projects-table";

export default async function ProjectsPage() {
  const activeOrgId = await (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("projects")
    .select("id, name, status, budget, end_date, customers(name)")
    .eq("org_id", context.orgId)
    .order("created_at", { ascending: false });

  const projects: ProjectRow[] = (rows ?? []).map((p) => {
    const customer = Array.isArray(p.customers) ? p.customers[0] : p.customers;
    return {
      id: p.id,
      name: p.name,
      customerName: customer?.name ?? null,
      status: p.status,
      budget: p.budget,
      endDate: p.end_date
    };
  });

  const canManage = can(context.role, "projects.manage");
  const canCreate = can(context.role, "projects.create");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">Projects</h1>
          <p className="text-sm text-ledger-500 dark:text-ledger-400">
            {projects.length} project{projects.length === 1 ? "" : "s"} for {context.orgName}.
          </p>
        </div>
        {canCreate && (
          <Link href="/projects/new">
            <Button>
              <Plus className="h-4 w-4" />
              Add project
            </Button>
          </Link>
        )}
      </div>

      <ProjectsTable projects={projects} canManage={canManage} currency={context.currency} />
    </div>
  );
}