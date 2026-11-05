"use server";

import { revalidatePath } from "next/cache";
import { hashServiceRepairPortalToken } from "@/lib/service-center/portal";
import { createAdminClient } from "@/lib/supabase/admin";

export type ServiceRepairPortalActionState = {
  status: "idle" | "success" | "error";
  decision?: "approved" | "rejected";
  message?: string;
};

export async function respondToServiceRepairPortal(
  _previousState: ServiceRepairPortalActionState,
  formData: FormData,
): Promise<ServiceRepairPortalActionState> {
  const token = formData.get("token");
  const decision = formData.get("decision");
  const noteValue = formData.get("note");
  const note = typeof noteValue === "string" ? noteValue.trim() : "";
  const tokenHash = typeof token === "string" ? hashServiceRepairPortalToken(token) : null;

  if (!tokenHash) {
    return { status: "error", message: "This repair link is invalid or has expired." };
  }
  if (decision !== "approved" && decision !== "rejected") {
    return { status: "error", message: "Choose whether to approve or decline this estimate." };
  }
  if (note.length > 500) {
    return { status: "error", message: "Your note cannot exceed 500 characters." };
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("respond_to_service_repair_portal", {
    p_token_hash: tokenHash,
    p_decision: decision,
    p_note: note || null,
  });
  if (error) {
    console.error("[service-repair-portal] Customer response could not be saved:", error.message);
    return {
      status: "error",
      message: "Your response could not be saved. The link may have expired or the estimate may have changed; please contact the service center.",
    };
  }

  revalidatePath("/service-center");
  return {
    status: "success",
    decision,
    message: decision === "approved"
      ? "Your approval has been recorded. The service center can now see your response."
      : "Your decision has been recorded. The service center can now see your response.",
  };
}
