"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import type { CustomerAccountRequirement } from "@/types/database";

export interface PortalSettings {
  isEnabled: boolean;
  accountRequirement: CustomerAccountRequirement;
  requireApprovalBeforeProcessing: boolean;
  allowCustomerSelectDelivery: boolean;
  allowOrderNotes: boolean;
  allowViewOrderStatus: boolean;
  allowCreateAccount: boolean;
  requireEmailVerification: boolean;
  showPricesToCustomers: boolean;
}

export async function getPortalSettings(): Promise<PortalSettings> {
  const context = await getCurrentOrgContext();
  const defaults: PortalSettings = {
    isEnabled: false,
    accountRequirement: "optional",
    requireApprovalBeforeProcessing: true,
    allowCustomerSelectDelivery: true,
    allowOrderNotes: true,
    allowViewOrderStatus: true,
    allowCreateAccount: true,
    requireEmailVerification: false,
    showPricesToCustomers: true,
  };
  if (!context) return defaults;

  const supabase = await createClient();
  const { data } = await supabase.from("customer_portal_settings").select("*").eq("org_id", context.orgId).maybeSingle();
  if (!data) return defaults;

  return {
    isEnabled: data.is_enabled,
    accountRequirement: data.account_requirement,
    requireApprovalBeforeProcessing: data.require_approval_before_processing,
    allowCustomerSelectDelivery: data.allow_customer_select_delivery,
    allowOrderNotes: data.allow_order_notes,
    allowViewOrderStatus: data.allow_view_order_status,
    allowCreateAccount: data.allow_create_account,
    requireEmailVerification: data.require_email_verification,
    showPricesToCustomers: data.show_prices_to_customers,
  };
}

export interface SimpleResult {
  ok: boolean;
  error?: string;
}

export async function updatePortalSettings(settings: PortalSettings): Promise<SimpleResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "No active organization." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { error } = await supabase.from("customer_portal_settings").upsert(
    {
      org_id: context.orgId,
      is_enabled: settings.isEnabled,
      account_requirement: settings.accountRequirement,
      require_approval_before_processing: settings.requireApprovalBeforeProcessing,
      allow_customer_select_delivery: settings.allowCustomerSelectDelivery,
      allow_order_notes: settings.allowOrderNotes,
      allow_view_order_status: settings.allowViewOrderStatus,
      allow_create_account: settings.allowCreateAccount,
      require_email_verification: settings.requireEmailVerification,
      show_prices_to_customers: settings.showPricesToCustomers,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id" }
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings/customer-ordering");
  return { ok: true };
}