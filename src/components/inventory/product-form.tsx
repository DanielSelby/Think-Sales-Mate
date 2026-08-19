"use client";

import * as React from "react";
import Image from "next/image";
import { Loader2, Upload, X, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { uploadProductImage } from "@/app/(dashboard)/inventory/actions";

export interface ProductFormValues {
  sku?: string;
  name?: string;
  description?: string | null;
  category?: string | null;
  brand?: string | null;
  supplier?: string | null;
  barcode?: string | null;
  hsn_code?: string | null;
  location_id?: string | null;
  unit?: string;
  product_type?: "standard" | "service" | "digital";
  unit_price?: number;
  cost_price?: number | null;
  wholesale_price?: number | null;
  mrp?: number | null;
  tax_rate?: number | null;
  warranty_months?: number | null;
  expiry_date?: string | null;
  stock_quantity?: number;
  low_stock_threshold?: number;
  track_inventory?: boolean;
  allow_sale?: boolean;
  allow_purchase?: boolean;
  allow_negative_stock?: boolean;
  has_variants?: boolean;
  is_active?: boolean;
  tags?: string[];
  image_urls?: string[];
}

export interface ProductFormLocation {
  id: string;
  name: string;
}

const UNITS = ["pcs", "box", "kg", "g", "l", "ml", "m", "pack", "dozen"];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function makeSkuPreview() {
  const datePart = todayIso().replace(/-/g, "");
  const seq = String(Math.floor(1000 + Math.random() * 9000));
  return `TS-${datePart}-${seq}`;
}

function ToggleField({ name, checked, onChange }: { name: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center">
      <input type="checkbox" name={name} value="true" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span className="relative h-6 w-11 rounded-full bg-ledger-200 transition-colors peer-checked:bg-signal dark:bg-ledger-700">
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

function Checkbox({ name, defaultChecked, checked, onChange, label }: { name: string; defaultChecked?: boolean; checked?: boolean; onChange?: (v: boolean) => void; label: string }) {
  const controlled = checked !== undefined;
  return (
    <label className="flex items-center gap-2 text-sm text-ledger-700 dark:text-ledger-200">
      <input
        type="checkbox"
        name={name}
        value="true"
        defaultChecked={controlled ? undefined : defaultChecked}
        checked={controlled ? checked : undefined}
        onChange={controlled ? (e) => onChange?.(e.target.checked) : undefined}
        className="h-4 w-4 rounded border-ledger-300 accent-signal"
      />
      {label}
    </label>
  );
}

function FieldLabel({ htmlFor, children, optional }: { htmlFor?: string; children: React.ReactNode; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
      {children} {optional && <span className="font-normal text-ledger-400">(optional)</span>}
    </label>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-ink-900 dark:text-white">{title}</h2>
      {children}
    </div>
  );
}

export function ProductForm({
  action,
  initialValues,
  locations,
  categories = [],
  brands = [],
  error,
  submitLabel
}: {
  action: (formData: FormData) => void;
  initialValues?: ProductFormValues;
  locations: ProductFormLocation[];
  categories?: string[];
  brands?: string[];
  error?: string;
  submitLabel: string;
}) {
  const isEdit = !!initialValues?.sku;
  const [skuPreview] = React.useState(() => initialValues?.sku ?? makeSkuPreview());

  const [locationId, setLocationId] = React.useState(initialValues?.location_id ?? "");
  const [productType, setProductType] = React.useState(initialValues?.product_type ?? "standard");
  const [isService, setIsService] = React.useState(initialValues?.product_type === "service");

  const [trackExpiry, setTrackExpiry] = React.useState(!!initialValues?.expiry_date);
  const [trackWarranty, setTrackWarranty] = React.useState(initialValues?.warranty_months != null);
  const [trackInventory, setTrackInventory] = React.useState(initialValues?.track_inventory ?? true);
  const [isActive, setIsActive] = React.useState(initialValues?.is_active ?? true);

  const [costPrice, setCostPrice] = React.useState(initialValues?.cost_price != null ? String(initialValues.cost_price) : "");
  const [sellingPrice, setSellingPrice] = React.useState(initialValues?.unit_price != null ? String(initialValues.unit_price) : "");

  const [imageUrls, setImageUrls] = React.useState<string[]>(initialValues?.image_urls ?? []);
  const [uploading, setUploading] = React.useState(false);
  const [imageError, setImageError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [tags, setTags] = React.useState<string[]>(initialValues?.tags ?? []);
  const [tagInput, setTagInput] = React.useState("");

  const cost = parseFloat(costPrice) || 0;
  const selling = parseFloat(sellingPrice) || 0;
  const profitAmount = selling - cost;
  const profitMargin = cost > 0 ? (profitAmount / cost) * 100 : 0;

  async function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return;
    setImageError(null);
    const remaining = Math.max(0, 5 - imageUrls.length);
    const toUpload = Array.from(files).slice(0, remaining);
    if (toUpload.length === 0) {
      setImageError("You can upload up to 5 images.");
      return;
    }
    setUploading(true);
    for (const file of toUpload) {
      const fd = new FormData();
      fd.append("image", file);
      const result = await uploadProductImage(fd);
      if (result.error) {
        setImageError(result.error);
      } else if (result.url) {
        setImageUrls((prev) => [...prev, result.url!]);
      }
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeImage(url: string) {
    setImageUrls((prev) => prev.filter((u) => u !== url));
  }

  function addTag(raw: string) {
    const t = raw.trim();
    if (!t || tags.includes(t)) return;
    setTags((prev) => [...prev, t]);
    setTagInput("");
  }
  function removeTag(t: string) {
    setTags((prev) => prev.filter((x) => x !== t));
  }

  return (
    <form action={action} className="space-y-4">
      {error && <p className="rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p>}
      {imageError && <p className="rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{imageError}</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        {/* LEFT column */}
        <div className="space-y-4">
          <SectionCard title="Basic Information">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-2">
                <FieldLabel htmlFor="name">Product Name *</FieldLabel>
                <Input id="name" name="name" required defaultValue={initialValues?.name} placeholder="Enter product name" />
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="category">Category</FieldLabel>
                <Input id="category" name="category" list="category-options" defaultValue={initialValues?.category ?? ""} placeholder="Select category" />
                <datalist id="category-options">{categories.map((c) => <option key={c} value={c} />)}</datalist>
              </div>

              <div className="space-y-1.5">
                <FieldLabel htmlFor="brand">Brand</FieldLabel>
                <Input id="brand" name="brand" list="brand-options" defaultValue={initialValues?.brand ?? ""} placeholder="Select brand" />
                <datalist id="brand-options">{brands.map((b) => <option key={b} value={b} />)}</datalist>
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="sku_display">Auto SKU</FieldLabel>
                <Input id="sku_display" value={skuPreview} readOnly disabled className="cursor-not-allowed bg-ledger-50 font-mono dark:bg-white/[0.04]" />
                <p className="text-xs text-signal">{isEdit ? "SKU can't be changed after creation." : "SKU will be generated automatically"}</p>
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="barcode" optional>Barcode</FieldLabel>
                <Input id="barcode" name="barcode" defaultValue={initialValues?.barcode ?? ""} placeholder="Enter barcode" />
              </div>

              <div className="space-y-1.5">
                <FieldLabel htmlFor="hsn_code" optional>HSN / Code</FieldLabel>
                <Input id="hsn_code" name="hsn_code" defaultValue={initialValues?.hsn_code ?? ""} placeholder="Enter HSN or product code" />
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="unit">Unit *</FieldLabel>
                <Select id="unit" name="unit" required defaultValue={initialValues?.unit ?? "pcs"}>
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </Select>
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="product_type">Product Type</FieldLabel>
                <Select
                  id="product_type"
                  name="product_type"
                  value={productType}
                  onChange={(e) => { const v = e.target.value as "standard" | "service" | "digital"; setProductType(v); setIsService(v === "service"); }}
                >
                  <option value="standard">Standard</option>
                  <option value="service">Service</option>
                  <option value="digital">Digital</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <FieldLabel htmlFor="tax_rate" optional>Tax Rate (%)</FieldLabel>
                <Input id="tax_rate" name="tax_rate" type="number" step="0.01" min="0" defaultValue={initialValues?.tax_rate ?? ""} placeholder="Select tax rate" />
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="location_id">Default Location *</FieldLabel>
                <Select id="location_id" name="location_id" required value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                  <option value="" disabled>Select location</option>
                  {locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                </Select>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor="expiry_date" optional>Expiry Date</FieldLabel>
                  <Checkbox name="_expiry_toggle" checked={trackExpiry} onChange={setTrackExpiry} label="" />
                </div>
                <Input id="expiry_date" name="expiry_date" type="date" disabled={!trackExpiry} defaultValue={initialValues?.expiry_date ?? ""} className="disabled:cursor-not-allowed disabled:opacity-50" />
              </div>

              <div className="space-y-1.5 sm:col-span-1">
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor="warranty_months" optional>Warranty (Months)</FieldLabel>
                  <Checkbox name="_warranty_toggle" checked={trackWarranty} onChange={setTrackWarranty} label="" />
                </div>
                <Input id="warranty_months" name="warranty_months" type="number" min="0" disabled={!trackWarranty} defaultValue={initialValues?.warranty_months ?? ""} placeholder="Enter warranty in months" className="disabled:cursor-not-allowed disabled:opacity-50" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <FieldLabel htmlFor="supplier" optional>Supplier</FieldLabel>
                <Input id="supplier" name="supplier" defaultValue={initialValues?.supplier ?? ""} placeholder="Acme Distributors" />
              </div>
            </div>

            <div className="mt-4 space-y-1.5">
              <FieldLabel htmlFor="description" optional>Description</FieldLabel>
              <textarea
                id="description"
                name="description"
                maxLength={500}
                rows={3}
                defaultValue={initialValues?.description ?? ""}
                placeholder="Enter product description..."
                className="w-full rounded-md border border-ledger-200 bg-white px-3 py-2 text-sm text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
              />
            </div>
          </SectionCard>

          <SectionCard title="Product Images (optional)">
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || imageUrls.length >= 5}
                className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-ledger-200 text-center text-[10px] text-ledger-400 hover:border-signal hover:text-signal disabled:cursor-not-allowed disabled:opacity-50 dark:border-ledger-700"
              >
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                <span className="px-1 leading-tight">Drag & drop or click to browse</span>
              </button>
              {imageUrls.map((url) => (
                <div key={url} className="relative h-24 w-24 overflow-hidden rounded-md border border-ledger-100 dark:border-ledger-700">
                  <Image src={url} alt="Product" fill className="object-cover" unoptimized />
                  <button type="button" onClick={() => removeImage(url)} className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-alert text-white">
                    <X className="h-3 w-3" />
                  </button>
                  <input type="hidden" name="image_urls" value={url} />
                </div>
              ))}
              {imageUrls.length < 5 && (
                <button type="button" onClick={() => fileInputRef.current?.click()} className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-ledger-200 text-ledger-400 hover:border-signal hover:text-signal dark:border-ledger-700">
                  <Plus className="h-5 w-5" />
                  <span className="text-[10px]">Add More</span>
                </button>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e) => handleFilesSelected(e.target.files)} />
            <p className="mt-2 text-xs text-ledger-400">PNG, JPG or WEBP (Max. 2MB each) — up to 5 images.</p>
          </SectionCard>

          <SectionCard title="Additional Options">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Checkbox name="allow_sale" defaultChecked={initialValues?.allow_sale ?? true} label="Allow Sale" />
              <Checkbox name="allow_purchase" defaultChecked={initialValues?.allow_purchase ?? true} label="Allow Purchase" />
              <Checkbox name="allow_negative_stock" defaultChecked={initialValues?.allow_negative_stock ?? false} label="Allow Negative Stock" />
              <Checkbox name="has_variants" defaultChecked={initialValues?.has_variants ?? false} label="Product has Variants" />
              <Checkbox
                name="_is_service"
                checked={isService}
                onChange={(v) => { setIsService(v); setProductType(v ? "service" : "standard"); }}
                label="Service Product"
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-ledger-100 pt-4 dark:border-ledger-700">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-ledger-700 dark:text-ledger-200">Product Status</span>
                <ToggleField name="is_active" checked={isActive} onChange={setIsActive} />
                <span className={cn("text-sm font-medium", isActive ? "text-signal" : "text-ledger-400")}>{isActive ? "Active" : "Inactive"}</span>
              </div>
            </div>

            <div className="mt-3 space-y-1.5">
              <FieldLabel htmlFor="tag_input">Product Tags</FieldLabel>
              <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-ledger-200 p-2 dark:border-ledger-700">
                {tags.map((t) => (
                  <span key={t} className="flex items-center gap-1 rounded-full bg-signal-soft px-2 py-1 text-xs font-medium text-signal">
                    {t}
                    <button type="button" onClick={() => removeTag(t)}><X className="h-3 w-3" /></button>
                    <input type="hidden" name="tags" value={t} />
                  </span>
                ))}
                <input
                  id="tag_input"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(tagInput); } }}
                  placeholder="Search or add tags"
                  className="min-w-[120px] flex-1 border-none bg-transparent text-sm outline-none dark:text-white"
                />
              </div>
              <p className="text-xs text-ledger-400">Press Enter to add a tag</p>
            </div>
          </SectionCard>
        </div>

        {/* RIGHT column */}
        <div className="space-y-4">
          <SectionCard title="Pricing Information">
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1.5">
                <FieldLabel htmlFor="cost_price">Cost Price *</FieldLabel>
                <Input id="cost_price" name="cost_price" type="number" step="0.01" min="0" required value={costPrice} onChange={(e) => setCostPrice(e.target.value)} placeholder="Enter cost price" />
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="unit_price">Selling Price *</FieldLabel>
                <Input id="unit_price" name="unit_price" type="number" step="0.01" min="0" required value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} placeholder="Enter selling price" />
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="wholesale_price" optional>Wholesale Price</FieldLabel>
                <Input id="wholesale_price" name="wholesale_price" type="number" step="0.01" min="0" defaultValue={initialValues?.wholesale_price ?? ""} placeholder="Enter wholesale price" />
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="mrp" optional>MRP</FieldLabel>
                <Input id="mrp" name="mrp" type="number" step="0.01" min="0" defaultValue={initialValues?.mrp ?? ""} placeholder="Enter MRP" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <FieldLabel>Profit Margin</FieldLabel>
                  <div className="flex h-10 items-center rounded-md bg-ledger-50 px-3 text-sm font-semibold text-ledger-500 dark:bg-white/[0.04] dark:text-ledger-300">{profitMargin.toFixed(2)}%</div>
                </div>
                <div className="space-y-1.5">
                  <FieldLabel>Profit Amount</FieldLabel>
                  <div className="flex h-10 items-center rounded-md bg-ledger-50 px-3 text-sm font-semibold text-ledger-500 dark:bg-white/[0.04] dark:text-ledger-300">{profitAmount.toFixed(2)}</div>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Inventory Information">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-ledger-700 dark:text-ledger-200">Track Inventory</span>
              <ToggleField name="track_inventory" checked={trackInventory} onChange={setTrackInventory} />
            </div>
            <div className={cn("space-y-4", !trackInventory && "opacity-50")}>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="stock_quantity">Initial Stock</FieldLabel>
                <Input id="stock_quantity" name="stock_quantity" type="number" min="0" disabled={!trackInventory} defaultValue={initialValues?.stock_quantity ?? 0} placeholder="Enter initial stock" />
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="low_stock_threshold">Reorder Level</FieldLabel>
                <Input id="low_stock_threshold" name="low_stock_threshold" type="number" min="0" disabled={!trackInventory} defaultValue={initialValues?.low_stock_threshold ?? 5} placeholder="Enter reorder level" />
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="pref_location">Preferred Location</FieldLabel>
                <Select id="pref_location" disabled value={locationId}>
                  <option value="">Select location</option>
                  {locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                </Select>
                <p className="text-xs text-ledger-400">Mirrors Default Location above — this catalog only tracks one location per product.</p>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t border-ledger-100 pt-4 dark:border-ledger-700">
        <Button type="button" variant="outline" onClick={() => history.back()}>Cancel</Button>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}