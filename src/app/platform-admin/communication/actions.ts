"use server";

import { revalidatePath } from "next/cache";
import { createPlatformServerClient } from "@/lib/supabase/platform-server";
import { getPlatformAdmin } from "@/lib/platform-auth";

async function authorized() {
  const admin = await getPlatformAdmin();
  if (!admin) throw new Error("Platform administrator access required.");
  return createPlatformServerClient();
}

export async function setOrganizationMessagingSuspended(organizationId: string, suspended: boolean) {
  const supabase = await authorized();
  const { error } = await (supabase.from("platform_communication_accounts") as any).upsert({
    organization_id: organizationId,
    messaging_suspended: suspended,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/platform-admin/communication");
}

export async function adjustCommunicationCredits(organizationId: string, amount: number, note: string) {
  if (!Number.isFinite(amount) || amount === 0) throw new Error("A non-zero credit adjustment is required.");
  const supabase = await authorized();
  const { data: account } = await (supabase.from("platform_communication_accounts") as any)
    .select("credit_balance").eq("organization_id", organizationId).maybeSingle();
  const nextBalance = Math.max(0, Number(account?.credit_balance ?? 0) + amount);
  const { error: accountError } = await (supabase.from("platform_communication_accounts") as any).upsert({
    organization_id: organizationId,
    credit_balance: nextBalance,
    messaging_suspended: nextBalance <= 0,
    updated_at: new Date().toISOString(),
  });
  if (accountError) throw new Error(accountError.message);
  const { error: transactionError } = await (supabase.from("platform_communication_credit_transactions") as any).insert({
    organization_id: organizationId,
    amount,
    transaction_type: amount > 0 ? "top_up" : "deduction",
    note,
  });
  if (transactionError) throw new Error(transactionError.message);
  revalidatePath("/platform-admin/communication");
}

export async function setCommunicationProviderEnabled(providerName: string, channel: "SMS" | "WhatsApp" | "Email", enabled: boolean) {
  const supabase = await authorized();
  const { error } = await (supabase.from("platform_communication_providers") as any).upsert({
    provider_name: providerName,
    channel,
    enabled,
    status: enabled ? "active" : "disabled",
    updated_at: new Date().toISOString(),
  }, { onConflict: "provider_name" });
  if (error) throw new Error(error.message);
  revalidatePath("/platform-admin/communication");
}

export async function updateCommunicationCampaignStatus(id: string, status: string) {
  const allowed = ["draft", "submitted", "approved", "scheduled", "running", "paused", "cancelled", "sent"];
  if (!allowed.includes(status)) throw new Error("Invalid campaign status.");
  const supabase = await authorized();
  const { error } = await (supabase.from("platform_communication_campaigns") as any)
    .update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/platform-admin/communication");
}
