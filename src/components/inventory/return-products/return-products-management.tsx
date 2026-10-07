"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight, BadgeCheck, Boxes, Building2, CalendarDays, Check, ClipboardCheck,
  Clock3, FileText, Package, Plus, Search, Send, ShieldAlert,
  Truck, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAppAlert } from "@/components/ui/app-alert-provider";
import { formatCurrency } from "@/lib/sales/format";
import {
  consolidateBranchProductReturns,
  createPurchaseReturnFromBranchConsolidation,
  recordBranchReturnSupplierResponse,
  reviewBranchProductReturn,
  type ReturnActionResult,
} from "@/app/(dashboard)/inventory/return-products/actions";

export interface ReturnProductRow {
  id: string;
  returnId: string;
  returnNumber: number;
  returnDate: string;
  createdAt: string;
  status: string;
  isConsolidated: boolean;
  branchId: string;
  branchName: string;
  requestedBy: string;
  destinationName: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitCost: number;
  returnValue: number;
  condition: string;
  reason: string;
  supplierId: string | null;
  supplierName: string | null;
  purchaseId: string | null;
  purchaseReference: string | null;
  originalTransferId: string | null;
}

export interface ReturnConsolidationRow {
  id: string;
  number: number;
  supplierName: string;
  supplierPhone: string | null;
  supplierEmail: string | null;
  purchaseReference: string;
  status: string;
  createdAt: string;
  purchaseReturnId: string | null;
  purchaseReturnStatus: string | null;
  acceptedQuantity: number | null;
  rejectedQuantity: number | null;
  responseNotes: string | null;
  totalQuantity: number;
  totalValue: number;
  itemIds: string[];
  outcomeItems: { id: string; productName: string; quantity: number }[];
  conditions: string[];
  reasons: string[];
  branches: string[];
  productSummary: string;
}

type ManagementTab = "branch" | "identification" | "consolidated" | "supplier" | "history";

const TABS: { id: ManagementTab; label: string; icon: typeof Package }[] = [
  { id: "branch", label: "Branch Returns", icon: Package },
  { id: "identification", label: "Pending Identification", icon: Search },
  { id: "consolidated", label: "Consolidated Returns", icon: Boxes },
  { id: "supplier", label: "Supplier Returns", icon: Truck },
  { id: "history", label: "Return History", icon: FileText },
];

function statusLabel(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusTone(status: string) {
  if (["completed", "accepted", "identified"].includes(status)) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (["rejected", "cancelled"].includes(status)) return "bg-rose-50 text-rose-700 ring-rose-200";
  if (["supplier_return_created", "consolidated"].includes(status)) return "bg-violet-50 text-violet-700 ring-violet-200";
  return "bg-amber-50 text-amber-800 ring-amber-200";
}

function ReturnStatus({ status }: { status: string }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 ring-inset ${statusTone(status)}`}>{statusLabel(status)}</span>;
}

function StatCard({ title, value, description, icon: Icon, tone }: {
  title: string;
  value: string;
  description: string;
  icon: typeof Package;
  tone: string;
}) {
  return (
    <Card className="overflow-hidden border-slate-200 shadow-sm">
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
          <p className="mt-1 text-[11px] text-slate-500">{description}</p>
        </div>
        <span className={`rounded-xl p-2.5 ${tone}`}><Icon className="h-4 w-4" /></span>
      </CardContent>
    </Card>
  );
}

export function ReturnProductsManagement({
  rows,
  consolidations,
  kpis,
  currency,
  canCreate,
  canManage,
  canCreateSupplierReturn,
  canRecordSupplierOutcome,
}: {
  rows: ReturnProductRow[];
  consolidations: ReturnConsolidationRow[];
  kpis: {
    pendingBranchReturns: number;
    totalUnitsReturned: number;
    totalReturnValue: number;
    pendingIdentification: number;
    consolidatedReturns: number;
    supplierReturnsIssued: number;
  };
  currency: string;
  canCreate: boolean;
  canManage: boolean;
  canCreateSupplierReturn: boolean;
  canRecordSupplierOutcome: boolean;
}) {
  const router = useRouter();
  const showAlert = useAppAlert();
  const [tab, setTab] = React.useState<ManagementTab>("branch");
  const [query, setQuery] = React.useState("");
  const [branch, setBranch] = React.useState("all");
  const [supplier, setSupplier] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  const [condition, setCondition] = React.useState("all");
  const [reason, setReason] = React.useState("all");
  const [fromDate, setFromDate] = React.useState("");
  const [toDate, setToDate] = React.useState("");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [outcomeGroup, setOutcomeGroup] = React.useState<ReturnConsolidationRow | null>(null);
  const [outcomeValues, setOutcomeValues] = React.useState<Record<string, { accepted: string; rejected: string }>>({});
  const [outcomeNotes, setOutcomeNotes] = React.useState("");
  const [busy, startTransition] = React.useTransition();
  const [page, setPage] = React.useState(1);
  const pageSize = 12;
  const deferredQuery = React.useDeferredValue(query);

  const branches = React.useMemo(() => [...new Set(rows.map((row) => row.branchName))].sort(), [rows]);
  const suppliers = React.useMemo(() => [...new Set(rows.map((row) => row.supplierName).filter((name): name is string => Boolean(name)))].sort(), [rows]);
  const conditions = React.useMemo(() => [...new Set(rows.map((row) => row.condition))].sort(), [rows]);
  const reasons = React.useMemo(() => [...new Set(rows.map((row) => row.reason))].sort(), [rows]);

  const visibleRows = React.useMemo(() => {
    const term = deferredQuery.trim().toLowerCase();
    return rows.filter((row) => {
      const tabMatch = tab === "history"
        || (tab === "branch" && ["pending_review", "pending_identification", "identified"].includes(row.status))
        || (tab === "identification" && row.status === "pending_identification" && !row.supplierId)
        || (tab === "consolidated" && ["consolidated", "supplier_return_created", "completed"].includes(row.status))
        || (tab === "supplier" && ["supplier_return_created", "completed"].includes(row.status));
      if (!tabMatch) return false;
      if (branch !== "all" && row.branchName !== branch) return false;
      if (supplier !== "all" && row.supplierName !== supplier) return false;
      if (status !== "all" && row.status !== status) return false;
      if (condition !== "all" && row.condition !== condition) return false;
      if (reason !== "all" && row.reason !== reason) return false;
      if (fromDate && row.returnDate < fromDate) return false;
      if (toDate && row.returnDate > toDate) return false;
      if (term && !`${row.returnNumber} ${row.branchName} ${row.productName} ${row.sku} ${row.supplierName ?? ""} ${row.reason}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [rows, tab, deferredQuery, branch, supplier, status, condition, reason, fromDate, toDate]);

  const pageCount = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = visibleRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectedRows = rows.filter((row) => selected.includes(row.id));

  function showResult(result: ReturnActionResult, successMessage: string) {
    if (!result.ok) {
      showAlert(result.error ?? "Please try again.", { title: "Return action failed", tone: "error" });
      return;
    }
    setSelected([]);
    showAlert(result.warning ? `${successMessage} ${result.warning}` : successMessage, {
      title: result.warning ? "Return updated with an audit warning" : "Return products updated",
      tone: result.warning ? "error" : "success",
    });
    router.refresh();
  }

  function handleReview(returnId: string) {
    startTransition(async () => {
      showResult(await reviewBranchProductReturn(returnId), "The return was reviewed and is ready for supplier identification.");
    });
  }

  function handleConsolidate() {
    if (!selected.length) return;
    startTransition(async () => {
      const result = await consolidateBranchProductReturns(selected);
      showResult(result, result.number ? `Consolidation #${String(result.number).padStart(6, "0")} was created.` : "The selected return items were consolidated.");
    });
  }

  function handleCreateSupplierReturn(consolidationId: string) {
    startTransition(async () => {
      const result = await createPurchaseReturnFromBranchConsolidation(consolidationId);
      showResult(result, result.number ? `Purchase Return #${String(result.number).padStart(4, "0")} was created.` : "The Purchase Return was created.");
    });
  }

  function openSupplierOutcome(group: ReturnConsolidationRow) {
    setOutcomeGroup(group);
    setOutcomeNotes("");
    setOutcomeValues(Object.fromEntries(group.outcomeItems.map((item) => [item.id, { accepted: "", rejected: "" }])));
  }

  function saveSupplierOutcome() {
    if (!outcomeGroup) return;
    startTransition(async () => {
      const result = await recordBranchReturnSupplierResponse(
        outcomeGroup.id,
        outcomeGroup.outcomeItems.map((item) => ({
          returnItemId: item.id,
          acceptedQuantity: Number(outcomeValues[item.id]?.accepted),
          rejectedQuantity: Number(outcomeValues[item.id]?.rejected),
        })),
        outcomeNotes,
      );
      if (result.ok) setOutcomeGroup(null);
      showResult(result, "Supplier acceptance and rejected quantities have been saved. Rejected goods were returned to quarantine stock.");
    });
  }

  function clearFilters() {
    setQuery("");
    setBranch("all");
    setSupplier("all");
    setStatus("all");
    setCondition("all");
    setReason("all");
    setFromDate("");
    setToDate("");
  }

  const tabConsolidations = (tab === "supplier"
    ? consolidations.filter((group) => Boolean(group.purchaseReturnId))
    : consolidations).filter((group) => {
      const term = deferredQuery.trim().toLowerCase();
      if (branch !== "all" && !group.branches.includes(branch)) return false;
      if (supplier !== "all" && group.supplierName !== supplier) return false;
      if (status !== "all" && group.status !== status) return false;
      if (condition !== "all" && !group.conditions.includes(condition)) return false;
      if (reason !== "all" && !group.reasons.includes(reason)) return false;
      if (fromDate && group.createdAt.slice(0, 10) < fromDate) return false;
      if (toDate && group.createdAt.slice(0, 10) > toDate) return false;
      if (term && !`${group.number} ${group.supplierName} ${group.purchaseReference} ${group.branches.join(" ")} ${group.productSummary}`.toLowerCase().includes(term)) return false;
      return true;
    });

  return (
    <div className="space-y-5 px-3 py-5 sm:px-5 lg:px-7">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] text-slate-500"><span>Inventory</span><span>/</span><span className="text-slate-700">Return Products Management</span></div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Return Products Management</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Review branch inventory returns, identify original suppliers, and prepare supplier returns without affecting sales.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/inventory/return-products/reports"><Button variant="outline" className="gap-2"><FileText className="h-4 w-4" />Reports</Button></Link>
          {canCreate && <Link href="/inventory/return-products/new"><Button className="gap-2"><Plus className="h-4 w-4" />New Branch Return</Button></Link>}
          {canManage && <Button variant="outline" disabled={!selected.length || busy} onClick={handleConsolidate} className="gap-2"><Boxes className="h-4 w-4" />Consolidate{selected.length ? ` (${selected.length})` : ""}</Button>}
        </div>
        {outcomeGroup && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOutcomeGroup(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="supplier-outcome-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-4"><h2 id="supplier-outcome-title" className="text-lg font-bold text-slate-900">Record Supplier Outcome</h2><p className="mt-1 text-xs text-slate-500">Enter accepted and rejected quantities per item. Each line must add up to the branch return quantity.</p></div>
            <div className="space-y-3">
              {outcomeGroup.outcomeItems.map((item) => <div key={item.id} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_120px_120px] sm:items-center">
                <div><p className="text-xs font-semibold text-slate-800">{item.productName}</p><p className="text-[10px] text-slate-500">Returned: {item.quantity}</p></div>
                <label className="space-y-1 text-[10px] font-medium text-slate-600">Accepted<Input type="number" min={0} max={item.quantity} step={1} value={outcomeValues[item.id]?.accepted ?? ""} onChange={(event) => setOutcomeValues((current) => ({ ...current, [item.id]: { ...current[item.id], accepted: event.target.value } }))} /></label>
                <label className="space-y-1 text-[10px] font-medium text-slate-600">Rejected<Input type="number" min={0} max={item.quantity} step={1} value={outcomeValues[item.id]?.rejected ?? ""} onChange={(event) => setOutcomeValues((current) => ({ ...current, [item.id]: { ...current[item.id], rejected: event.target.value } }))} /></label>
              </div>)}
            </div>
            <label className="mt-3 block space-y-1 text-xs font-medium text-slate-600">Supplier response notes<textarea value={outcomeNotes} onChange={(event) => setOutcomeNotes(event.target.value)} rows={3} className="w-full rounded-md border border-slate-200 p-2 text-xs" /></label>
            <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setOutcomeGroup(null)}>Cancel</Button><Button disabled={busy} onClick={saveSupplierOutcome}>{busy ? "Saving…" : "Save Outcome"}</Button></div>
          </section>
        </div>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard title="Pending Branch Returns" value={String(kpis.pendingBranchReturns)} description="Awaiting returns-office review" icon={Clock3} tone="bg-amber-50 text-amber-700" />
        <StatCard title="Total Units Returned" value={kpis.totalUnitsReturned.toLocaleString()} description="Units moved into return inventory" icon={Package} tone="bg-blue-50 text-blue-700" />
        <StatCard title="Total Return Value" value={formatCurrency(kpis.totalReturnValue, currency)} description="Recorded at existing product cost" icon={Boxes} tone="bg-emerald-50 text-emerald-700" />
        <StatCard title="Pending Identification" value={String(kpis.pendingIdentification)} description="Supplier or purchase source unknown" icon={Search} tone="bg-orange-50 text-orange-700" />
        <StatCard title="Consolidated Returns" value={String(kpis.consolidatedReturns)} description="Supplier- and purchase-matched groups" icon={ClipboardCheck} tone="bg-violet-50 text-violet-700" />
        <StatCard title="Supplier Returns Issued" value={String(kpis.supplierReturnsIssued)} description="Connected to Purchase Returns" icon={Truck} tone="bg-cyan-50 text-cyan-700" />
      </div>

      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-3 pt-3">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => { setTab(id); setSelected([]); }}
              className={`inline-flex shrink-0 items-center gap-2 rounded-t-lg px-3 py-2.5 text-xs font-semibold transition ${tab === id ? "border-b-2 border-blue-600 text-blue-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`}>
              <Icon className="h-3.5 w-3.5" />{label}
            </button>
          ))}
        </div>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="relative sm:col-span-2 lg:col-span-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search return, product, SKU…" className="pl-9" />
            </label>
            <select aria-label="Filter by branch" value={branch} onChange={(event) => setBranch(event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-xs">
              <option value="all">All branches</option>{branches.map((name) => <option key={name}>{name}</option>)}
            </select>
            <select aria-label="Filter by supplier" value={supplier} onChange={(event) => setSupplier(event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-xs">
              <option value="all">All suppliers</option>{suppliers.map((name) => <option key={name}>{name}</option>)}
            </select>
            <select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-xs">
              <option value="all">All statuses</option>{[...new Set([...rows.map((row) => row.status), ...consolidations.map((group) => group.status)])].sort().map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}
            </select>
            <select aria-label="Filter by condition" value={condition} onChange={(event) => setCondition(event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-xs">
              <option value="all">All conditions</option>{conditions.map((value) => <option key={value}>{value}</option>)}
            </select>
            <select aria-label="Filter by return reason" value={reason} onChange={(event) => setReason(event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-xs">
              <option value="all">All reasons</option>{reasons.map((value) => <option key={value}>{value}</option>)}
            </select>
            <label className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><Input aria-label="Start date" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="pl-9" /></label>
            <label className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><Input aria-label="End date" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="pl-9" /></label>
            <Button variant="ghost" className="justify-start gap-2 text-slate-500" onClick={clearFilters}><RotateCcw className="h-3.5 w-3.5" />Reset filters</Button>
          </div>

          {tab === "consolidated" || tab === "supplier" ? (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr><th className="px-3 py-3">Consolidation</th><th className="px-3 py-3">Supplier</th><th className="px-3 py-3">Purchase source</th><th className="px-3 py-3">Branches / Products</th><th className="px-3 py-3">Qty</th><th className="px-3 py-3">Value</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Action</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tabConsolidations.map((group) => (
                    <tr key={group.id} className="hover:bg-slate-50/70">
                      <td className="px-3 py-3 font-semibold text-blue-700">CON-{String(group.number).padStart(6, "0")}</td>
                      <td className="px-3 py-3"><div className="font-medium text-slate-800">{group.supplierName}</div><div className="text-[10px] text-slate-500">{group.supplierEmail ?? group.supplierPhone ?? ""}</div></td>
                      <td className="px-3 py-3 text-slate-600">{group.purchaseReference}</td>
                      <td className="max-w-[240px] px-3 py-3"><div className="text-slate-700">{group.branches.join(", ")}</div><div className="truncate text-[10px] text-slate-500">{group.productSummary}</div></td>
                      <td className="px-3 py-3 tabular-nums">{group.totalQuantity}</td>
                      <td className="px-3 py-3 tabular-nums">{formatCurrency(group.totalValue, currency)}</td>
                      <td className="px-3 py-3"><ReturnStatus status={group.status} /></td>
                      <td className="px-3 py-3 text-right">
                        {canCreateSupplierReturn && group.status === "ready" && <Button size="sm" disabled={busy} onClick={() => handleCreateSupplierReturn(group.id)} className="gap-1.5"><Send className="h-3.5 w-3.5" />Create Supplier Return</Button>}
                        {canRecordSupplierOutcome && group.status === "supplier_return_created" && group.purchaseReturnStatus === "approved" && <Button size="sm" variant="outline" disabled={busy} onClick={() => openSupplierOutcome(group)}>Record Supplier Outcome</Button>}
                        {canRecordSupplierOutcome && group.status === "supplier_return_created" && group.purchaseReturnStatus !== "approved" && <span className="text-[10px] text-amber-700">Approve Purchase Return first</span>}
                        {group.purchaseReturnId && <Link className="inline-flex items-center gap-1 text-blue-700 hover:underline" href={`/purchases/returns/${group.purchaseReturnId}`}>Open Purchase Return <ArrowRight className="h-3.5 w-3.5" /></Link>}
                      </td>
                    </tr>
                  ))}
                  {!tabConsolidations.length && <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-500">No consolidated returns match this view.</td></tr>}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[1000px] text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr><th className="w-9 px-3 py-3">{canManage && tab !== "history" ? <span className="sr-only">Select</span> : null}</th><th className="px-3 py-3">Return / Date</th><th className="px-3 py-3">Branch / Requested By</th><th className="px-3 py-3">Product</th><th className="px-3 py-3">Qty</th><th className="px-3 py-3">Value</th><th className="px-3 py-3">Supplier</th><th className="px-3 py-3">Condition / Reason</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Action</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageRows.map((row) => {
                    const canSelect = row.status === "identified" && !row.isConsolidated && Boolean(row.supplierId && row.purchaseId) && canManage;
                    const displayStatus = row.isConsolidated && row.status === "identified" ? "consolidated" : row.status;
                    return (
                      <tr key={row.id} className="hover:bg-slate-50/70">
                        <td className="px-3 py-3">
                          {canSelect && <input aria-label={`Select ${row.productName} for consolidation`} type="checkbox" checked={selected.includes(row.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id))} className="rounded border-slate-300 text-blue-600" />}
                        </td>
                        <td className="px-3 py-3"><Link href={`/inventory/return-products/${row.returnId}`} className="font-semibold text-blue-700 hover:underline">RET-{String(row.returnNumber).padStart(6, "0")}</Link><div className="mt-1 text-[10px] text-slate-500">{row.returnDate}</div></td>
                        <td className="px-3 py-3"><div className="inline-flex items-center gap-1.5 text-slate-700"><Building2 className="h-3.5 w-3.5 text-slate-400" />{row.branchName}</div><div className="mt-1 text-[10px] text-slate-500">{row.requestedBy}</div></td>
                        <td className="px-3 py-3"><div className="font-medium text-slate-800">{row.productName}</div><div className="text-[10px] text-slate-500">{row.sku}</div></td>
                        <td className="px-3 py-3 tabular-nums">{row.quantity}</td>
                        <td className="px-3 py-3 tabular-nums">{formatCurrency(row.returnValue, currency)}</td>
                        <td className="px-3 py-3 text-slate-700">{row.supplierName ?? <span className="text-slate-400">Unknown</span>}<div className="text-[10px] text-slate-500">{row.purchaseReference ?? ""}</div></td>
                        <td className="px-3 py-3"><div className="text-slate-700">{row.condition}</div><div className="text-[10px] text-slate-500">{row.reason}</div></td>
                        <td className="px-3 py-3"><ReturnStatus status={displayStatus} /></td>
                        <td className="px-3 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {canManage && row.status === "pending_review" && <Button size="sm" variant="outline" disabled={busy} onClick={() => handleReview(row.returnId)} className="gap-1.5"><Check className="h-3.5 w-3.5" />Review</Button>}
                            <Link href={`/inventory/return-products/${row.returnId}`} className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-blue-700 hover:underline">View <ArrowRight className="h-3.5 w-3.5" /></Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!pageRows.length && <tr><td colSpan={10} className="px-4 py-12 text-center text-slate-500">No branch returns match the selected filters.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-col gap-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <p>Showing {tab === "consolidated" || tab === "supplier" ? tabConsolidations.length : visibleRows.length} {tab === "consolidated" || tab === "supplier" ? "consolidations" : "return items"}</p>
            {tab !== "consolidated" && tab !== "supplier" && <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setPage((current) => Math.max(1, currentPage - 1))}>Previous</Button>
              <span>Page {currentPage} of {pageCount}</span>
              <Button size="sm" variant="outline" disabled={currentPage >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, currentPage + 1))}>Next</Button>
            </div>}
          </div>
          {canManage && selectedRows.length > 0 && <div className="flex flex-col gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 sm:flex-row sm:items-center sm:justify-between">
            <span>{selectedRows.length} identified item(s) selected. Consolidation is restricted to one supplier, purchase source, and destination.</span>
            <span className="inline-flex items-center gap-1 font-semibold"><ShieldAlert className="h-3.5 w-3.5" />System validates compatibility before saving.</span>
          </div>}
        </CardContent>
      </Card>
      <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-5 text-slate-600">
        <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
        Branch returns are separate inventory movements. They do not create sales, customer transactions, or sales-return records.
      </div>
    </div>
  );
}
