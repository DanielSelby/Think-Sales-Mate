import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { ProjectForm, type CustomerOption } from "@/components/projects/project-form";
import { createProject } from "@/app/(dashboard)/projects/actions";

export default async function NewProjectPage({ searchParams }: { searchParams: { error?: string } }) {
  const activeOrgId = cookies().get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = createClient();
  const { data: rows } = await supabase.from("customers").select("id, name").eq("org_id", context.orgId).order("name");
  const customers: CustomerOption[] = rows ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/projects" className="inline-flex items-center gap-1 text-sm text-ledger-500 hover:text-ink-900 dark:hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to projects
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink-900 dark:text-white">Add project</h1>
      </div>

      <ProjectForm action={createProject} customers={customers} error={searchParams.error} submitLabel="Add project" />
    </div>
  );
}