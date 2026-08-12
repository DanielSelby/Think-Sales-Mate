"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";

function redirectWithError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function parseProjectForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const customerId = String(formData.get("customer_id") ?? "").trim();
  const status = String(formData.get("status") ?? "planning").trim() as
    | "planning"
    | "active"
    | "on_hold"
    | "completed"
    | "cancelled";
  const startDate = String(formData.get("start_date") ?? "").trim();
  const endDate = String(formData.get("end_date") ?? "").trim();
  const budgetRaw = String(formData.get("budget") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  return {
    name,
    customer_id: customerId || null,
    status,
    start_date: startDate || null,
    end_date: endDate || null,
    budget: budgetRaw ? Number(budgetRaw) : null,
    description: description || null
  };
}

export async function createProject(formData: FormData): Promise<void> {
  const context = await getCurrentOrgContext();
  if (!context) redirectWithError("/projects/new", "Your session expired — please sign in again.");
  if (!can(context.role, "projects.create")) {
    redirectWithError("/projects/new", "You don't have permission to add projects.");
  }

  const fields = parseProjectForm(formData);
  if (!fields.name) redirectWithError("/projects/new", "Name is required.");

  const supabase = await createClient();
  const { error } = await supabase.from("projects").insert({
    org_id: context.orgId,
    created_by: context.userId,
    ...fields
  });

  if (error) redirectWithError("/projects/new", error.message);

  revalidatePath("/projects");
  redirect("/projects");
}

export async function updateProject(projectId: string, formData: FormData): Promise<void> {
  const context = await getCurrentOrgContext();
  if (!context) redirectWithError(`/projects/${projectId}/edit`, "Your session expired — please sign in again.");
  if (!can(context.role, "projects.manage")) {
    redirectWithError(`/projects/${projectId}/edit`, "You don't have permission to edit projects.");
  }

  const fields = parseProjectForm(formData);
  if (!fields.name) redirectWithError(`/projects/${projectId}/edit`, "Name is required.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .eq("org_id", context.orgId);

  if (error) redirectWithError(`/projects/${projectId}/edit`, error.message);

  revalidatePath("/projects");
  redirect("/projects");
}

export async function deleteProject(projectId: string) {
  const context = await getCurrentOrgContext();
  if (!context || !can(context.role, "projects.manage")) {
    return { error: "You don't have permission to remove projects." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("projects").delete().eq("id", projectId).eq("org_id", context.orgId);
  if (error) return { error: error.message };

  revalidatePath("/projects");
  return { success: true };
}