"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  CalendarDays, Download, Eye, FileSpreadsheet, FileText, Filter, MoreVertical,
  Pencil, Plus, Search, Trash2, X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { KpiFlipCard } from "@/components/charts/kpi-flip-card";
import { deleteDraftSale, type DraftSaleRow } from "@/app/(dashboard)/sales/actions";
import { formatCurrency, formatDateTime, formatInvoiceNumber } from "@/lib/sales/format";
import { cn } from "@/lib/utils";

export interface BranchRequestRow {
  id: string;
  label: string;
  source: string;
  destination: string;
  createdAt: string;
  totalQuantity: number;
  status: string;
  transferId: string | null;
}

const DOC_STATUS_LABEL: Record<DraftSaleRow["documentStatus"], string> = {
  draft: "Draft",
  quotation: "Quotation",
  proforma: "Proforma",
};

const DOC_STATUS_TONE: Record<DraftSaleRow["documentStatus"], "neutral" | "amber" | "signal"> = {
  draft: "neutral",
  quotation: "amber",
  proforma: "signal",
};

export function DraftsListView({ drafts, currency, branchRequests = [] }: { drafts: DraftSaleRow[]; currency: string; branchRequests?: BranchRequestRow[] }) {
  const [rows, setRows] = useState(drafts);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | DraftSaleRow["documentStatus"]>("all");
  const [dateRange, setDateRange] = useState("all");
  const [showFilters, setShowFilters] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [activeTab, setActiveTab] = useState<"documents" | "requests">("documents");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const cutoff = dateRange === "all" ? null : Date.now() - Number(dateRange) * 86400000;
    return rows.filter((row) => {
      if (type !== "all" && row.documentStatus !== type) return false;
      if (cutoff && new Date(row.createdAt).getTime() < cutoff) return false;
      if (normalized && !`${formatInvoiceNumber(row.saleNumber)} ${row.customerName}`.toLowerCase().includes(normalized)) return false;
      return true;
    });
  }, [dateRange, query, rows, type]);

  const totals = useMemo(() => ({
    draft: rows.filter((row) => row.documentStatus === "draft").reduce((sum, row) => sum + row.total, 0),
    quotation: rows.filter((row) => row.documentStatus === "quotation").reduce((sum, row) => sum + row.total, 0),
    proforma: rows.filter((row) => row.documentStatus === "proforma").reduce((sum, row) => sum + row.total, 0),
  }), [rows]);

  function clearFilters() {
    setQuery("");
    setType("all");
    setDateRange("all");
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this draft? This can't be undone.")) return;
    setPendingId(id);
    startTransition(async () => {
      const result = await deleteDraftSale(id);
      setPendingId(null);
      if (!result.ok) {
        setNotice({ message: result.error ?? "Couldn't delete this draft.", tone: "error" });
        return;
      }
      setRows((current) => current.filter((row) => row.id !== id));
      setNotice({ message: "Document deleted.", tone: "success" });
      window.setTimeout(() => setNotice(null), 3000);
    });
  }

  return (
    <div className="space-y-4 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs text-ledger-400">Sales &gt; Sales Documents</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-ink-900 dark:text-white">Sales Documents</h1>
          <p className="text-sm text-ledger-500 dark:text-ledger-400">Manage your sales drafts, quotations and proformas</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="md"><Download className="h-4 w-4" /> Export</Button>
          <Link href="/sales/new" className="inline-flex h-9 items-center gap-2 rounded-md bg-ink-900 px-4 text-sm font-medium text-white shadow-sm hover:bg-ink-950 dark:bg-white dark:text-ink-900">
            <Plus className="h-4 w-4" /> New Document
          </Link>
        </div>
      </div>

      <nav className="flex items-center gap-6 overflow-x-auto border-b border-ledger-100 dark:border-ledger-700">
        {[
          ["Drafts", "/sales/drafts", FileText, true],
          ["Quotations", "/sales/drafts", FileText, false],
          ["Proformas", "/sales/drafts", FileText, false],
          ["Sales Orders", "/sales", FileSpreadsheet, false],
          ["Invoices", "/sales", FileText, false],
          ["Credit Notes", "/sales", FileText, false],
        ].map(([label, href, Icon, active]) => {
          const TabIcon = Icon as typeof FileText;
          return <Link key={String(label)} href={String(href)} onClick={() => setActiveTab("documents")} className={cn("flex shrink-0 items-center gap-2 border-b-2 px-1 pb-3 text-xs font-medium", active && activeTab === "documents" ? "border-signal text-signal" : "border-transparent text-ledger-500 hover:border-ledger-300 hover:text-ink-900")}>
            <TabIcon className="h-3.5 w-3.5" /> {String(label)}
          </Link>;
        }).concat([
          <button key="branch-requests" type="button" onClick={() => setActiveTab("requests")} className={cn("flex shrink-0 items-center gap-2 border-b-2 px-1 pb-3 text-xs font-medium", activeTab === "requests" ? "border-signal text-signal" : "border-transparent text-ledger-500 hover:border-ledger-300 hover:text-ink-900")}>
            <FileText className="h-3.5 w-3.5" /> Branch Requests
          </button>
        ])}
      </nav>

      {activeTab === "requests" ? (
        <Card accent="neutral" className="overflow-hidden rounded-2xl shadow-card">
          <div className="border-b border-ledger-100 px-4 py-3 text-xs text-ledger-500 dark:border-ledger-700">{branchRequests.length} branch requests</div>
          <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b border-ledger-100 bg-ledger-50/60 text-ledger-500"><th className="px-4 py-3">Request</th><th className="px-3 py-3">From</th><th className="px-3 py-3">Requesting Branch</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">Qty</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-ledger-100 dark:divide-ledger-700">
            {branchRequests.map((request) => <tr key={request.id}><td className="px-4 py-3 font-mono font-medium text-signal">{request.label}</td><td className="px-3 py-3">{request.source}</td><td className="px-3 py-3">{request.destination}</td><td className="px-3 py-3">{new Date(request.createdAt).toLocaleDateString()}</td><td className="px-3 py-3">{request.totalQuantity}</td><td className="px-3 py-3"><Badge tone={request.status === "approved" || request.status === "completed" ? "signal" : request.status === "rejected" ? "alert" : "neutral"}>{request.status.replace("_", " ")}</Badge></td><td className="px-3 py-3 text-right">            <Link href={`/inventory/transfers/new?requestId=${request.id}`} className="rounded-md border border-ledger-200 px-2 py-1 font-medium text-signal hover:bg-signal-soft">Review & Edit</Link>{request.transferId && <Link href={`/inventory/transfers/${request.transferId}`} className="ml-2 text-signal underline">Transfer</Link>}</td></tr>)}
            {!branchRequests.length && <tr><td colSpan={7} className="px-4 py-14 text-center text-ledger-400">No branch requests found.</td></tr>}
          </tbody></table></div>
        </Card>
      ) : <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiFlipCard color="green" label="Total Drafts" value={`${rows.filter((row) => row.documentStatus === "draft").length}`} icon={<FileText className="h-full w-full" />} detail={formatCurrency(totals.draft, currency)} />
        <KpiFlipCard color="blue" label="Total Quotations" value={`${rows.filter((row) => row.documentStatus === "quotation").length}`} icon={<FileText className="h-full w-full" />} detail={formatCurrency(totals.quotation, currency)} />
        <KpiFlipCard color="purple" label="Total Proformas" value={`${rows.filter((row) => row.documentStatus === "proforma").length}`} icon={<FileSpreadsheet className="h-full w-full" />} detail={formatCurrency(totals.proforma, currency)} />
        <KpiFlipCard color="amber" label="Total Sales Value" value={formatCurrency(rows.reduce((sum, row) => sum + row.total, 0), currency)} icon={<FileText className="h-full w-full" />} detail="Total value of all saved sales documents." />
      </div>

      <Card accent="neutral" className="rounded-2xl shadow-card">
        <CardContent className="pt-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink-900 dark:text-white"><Filter className="h-4 w-4 text-signal" /> Filters</div>
            <button type="button" onClick={() => setShowFilters((value) => !value)} className="text-xs font-medium text-signal">{showFilters ? "Hide Filters" : "Show Filters"} <span className="ml-2" onClick={(event) => { event.stopPropagation(); clearFilters(); }}>Clear</span></button>
          </div>
          {showFilters && <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="relative md:col-span-2"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ledger-400" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by number, customer or reference..." className="pl-9" /></div>
            <div><label className="mb-1 block text-xs font-medium text-ledger-500">Document Type</label><Select value={type} onChange={(event) => setType(event.target.value as typeof type)}><option value="all">All Types</option><option value="draft">Draft</option><option value="quotation">Quotation</option><option value="proforma">Proforma</option></Select></div>
            <div><label className="mb-1 block text-xs font-medium text-ledger-500">Date Range</label><Select value={dateRange} onChange={(event) => setDateRange(event.target.value)}><option value="all">All Dates</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></Select></div>
          </div>}
        </CardContent>
      </Card>

      {notice && <div className={cn("flex items-center justify-between rounded-md border px-4 py-2.5 text-sm", notice.tone === "success" ? "border-signal/30 bg-signal-soft text-ink-900" : "border-alert/30 bg-alert-soft text-alert")}>{notice.message}<button onClick={() => setNotice(null)}><X className="h-3.5 w-3.5" /></button></div>}

      <Card accent="neutral" className="overflow-hidden rounded-2xl shadow-card">
        <div className="flex items-center justify-between border-b border-ledger-100 px-4 py-3 text-xs text-ledger-500 dark:border-ledger-700">
          <span>Showing {filtered.length} of {rows.length} documents</span>
          <Button variant="outline" size="sm"><Download className="h-3.5 w-3.5" /> Export</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead><tr className="border-b border-ledger-100 bg-ledger-50/60 text-xs text-ledger-500 dark:border-ledger-700 dark:bg-white/[0.03]">
              <th className="px-4 py-3 font-medium">Document</th><th className="px-3 py-3 font-medium">Customer</th><th className="px-3 py-3 font-medium">Date</th><th className="px-3 py-3 font-medium">Expiry Date</th><th className="px-3 py-3 text-right font-medium">Amount</th><th className="px-3 py-3 font-medium">Status</th><th className="px-3 py-3 font-medium">Created By</th><th className="px-3 py-3 pr-4 text-right font-medium">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700">
              {filtered.length === 0 ? <tr><td colSpan={8} className="px-4 py-14 text-center text-sm text-ledger-400"><FileText className="mx-auto mb-2 h-6 w-6" />No documents match your filters.</td></tr> : filtered.map((document) => {
                const { date, time } = formatDateTime(document.createdAt);
                return <tr key={document.id} className="hover:bg-ledger-50/60 dark:hover:bg-white/[0.03]">
                  <td className="px-4 py-3"><Link href={`/sales/${document.id}/edit`} className="font-mono text-[13px] font-medium text-signal hover:underline">{formatInvoiceNumber(document.saleNumber)}<span className="mt-0.5 block font-sans text-[10px] text-ledger-400">{DOC_STATUS_LABEL[document.documentStatus]}</span></Link></td>
                  <td className="px-3 py-3 font-medium text-ink-900 dark:text-white">{document.customerName}<span className="block text-[10px] text-ledger-400">—</span></td>
                  <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">{date}<span className="block text-[10px] text-ledger-400">{time}</span></td>
                  <td className="px-3 py-3 text-ledger-400">—</td>
                  <td className="px-3 py-3 text-right font-medium text-ink-900 dark:text-white">{formatCurrency(document.total, currency)}</td>
                  <td className="px-3 py-3"><Badge tone={DOC_STATUS_TONE[document.documentStatus]}>{DOC_STATUS_LABEL[document.documentStatus]}</Badge></td>
                  <td className="px-3 py-3 text-ledger-600 dark:text-ledger-300">Current user</td>
                  <td className="px-3 py-3 pr-4"><div className="flex items-center justify-end gap-1 text-ledger-400"><Link href={`/sales/${document.id}`} className="rounded-md p-1.5 hover:bg-ledger-100 hover:text-ink-900" title="View"><Eye className="h-4 w-4" /></Link><Link href={`/sales/${document.id}/edit`} className="rounded-md p-1.5 hover:bg-ledger-100 hover:text-ink-900" title="Edit"><Pencil className="h-4 w-4" /></Link><button onClick={() => handleDelete(document.id)} disabled={isPending && pendingId === document.id} className="rounded-md p-1.5 hover:bg-alert-soft hover:text-alert disabled:opacity-40" title="Delete"><Trash2 className="h-4 w-4" /></button><button className="rounded-md p-1.5 hover:bg-ledger-100" title="More actions"><MoreVertical className="h-4 w-4" /></button></div></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-ledger-100 px-4 py-3 text-xs text-ledger-500 dark:border-ledger-700"><span>Rows per page: 10</span><span>Page 1 of 1</span></div>
      </Card>
      </>}
    </div>
  );
}
