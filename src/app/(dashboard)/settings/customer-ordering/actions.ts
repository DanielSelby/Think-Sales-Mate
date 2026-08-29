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
  allowCustomerLocationSelection: boolean;
  allowGuestOrders: boolean;
  requireCustomerAccount: boolean;
  autoReserveStockOnApproval: boolean;
  sendEmailNotifications: boolean;
  sendWhatsAppNotifications: boolean;
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
    allowCustomerLocationSelection: true,
    allowGuestOrders: true,
    requireCustomerAccount: false,
    autoReserveStockOnApproval: true,
    sendEmailNotifications: true,
    sendWhatsAppNotifications: false,
  };
  if (!context) return defaults;

  const supabase = await createClient();
  const { data } = await supabase.from("customer_portal_settings").select("*").eq("org_id", context.orgId).maybeSingle();
  if (!data) return defaults;

  return {
    isEnabled: data.is_enabled ?? defaults.isEnabled,
    accountRequirement: data.account_requirement ?? defaults.accountRequirement,
    requireApprovalBeforeProcessing: data.require_approval_before_processing ?? defaults.requireApprovalBeforeProcessing,
    allowCustomerSelectDelivery: data.allow_customer_select_delivery ?? defaults.allowCustomerSelectDelivery,
    allowOrderNotes: data.allow_order_notes ?? defaults.allowOrderNotes,
    allowViewOrderStatus: data.allow_view_order_status ?? defaults.allowViewOrderStatus,
    allowCreateAccount: data.allow_create_account ?? defaults.allowCreateAccount,
    requireEmailVerification: data.require_email_verification ?? defaults.requireEmailVerification,
    showPricesToCustomers: data.show_prices_to_customers ?? defaults.showPricesToCustomers,
    allowCustomerLocationSelection: data.allow_customer_location_selection ?? defaults.allowCustomerLocationSelection,
    allowGuestOrders: data.allow_guest_orders ?? defaults.allowGuestOrders,
    requireCustomerAccount: data.require_customer_account ?? defaults.requireCustomerAccount,
    autoReserveStockOnApproval: data.auto_reserve_stock_on_approval ?? defaults.autoReserveStockOnApproval,
    sendEmailNotifications: data.send_email_notifications ?? defaults.sendEmailNotifications,
    sendWhatsAppNotifications: data.send_whatsapp_notifications ?? defaults.sendWhatsAppNotifications,
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
      allow_customer_location_selection: settings.allowCustomerLocationSelection,
      allow_guest_orders: settings.allowGuestOrders,
      require_customer_account: settings.requireCustomerAccount,
      auto_reserve_stock_on_approval: settings.autoReserveStockOnApproval,
      send_email_notifications: settings.sendEmailNotifications,
      send_whatsapp_notifications: settings.sendWhatsAppNotifications,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id" }
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings/customer-ordering");
  revalidatePath("/orders");
  return { ok: true };
}