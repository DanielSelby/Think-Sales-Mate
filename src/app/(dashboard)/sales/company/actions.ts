"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { can } from "@/lib/rbac";

async function requireAdmin() {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "Your session expired — please sign in again." } as const;
  if (!can(context.role, "settings.edit")) {
    return { error: "You don't have permission to edit the company profile." } as const;
  }
  return { context } as const;
}

export interface CompanyProfileFields {
  companyName: string;
  registrationNo?: string;
  businessEmail: string;
  businessPhone: string;
  website?: string;
  tin?: string;
  description?: string;
  country?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postcode?: string;
  region?: string;
  contactName?: string;
  contactDesignation?: string;
  contactEmail?: string;
  contactPhone?: string;
  defaultSalesTaxPercent?: number;
  showLogoOnInvoices?: boolean;
  showInfoOnReceipts?: boolean;
  enableBarcodeOnDocuments?: boolean;
  facebookUrl?: string;
  twitterUrl?: string;
  linkedinUrl?: string;
  youtubeUrl?: string;
}

export async function saveCompanyProfile(fields: CompanyProfileFields) {
  const check = await requireAdmin();
  if ("error" in check) return check;

  if (!fields.companyName.trim()) return { error: "Company name is required." };
  if (!fields.businessEmail.trim()) return { error: "Business email is required." };

  const supabase = await createClient();
  const { error } = await supabase.from("company_profile").upsert(
    {
      org_id: check.context.orgId,
      company_name: fields.companyName.trim(),
      registration_no: fields.registrationNo || null,
      business_email: fields.businessEmail.trim(),
      business_phone: fields.businessPhone || null,
      website: fields.website || null,
      tin: fields.tin || null,
      description: fields.description || null,
      country: fields.country || null,
      address_line1: fields.addressLine1 || null,
      address_line2: fields.addressLine2 || null,
      city: fields.city || null,
      postcode: fields.postcode || null,
      region: fields.region || null,
      contact_name: fields.contactName || null,
      contact_designation: fields.contactDesignation || null,
      contact_email: fields.contactEmail || null,
      contact_phone: fields.contactPhone || null,
      default_sales_tax_percent: fields.defaultSalesTaxPercent ?? 0,
      show_logo_on_invoices: fields.showLogoOnInvoices ?? true,
      show_info_on_receipts: fields.showInfoOnReceipts ?? true,
      enable_barcode_on_documents: fields.enableBarcodeOnDocuments ?? false,
      facebook_url: fields.facebookUrl || null,
      twitter_url: fields.twitterUrl || null,
      linkedin_url: fields.linkedinUrl || null,
      youtube_url: fields.youtubeUrl || null,
      updated_at: new Date().toISOString()
    },
    { onConflict: "org_id" }
  );

  if (error) return { error: error.message };
  revalidatePath("/settings/company");
  return { success: true };
}

export async function uploadCompanyLogo(formData: FormData) {
  const check = await requireAdmin();
  if ("error" in check) return check;

  const file = formData.get("logo") as File | null;
  if (!file || file.size === 0) return { error: "Choose a file first." };
  if (file.size > 2 * 1024 * 1024) return { error: "Logo must be under 2MB." };
  if (!["image/png", "image/jpeg", "image/svg+xml"].includes(file.type)) {
    return { error: "Logo must be a JPG, PNG, or SVG file." };
  }

  const supabase = await createClient();
  const ext = file.name.split(".").pop();
  const path = `${check.context.orgId}/logo.${ext}`;

  const { error: uploadError } = await supabase.storage.from("company-assets").upload(path, file, { upsert: true });
  if (uploadError) return { error: uploadError.message };

  const { data: publicUrl } = supabase.storage.from("company-assets").getPublicUrl(path);
  const logoUrl = `${publicUrl.publicUrl}?v=${Date.now()}`;

  const { error } = await supabase
    .from("company_profile")
    .upsert({ org_id: check.context.orgId, logo_url: logoUrl, updated_at: new Date().toISOString() }, { onConflict: "org_id" });

  if (error) return { error: error.message };
  revalidatePath("/settings/company");
  return { success: true, logoUrl };
}

// Real helper other modules (Invoices, Receipts, POS, etc.) can call —
// I haven't touched those modules myself since I haven't reviewed them.
export async function getCompanyProfile(orgId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("company_profile").select("*").eq("org_id", orgId).maybeSingle();
  return data;
}