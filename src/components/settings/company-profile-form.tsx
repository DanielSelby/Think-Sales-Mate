"use client";

import { useRef, useState, useTransition } from "react";
import { Upload, Save, Facebook, Twitter, Linkedin, Youtube, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveCompanyProfile, uploadCompanyLogo } from "@/app/(dashboard)/settings/company/actions";
import type { Database } from "@/types/database";

type CompanyProfileRow = Database["public"]["Tables"]["company_profile"]["Row"];

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 ${checked ? "bg-signal" : "bg-ledger-200 dark:bg-white/[0.1]"}`}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
    </button>
  );
}

export function CompanyProfileForm({ profile, canManage }: { profile: CompanyProfileRow | null; canManage: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [logoUrl, setLogoUrl] = useState(profile?.logo_url ?? null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [description, setDescription] = useState(profile?.description ?? "");
  const [showLogo, setShowLogo] = useState(profile?.show_logo_on_invoices ?? true);
  const [showInfo, setShowInfo] = useState(profile?.show_info_on_receipts ?? true);
  const [enableBarcode, setEnableBarcode] = useState(profile?.enable_barcode_on_documents ?? false);

  function handleLogoChange(file: File) {
    setError(null);
    setUploadingLogo(true);
    const formData = new FormData();
    formData.append("logo", file);
    startTransition(async () => {
      const result = await uploadCompanyLogo(formData);
      if (result?.error) setError(result.error);
      else if (result?.logoUrl) setLogoUrl(result.logoUrl);
      setUploadingLogo(false);
    });
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveCompanyProfile({
        companyName: String(formData.get("company_name") ?? ""),
        registrationNo: String(formData.get("registration_no") ?? ""),
        businessEmail: String(formData.get("business_email") ?? ""),
        businessPhone: String(formData.get("business_phone") ?? ""),
        website: String(formData.get("website") ?? ""),
        tin: String(formData.get("tin") ?? ""),
        description,
        country: String(formData.get("country") ?? ""),
        addressLine1: String(formData.get("address_line1") ?? ""),
        addressLine2: String(formData.get("address_line2") ?? ""),
        city: String(formData.get("city") ?? ""),
        postcode: String(formData.get("postcode") ?? ""),
        region: String(formData.get("region") ?? ""),
        contactName: String(formData.get("contact_name") ?? ""),
        contactDesignation: String(formData.get("contact_designation") ?? ""),
        contactEmail: String(formData.get("contact_email") ?? ""),
        contactPhone: String(formData.get("contact_phone") ?? ""),
        defaultSalesTaxPercent: Number(formData.get("default_sales_tax") ?? 0),
        showLogoOnInvoices: showLogo,
        showInfoOnReceipts: showInfo,
        enableBarcodeOnDocuments: enableBarcode,
        facebookUrl: String(formData.get("facebook_url") ?? ""),
        twitterUrl: String(formData.get("twitter_url") ?? ""),
        linkedinUrl: String(formData.get("linkedin_url") ?? ""),
        youtubeUrl: String(formData.get("youtube_url") ?? "")
      });
      if (result?.error) setError(result.error);
      else setSaved(true);
    });
  }

  return (
    <form action={handleSubmit} className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs text-ledger-400">Settings &gt; Company Profile</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-white">Company Profile</h1>
          <p className="text-sm text-ledger-500 dark:text-ledger-400">Manage your company information and business details.</p>
        </div>
        {canManage && (
          <Button type="submit" disabled={isPending}>
            <Save className="h-3.5 w-3.5" />
            {isPending ? "Saving…" : "Save changes"}
          </Button>
        )}
      </div>

      {error && (
        <p className="flex items-center justify-between rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">
          {error}
          <button type="button" onClick={() => setError(null)}>
            <X className="h-3.5 w-3.5" />
          </button>
        </p>
      )}
      {saved && <p className="rounded-md bg-signal-soft px-3 py-2 text-sm text-signal">Company profile saved.</p>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Left: company info */}
        <div className="space-y-5 lg:col-span-2">
          <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Company information</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Company logo</label>
                <div className="mt-1.5 flex items-center gap-4">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-ledger-200 bg-ledger-50 dark:border-ledger-700 dark:bg-white/[0.04]">
                    {logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoUrl} alt="Company logo" className="h-full w-full object-contain" />
                    ) : (
                      <Upload className="h-6 w-6 text-ledger-300" />
                    )}
                  </div>
                  {canManage && (
                    <div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={uploadingLogo}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="h-3.5 w-3.5" />
                        {uploadingLogo ? "Uploading…" : "Change logo"}
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".jpg,.jpeg,.png,.svg"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleLogoChange(file);
                          e.target.value = "";
                        }}
                      />
                      <p className="mt-1 text-[11px] text-ledger-400">JPG, PNG or SVG. Max size 2MB.</p>
                    </div>
                  )}
                </div>
              </div>

              <Field label="Company name" name="company_name" required defaultValue={profile?.company_name ?? ""} disabled={!canManage} />
              <Field label="Company registration no." name="registration_no" defaultValue={profile?.registration_no ?? ""} disabled={!canManage} />
              <Field label="Business email" name="business_email" type="email" required defaultValue={profile?.business_email ?? ""} disabled={!canManage} />
              <Field label="Business phone" name="business_phone" type="tel" defaultValue={profile?.business_phone ?? ""} disabled={!canManage} />
              <Field label="Website" name="website" defaultValue={profile?.website ?? ""} disabled={!canManage} />
              <Field label="Tax Identification Number (TIN)" name="tin" defaultValue={profile?.tin ?? ""} disabled={!canManage} />
            </div>

            <div className="mt-4 space-y-1.5">
              <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Business description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                disabled={!canManage}
                rows={3}
                maxLength={500}
                className="w-full rounded-md border border-ledger-200 bg-white px-3 py-2 text-sm disabled:opacity-60 dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
              />
              <p className="text-right text-[11px] text-ledger-400">{description.length}/500</p>
            </div>
          </div>

          <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Contact person / primary contact</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Full name" name="contact_name" defaultValue={profile?.contact_name ?? ""} disabled={!canManage} />
              <Field label="Designation" name="contact_designation" defaultValue={profile?.contact_designation ?? ""} disabled={!canManage} />
              <Field label="Email" name="contact_email" type="email" defaultValue={profile?.contact_email ?? ""} disabled={!canManage} />
              <Field label="Phone" name="contact_phone" type="tel" defaultValue={profile?.contact_phone ?? ""} disabled={!canManage} />
            </div>
          </div>

          <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <h2 className="text-sm font-semibold text-ink-900 dark:text-white">
              Social media links <span className="font-normal text-ledger-400">(optional)</span>
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <SocialField icon={Facebook} name="facebook_url" defaultValue={profile?.facebook_url ?? ""} disabled={!canManage} />
              <SocialField icon={Twitter} name="twitter_url" defaultValue={profile?.twitter_url ?? ""} disabled={!canManage} />
              <SocialField icon={Linkedin} name="linkedin_url" defaultValue={profile?.linkedin_url ?? ""} disabled={!canManage} />
              <SocialField icon={Youtube} name="youtube_url" defaultValue={profile?.youtube_url ?? ""} disabled={!canManage} />
            </div>
          </div>
        </div>

        {/* Right: address + business settings */}
        <div className="space-y-5">
          <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Address information</h2>
            <div className="mt-4 space-y-4">
              <Field label="Country" name="country" defaultValue={profile?.country ?? ""} disabled={!canManage} />
              <Field label="Address line 1" name="address_line1" defaultValue={profile?.address_line1 ?? ""} disabled={!canManage} />
              <Field label="Address line 2" name="address_line2" defaultValue={profile?.address_line2 ?? ""} disabled={!canManage} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="City" name="city" defaultValue={profile?.city ?? ""} disabled={!canManage} />
                <Field label="Post code" name="postcode" defaultValue={profile?.postcode ?? ""} disabled={!canManage} />
              </div>
              <Field label="Region / State" name="region" defaultValue={profile?.region ?? ""} disabled={!canManage} />
            </div>
          </div>

          <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Business settings</h2>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Default sales tax</label>
                <div className="mt-1 flex items-center rounded-md border border-ledger-200 dark:border-ledger-700">
                  <input
                    name="default_sales_tax"
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    disabled={!canManage}
                    defaultValue={profile?.default_sales_tax_percent ?? 0}
                    className="h-10 w-full rounded-l-md border-none bg-white px-3 text-sm disabled:opacity-60 dark:bg-ink-900 dark:text-white"
                  />
                  <span className="px-3 text-sm text-ledger-400">%</span>
                </div>
                <p className="mt-1 text-[11px] text-ledger-400">Tax applied to all sales by default</p>
              </div>

              <ToggleRow
                label="Show company logo on invoices"
                description="Display company logo on all invoices"
                checked={showLogo}
                onChange={setShowLogo}
                disabled={!canManage}
              />
              <ToggleRow
                label="Show company info on receipts"
                description="Display company information on receipts"
                checked={showInfo}
                onChange={setShowInfo}
                disabled={!canManage}
              />
              <ToggleRow
                label="Enable barcode on documents"
                description="Show barcode on invoices and receipts"
                checked={enableBarcode}
                onChange={setEnableBarcode}
                disabled={!canManage}
              />
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  defaultValue,
  disabled
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="text-xs font-medium text-ledger-500 dark:text-ledger-400">
        {label} {required && <span className="text-alert">*</span>}
      </label>
      <Input id={name} name={name} type={type} required={required} defaultValue={defaultValue} disabled={disabled} />
    </div>
  );
}

function SocialField({
  icon: Icon,
  name,
  defaultValue,
  disabled
}: {
  icon: React.ComponentType<{ className?: string }>;
  name: string;
  defaultValue: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-ledger-200 px-3 dark:border-ledger-700">
      <Icon className="h-4 w-4 shrink-0 text-ledger-400" />
      <input
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        placeholder="https://…"
        className="h-10 w-full border-none bg-transparent text-sm outline-none disabled:opacity-60 dark:text-white"
      />
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-ledger-100 pt-3 dark:border-ledger-700">
      <div>
        <p className="text-sm font-medium text-ink-900 dark:text-white">{label}</p>
        <p className="text-xs text-ledger-400">{description}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}