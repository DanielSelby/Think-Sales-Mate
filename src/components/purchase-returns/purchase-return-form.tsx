"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Info, Trash2, ChevronRight, Loader2, MoreHorizontal, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/sales/format";
import {
  formatReturnNumber, RETURN_REASONS, ITEM_CONDITIONS, REFUND_METHODS, REFUND_STATUSES,
} from "@/lib/purchase-returns/format";
import { OrderPicker } from "@/components/purchase-returns/order-picker";
import { AttachmentsDropzone, type StagedFile } from "@/components/purchases/attachments-dropzone";
import {
  getPurchaseForReturn, createPurchaseReturn, type EligiblePurchase, type PurchaseForReturn, type ReturnableLine,
} from "@/app/(dashboard)/purchases/returns/actions";

export interface LocationOption { id: string; name: string; }
export interface BankAccountOption { id: string; name: string; }
export interface ReturnOverviewSlice { reason: string; count: number; }
export interface TopSupplierByReturnValue { name: string; total: number; }
export interface RecentReturn { id: string; returnNumber: number; reason: string; createdAt: string; }

interface PurchaseReturnFormProps {
  locations: LocationOption[];
  bankAccounts: BankAccountOption[];
  currency: string;
  overview: ReturnOverviewSlice[];
  topSuppliers: TopSupplierByReturnValue[];
  recentReturns: RecentReturn[];
}

interface LineState extends ReturnableLine {
  batchSerial: string;
  returnQty: string;
  returnReason: string;
  condition: string;
}

const DONUT_COLORS = ["#1d8f5e", "#a8781f", "#68655c", "#b8402f", "#b3ab97", "#8b8677"];

export function PurchaseReturnForm({ locations, bankAccounts, currency, overview, topSuppliers, recentReturns }: PurchaseReturnFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [loadingPurchase, setLoadingPurchase] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [purchase, setPurchase] = React.useState<PurchaseForReturn | null>(null);
  const [locationId, setLocationId] = React.useState("");
  const [returnReason, setReturnReason] = React.useState<string>(RETURN_REASONS[0]);
  const [invoiceNumber, setInvoiceNumber] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [returnDate] = React.useState(() => new Date().toISOString().slice(0, 10));

  const [notes, setNotes] = React.useState("");
  const [internalNotes, setInternalNotes] = React.useState("");
  const [notesTab, setNotesTab] = React.useState<"purchase" | "internal">("purchase");
  const [paymentStatus, setPaymentStatus] = React.useState("Unpaid");

  const [lines, setLines] = React.useState<LineState[]>([]);
  const [restockingFee, setRestockingFee] = React.useState(0);
  const [taxAdjustment, setTaxAdjustment] = React.useState(0);

  const [refundMethod, setRefundMethod] = React.useState<string>(REFUND_METHODS[0]);
  const [paymentAccount, setPaymentAccount] = React.useState(bankAccounts[0]?.name ?? "");
  const [refundStatus, setRefundStatus] = React.useState<string>(REFUND_STATUSES[0]);
  const [attachments, setAttachments] = React.useState<StagedFile[]>([]);
  const [itemSearch, setItemSearch] = React.useState("");

  function loadPurchase(selected: EligiblePurchase) {
    setLoadingPurchase(true);
    setError(null);
    getPurchaseForReturn(selected.id).then((data) => {
      setLoadingPurchase(false);
      if (!data) {
        setError("Couldn't load that purchase order.");
        return;
      }
      setPurchase(data);
      setLocationId(data.locationId);
      setLines(
        data.lines.map((l) => ({
          ...l,
          batchSerial: "",
          returnQty: l.remaining > 0 ? "0" : "0",
          returnReason: RETURN_REASONS[0],
          condition: ITEM_CONDITIONS[1],
        }))
      );
    });
  }

  function updateLine(purchaseItemId: string, patch: Partial<LineState>) {
    setLines((prev) => prev.map((l) => (l.purchaseItemId === purchaseItemId ? { ...l, ...patch } : l)));
  }
  function removeLine(purchaseItemId: string) {
    setLines((prev) => prev.filter((l) => l.purchaseItemId !== purchaseItemId));
  }

  const activeLines = lines.filter((l) => Number(l.returnQty) > 0);
  const visibleLines = lines.filter((line) => {
    const query = itemSearch.trim().toLowerCase();
    return !query || `${line.productName} ${line.sku}`.toLowerCase().includes(query);
  });
  const totalReturnQty = activeLines.reduce((sum, l) => sum + Number(l.returnQty), 0);
  const totalReturnValue = activeLines.reduce((sum, l) => sum + Number(l.returnQty) * l.unitCost, 0);
  const refundAmount = Math.max(0, totalReturnValue - restockingFee + taxAdjustment);

  function submit(action: "draft" | "submitted") {
    setError(null);
    if (!purchase) return setError("Select an original purchase order first.");
    if (!locationId) return setError("Select a receiving location.");

    for (const l of lines) {
      const qty = Number(l.returnQty);
      if (qty > l.remaining) {
        setError(`Return quantity for ${l.productName} can't exceed ${l.remaining} (already returned: ${l.alreadyReturned}).`);
        return;
      }
    }
    if (activeLines.length === 0) return setError("Add a return quantity for at least one item.");

    startTransition(async () => {
      const result = await createPurchaseReturn({
        purchaseId: purchase.purchaseId,
        supplierId: purchase.supplierId,
        locationId,
        returnReason,
        invoiceNumber: invoiceNumber || null,
        reference: reference || null,
        notes: notes || null,
        internalNotes: internalNotes || null,
        paymentStatus,
        refundMethod,
        paymentAccount: paymentAccount || null,
        refundStatus,
        restockingFee,
        taxAdjustment,
        lines: activeLines.map((l) => ({
          purchaseItemId: l.purchaseItemId,
          productId: l.productId,
          batchSerial: l.batchSerial || null,
          purchasedQty: l.purchasedQty,
          returnQty: Number(l.returnQty),
          unitCost: l.unitCost,
          returnReason: l.returnReason,
          condition: l.condition,
        })),
        action,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.push(`/purchases/returns/${result.returnId}`);
    });
  }

  const donutTotal = overview.reduce((sum, o) => sum + o.count, 0);
  const maxSupplierTotal = Math.max(1, ...topSuppliers.map((s) => s.total));

  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">Purchase Return</h1>
          <p className="mt-1 flex items-center gap-1 text-sm text-ledger-500 dark:text-ledger-400">
            Purchases <ChevronRight className="h-3.5 w-3.5" /> Purchase Returns <ChevronRight className="h-3.5 w-3.5" /> New Return
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-md border border-ledger-100 bg-white px-4 py-2 text-right text-sm dark:border-ledger-700 dark:bg-ink-900">
            <p className="text-xs text-ledger-400">Return No.</p>
            <p className="font-mono font-medium text-ink-900 dark:text-white">Auto-generated on save</p>
          </div>
          <div className="rounded-md border border-ledger-100 bg-white px-4 py-2 text-right text-sm dark:border-ledger-700 dark:bg-ink-900">
            <p className="text-xs text-ledger-400">Return Date</p>
            <p className="font-medium text-ink-900 dark:text-white">{returnDate}</p>
          </div>
          </div>
      </div>

      <div className="flex items-center gap-3 px-2">
        {[
          ["1", "Return Info", true],
          ["2", "Items", Boolean(purchase)],
          ["3", "Review & Approval", false],
        ].map(([number, label, complete], index) => (
          <React.Fragment key={String(number)}>
            <div className="flex min-w-0 items-center gap-2">
              <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold", complete ? "bg-signal text-white" : "border border-ledger-200 bg-white text-ledger-400 dark:border-ledger-600 dark:bg-ink-900")}>{number}</span>
              <span className={cn("text-xs font-semibold", complete ? "text-signal" : "text-ledger-400")}>{label}</span>
            </div>
            {index < 2 && <div className="h-px flex-1 bg-ledger-200 dark:bg-ledger-700" />}
          </React.Fragment>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {/* Info grid */}
          <Card accent="neutral" className="border-l border-l-ledger-100 shadow-sm dark:border-l-ledger-700">
            <CardHeader className="border-b border-ledger-100 pb-3 dark:border-ledger-700">
              <CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Return Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 pt-4 md:grid-cols-3">
              <div className="space-y-3">
                <Field label="Original Purchase Order" required>
                  <OrderPicker onSelect={loadPurchase} selectedLabel={purchase ? formatReturnNumber(purchase.purchaseNumber).replace("PR-", "PO-") : null} />
                </Field>
                {loadingPurchase && <p className="flex items-center gap-2 text-sm text-ledger-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading purchase...</p>}
                <Field label="Supplier">
                  <Input value={purchase?.supplierName ?? ""} disabled className="opacity-70" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Contact Person"><Input value={purchase?.contactPerson ?? ""} disabled className="opacity-70" /></Field>
                  <Field label="Phone"><Input value={purchase?.phone ?? ""} disabled className="opacity-70" /></Field>
                </div>
                <Field label="Email"><Input value={purchase?.email ?? ""} disabled className="opacity-70" /></Field>
              </div>
              <div className="space-y-3">
                <Field label="Return Date" required><Input type="date" value={returnDate} readOnly /></Field>
                <Field label="Receiving Location" required>
                  <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                    <option value="" disabled>Select location</option>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </Select>
                </Field>
                <Field label="Return Reason">
                  <Select value={returnReason} onChange={(e) => setReturnReason(e.target.value)}>
                    {RETURN_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </Select>
                </Field>
                <Field label="Invoice No.">
                  <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="e.g. INV-2025-04567" />
                </Field>
                <Field label="Reference / Description">
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Short description" />
                </Field>
              </div>
              <div className="space-y-3">
                <Field label="Notes">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Some items were damaged during transport. Supplier to be notified."
                    className="flex w-full rounded-md border border-ledger-200 bg-white px-3 py-2 text-sm placeholder:text-ledger-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                  />
                </Field>
                <Field label="Payment Status">
                  <Select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
                    <option value="Unpaid">Unpaid</option>
                    <option value="Partially Paid">Partially Paid</option>
                    <option value="Paid">Paid</option>
                  </Select>
                </Field>
                <Field label="Approval Status"><Input value="Pending Approval" readOnly /></Field>
              </div>
            </CardContent>
          </Card>

          {/* Returned items table */}
          <Card accent="neutral" className="shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Returned Items</CardTitle>
                <div className="relative w-64">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ledger-400" />
                  <Input value={itemSearch} onChange={(event) => setItemSearch(event.target.value)} placeholder="Search product, SKU or barcode..." className="h-8 pl-8 text-xs" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {!purchase ? (
                <p className="py-10 text-center text-sm text-ledger-400">Select an original purchase order above to load its items.</p>
              ) : (
                <div className="overflow-x-auto rounded-md border border-ledger-100 dark:border-ledger-700">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-ledger-100 bg-ledger-50/60 text-xs text-ledger-400 dark:border-ledger-700 dark:bg-white/[0.03]">
                        <th className="w-8 px-3 py-2 font-medium">#</th>
                        <th className="px-3 py-2 font-medium">Product</th>
                        <th className="px-3 py-2 font-medium">SKU</th>
                        <th className="w-32 px-3 py-2 font-medium">Batch / Serial</th>
                        <th className="w-20 px-3 py-2 text-right font-medium">Purchased</th>
                        <th className="w-20 px-3 py-2 text-right font-medium">Return Qty</th>
                        <th className="w-24 px-3 py-2 text-right font-medium">Unit Cost</th>
                        <th className="w-28 px-3 py-2 text-right font-medium">Return Value</th>
                        <th className="w-36 px-3 py-2 font-medium">Reason</th>
                        <th className="w-32 px-3 py-2 font-medium">Condition</th>
                        <th className="w-10 px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700">
                      {visibleLines.map((l, i) => (
                        <tr key={l.purchaseItemId}>
                          <td className="px-3 py-2 text-ledger-400">{i + 1}</td>
                          <td className="px-3 py-2 text-ink-900 dark:text-white">{l.productName}</td>
                          <td className="px-3 py-2 font-mono text-xs text-ledger-500">{l.sku}</td>
                          <td className="px-3 py-2">
                            <input
                              value={l.batchSerial}
                              onChange={(e) => updateLine(l.purchaseItemId, { batchSerial: e.target.value })}
                              placeholder="—"
                              className="h-8 w-full rounded border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                            />
                          </td>
                          <td className="px-3 py-2 text-right text-ledger-500">{l.purchasedQty}</td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              max={l.remaining}
                              value={l.returnQty}
                              disabled={l.remaining === 0}
                              onChange={(e) => updateLine(l.purchaseItemId, { returnQty: e.target.value })}
                              className="h-8 w-full rounded border border-ledger-200 bg-white px-2 text-right text-sm disabled:opacity-40 dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                            />
                          </td>
                          <td className="px-3 py-2 text-right text-ledger-500">{l.unitCost.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-mono font-medium text-ink-900 dark:text-white">
                            {(Number(l.returnQty) * l.unitCost).toFixed(2)}
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={l.returnReason}
                              onChange={(e) => updateLine(l.purchaseItemId, { returnReason: e.target.value })}
                              className="h-8 w-full rounded border border-ledger-200 bg-white px-1.5 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                            >
                              {RETURN_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={l.condition}
                              onChange={(e) => updateLine(l.purchaseItemId, { condition: e.target.value })}
                              className="h-8 w-full rounded border border-ledger-200 bg-white px-1.5 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                            >
                              {ITEM_CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button onClick={() => removeLine(l.purchaseItemId)} className="rounded p-1.5 text-alert/70 hover:bg-alert-soft hover:text-alert">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Attachments / Refund / Notes */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <Card accent="neutral">
              <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Attachments</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <AttachmentsDropzone files={attachments} onChange={setAttachments} />
              </CardContent>
            </Card>

            <Card accent="neutral">
              <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Refund Details</CardTitle></CardHeader>
              <CardContent className="space-y-3 pt-0">
                <Field label="Refund Method">
                  <Select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)}>
                    {REFUND_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </Select>
                </Field>
                <Field label="Payment Account">
                  <Select value={paymentAccount} onChange={(e) => setPaymentAccount(e.target.value)}>
                    <option value="">Select account</option>
                    {bankAccounts.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
                  </Select>
                </Field>
                <Field label="Refund Status">
                  <Select value={refundStatus} onChange={(e) => setRefundStatus(e.target.value)}>
                    {REFUND_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </Field>
              </CardContent>
            </Card>

            <Card accent="neutral">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-4">
                  <button onClick={() => setNotesTab("purchase")} className={cn("text-[13px] font-semibold pb-1", notesTab === "purchase" ? "border-b-2 border-signal text-ink-900 dark:text-white" : "text-ledger-400")}>Purchase Notes</button>
                  <button onClick={() => setNotesTab("internal")} className={cn("text-[13px] font-semibold pb-1", notesTab === "internal" ? "border-b-2 border-signal text-ink-900 dark:text-white" : "text-ledger-400")}>Internal Notes</button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {notesTab === "purchase" ? (
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={5}
                    placeholder="Add any additional notes..."
                    className="flex w-full rounded-md border border-ledger-200 bg-white px-3 py-2 text-sm placeholder:text-ledger-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                  />
                ) : (
                  <textarea
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    rows={5}
                    placeholder="Not shown to the supplier..."
                    className="flex w-full rounded-md border border-ledger-200 bg-white px-3 py-2 text-sm placeholder:text-ledger-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <Card accent="signal" className="shadow-sm xl:sticky xl:top-2">
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Return Summary</CardTitle></CardHeader>
            <CardContent className="space-y-2.5 pt-0 text-sm">
              <SummaryRow label="Total Products" value={`${activeLines.length}`} />
              <SummaryRow label="Total Return Quantity" value={`${totalReturnQty}`} />
              <SummaryRow label="Subtotal" value={formatCurrency(totalReturnValue, currency)} />
              <SummaryRow label="Discount" value={formatCurrency(0, currency)} />
              <SummaryRow label="Tax" value={formatCurrency(taxAdjustment, currency)} />
              <div className="flex items-center justify-between gap-2">
                <span className="text-ledger-500">Restocking Fee</span>
                <input type="number" min={0} step="0.01" value={restockingFee} onChange={(e) => setRestockingFee(Number(e.target.value))} className="h-8 w-24 rounded border border-ledger-200 bg-white px-2 text-right text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-ledger-500">Tax Adjustment</span>
                <input type="number" step="0.01" value={taxAdjustment} onChange={(e) => setTaxAdjustment(Number(e.target.value))} className="h-8 w-24 rounded border border-ledger-200 bg-white px-2 text-right text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white" />
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-ledger-100 pt-3 dark:border-ledger-700">
                <span className="font-medium text-ink-900 dark:text-white">Total Return Value</span>
                <span className="font-display text-lg font-semibold text-signal">{formatCurrency(refundAmount, currency)}</span>
              </div>
              <div className="mt-4 rounded-lg bg-signal/10 p-3 text-xs text-signal">Return will be processed and stock updated after approval.</div>
              <div className="mt-4 space-y-2 border-t border-ledger-100 pt-4 text-xs dark:border-ledger-700">
                <SummaryRow label="Return Status" value="Draft" />
                <SummaryRow label="Approval Status" value="Pending" />
                <SummaryRow label="Prepared By" value="Current user" />
              </div>
            </CardContent>
          </Card>

          <Card accent="neutral">
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Return Overview</CardTitle></CardHeader>
            <CardContent className="pt-0">
              {donutTotal === 0 ? (
                <p className="text-sm text-ledger-400">No return history yet.</p>
              ) : (
                <>
                  <div className="relative mx-auto h-36 w-36">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={overview.map((o, i) => ({ name: o.reason, value: o.count, color: DONUT_COLORS[i % DONUT_COLORS.length] }))} dataKey="value" innerRadius={42} outerRadius={62} paddingAngle={2}>
                          {overview.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} stroke="none" />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="font-display text-lg font-semibold text-ink-900 dark:text-white">{donutTotal}</span>
                      <span className="text-[10px] text-ledger-400">Items</span>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {overview.map((o, i) => (
                      <div key={o.reason} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-ledger-500"><span className="h-2 w-2 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} /> {o.reason}</span>
                        <span className="font-medium text-ink-900 dark:text-white">{o.count} ({Math.round((o.count / donutTotal) * 100)}%)</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card accent="neutral">
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Top Suppliers (By Return Value)</CardTitle></CardHeader>
            <CardContent className="space-y-3 pt-0">
              {topSuppliers.length === 0 && <p className="text-sm text-ledger-400">No returns yet.</p>}
              {topSuppliers.map((s) => (
                <div key={s.name}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="truncate text-ink-900 dark:text-white">{s.name}</span>
                    <span className="font-mono text-xs text-ledger-500">{formatCurrency(s.total, currency)}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-ledger-100 dark:bg-white/[0.06]">
                    <div className="h-1.5 rounded-full bg-amber" style={{ width: `${(s.total / maxSupplierTotal) * 100}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card accent="neutral">
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Recent Purchase Returns</CardTitle></CardHeader>
            <CardContent className="space-y-2.5 pt-0">
              {recentReturns.length === 0 && <p className="text-sm text-ledger-400">No returns yet.</p>}
              {recentReturns.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-mono text-signal">{formatReturnNumber(r.returnNumber)}</p>
                    <p className="text-xs text-ledger-400">{r.reason}</p>
                  </div>
                  <span className="text-xs text-ledger-400">{new Date(r.createdAt).toLocaleDateString("en-GH", { day: "2-digit", month: "short" })}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-alert/30 bg-alert-soft px-4 py-2.5 text-sm text-alert">
          <Info className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ledger-100 bg-white/95 px-6 py-3 backdrop-blur dark:border-ledger-700 dark:bg-ink-900/95">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between">
          <Button variant="outline" size="md" onClick={() => router.back()} disabled={isPending}>Cancel</Button>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="md" onClick={() => submit("draft")} disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save Draft
            </Button>
            <Button variant="primary" size="md" onClick={() => submit("submitted")} disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />} Submit Return
            </Button>
            <Button variant="ghost" size="md" disabled title="Approve after submitting, from the return's detail page">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ledger-500">{label} {required && <span className="text-alert">*</span>}</span>
      {children}
    </label>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ledger-500">{label}</span>
      <span className="font-medium text-ink-900 dark:text-white">{value}</span>
    </div>
  );
}