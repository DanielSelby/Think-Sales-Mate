"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { getProductAppPath } from "@/lib/product-app-routes";

const eventInputSchema = z.object({
  branchId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(5000),
  audience: z.enum(["all", "guardians"]),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
}).strict();

function parseLocalDateTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function createEducationCommunicationEventDraft(formData: FormData) {
  const startsAt = String(formData.get("starts_at") ?? "");
  const endsAt = String(formData.get("ends_at") ?? "");
  const input = eventInputSchema.safeParse({
    branchId: String(formData.get("branch_id") ?? ""),
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    audience: String(formData.get("audience") ?? ""),
    startsAt,
    endsAt,
  });
  const parsedStart = parseLocalDateTime(startsAt);
  const parsedEnd = parseLocalDateTime(endsAt);
  const communicationPath = getProductAppPath("think-education", "/communication");
  if (!input.success || !parsedStart || !parsedEnd || parsedEnd < parsedStart) {
    redirect(`${communicationPath}?event=invalid`);
  }

  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");

  const supabase = await createClient();
  const { error } = await supabase.rpc("education_communication_create_event_draft", {
    p_org_id: context.orgId,
    p_branch_id: input.data.branchId,
    p_title: input.data.title,
    p_body: input.data.body,
    p_audience: input.data.audience,
    p_event_starts_at: parsedStart.toISOString(),
    p_event_ends_at: parsedEnd.toISOString(),
  });
  if (error) {
    if (error.code === "42501") redirect(`${communicationPath}?event=denied`);
    if (error.code === "22023") redirect(`${communicationPath}?event=invalid`);
    console.error("Could not create Think Education event draft:", error.message);
    redirect(`${communicationPath}?event=error`);
  }

  revalidatePath(communicationPath);
  revalidatePath("/education-portal");
  redirect(`${communicationPath}?event=created`);
}
