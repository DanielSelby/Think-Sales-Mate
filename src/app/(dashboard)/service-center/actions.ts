"use server";

import { revalidatePath } from "next/cache";
import { canAccessLocation } from "@/lib/organizations/location-access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission } from "@/lib/rbac/permissions";
import { parseServiceJobParts } from "@/lib/service-center/part-validation";
import { parseServiceInvoiceDueDate } from "@/lib/service-center/invoice-validation";
import { parseServiceContact } from "@/lib/service-center/contact-validation";
import { parseServiceQuotationLines } from "@/lib/service-center/quotation-validation";
import { parseServiceAssetWarranty } from "@/lib/service-center/warranty-validation";
import { parseServiceIntake } from "@/lib/service-center/intake-validation";
import { buildServiceQuotationMessage } from "@/lib/service-center/quotation-message";
import {
  createServiceRepairPortalToken,
  getServiceRepairPortalBaseUrl,
  getServiceRepairPortalUrl,
} from "@/lib/service-center/portal";
import { deliverMessage, type DeliveryChannel } from "@/lib/communication/providers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ServiceAppointmentStatus, ServiceJobPriority, ServiceJobStatus } from "@/types/database";

export type ServiceActionResult = { ok: true; jobNumber?: string } | { ok: false; error: string };
export type ServiceRecordActionResult = { ok: true } | { ok: false; error: string };
export type ServiceQuotationActionResult = { ok: true; quotationId?: string } | { ok: false; error: string };
export type ServiceDeliveryActionResult =
  | { ok: true; provider: string; recipient: string }
  | { ok: false; error: string };
export type ServiceInvoiceActionResult =
  | { ok: true; invoiceNumber: number }
  | { ok: false; error: string };
const appointmentStatuses: ServiceAppointmentStatus[] = ["scheduled", "confirmed", "completed", "cancelled", "no_show"];
const quotationActions = ["sent", "approved", "rejected", "withdrawn"] as const;

const serviceStatuses: ServiceJobStatus[] = [
  "received",
  "inspection",
  "awaiting_quotation",
  "awaiting_customer_approval",
  "approved",
  "rejected",
  "in_progress",
  "awaiting_parts",
  "quality_check",
  "ready_for_collection",
  "awaiting_payment",
  "completed",
  "closed",
  "cancelled",
];

const servicePriorities: ServiceJobPriority[] = ["low", "normal", "high", "urgent"];

function isServiceStatus(value: string): value is ServiceJobStatus {
  return serviceStatuses.some((status) => status === value);
}

function isServicePriority(value: string): value is ServiceJobPriority {
  return servicePriorities.some((priority) => priority === value);
}

function isServiceAppointmentStatus(value: string): value is ServiceAppointmentStatus {
  return appointmentStatuses.some((status) => status === value);
}

function formText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function createServiceAsset(formData: FormData): Promise<ServiceRecordActionResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "Your session expired. Please sign in again." };
  if (!await canPermission("service_assets", "create")) {
    return { ok: false, error: "You do not have permission to register customer equipment." };
  }

  const locationId = formText(formData, "assetLocationId");
  const customerId = formText(formData, "assetCustomerId");
  const assetType = formText(formData, "assetType");
  const brand = formText(formData, "assetBrand");
  const model = formText(formData, "assetModel");
  const serialNumber = formText(formData, "assetSerialNumber");
  const condition = formText(formData, "assetCondition");
  const notes = formText(formData, "assetNotes");
  const warranty = parseServiceAssetWarranty({
    provider: formData.get("assetWarrantyProvider"),
    reference: formData.get("assetWarrantyReference"),
    startDate: formData.get("assetWarrantyStartDate"),
    endDate: formData.get("assetWarrantyEndDate"),
    terms: formData.get("assetWarrantyTerms"),
  });
  if (!warranty.ok) return warranty;
  if (!locationId || !canAccessLocation(context, locationId)) {
    return { ok: false, error: "You are not assigned to the selected branch." };
  }
  if (!customerId) return { ok: false, error: "Choose the equipment owner." };
  if (!assetType || assetType.length > 80) {
    return { ok: false, error: "Enter an equipment type (up to 80 characters)." };
  }
  if (brand.length > 100 || model.length > 100 || serialNumber.length > 120 || condition.length > 100 || notes.length > 2000) {
    return { ok: false, error: "One or more equipment details exceed the allowed length." };
  }

  const supabase = await createClient();
  const [{ data: location, error: locationError }, { data: customer, error: customerError }] = await Promise.all([
    supabase.from("business_locations").select("id").eq("org_id", context.orgId).eq("id", locationId).eq("is_active", true).maybeSingle(),
    supabase.from("customers").select("id").eq("org_id", context.orgId).eq("id", customerId).maybeSingle(),
  ]);
  if (locationError) return { ok: false, error: `Could not verify the selected branch: ${locationError.message}` };
  if (!location) return { ok: false, error: "The selected branch is unavailable." };
  if (customerError) return { ok: false, error: `Could not verify the selected customer: ${customerError.message}` };
  if (!customer) return { ok: false, error: "The selected customer is unavailable." };

  const { error } = await supabase.from("service_assets").insert({
    org_id: context.orgId,
    location_id: locationId,
    customer_id: customerId,
    asset_type: assetType,
    brand: brand || null,
    model: model || null,
    serial_number: serialNumber || null,
    condition: condition || null,
    notes: notes || null,
    ...warranty.warranty,
    created_by: context.userId,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "An equipment record with that serial number already exists at this branch." };
    return { ok: false, error: `Could not register the equipment: ${error.message}` };
  }

  revalidatePath("/service-center");
  return { ok: true };
}

export async function registerServiceTechnician(formData: FormData): Promise<ServiceRecordActionResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "Your session expired. Please sign in again." };
  if (!await canPermission("service_technicians", "create")) {
    return { ok: false, error: "You do not have permission to register service technicians." };
  }

  const locationId = formText(formData, "technicianLocationId");
  const userId = formText(formData, "technicianUserId");
  const skillsText = formText(formData, "technicianSkills");
  if (!locationId || !canAccessLocation(context, locationId)) {
    return { ok: false, error: "You are not assigned to the selected branch." };
  }
  if (!userId) {
    return { ok: false, error: "Choose an active organization member." };
  }
  const skills = Array.from(new Set(skillsText.split(",").map((skill) => skill.trim()).filter(Boolean)));
  if (skills.some((skill) => skill.length > 80) || skills.length > 20) {
    return { ok: false, error: "Enter no more than 20 skills, with up to 80 characters each." };
  }

  const supabase = await createClient();
  const { data: member, error: memberError } = await supabase
    .from("organization_members")
    .select("user_id, status, branch_scope, location_id, secondary_location_ids")
    .eq("org_id", context.orgId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (memberError) return { ok: false, error: `Could not verify the organization member: ${memberError.message}` };
  if (!member) return { ok: false, error: "The selected person is not an active member of this organization." };
  const memberHasBranch = member.branch_scope === "all"
    || member.location_id === locationId
    || (member.secondary_location_ids ?? []).includes(locationId);
  if (!memberHasBranch) return { ok: false, error: "The selected person is not assigned to this branch." };

  const { error } = await supabase.from("service_technicians").insert({
    org_id: context.orgId,
    location_id: locationId,
    user_id: userId,
    skills,
    created_by: context.userId,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "That person is already registered as a technician at this branch." };
    return { ok: false, error: `Could not register the technician: ${error.message}` };
  }

  revalidatePath("/service-center");
  return { ok: true };
}

export async function createServiceJob(formData: FormData): Promise<ServiceActionResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "Your session expired. Please sign in again." };
  if (!await canPermission("service_jobs", "create")) {
    return { ok: false, error: "You do not have permission to create service jobs." };
  }

  const locationId = formText(formData, "locationId");
  const customerId = formText(formData, "customerId");
  const assetId = formText(formData, "assetId");
  const technicianId = formText(formData, "technicianId");
  const originalJobId = formText(formData, "originalJobId");
  const reportedProblem = formText(formData, "reportedProblem");
  const priorityValue = formText(formData, "priority");
  const intake = parseServiceIntake({
    conditionOnArrival: formData.get("conditionOnArrival"),
    accessories: formData.get("intakeAccessories"),
    confirmedBy: formData.get("intakeConfirmedBy"),
    confirmedAs: formData.get("intakeConfirmedAs"),
    acknowledged: formData.get("intakeAcknowledged"),
  });
  if (!locationId || !canAccessLocation(context, locationId)) {
    return { ok: false, error: "You are not assigned to the selected branch." };
  }
  if (!customerId) return { ok: false, error: "Choose a customer for this job." };
  if (!reportedProblem || reportedProblem.length > 4000) {
    return { ok: false, error: "Describe the reported problem (up to 4,000 characters)." };
  }
  if (!isServicePriority(priorityValue)) {
    return { ok: false, error: "Choose a valid job priority." };
  }
  if (!intake.ok) return intake;

  const supabase = await createClient();
  const [{ data: location, error: locationError }, { data: customer, error: customerError }] = await Promise.all([
    supabase.from("business_locations").select("id").eq("org_id", context.orgId).eq("id", locationId).eq("is_active", true).maybeSingle(),
    supabase.from("customers").select("id").eq("org_id", context.orgId).eq("id", customerId).maybeSingle(),
  ]);
  if (locationError) return { ok: false, error: `Could not verify the selected branch: ${locationError.message}` };
  if (!location) return { ok: false, error: "The selected branch is unavailable." };
  if (customerError) return { ok: false, error: `Could not verify the selected customer: ${customerError.message}` };
  if (!customer) return { ok: false, error: "The selected customer is unavailable." };

  if (assetId) {
    const { data: asset, error: assetError } = await supabase.from("service_assets")
      .select("id")
      .eq("org_id", context.orgId)
      .eq("location_id", locationId)
      .eq("customer_id", customerId)
      .eq("id", assetId)
      .maybeSingle();
    if (assetError) return { ok: false, error: `Could not verify the selected equipment: ${assetError.message}` };
    if (!asset) return { ok: false, error: "The equipment must belong to this customer and branch." };
  }
  if (technicianId) {
    const { data: technician, error: technicianError } = await supabase.from("service_technicians")
      .select("id")
      .eq("org_id", context.orgId)
      .eq("location_id", locationId)
      .eq("id", technicianId)
      .eq("is_active", true)
      .maybeSingle();
    if (technicianError) return { ok: false, error: `Could not verify the selected technician: ${technicianError.message}` };
    if (!technician) return { ok: false, error: "The selected technician is not active at this branch." };
  }

  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const jobNumber = `SR-${datePart}-${crypto.randomUUID().toUpperCase()}`;
  if (originalJobId) {
    if (!assetId) {
      return { ok: false, error: "Select the original equipment before creating a warranty claim." };
    }
    const { error } = await supabase.rpc("create_service_job_warranty_claim", {
      p_org_id: context.orgId,
      p_location_id: locationId,
      p_customer_id: customerId,
      p_asset_id: assetId,
      p_original_job_id: originalJobId,
      p_job_number: jobNumber,
      p_priority: priorityValue,
      p_reported_problem: reportedProblem,
      p_technician_id: technicianId || null,
      p_condition_on_arrival: intake.intake.conditionOnArrival,
      p_accessories: intake.intake.accessories,
      p_intake_confirmed_by: intake.intake.confirmedBy,
      p_intake_confirmed_as: intake.intake.confirmedAs,
    });
    if (error) return { ok: false, error: `Could not create the warranty follow-up job: ${error.message}` };

    revalidatePath("/service-center");
    return { ok: true, jobNumber };
  }

  const { error } = await supabase.from("service_jobs").insert({
    org_id: context.orgId,
    location_id: locationId,
    job_number: jobNumber,
    customer_id: customerId,
    asset_id: assetId || null,
    technician_id: technicianId || null,
    status: "received",
    priority: priorityValue,
    reported_problem: reportedProblem,
    condition_on_arrival: intake.intake.conditionOnArrival,
    accessories: intake.intake.accessories,
    intake_confirmed_by: intake.intake.confirmedBy,
    intake_confirmed_as: intake.intake.confirmedAs,
    created_by: context.userId,
  });
  if (error) return { ok: false, error: `Could not create the service job: ${error.message}` };

  revalidatePath("/service-center");
  return { ok: true, jobNumber };
}

export async function decideServiceJobWarrantyClaim(formData: FormData): Promise<ServiceRecordActionResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "Your session expired. Please sign in again." };
  if (!await canPermission("service_jobs", "edit")) {
    return { ok: false, error: "You do not have permission to decide warranty claims." };
  }

  const claimId = formText(formData, "warrantyClaimId");
  const decision = formText(formData, "warrantyDecision");
  const note = formText(formData, "warrantyDecisionNote");
  if (!claimId) return { ok: false, error: "Choose the warranty claim to decide." };
  if (decision !== "covered" && decision !== "not_covered") {
    return { ok: false, error: "Choose whether the warranty claim is covered." };
  }
  if (!note || note.length > 1000) {
    return { ok: false, error: "Record the reason for the warranty decision (up to 1,000 characters)." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_service_job_warranty_claim", {
    p_claim_id: claimId,
    p_decision: decision,
    p_note: note,
  });
  if (error) return { ok: false, error: `Could not record warranty decision: ${error.message}` };

  revalidatePath("/service-center");
  return { ok: true };
}

export async function transitionServiceJob(formData: FormData): Promise<ServiceActionResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "Your session expired. Please sign in again." };
  if (!await canPermission("service_jobs", "edit")) {
    return { ok: false, error: "You do not have permission to update service jobs." };
  }

  const jobId = formText(formData, "jobId");
  const statusValue = formText(formData, "status");
  const note = formText(formData, "note");
  if (!jobId) return { ok: false, error: "Choose a service job." };
  if (!isServiceStatus(statusValue)) {
    return { ok: false, error: "Choose a valid job status." };
  }
  if (note.length > 2000) return { ok: false, error: "The status note cannot exceed 2,000 characters." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("transition_service_job", {
    p_job_id: jobId,
    p_new_status: statusValue,
    p_note: note || null,
  });
  if (error) return { ok: false, error: `Could not update the service job: ${error.message}` };

  revalidatePath("/service-center");
  return { ok: true };
}

export async function createServiceJobInvoice(formData: FormData): Promise<ServiceInvoiceActionResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "Your session expired. Please sign in again." };
  if (!await canPermission("service_jobs", "edit")) {
    return { ok: false, error: "You do not have permission to invoice repair jobs." };
  }

  const jobId = formText(formData, "serviceInvoiceJobId");
  if (!jobId) return { ok: false, error: "Choose the repair job to invoice." };
  const dueDate = parseServiceInvoiceDueDate(formData.get("serviceInvoiceDueDate"));
  if (!dueDate.ok) return dueDate;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_service_job_invoice", {
    p_job_id: jobId,
    p_due_date: dueDate.dueDate,
  });
  if (error) return { ok: false, error: `Could not create the repair invoice: ${error.message}` };
  const invoice = data?.[0];
  if (!invoice) return { ok: false, error: "The invoice was created but its number could not be retrieved. Refresh the service jobs and Accounts Receivable pages." };

  revalidatePath("/service-center");
  revalidatePath("/accounting/invoices");
  revalidatePath("/accounting");
  revalidatePath("/dashboard");
  return { ok: true, invoiceNumber: invoice.invoice_number };
}

export async function recordServiceJobHandover(formData: FormData): Promise<ServiceRecordActionResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "Your session expired. Please sign in again." };
  if (!await canPermission("service_jobs", "edit")) {
    return { ok: false, error: "You do not have permission to record equipment handover." };
  }

  const jobId = formText(formData, "handoverJobId");
  const recipientName = formText(formData, "handoverRecipientName");
  const recipientType = formText(formData, "handoverRecipientType");
  const condition = formText(formData, "handoverCondition");
  const accessoriesReturned = formText(formData, "handoverAccessories");
  const isCoveredWarranty = formData.get("handoverWarrantyCovered") === "yes";
  const customerAcknowledged = formData.get("handoverAcknowledged") === "on";
  if (!jobId) return { ok: false, error: "Choose the repair job for this handover." };
  if (recipientName.length < 1 || recipientName.length > 120) {
    return { ok: false, error: "Enter the recipient's name (up to 120 characters)." };
  }
  if (recipientType !== "customer" && recipientType !== "authorized_representative") {
    return { ok: false, error: "Select who collected the equipment." };
  }
  if (condition.length < 1 || condition.length > 1000) {
    return { ok: false, error: "Record the equipment condition at handover (up to 1,000 characters)." };
  }
  if (accessoriesReturned.length > 1000) {
    return { ok: false, error: "Returned accessories cannot exceed 1,000 characters." };
  }
  if (!customerAcknowledged) {
    return { ok: false, error: "Confirm that the recipient acknowledged receiving the equipment." };
  }

  const supabase = await createClient();
  const { error } = isCoveredWarranty
    ? await supabase.rpc("record_covered_service_job_handover", {
        p_job_id: jobId,
        p_recipient_name: recipientName,
        p_recipient_type: recipientType,
        p_condition_on_handover: condition,
        p_accessories_returned: accessoriesReturned || null,
        p_customer_acknowledged: customerAcknowledged,
      })
    : await supabase.rpc("record_service_job_handover", {
        p_job_id: jobId,
        p_recipient_name: recipientName,
        p_recipient_type: recipientType,
        p_condition_on_handover: condition,
        p_accessories_returned: accessoriesReturned || null,
        p_customer_acknowledged: customerAcknowledged,
      });
  if (error) return { ok: false, error: `Could not record equipment handover: ${error.message}` };

  revalidatePath("/service-center");
  return { ok: true };
}

async function saveServiceCustomerContact(
  formData: FormData,
  requireSentConfirmation = false,
): Promise<ServiceRecordActionResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "Your session expired. Please sign in again." };
  if (!await canPermission("service_jobs", "edit")) {
    return { ok: false, error: "You do not have permission to log customer contact." };
  }

  if (requireSentConfirmation) {
    if (formData.get("customerUpdateSent") !== "yes") {
      return { ok: false, error: "Confirm that you sent the customer update before logging it." };
    }
    if (formText(formData, "contactDirection") !== "outgoing"
      || formText(formData, "contactOutcome") !== "completed"
      || !["sms", "whatsapp", "email"].includes(formText(formData, "contactMethod"))) {
      return { ok: false, error: "Choose a supported message channel and confirm the update was sent." };
    }
  }

  const jobId = formText(formData, "contactJobId");
  if (!jobId) return { ok: false, error: "Choose the repair job for this contact." };
  const contact = parseServiceContact({
    direction: formData.get("contactDirection"),
    method: formData.get("contactMethod"),
    outcome: formData.get("contactOutcome"),
    details: formData.get("contactDetails"),
  });
  if (!contact.ok) return contact;

  const supabase = await createClient();
  const { data: job, error: jobError } = await supabase.from("service_jobs")
    .select("id, location_id")
    .eq("org_id", context.orgId)
    .eq("id", jobId)
    .maybeSingle();
  if (jobError) return { ok: false, error: `Could not verify the repair job: ${jobError.message}` };
  if (!job || !canAccessLocation(context, job.location_id)) {
    return { ok: false, error: "The selected repair job is unavailable to your branch." };
  }

  const { error } = await supabase.from("service_job_customer_contacts").insert({
    org_id: context.orgId,
    location_id: job.location_id,
    job_id: job.id,
    ...contact.contact,
    actor_id: context.userId,
  });
  if (error) return { ok: false, error: `Could not record customer contact: ${error.message}` };

  revalidatePath("/service-center");
  return { ok: true };
}

export async function createServiceCustomerContact(formData: FormData): Promise<ServiceRecordActionResult> {
  return saveServiceCustomerContact(formData);
}

export async function recordServiceCustomerUpdate(formData: FormData): Promise<ServiceRecordActionResult> {
  return saveServiceCustomerContact(formData, true);
}

export async function sendServiceCustomerUpdate(formData: FormData): Promise<ServiceDeliveryActionResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "Your session expired. Please sign in again." };
  if (!await canPermission("service_jobs", "edit")) {
    return { ok: false, error: "You do not have permission to send customer updates." };
  }

  const jobId = formText(formData, "contactJobId");
  const method = formText(formData, "contactMethod");
  const message = formText(formData, "contactDetails");
  if (!jobId) return { ok: false, error: "Choose the repair job for this update." };
  if (method !== "sms" && method !== "whatsapp" && method !== "email") {
    return { ok: false, error: "Choose SMS, WhatsApp, or Email." };
  }
  const channel: DeliveryChannel = method === "sms" ? "SMS"
    : method === "whatsapp" ? "WhatsApp" : "Email";
  if (!message || message.length > 1800) {
    return { ok: false, error: "Enter a message of up to 1,800 characters." };
  }

  const supabase = await createClient();
  const { data: job, error: jobError } = await supabase.from("service_jobs")
    .select("id, location_id, customer_id, job_number")
    .eq("org_id", context.orgId)
    .eq("id", jobId)
    .maybeSingle();
  if (jobError) return { ok: false, error: `Could not verify the repair job: ${jobError.message}` };
  if (!job || !canAccessLocation(context, job.location_id)) {
    return { ok: false, error: "The selected repair job is unavailable to your branch." };
  }

  const { data: customer, error: customerError } = await supabase.from("customers")
    .select("id, name, email, phone")
    .eq("org_id", context.orgId)
    .eq("id", job.customer_id)
    .maybeSingle();
  if (customerError) return { ok: false, error: `Could not load the repair customer: ${customerError.message}` };
  if (!customer) return { ok: false, error: "The repair customer could not be found." };

  const { data: preference, error: preferenceError } = await supabase.from("customer_message_preferences")
    .select("whatsapp, sms, email")
    .eq("org_id", context.orgId)
    .eq("customer_id", customer.id)
    .maybeSingle();
  if (preferenceError) return { ok: false, error: `Could not verify customer messaging preferences: ${preferenceError.message}` };
  const channelAllowed = channel === "WhatsApp" ? preference?.whatsapp !== false
    : channel === "SMS" ? preference?.sms !== false
      : preference?.email !== false;
  if (!channelAllowed) return { ok: false, error: `This customer has opted out of ${channel}. Choose another allowed channel.` };

  const recipient = (channel === "Email" ? customer.email : customer.phone)?.trim();
  if (!recipient) return { ok: false, error: `No ${channel === "Email" ? "email address" : "phone number"} is saved for this customer.` };

  const contactDetails = (summary: string) => `${summary}\n${message}`.slice(0, 2000);
  const { error: contactInsertError } = await supabase.from("service_job_customer_contacts")
    .insert({
      org_id: context.orgId,
      location_id: job.location_id,
      job_id: job.id,
      direction: "outgoing",
      method,
      outcome: "follow_up_needed",
      details: contactDetails(`Delivery attempt started via ${channel}.`),
      actor_id: context.userId,
    });
  if (contactInsertError) return { ok: false, error: `Could not prepare the customer update record: ${contactInsertError.message}` };

  const subject = channel === "Email" ? `Repair update: ${job.job_number}` : null;
  const { data: history, error: historyInsertError } = await supabase.from("communication_message_history")
    .insert({
      org_id: context.orgId,
      customer_id: customer.id,
      event: `Service repair update: ${job.job_number}`,
      channel,
      recipient,
      delivery_recipient: recipient,
      rendered_subject: subject,
      rendered_content: message,
      status: "Pending",
      sent_by: context.userId,
      branch_scope: context.branchScope,
    })
    .select("id")
    .single();
  if (historyInsertError) {
    const { error: contactLogError } = await supabase.from("service_job_customer_contacts").insert({
      org_id: context.orgId,
      location_id: job.location_id,
      job_id: job.id,
      direction: "outgoing",
      method,
      outcome: "other",
      details: contactDetails(`Message not sent: delivery history could not be recorded (${historyInsertError.message}).`),
      actor_id: context.userId,
    });
    revalidatePath("/service-center");
    if (contactLogError) return { ok: false, error: `Message was not sent because delivery history could not be recorded (${historyInsertError.message}); the repair contact log also needs attention (${contactLogError.message}).` };
    return { ok: false, error: `Message was not sent because delivery history could not be recorded: ${historyInsertError.message}` };
  }

  const delivery = await deliverMessage({ channel, recipient, subject, content: message });
  const status = delivery.sent ? "Sent" as const : "Failed" as const;
  const { error: historyUpdateError } = await supabase.from("communication_message_history")
    .update({
      status,
      delivery_provider: delivery.provider,
      failure_reason: delivery.reason ?? null,
    })
    .eq("org_id", context.orgId)
    .eq("id", history.id);
  const contactOutcome = delivery.sent ? "completed" as const : "other" as const;
  const finalContactDetails = delivery.sent
    ? contactDetails(`Message sent via ${delivery.provider} to ${recipient}.`)
    : contactDetails(`Delivery failed via ${delivery.provider}: ${(delivery.reason ?? "No reason provided.").slice(0, 240)}.`);
  const { error: contactLogError } = await supabase.from("service_job_customer_contacts").insert({
    org_id: context.orgId,
    location_id: job.location_id,
    job_id: job.id,
    direction: "outgoing",
    method,
    outcome: contactOutcome,
    details: finalContactDetails,
    actor_id: context.userId,
  });

  revalidatePath("/service-center");
  if (historyUpdateError || contactLogError) {
    const loggedErrors = [
      historyUpdateError ? `message history: ${historyUpdateError.message}` : null,
      contactLogError ? `repair contact log: ${contactLogError.message}` : null,
    ].filter((error): error is string => error !== null).join("; ");
    const deliverySummary = delivery.sent ? "The message was sent" : "The message was not sent";
    return { ok: false, error: `${deliverySummary}, but the delivery result could not be fully saved (${loggedErrors}). Check the delivery record before retrying.${delivery.reason ? ` Provider: ${delivery.reason}` : ""}` };
  }

  if (!delivery.sent) {
    return { ok: false, error: `Message was not sent: ${delivery.reason ?? "The provider did not accept it."}` };
  }
  return { ok: true, provider: delivery.provider, recipient };
}

export async function createServiceQuotation(formData: FormData): Promise<ServiceQuotationActionResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "Your session expired. Please sign in again." };
  if (!await canPermission("service_jobs", "edit")) {
    return { ok: false, error: "You do not have permission to prepare service estimates." };
  }

  const jobId = formText(formData, "quotationJobId");
  const notes = formText(formData, "quotationNotes");
  const taxRateValue = formData.get("quotationTaxRate");
  if (taxRateValue !== null && typeof taxRateValue !== "string") {
    return { ok: false, error: "Enter a valid tax rate." };
  }
  const taxRateText = taxRateValue?.trim() || "0";
  const lines = parseServiceQuotationLines(
    formData.getAll("itemDescription"),
    formData.getAll("itemQuantity"),
    formData.getAll("itemUnitPrice"),
  );
  if (!jobId) return { ok: false, error: "Choose a service job for this estimate." };
  if (!lines.ok) return lines;
  if (notes.length > 2000) return { ok: false, error: "Estimate notes cannot exceed 2,000 characters." };
  if (!/^\d+(?:\.\d{1,2})?$/.test(taxRateText)) {
    return { ok: false, error: "Enter a tax rate from 0 to 100 with up to 2 decimal places." };
  }
  const taxRate = Number(taxRateText);
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
    return { ok: false, error: "Enter a tax rate from 0 to 100." };
  }

  const supabase = await createClient();
  const { data: quotationId, error } = await supabase.rpc("create_service_quotation", {
    p_job_id: jobId,
    p_items: lines.items,
    p_notes: notes || null,
    p_tax_rate: taxRate,
  });
  if (error) return { ok: false, error: `Could not create the estimate: ${error.message}` };

  revalidatePath("/service-center");
  return { ok: true, quotationId };
}

export async function transitionServiceQuotation(formData: FormData): Promise<ServiceRecordActionResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "Your session expired. Please sign in again." };
  if (!await canPermission("service_jobs", "edit")) {
    return { ok: false, error: "You do not have permission to update service estimates." };
  }

  const quotationId = formText(formData, "quotationId");
  const newStatus = formText(formData, "quotationStatus");
  const note = formText(formData, "quotationActionNote");
  if (!quotationId) return { ok: false, error: "Choose an estimate." };
  if (!quotationActions.some((status) => status === newStatus)) {
    return { ok: false, error: "Choose a valid estimate action." };
  }
  if (!note || note.length > 1000) {
    return { ok: false, error: "Enter an action note or customer response (up to 1,000 characters)." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("transition_service_quotation", {
    p_quotation_id: quotationId,
    p_new_status: newStatus,
    p_note: note,
  });
  if (error) return { ok: false, error: `Could not update the estimate: ${error.message}` };

  revalidatePath("/service-center");
  return { ok: true };
}

export async function sendServiceQuotation(formData: FormData): Promise<ServiceDeliveryActionResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "Your session expired. Please sign in again." };
  if (!await canPermission("service_jobs", "edit")) {
    return { ok: false, error: "You do not have permission to send service estimates." };
  }

  const quotationId = formText(formData, "quotationId");
  const method = formText(formData, "quotationChannel");
  if (!quotationId) return { ok: false, error: "Choose an estimate to send." };
  if (method !== "sms" && method !== "whatsapp" && method !== "email") {
    return { ok: false, error: "Choose SMS, WhatsApp, or Email." };
  }
  const channel: DeliveryChannel = method === "sms" ? "SMS"
    : method === "whatsapp" ? "WhatsApp" : "Email";

  const supabase = await createClient();
  const { data: quotation, error: quotationError } = await supabase.from("service_quotations")
    .select("id, org_id, location_id, job_id, version, status, subtotal, tax_rate, tax_amount, total, notes")
    .eq("org_id", context.orgId)
    .eq("id", quotationId)
    .maybeSingle();
  if (quotationError) return { ok: false, error: `Could not load the estimate: ${quotationError.message}` };
  if (!quotation || quotation.status !== "draft") {
    return { ok: false, error: "Only a draft estimate can be sent. Refresh the page and check its current status." };
  }
  if (!canAccessLocation(context, quotation.location_id)) {
    return { ok: false, error: "The selected estimate is unavailable to your branch." };
  }

  const { data: job, error: jobError } = await supabase.from("service_jobs")
    .select("id, job_number, customer_id, status")
    .eq("org_id", context.orgId)
    .eq("location_id", quotation.location_id)
    .eq("id", quotation.job_id)
    .maybeSingle();
  if (jobError) return { ok: false, error: `Could not verify the repair job: ${jobError.message}` };
  if (!job || !["inspection", "awaiting_quotation"].includes(job.status)) {
    return { ok: false, error: "This job is no longer ready for an estimate. Refresh the page and check its status." };
  }

  const [{ data: customer, error: customerError }, { data: items, error: itemsError }, { data: preference, error: preferenceError }] = await Promise.all([
    supabase.from("customers").select("id, name, email, phone")
      .eq("org_id", context.orgId).eq("id", job.customer_id).maybeSingle(),
    supabase.from("service_quotation_items").select("description, quantity, unit_price, line_total")
      .eq("org_id", context.orgId).eq("location_id", quotation.location_id)
      .eq("quotation_id", quotation.id).order("created_at"),
    supabase.from("customer_message_preferences").select("whatsapp, sms, email")
      .eq("org_id", context.orgId).eq("customer_id", job.customer_id).maybeSingle(),
  ]);
  if (customerError) return { ok: false, error: `Could not load the estimate customer: ${customerError.message}` };
  if (itemsError) return { ok: false, error: `Could not load estimate items: ${itemsError.message}` };
  if (preferenceError) return { ok: false, error: `Could not verify customer messaging preferences: ${preferenceError.message}` };
  if (!customer) return { ok: false, error: "The estimate customer could not be found." };
  if (!items?.length) return { ok: false, error: "This estimate has no saved items to send." };

  const channelAllowed = channel === "WhatsApp" ? preference?.whatsapp !== false
    : channel === "SMS" ? preference?.sms !== false
      : preference?.email !== false;
  if (!channelAllowed) return { ok: false, error: `This customer has opted out of ${channel}. Choose another allowed channel.` };
  const recipient = (channel === "Email" ? customer.email : customer.phone)?.trim();
  if (!recipient) return { ok: false, error: `No ${channel === "Email" ? "email address" : "phone number"} is saved for this customer.` };

  const event = `Service estimate: ${job.job_number} v${quotation.version}`;
  const { data: previousDelivery, error: previousDeliveryError } = await supabase.from("communication_message_history")
    .select("status")
    .eq("org_id", context.orgId)
    .eq("customer_id", customer.id)
    .eq("event", event)
    .in("status", ["Pending", "Sent"])
    .limit(1)
    .maybeSingle();
  if (previousDeliveryError) return { ok: false, error: `Could not check previous estimate delivery attempts: ${previousDeliveryError.message}` };
  if (previousDelivery) {
    return { ok: false, error: previousDelivery.status === "Sent"
      ? "This estimate has already been sent. Refresh the page to see its current status."
      : "A delivery attempt for this estimate is already pending. Check message history before trying again." };
  }

  const subject = `Repair estimate ${job.job_number} v${quotation.version}`;
  const message = buildServiceQuotationMessage({
    customerName: customer.name,
    jobNumber: job.job_number,
    version: quotation.version,
    currency: context.currency,
    items,
    subtotal: quotation.subtotal,
    taxRate: quotation.tax_rate,
    taxAmount: quotation.tax_amount,
    total: quotation.total,
    notes: quotation.notes,
  });
  const portalBaseUrl = getServiceRepairPortalBaseUrl(process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL);
  if (!portalBaseUrl) {
    return { ok: false, error: "The customer portal URL is not securely configured. Set SITE_URL or NEXT_PUBLIC_SITE_URL to the production HTTPS origin." };
  }
  const { token, tokenHash } = createServiceRepairPortalToken();
  const portalUrl = getServiceRepairPortalUrl(portalBaseUrl, token);
  const deliveryContent = `${message}\n\nReview your repair estimate and approve or decline securely: ${portalUrl}`;
  if (deliveryContent.length > 1800) {
    return { ok: false, error: "This estimate exceeds the direct-message limit. Use the existing manual send workflow instead." };
  }

  const { data: history, error: historyInsertError } = await supabase.from("communication_message_history")
    .insert({
      org_id: context.orgId,
      customer_id: customer.id,
      event,
      channel,
      recipient,
      delivery_recipient: recipient,
      rendered_subject: channel === "Email" ? subject : null,
      rendered_content: `${message}\n\nA secure repair portal link was included.`,
      status: "Pending",
      sent_by: context.userId,
      branch_scope: context.branchScope,
    })
    .select("id")
    .single();
  if (historyInsertError) return { ok: false, error: `Could not record the delivery attempt, so the estimate was not sent: ${historyInsertError.message}` };

  const admin = createAdminClient();
  const { data: portalLink, error: portalLinkError } = await admin.from("service_quotation_portal_links")
    .insert({
      org_id: context.orgId,
      location_id: quotation.location_id,
      job_id: job.id,
      quotation_id: quotation.id,
      token_hash: tokenHash,
      created_by: context.userId,
    })
    .select("id")
    .single();
  if (portalLinkError) {
    const { error: historyFailureError } = await supabase.from("communication_message_history")
      .update({ status: "Failed", failure_reason: portalLinkError.message })
      .eq("org_id", context.orgId)
      .eq("id", history.id);
    return {
      ok: false,
      error: `Could not create the secure repair link, so the estimate was not sent: ${portalLinkError.message}${historyFailureError ? ` Delivery failure logging also failed: ${historyFailureError.message}` : ""}`,
    };
  }

  const delivery = await deliverMessage({ channel, recipient, subject, content: deliveryContent });
  const { error: historyUpdateError } = await supabase.from("communication_message_history")
    .update({
      status: delivery.sent ? "Sent" : "Failed",
      delivery_provider: delivery.provider,
      failure_reason: delivery.reason ?? null,
    })
    .eq("org_id", context.orgId)
    .eq("id", history.id);
  if (!delivery.sent) {
    const { error: revokeError } = await admin.from("service_quotation_portal_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("org_id", context.orgId)
      .eq("id", portalLink.id);
    revalidatePath("/service-center");
    return { ok: false, error: `Estimate was not sent: ${delivery.reason ?? "The provider did not accept it."}${historyUpdateError ? ` Delivery result logging also failed: ${historyUpdateError.message}` : ""}${revokeError ? ` Portal link revocation also failed: ${revokeError.message}` : ""}` };
  }

  const { error: transitionError } = await supabase.rpc("transition_service_quotation", {
    p_quotation_id: quotation.id,
    p_new_status: "sent",
    p_note: `Sent via ${delivery.provider} to ${recipient}.`,
  });
  revalidatePath("/service-center");
  if (transitionError) {
    const { error: revokeError } = await admin.from("service_quotation_portal_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("org_id", context.orgId)
      .eq("id", portalLink.id);
    return { ok: false, error: `Estimate was sent to ${recipient}, but the estimate status could not be updated (${transitionError.message}). Do not resend; refresh the page and record the sent status manually.${historyUpdateError ? ` Delivery result logging also failed: ${historyUpdateError.message}` : ""}${revokeError ? ` Portal link revocation also failed: ${revokeError.message}` : ""}` };
  }
  if (historyUpdateError) {
    return { ok: false, error: `Estimate was sent to ${recipient}, but the delivery result could not be fully saved (${historyUpdateError.message}). Check message history before retrying.` };
  }
  return { ok: true, provider: delivery.provider, recipient };
}

export async function issueServiceJobParts(formData: FormData): Promise<ServiceRecordActionResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "Your session expired. Please sign in again." };
  if (!await canPermission("service_jobs", "edit") || !await canPermission("inventory", "edit")) {
    return { ok: false, error: "You need service-job and inventory edit permission to issue parts." };
  }

  const jobId = formText(formData, "partsJobId");
  const note = formText(formData, "partsIssueNote");
  const items = parseServiceJobParts(formData.getAll("partProductId"), formData.getAll("partQuantity"));
  if (!jobId) return { ok: false, error: "Choose the repair job for these parts." };
  if (!items.ok) return items;
  if (note.length > 1000) return { ok: false, error: "Parts note cannot exceed 1,000 characters." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("issue_service_job_parts", {
    p_job_id: jobId,
    p_items: items.items,
    p_note: note || null,
  });
  if (error) {
    if (error.message.toLowerCase().includes("insufficient_stock")) {
      return { ok: false, error: "There is not enough stock at the job's branch to issue the requested parts." };
    }
    return { ok: false, error: `Could not issue parts to the repair job: ${error.message}` };
  }

  revalidatePath("/service-center");
  revalidatePath("/inventory");
  revalidatePath("/inventory/history");
  return { ok: true };
}

export async function returnServiceJobPart(formData: FormData): Promise<ServiceRecordActionResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "Your session expired. Please sign in again." };
  if (!await canPermission("service_jobs", "edit") || !await canPermission("inventory", "edit")) {
    return { ok: false, error: "You need service-job and inventory edit permission to return parts." };
  }

  const issueId = formText(formData, "partIssueId");
  const quantityText = formText(formData, "partReturnQuantity");
  const note = formText(formData, "partReturnNote");
  if (!issueId) return { ok: false, error: "Choose the issued part to return." };
  if (!/^\d+$/.test(quantityText)) return { ok: false, error: "Return quantity must be a whole number." };
  const quantity = Number(quantityText);
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 10000) {
    return { ok: false, error: "Return quantity must be between 1 and 10,000." };
  }
  if (!note || note.length > 1000) return { ok: false, error: "Enter a return reason of up to 1,000 characters." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("return_service_job_part", {
    p_issue_id: issueId,
    p_quantity: quantity,
    p_note: note,
  });
  if (error) return { ok: false, error: `Could not return the unused parts to inventory: ${error.message}` };

  revalidatePath("/service-center");
  revalidatePath("/inventory");
  revalidatePath("/inventory/history");
  return { ok: true };
}

export async function createServiceAppointment(formData: FormData): Promise<ServiceRecordActionResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "Your session expired. Please sign in again." };
  if (!await canPermission("service_appointments", "create")) {
    return { ok: false, error: "You do not have permission to schedule service appointments." };
  }

  const locationId = formText(formData, "appointmentLocationId");
  const customerId = formText(formData, "appointmentCustomerId");
  const assetId = formText(formData, "appointmentAssetId");
  const technicianId = formText(formData, "appointmentTechnicianId");
  const jobId = formText(formData, "appointmentJobId");
  const title = formText(formData, "appointmentTitle");
  const notes = formText(formData, "appointmentNotes");
  const startsAtValue = formText(formData, "appointmentStartsAt");
  const endsAtValue = formText(formData, "appointmentEndsAt");
  const startsAt = new Date(startsAtValue);
  const endsAt = new Date(endsAtValue);
  if (!locationId || !canAccessLocation(context, locationId)) {
    return { ok: false, error: "You are not assigned to the selected branch." };
  }
  if (!customerId) return { ok: false, error: "Choose a customer for this appointment." };
  if (!title || title.length > 160) return { ok: false, error: "Enter an appointment title (up to 160 characters)." };
  if (!startsAtValue || !endsAtValue || !Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) {
    return { ok: false, error: "Enter a valid start and end time." };
  }
  const durationMs = endsAt.getTime() - startsAt.getTime();
  if (durationMs <= 0 || durationMs > 24 * 60 * 60 * 1000) {
    return { ok: false, error: "The appointment must end after it starts and last no longer than 24 hours." };
  }
  if (notes.length > 2000) return { ok: false, error: "Appointment notes cannot exceed 2,000 characters." };

  const supabase = await createClient();
  const [{ data: location, error: locationError }, { data: customer, error: customerError }] = await Promise.all([
    supabase.from("business_locations").select("id").eq("org_id", context.orgId).eq("id", locationId).eq("is_active", true).maybeSingle(),
    supabase.from("customers").select("id").eq("org_id", context.orgId).eq("id", customerId).maybeSingle(),
  ]);
  if (locationError) return { ok: false, error: `Could not verify the selected branch: ${locationError.message}` };
  if (!location) return { ok: false, error: "The selected branch is unavailable." };
  if (customerError) return { ok: false, error: `Could not verify the selected customer: ${customerError.message}` };
  if (!customer) return { ok: false, error: "The selected customer is unavailable." };

  if (assetId) {
    const { data: asset, error } = await supabase.from("service_assets")
      .select("id")
      .eq("org_id", context.orgId)
      .eq("location_id", locationId)
      .eq("customer_id", customerId)
      .eq("id", assetId)
      .maybeSingle();
    if (error) return { ok: false, error: `Could not verify the selected equipment: ${error.message}` };
    if (!asset) return { ok: false, error: "The equipment must belong to this customer and branch." };
  }
  if (technicianId) {
    const { data: technician, error } = await supabase.from("service_technicians")
      .select("id")
      .eq("org_id", context.orgId)
      .eq("location_id", locationId)
      .eq("id", technicianId)
      .eq("is_active", true)
      .maybeSingle();
    if (error) return { ok: false, error: `Could not verify the selected technician: ${error.message}` };
    if (!technician) return { ok: false, error: "The technician is not active at this branch." };
  }
  if (jobId) {
    const { data: job, error } = await supabase.from("service_jobs")
      .select("id")
      .eq("org_id", context.orgId)
      .eq("location_id", locationId)
      .eq("customer_id", customerId)
      .eq("id", jobId)
      .maybeSingle();
    if (error) return { ok: false, error: `Could not verify the selected service job: ${error.message}` };
    if (!job) return { ok: false, error: "The linked job must belong to this customer and branch." };
  }

  const { error } = await supabase.from("service_appointments").insert({
    org_id: context.orgId,
    location_id: locationId,
    customer_id: customerId,
    asset_id: assetId || null,
    technician_id: technicianId || null,
    job_id: jobId || null,
    title,
    notes: notes || null,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    status: "scheduled",
    created_by: context.userId,
  });
  if (error) {
    if (error.message.toLowerCase().includes("technician already has an appointment")) {
      return { ok: false, error: "The technician already has an appointment during this time." };
    }
    return { ok: false, error: `Could not schedule the appointment: ${error.message}` };
  }

  revalidatePath("/service-center");
  return { ok: true };
}

export async function transitionServiceAppointment(formData: FormData): Promise<ServiceRecordActionResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "Your session expired. Please sign in again." };
  if (!await canPermission("service_appointments", "edit")) {
    return { ok: false, error: "You do not have permission to update service appointments." };
  }

  const appointmentId = formText(formData, "appointmentId");
  const newStatus = formText(formData, "appointmentStatus");
  if (!appointmentId) return { ok: false, error: "Choose an appointment." };
  if (!isServiceAppointmentStatus(newStatus) || newStatus === "scheduled") {
    return { ok: false, error: "Choose a valid next appointment status." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("transition_service_appointment", {
    p_appointment_id: appointmentId,
    p_new_status: newStatus,
  });
  if (error) return { ok: false, error: `Could not update the appointment: ${error.message}` };

  revalidatePath("/service-center");
  return { ok: true };
}

export async function sendServiceAppointmentReminder(formData: FormData): Promise<ServiceDeliveryActionResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "Your session expired. Please sign in again." };
  if (!await canPermission("service_appointments", "edit")) {
    return { ok: false, error: "You do not have permission to send appointment reminders." };
  }

  const appointmentId = formText(formData, "appointmentId");
  const method = formText(formData, "reminderChannel");
  const message = formText(formData, "reminderMessage");
  if (!appointmentId) return { ok: false, error: "Choose an appointment." };
  if (method !== "sms" && method !== "whatsapp" && method !== "email") {
    return { ok: false, error: "Choose SMS, WhatsApp, or Email." };
  }
  const channel: DeliveryChannel = method === "sms" ? "SMS"
    : method === "whatsapp" ? "WhatsApp" : "Email";
  if (!message || message.length > 1800) {
    return { ok: false, error: "Enter a reminder of up to 1,800 characters." };
  }

  const supabase = await createClient();
  const { data: appointment, error: appointmentError } = await supabase.from("service_appointments")
    .select("id, location_id, customer_id, title, starts_at, status")
    .eq("org_id", context.orgId)
    .eq("id", appointmentId)
    .maybeSingle();
  if (appointmentError) return { ok: false, error: `Could not verify the appointment: ${appointmentError.message}` };
  if (!appointment || !canAccessLocation(context, appointment.location_id)) {
    return { ok: false, error: "The selected appointment is unavailable to your branch." };
  }
  if (appointment.status !== "scheduled" && appointment.status !== "confirmed") {
    return { ok: false, error: "Reminders can only be sent for scheduled or confirmed appointments." };
  }
  if (new Date(appointment.starts_at).getTime() <= Date.now()) {
    return { ok: false, error: "This appointment has already started. Reminders are only available beforehand." };
  }

  const { data: customer, error: customerError } = await supabase.from("customers")
    .select("id, phone, email")
    .eq("org_id", context.orgId)
    .eq("id", appointment.customer_id)
    .maybeSingle();
  if (customerError) return { ok: false, error: `Could not load the appointment customer: ${customerError.message}` };
  if (!customer) return { ok: false, error: "The appointment customer could not be found." };

  const { data: preference, error: preferenceError } = await supabase.from("customer_message_preferences")
    .select("whatsapp, sms, email")
    .eq("org_id", context.orgId)
    .eq("customer_id", customer.id)
    .maybeSingle();
  if (preferenceError) return { ok: false, error: `Could not verify customer messaging preferences: ${preferenceError.message}` };
  const channelAllowed = channel === "WhatsApp" ? preference?.whatsapp !== false
    : channel === "SMS" ? preference?.sms !== false
      : preference?.email !== false;
  if (!channelAllowed) return { ok: false, error: `This customer has opted out of ${channel}. Choose another allowed channel.` };

  const recipient = (channel === "Email" ? customer.email : customer.phone)?.trim();
  if (!recipient) return { ok: false, error: `No ${channel === "Email" ? "email address" : "phone number"} is saved for this customer.` };
  const subject = channel === "Email" ? `Appointment reminder: ${appointment.title}` : null;
  const { data: history, error: historyInsertError } = await supabase.from("communication_message_history")
    .insert({
      org_id: context.orgId,
      customer_id: customer.id,
      event: `Service appointment reminder: ${appointment.title}`,
      channel,
      recipient,
      delivery_recipient: recipient,
      rendered_subject: subject,
      rendered_content: message,
      status: "Pending",
      sent_by: context.userId,
      branch_scope: context.branchScope,
    })
    .select("id")
    .single();
  if (historyInsertError) return { ok: false, error: `Could not record the reminder attempt, so no message was sent: ${historyInsertError.message}` };

  const delivery = await deliverMessage({ channel, recipient, subject, content: message });
  const { error: historyUpdateError } = await supabase.from("communication_message_history")
    .update({
      status: delivery.sent ? "Sent" : "Failed",
      delivery_provider: delivery.provider,
      failure_reason: delivery.reason ?? null,
    })
    .eq("org_id", context.orgId)
    .eq("id", history.id);
  revalidatePath("/service-center");
  if (historyUpdateError) {
    const outcome = delivery.sent ? "The reminder was sent" : "The reminder was not sent";
    return { ok: false, error: `${outcome}, but its delivery result could not be saved (${historyUpdateError.message}). Check message history before retrying.${delivery.reason ? ` Provider: ${delivery.reason}` : ""}` };
  }
  if (!delivery.sent) return { ok: false, error: `Reminder was not sent: ${delivery.reason ?? "The provider did not accept it."}` };
  return { ok: true, provider: delivery.provider, recipient };
}
