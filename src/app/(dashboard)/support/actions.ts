"use server";

import { revalidatePath } from "next/cache";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createPlatformServiceClient } from "@/lib/supabase/platform-service";
import { getSlaHours, type SupportPriority } from "@/lib/support/constants";

export async function submitSupportComplaint(input: {
  category: string;
  subject: string;
  description: string;
  priority: SupportPriority;
}) {
  const context = await getCurrentOrgContext();
  if (!context) throw new Error("Your session has expired. Please sign in again.");
  if (!input.subject.trim() || !input.description.trim()) throw new Error("Subject and description are required.");

  const supabase = createPlatformServiceClient();
  const now = new Date();
  const sla = getSlaHours(input.priority);
  const { data, error } = await supabase
    .from("platform_complaints")
    .insert({
      organization_id: context.orgId,
      organization_name: context.orgName,
      submitted_by: context.userEmail,
      submitter_email: context.userEmail,
      category: input.category,
      subject: input.subject.trim(),
      description: input.description.trim(),
      priority: input.priority,
      status: "new",
      first_response_due: new Date(now.getTime() + sla.response * 60 * 60 * 1000).toISOString(),
      resolution_due: new Date(now.getTime() + sla.resolution * 60 * 60 * 1000).toISOString(),
    })
    .select("id, ticket_number")
    .single();
  if (error) throw new Error(error.message);

  await supabase.from("platform_complaint_messages").insert({
    complaint_id: data.id,
    author_name: context.userEmail,
    author_email: context.userEmail,
    body: input.description.trim(),
  });
  await supabase.from("platform_complaint_activity").insert({
    complaint_id: data.id,
    action: "Complaint Created",
    actor_name: context.userEmail,
    metadata: { category: input.category, priority: input.priority },
  });
  await supabase.from("platform_notifications").insert({
    severity: input.priority === "critical" ? "critical" : "info",
    title: `New complaint ${data.ticket_number}`,
    message: `${context.orgName} submitted a ${input.priority} priority ${input.category} request.`,
  });

  revalidatePath("/support");
  return data;
}
