"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Clock3, FileText, Link2, Package, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAppAlert } from "@/components/ui/app-alert-provider";
import { formatCurrency } from "@/lib/sales/format";
import { AttachmentsDropzone, type StagedFile } from "@/components/purchases/attachments-dropzone";
import { identifyBranchProductReturnItem, reviewBranchProductReturn, uploadBranchProductReturnAttachments } from "@/app/(dashboard)/inventory/return-products/actions";

export interface ReturnDetailData {
  id: string;
  number: number;
  date: string;
  createdAt: string;
  status: string;
  sourceLocationId: string;
  sourceLocationName: string;
  destinationLocationName: string;
  requestedBy: string;
  reason: string;
  priority: string;
  notes: string | null;
  items: {
    id: string;
    productId: string;
    productName: string;
    sku: string;
    quantity: number;
    unitCost: number;
    value: number;
    condition: string;
    reason: string;
    inspectionNotes: string | null;
    originalTransferId: string | null;
    supplierId: string | null;
    supplierName: string | null;
    purchaseItemId: string | null;
    purchaseReference: string | null;
    purchaseUnitCost: number | null;
    purchaseMatches: {
      purchaseItemId: string;
      purchaseId: string;
      supplierId: string;
      supplierName: string;
      purchaseNumber: number;
      purchaseReference: string;
      purchaseDate: string;
      unitCost: number;
      quantity: number;
    }[];
  }[];
  auditEvents: { id: string; action: string; at: string; actorId: string | null; description: string }[];
  attachments: { id: string; name: string; url: string; contentType: string; size: number }[];
}

function formatStatus(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function BranchProductReturnDetails({ data, currency, canManage, canAttach }: {
  data: ReturnDetailData;
  currency: string;
  canManage: boolean;
  canAttach: boolean;
}) {
  const router = useRouter();
  const showAlert = useAppAlert();
  const [busy, startTransition] = React.useTransition();
  const [selections, setSelections] = React.useState<Record<string, string>>({});
  const [attachmentDraft, setAttachmentDraft] = React.useState<StagedFile[]>([]);

  function review() {
    startTransition(async () => {
      const result = await reviewBranchProductReturn(data.id);
      if (!result.ok) {
        showAlert(result.error ?? "Could not review the return.", { title: "Review failed", tone: "error" });
        return;
      }
      showAlert(result.warning ?? "The return is now awaiting supplier identification.", {
        title: result.warning ? "Return reviewed with an audit warning" : "Return reviewed",
        tone: result.warning ? "error" : "success",
      });
      router.refresh();
    });
  }

  function identify(itemId: string) {
    const purchaseItemId = selections[itemId];
    if (!purchaseItemId) {
      showAlert("Choose the correct supplier and original purchase line first.", { title: "Select a purchase match", tone: "error" });
      return;
    }
    startTransition(async () => {
      const result = await identifyBranchProductReturnItem(itemId, purchaseItemId);
      if (!result.ok) {
        showAlert(result.error ?? "Could not identify this supplier.", { title: "Supplier identification failed", tone: "error" });
        return;
      }
      showAlert(result.warning ?? "The original purchase record is linked to this return item.", {
        title: result.warning ? "Supplier identified with an audit warning" : "Supplier identified",
        tone: result.warning ? "error" : "success",
      });
      router.refresh();
    });
  }

  function uploadAttachments() {
    if (!attachmentDraft.length) return;
    const formData = new FormData();
    attachmentDraft.forEach(({ file }) => formData.append("files", file));
    startTransition(async () => {
      const result = await uploadBranchProductReturnAttachments(data.id, formData);
      if (!result.ok) {
        showAlert(result.error ?? "The files could not be linked to this return.", { title: "Attachment upload failed", tone: "error" });
        return;
      }
      setAttachmentDraft([]);
      showAlert(result.warning ?? "The supporting files were added to the return record.", {
        title: result.warning ? "Attachments saved with an audit warning" : "Attachments uploaded",
        tone: result.warning ? "error" : "success",
      });
      router.refresh();
    });
  }

  const totalQuantity = data.items.reduce((sum, item) => sum + item.quantity, 0);
  const totalValue = data.items.reduce((sum, item) => sum + item.value, 0);
  const timeline = [
    ["Created", true],
    ["Submitted", true],
    ["Review", data.status !== "pending_review"],
    ["Supplier Identification", ["identified", "consolidated", "supplier_return_created", "completed"].includes(data.status)],
    ["Consolidated", ["consolidated", "supplier_return_created", "completed"].includes(data.status)],
    ["Supplier Return", ["supplier_return_created", "completed"].includes(data.status)],
    ["Completed", data.status === "completed"],
  ] as const;

  return (
    <div className="space-y-5 px-3 py-5 sm:px-5 lg:px-7">
      <div>
        <Link href="/inventory/return-products" className="mb-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-blue-700"><ArrowLeft className="h-3.5 w-3.5" />Return Products Management</Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold tracking-tight text-slate-900">RET-{String(data.number).padStart(6, "0")}</h1><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">{formatStatus(data.status)}</span></div><p className="mt-1 text-sm text-slate-500">Branch inventory return · {data.date}</p></div>
          {canManage && data.status === "pending_review" && <Button disabled={busy} onClick={review} className="gap-2"><Check className="h-4 w-4" />Review Return</Button>}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
              {[["Source Branch", data.sourceLocationName], ["Returns Office", data.destinationLocationName], ["Return Date", data.date], ["Priority", data.priority], ["Requested By", data.requestedBy], ["Reason", data.reason], ["Total Items", String(data.items.length)], ["Total Quantity", String(totalQuantity)]].map(([label, value]) => <div key={label}><p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-xs font-semibold text-slate-800">{value}</p></div>)}
              {data.notes && <div className="sm:col-span-2 lg:col-span-4"><p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Notes</p><p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">{data.notes}</p></div>}
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Package className="h-4 w-4 text-blue-600" />Return Items</h2><span className="text-xs font-semibold text-slate-600">{formatCurrency(totalValue, currency)}</span></div>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[780px] text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2.5">Product / SKU</th><th className="px-3 py-2.5">Qty</th><th className="px-3 py-2.5">Cost / Value</th><th className="px-3 py-2.5">Condition / Reason</th><th className="px-3 py-2.5">Supplier / Purchase</th><th className="px-3 py-2.5">Trace / Identify</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.items.map((item) => (
                      <tr key={item.id} className="align-top">
                        <td className="px-3 py-3"><p className="font-medium text-slate-800">{item.productName}</p><p className="text-[10px] text-slate-500">{item.sku}</p></td>
                        <td className="px-3 py-3 tabular-nums">{item.quantity}</td>
                        <td className="px-3 py-3"><p>{formatCurrency(item.unitCost, currency)} / unit</p><p className="font-semibold">{formatCurrency(item.value, currency)}</p></td>
                        <td className="px-3 py-3"><p>{item.condition}</p><p className="text-[10px] text-slate-500">{item.reason}</p>{item.inspectionNotes && <p className="mt-1 max-w-44 text-[10px] text-slate-500">{item.inspectionNotes}</p>}</td>
                        <td className="px-3 py-3"><p>{item.supplierName ?? <span className="text-slate-400">Unknown</span>}</p><p className="text-[10px] text-slate-500">{item.purchaseReference ?? "Not identified"}</p></td>
                        <td className="px-3 py-3">
                          {item.originalTransferId && <Link href={`/inventory/transfers/${item.originalTransferId}`} className="mb-2 inline-flex items-center gap-1 text-[10px] text-blue-700 hover:underline"><Link2 className="h-3 w-3" />Original transfer</Link>}
                          {!item.supplierId && canManage && ["pending_identification", "identified"].includes(data.status) ? (
                            <div className="min-w-52 space-y-2">
                              <select aria-label={`Purchase match for ${item.productName}`} value={selections[item.id] ?? ""} onChange={(event) => setSelections((current) => ({ ...current, [item.id]: event.target.value }))} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-[10px]">
                                <option value="">Choose a historical purchase</option>
                                {item.purchaseMatches.map((match) => <option key={match.purchaseItemId} value={match.purchaseItemId}>{match.supplierName} · {match.purchaseReference} · {match.purchaseDate} · {formatCurrency(match.unitCost, currency)}</option>)}
                              </select>
                              <Button size="sm" variant="outline" disabled={busy || !item.purchaseMatches.length} onClick={() => identify(item.id)} className="h-8 gap-1.5 text-[10px]"><Search className="h-3 w-3" />Identify Supplier</Button>
                              {!item.purchaseMatches.length && <p className="text-[10px] text-amber-700">No received purchase match found for this product.</p>}
                            </div>
                          ) : item.supplierId ? <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700"><ShieldCheck className="h-3 w-3" />Purchase confirmed · {formatCurrency(item.purchaseUnitCost ?? item.unitCost, currency)}</span> : <span className="text-[10px] text-slate-400">Pending identification</span>}
                        </td>
                      </tr>
                    ))}
                    {!data.items.length && <tr><td colSpan={6} className="p-8 text-center text-slate-500">No return items were found.</td></tr>}
                  </tbody>
                </table>
              </div>
              {data.status === "identified" && canManage && <div className="rounded-md bg-violet-50 p-3 text-xs text-violet-800">All items are identified. Go to the return list to select compatible items for consolidation.</div>}
            </CardContent>
          </Card>
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="space-y-3 p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><FileText className="h-4 w-4 text-blue-600" />Supporting Attachments</h2>
              {data.attachments.length ? <ul className="space-y-2">{data.attachments.map((file) => <li key={file.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-100 p-2"><div className="min-w-0"><p className="truncate text-xs font-medium text-slate-700">{file.name}</p><p className="text-[10px] text-slate-400">{Math.ceil(file.size / 1024)} KB</p></div><a href={file.url} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-medium text-blue-700 hover:underline">Open</a></li>)}</ul> : <p className="text-xs text-slate-500">No supporting files attached.</p>}
              {canAttach && <div className="space-y-2 border-t border-slate-100 pt-3"><AttachmentsDropzone files={attachmentDraft} onChange={setAttachmentDraft} /><Button size="sm" disabled={busy || !attachmentDraft.length} onClick={uploadAttachments}>Upload Files</Button></div>}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="space-y-4 p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Clock3 className="h-4 w-4 text-blue-600" />Status Timeline</h2>
              <ol className="space-y-0">
                {timeline.map(([label, complete], index) => <li key={label} className="flex gap-3">
                  <div className="flex flex-col items-center"><span className={`flex h-5 w-5 items-center justify-center rounded-full ${complete ? "bg-blue-600 text-white" : "border border-slate-300 text-slate-300"}`}>{complete ? <Check className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}</span>{index < timeline.length - 1 && <span className={`my-1 min-h-5 w-px flex-1 ${complete ? "bg-blue-300" : "bg-slate-200"}`} />}</div>
                  <div className="pb-4 text-xs"><p className={complete ? "font-semibold text-slate-800" : "text-slate-400"}>{label}</p>{label === "Created" && <p className="mt-0.5 text-[10px] text-slate-400">{new Date(data.createdAt).toLocaleString()}</p>}</div>
                </li>)}
              </ol>
              <div className="rounded-md border border-blue-100 bg-blue-50 p-3 text-[10px] leading-4 text-blue-800">This return moves inventory from the branch into returns/quarantine stock; no sale, customer account, or sales report is created.</div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardContent className="space-y-3 p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><FileText className="h-4 w-4 text-blue-600" />Audit History</h2>
              <ol className="space-y-3">
                {data.auditEvents.map((event) => <li key={event.id} className="border-l-2 border-slate-200 pl-3"><p className="text-xs font-medium capitalize text-slate-700">{event.description}</p><p className="mt-1 text-[10px] text-slate-400">{new Date(event.at).toLocaleString()}</p></li>)}
                {!data.auditEvents.length && <li className="text-xs text-slate-500">Return submitted {new Date(data.createdAt).toLocaleString()}</li>}
              </ol>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
