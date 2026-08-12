import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { ProjectForm, type CustomerOption } from "@/components/projects/project-form";
import { updateProject } from "@/app/(dashboard)/projects/actions";

export default async function EditProjectPage({
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
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, customer_id, status, start_date, end_date, budget, description")
    .eq("id", params.id)
    .eq("org_id", context.orgId)
    .single();

  if (!project) notFound();

  const { data: rows } = await supabase.from("customers").select("id, name").eq("org_id", context.orgId).order("name");
  const customers: CustomerOption[] = rows ?? [];

  const boundUpdate = updateProject.bind(null, project.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/projects" className="inline-flex items-center gap-1 text-sm text-ledger-500 hover:text-ink-900 dark:hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to projects
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink-900 dark:text-white">Edit {project.name}</h1>
      </div>

      <ProjectForm
        action={boundUpdate}
        initialValues={project}
        customers={customers}
        error={searchParams.error}
        submitLabel="Save changes"
      />
    </div>
  );
}
