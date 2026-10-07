"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, MapPin, Package, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAppAlert } from "@/components/ui/app-alert-provider";
import { formatCurrency } from "@/lib/sales/format";
import { AttachmentsDropzone, type StagedFile } from "@/components/purchases/attachments-dropzone";
import { createBranchProductReturn, uploadBranchProductReturnAttachments, type BranchReturnItemInput } from "@/app/(dashboard)/inventory/return-products/actions";

export interface ReturnFormLocation { id: string; name: string; }
export interface ReturnFormProduct {
  id: string;
  name: string;
  sku: string;
  locationId: string;
  available: number;
  unitCost: number;
  unit: string;
  transfers: { id: string; label: string }[];
}

interface LineDraft {
  key: number;
  productId: string;
  quantity: string;
  condition: string;
  reason: string;
  inspectionNotes: string;
  transferId: string;
}

const REASONS = ["Broken", "Faulty", "Defective", "Damaged", "Expired", "Packaging Damage", "Wrong Product", "Quality Issue", "Missing Parts", "Other"];
const CONDITIONS = ["Damaged", "Broken", "Faulty", "Defective", "Expired", "Unsellable", "Awaiting Inspection", "Good"];
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

function emptyLine(key: number): LineDraft {
  return { key, productId: "", quantity: "", condition: "Awaiting Inspection", reason: "Damaged", inspectionNotes: "", transferId: "" };
}

export function NewBranchReturnForm({
  locations,
  destinations,
  products,
  currency,
}: {
  locations: ReturnFormLocation[];
  destinations: ReturnFormLocation[];
  products: ReturnFormProduct[];
  currency: string;
}) {
  const router = useRouter();
  const showAlert = useAppAlert();
  const [busy, startTransition] = React.useTransition();
  const [sourceLocationId, setSourceLocationId] = React.useState(locations[0]?.id ?? "");
  const [destinationLocationId, setDestinationLocationId] = React.useState(destinations[0]?.id ?? "");
  const [returnDate, setReturnDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [returnReason, setReturnReason] = React.useState("Damaged");
  const [otherReason, setOtherReason] = React.useState("");
  const [priority, setPriority] = React.useState<(typeof PRIORITIES)[number]>("normal");
  const [notes, setNotes] = React.useState("");
  const [lines, setLines] = React.useState<LineDraft[]>([emptyLine(1)]);
  const [nextKey, setNextKey] = React.useState(2);
  const [attachments, setAttachments] = React.useState<StagedFile[]>([]);

  const availableProducts = products.filter((product) => product.locationId === sourceLocationId);
  const selectedProductIds = new Set(lines.map((line) => line.productId).filter(Boolean));
  const itemCount = lines.filter((line) => line.productId && Number(line.quantity) > 0).length;
  const totalQuantity = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
  const totalValue = lines.reduce((sum, line) => {
    const product = products.find((candidate) => candidate.id === line.productId && candidate.locationId === sourceLocationId);
    return sum + (product?.unitCost ?? 0) * (Number(line.quantity) || 0);
  }, 0);

  function changeSource(locationId: string) {
    setSourceLocationId(locationId);
    setLines((current) => current.map((line) => emptyLine(line.key)));
  }

  function patchLine(key: number, patch: Partial<LineDraft>) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  }

  function addLine() {
    setLines((current) => [...current, emptyLine(nextKey)]);
    setNextKey((value) => value + 1);
  }

  function removeLine(key: number) {
    setLines((current) => current.length === 1 ? [emptyLine(key)] : current.filter((line) => line.key !== key));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = returnReason === "Other" ? otherReason.trim() : returnReason;
    const items: BranchReturnItemInput[] = lines
      .filter((line) => line.productId)
      .map((line) => ({
        productId: line.productId,
        quantity: Number(line.quantity),
        condition: line.condition,
        reason: line.reason === "Other" ? line.inspectionNotes.trim() || "Other" : line.reason,
        inspectionNotes: line.inspectionNotes || null,
        transferId: line.transferId || null,
      }));
    if (!sourceLocationId || !destinationLocationId) {
      showAlert("Choose the source branch and returns destination.", { title: "Missing location", tone: "error" });
      return;
    }
    if (!reason) {
      showAlert("Enter a reason for selecting Other.", { title: "Return reason required", tone: "error" });
      return;
    }
    if (!items.length || items.length !== lines.filter((line) => Number(line.quantity) > 0).length) {
      showAlert("Choose a product and enter a positive whole-number quantity on every item.", { title: "Check return items", tone: "error" });
      return;
    }
    if (attachments.length > 10) {
      showAlert("A maximum of 10 evidence files can be attached to one return.", { title: "Too many attachments", tone: "error" });
      return;
    }
    if (lines.some((line) => line.reason === "Other" && !line.inspectionNotes.trim())) {
      showAlert("Describe the reason when selecting Other for a return item.", { title: "Item reason details required", tone: "error" });
      return;
    }
    for (const line of lines) {
      const product = products.find((candidate) => candidate.id === line.productId && candidate.locationId === sourceLocationId);
      if (!product || !Number.isInteger(Number(line.quantity)) || Number(line.quantity) < 1 || Number(line.quantity) > product.available) {
        showAlert("The return quantity must be a positive whole number no greater than available branch stock.", { title: "Invalid return quantity", tone: "error" });
        return;
      }
    }
    startTransition(async () => {
      const result = await createBranchProductReturn({
        sourceLocationId,
        destinationLocationId,
        returnDate,
        returnReason: reason,
        priority,
        notes,
        items,
      });
      if (!result.ok || !result.id) {
        showAlert(result.error ?? "Please review the information and try again.", { title: "Could not submit return", tone: "error" });
        return;
      }
      if (attachments.length) {
        const formData = new FormData();
        attachments.forEach(({ file }) => formData.append("files", file));
        const uploadResult = await uploadBranchProductReturnAttachments(result.id, formData);
        if (!uploadResult.ok) {
          showAlert(uploadResult.error ?? "The inventory return was recorded, but some evidence files could not be saved. Open the return to upload them again.", {
            title: "Return submitted; attachment upload failed",
            tone: "error",
          });
          router.push(`/inventory/return-products/${result.id}`);
          router.refresh();
          return;
        }
      }
      showAlert(`RET-${String(result.number ?? 0).padStart(6, "0")} has been recorded. Stock was moved to the returns location.`, {
        title: "Branch return submitted",
        tone: "success",
      });
      router.push(`/inventory/return-products/${result.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5 px-3 py-5 sm:px-5 lg:px-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/inventory/return-products" className="mb-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-blue-700"><ArrowLeft className="h-3.5 w-3.5" />Return Products Management</Link>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">New Branch Return</h1>
          <p className="mt-1 text-sm text-slate-500">Submit damaged or otherwise returnable inventory to an authorized returns warehouse.</p>
        </div>
        <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">Pending Review</span>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="space-y-4 p-4 sm:p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><FileText className="h-4 w-4 text-blue-600" />Return Information</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="space-y-1.5 text-xs font-medium text-slate-600">Return Number<Input value="Generated on submission" readOnly className="bg-slate-50" /></label>
                <label className="space-y-1.5 text-xs font-medium text-slate-600">Source Branch<select required value={sourceLocationId} onChange={(event) => changeSource(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-xs"><option value="">Select branch</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
                <label className="space-y-1.5 text-xs font-medium text-slate-600">Return Date<Input type="date" required value={returnDate} onChange={(event) => setReturnDate(event.target.value)} /></label>
                <label className="space-y-1.5 text-xs font-medium text-slate-600">Return Reason<select value={returnReason} onChange={(event) => setReturnReason(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-xs">{REASONS.map((reason) => <option key={reason}>{reason}</option>)}</select></label>
                {returnReason === "Other" && <label className="space-y-1.5 text-xs font-medium text-slate-600">Reason details<Input required value={otherReason} onChange={(event) => setOtherReason(event.target.value)} placeholder="Describe the reason" /></label>}
                <label className="space-y-1.5 text-xs font-medium text-slate-600">Priority<select value={priority} onChange={(event) => setPriority(event.target.value as (typeof PRIORITIES)[number])} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-xs">{PRIORITIES.map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
                <label className="space-y-1.5 text-xs font-medium text-slate-600 sm:col-span-2">Destination / Returns Office<select required value={destinationLocationId} onChange={(event) => setDestinationLocationId(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-xs"><option value="">Select returns office</option>{destinations.filter((location) => location.id !== sourceLocationId).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
              </div>
              <label className="block space-y-1.5 text-xs font-medium text-slate-600">Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={2000} placeholder="Additional information for the returns office…" className="w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></label>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Package className="h-4 w-4 text-blue-600" />Return Items</h2>
                <Button type="button" variant="outline" size="sm" onClick={addLine} className="gap-1.5"><Plus className="h-3.5 w-3.5" />Add Product</Button>
              </div>
              <div className="space-y-3">
                {lines.map((line, index) => {
                  const product = products.find((candidate) => candidate.id === line.productId && candidate.locationId === sourceLocationId);
                  return (
                    <div key={line.key} className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-2 xl:grid-cols-[minmax(190px,1.5fr)_80px_90px_120px_130px_130px_minmax(150px,1fr)_36px] xl:items-end">
                      <label className="space-y-1.5 text-xs font-medium text-slate-600 md:col-span-2 xl:col-span-1">Product / SKU<select required value={line.productId} onChange={(event) => patchLine(line.key, { productId: event.target.value, quantity: "", transferId: "" })} className="h-10 w-full rounded-md border border-slate-200 bg-white px-2 text-xs"><option value="">Select product</option>{availableProducts.filter((candidate) => !selectedProductIds.has(candidate.id) || candidate.id === line.productId).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.sku}</option>)}</select></label>
                      <div className="text-xs text-slate-500"><span className="mb-1 block font-medium">Available</span><div className="flex h-10 items-center rounded-md bg-slate-50 px-3 tabular-nums">{product?.available ?? "—"} {product?.unit ?? ""}</div></div>
                      <label className="space-y-1.5 text-xs font-medium text-slate-600">Return Qty<Input type="number" min={1} max={product?.available ?? undefined} step={1} required={Boolean(product)} disabled={!product} value={line.quantity} onChange={(event) => patchLine(line.key, { quantity: event.target.value })} /></label>
                      <div className="text-xs text-slate-500"><span className="mb-1 block font-medium">Unit Cost</span><div className="flex h-10 items-center rounded-md bg-slate-50 px-3">{product ? formatCurrency(product.unitCost, currency) : "—"}</div></div>
                      <label className="space-y-1.5 text-xs font-medium text-slate-600">Condition<select value={line.condition} onChange={(event) => patchLine(line.key, { condition: event.target.value })} className="h-10 w-full rounded-md border border-slate-200 bg-white px-2 text-xs">{CONDITIONS.map((condition) => <option key={condition}>{condition}</option>)}</select></label>
                      <label className="space-y-1.5 text-xs font-medium text-slate-600">Original Transfer<select value={line.transferId} onChange={(event) => patchLine(line.key, { transferId: event.target.value })} disabled={!product || !product.transfers.length} className="h-10 w-full rounded-md border border-slate-200 bg-white px-2 text-xs"><option value="">Not identified</option>{product?.transfers.map((transfer) => <option key={transfer.id} value={transfer.id}>{transfer.label}</option>)}</select></label>
                      <label className="space-y-1.5 text-xs font-medium text-slate-600">Item Reason<select value={line.reason} onChange={(event) => patchLine(line.key, { reason: event.target.value })} className="h-10 w-full rounded-md border border-slate-200 bg-white px-2 text-xs">{REASONS.map((reason) => <option key={reason}>{reason}</option>)}</select></label>
                      <label className="space-y-1.5 text-xs font-medium text-slate-600 md:col-span-2 xl:col-span-1">Inspection Notes<Input value={line.inspectionNotes} onChange={(event) => patchLine(line.key, { inspectionNotes: event.target.value })} placeholder="Describe the issue" /></label>
                      <Button type="button" variant="ghost" size="sm" aria-label={`Remove item ${index + 1}`} onClick={() => removeLine(line.key)} className="justify-self-end px-2 text-slate-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  );
                })}
              </div>
              {!availableProducts.length && <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-800">No products with available inventory were found for this branch.</p>}
            </CardContent>
          </Card>
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="space-y-3 p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-slate-900">Supporting Attachments</h2>
              <p className="text-xs text-slate-500">Attach product photos, inspection documents, or supplier correspondence (PDF, JPG, PNG; 5 MB each).</p>
              <AttachmentsDropzone files={attachments} onChange={setAttachments} />
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-200 shadow-sm xl:sticky xl:top-4">
          <CardContent className="space-y-4 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><MapPin className="h-4 w-4 text-blue-600" />Return Summary</h2>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between gap-2"><span className="text-slate-500">Line items</span><span className="font-semibold text-slate-800">{itemCount}</span></div>
              <div className="flex justify-between gap-2"><span className="text-slate-500">Total units</span><span className="font-semibold text-slate-800">{totalQuantity}</span></div>
              <div className="border-t border-slate-100 pt-3"><div className="flex justify-between gap-2"><span className="text-slate-500">Return value</span><span className="font-bold text-slate-900">{formatCurrency(totalValue, currency)}</span></div><p className="mt-1 text-[10px] text-slate-400">Calculated from existing product cost; confirmed again on the server.</p></div>
              <div className="rounded-md bg-blue-50 p-3 leading-5 text-blue-800">Submitting atomically moves the quantities from this branch into returns/quarantine stock. This is not a sale or sales return.</div>
            </div>
            <div className="flex flex-col gap-2 border-t border-slate-100 pt-4">
              <Button type="submit" disabled={busy || !products.length || !sourceLocationId || !destinationLocationId}>{busy ? "Submitting…" : "Submit Branch Return"}</Button>
              <Link href="/inventory/return-products"><Button type="button" variant="outline" className="w-full">Cancel</Button></Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
