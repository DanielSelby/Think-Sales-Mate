"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Eye,
  FileText,
  MoreHorizontal,
  Package,
  Printer,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { approveStockRequest, rejectStockRequest } from "@/app/(dashboard)/inventory/stock-requests/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExportCsvButton } from "@/components/reports/export-csv-button";

type RequestStatus = "draft" | "pending_approval" | "approved" | "rejected" | "completed";

interface RequestItem {
  productName: string;
  sku: string | null;
  quantity: number;
  reason: string | null;
}

interface RequestRow {
  id: string;
  label: string;
  status: RequestStatus;
  source: string;
  destination: string;
  createdAt: string;
  requestedBy: string;
  totalQuantity: number;
  itemCount: number;
  transferId: string | null;
  requestType: string;
  priority?: string | null;
  notes?: string | null;
  items: RequestItem[];
}

const STATUS_META: Record<RequestStatus, { label: string; tone: "neutral" | "signal" | "alert" | "amber"; className: string }> = {
  draft: { label: "Draft", tone: "neutral", className: "bg-slate-100 text-slate-600" },
  pending_approval: { label: "Pending approval", tone: "amber", className: "bg-amber-50 text-amber-700" },
  approved: { label: "Approved", tone: "signal", className: "bg-emerald-50 text-emerald-700" },
  rejected: { label: "Rejected", tone: "alert", className: "bg-red-50 text-red-700" },
  completed: { label: "Fulfilled", tone: "signal", className: "bg-blue-50 text-blue-700" },
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));

const statusLabel = (status: RequestStatus) => STATUS_META[status]?.label ?? status.replaceAll("_", " ");

export function StockRequestHistory({
  requests,
  canApprove,
  initialRequestId,
}: {
  requests: RequestRow[];
  canApprove: boolean;
  initialRequestId?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [viewing, setViewing] = useState<RequestRow | null>(null);
  const [query, setQuery] = useState("");
  const [branch, setBranch] = useState("all");
  const [status, setStatus] = useState<"all" | RequestStatus>("all");
  const [requestType, setRequestType] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [menu, setMenu] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (initialRequestId) setViewing(requests.find((request) => request.id === initialRequestId) ?? null);
  }, [initialRequestId, requests]);

  const branches = useMemo(
    () => [...new Set(requests.flatMap((request) => [request.source, request.destination]))].sort(),
    [requests]
  );
  const requestTypes = useMemo(() => [...new Set(requests.map((request) => request.requestType))].sort(), [requests]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return requests.filter((request) => {
      const date = request.createdAt.slice(0, 10);
      const searchable = [request.label, request.source, request.destination, request.requestedBy, request.requestType]
        .join(" ")
        .toLowerCase();
      return (
        (status === "all" || request.status === status) &&
        (branch === "all" || request.source === branch || request.destination === branch) &&
        (requestType === "all" || request.requestType === requestType) &&
        (!dateFrom || date >= dateFrom) &&
        (!dateTo || date <= dateTo) &&
        (!normalized || searchable.includes(normalized))
      );
    });
  }, [branch, dateFrom, dateTo, query, requestType, requests, status]);

  const counts = useMemo(
    () =>
      filtered.reduce<Record<string, number>>(
        (result, request) => ({ ...result, all: (result.all ?? 0) + 1, [request.status]: (result[request.status] ?? 0) + 1 }),
        { all: 0 }
      ),
    [filtered]
  );
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * size, currentPage * size);

  function clearFilters() {
    setQuery("");
    setBranch("all");
    setStatus("all");
    setRequestType("all");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  function decide(id: string, decision: "approve" | "reject") {
    const reason = decision === "reject" ? window.prompt("Why is this request being rejected?") : undefined;
    if (decision === "reject" && !reason?.trim()) return;
    startTransition(async () => {
      const result =
        decision === "approve" ? await approveStockRequest(id) : await rejectStockRequest(id, reason!.trim());
      setMessage(result.error ?? (decision === "approve" ? "Request approved and transfer created." : "Request rejected."));
      setMenu(null);
    });
  }

  const exportRows = filtered.map((request) => [
    request.label,
    request.destination,
    request.requestType,
    request.requestedBy,
    formatDate(request.createdAt),
    statusLabel(request.status),
    request.itemCount,
    request.totalQuantity,
  ]);

  return (
    <div className="space-y-5 pb-8 text-sm">
      <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <p className="flex items-center gap-1 text-xs font-medium text-ledger-500">
            Inventory <ChevronRight className="h-3 w-3" /> Branch Stock Requests <ChevronRight className="h-3 w-3" /> Request History
          </p>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink-900 dark:text-white">Branch Stock Request History</h1>
          <p className="mt-1 max-w-2xl text-sm text-ledger-500 dark:text-ledger-400">
            View and manage all stock requests made by branches. Track approvals, fulfillment status, quantities and transfer activity.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportCsvButton filename="stock-request-history.csv" headers={["Request ID", "Branch", "Request Type", "Requested By", "Date", "Status", "Items", "Total Quantity"]} rows={exportRows} />
          <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print</Button>
          <Link href="/inventory/stock-requests"><Button className="bg-signal text-white hover:bg-signal/90"><ClipboardList className="mr-2 h-4 w-4" />New Request</Button></Link>
        </div>
      </header>

      {message && <div role="status" className="rounded-xl border border-signal/20 bg-signal-soft px-4 py-3 text-sm text-signal">{message}</div>}

      <section className="rounded-2xl border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="text-[10px] font-bold uppercase tracking-wide text-ledger-400">Date from<input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} className="mt-1 h-9 w-full rounded-lg border border-ledger-200 bg-white px-3 text-xs text-ink-900 outline-none focus:border-signal dark:border-ledger-700 dark:bg-ink-900 dark:text-white" /></label>
          <label className="text-[10px] font-bold uppercase tracking-wide text-ledger-400">Date to<input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} className="mt-1 h-9 w-full rounded-lg border border-ledger-200 bg-white px-3 text-xs text-ink-900 outline-none focus:border-signal dark:border-ledger-700 dark:bg-ink-900 dark:text-white" /></label>
          <label className="text-[10px] font-bold uppercase tracking-wide text-ledger-400">Branch<select value={branch} onChange={(event) => { setBranch(event.target.value); setPage(1); }} className="mt-1 h-9 w-full rounded-lg border border-ledger-200 bg-white px-3 text-xs text-ink-900 outline-none focus:border-signal dark:border-ledger-700 dark:bg-ink-900 dark:text-white"><option value="all">All branches</option>{branches.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="text-[10px] font-bold uppercase tracking-wide text-ledger-400">Status<select value={status} onChange={(event) => { setStatus(event.target.value as "all" | RequestStatus); setPage(1); }} className="mt-1 h-9 w-full rounded-lg border border-ledger-200 bg-white px-3 text-xs text-ink-900 outline-none focus:border-signal dark:border-ledger-700 dark:bg-ink-900 dark:text-white"><option value="all">All statuses</option>{Object.entries(STATUS_META).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}</select></label>
          <label className="text-[10px] font-bold uppercase tracking-wide text-ledger-400">Request type<select value={requestType} onChange={(event) => { setRequestType(event.target.value); setPage(1); }} className="mt-1 h-9 w-full rounded-lg border border-ledger-200 bg-white px-3 text-xs text-ink-900 outline-none focus:border-signal dark:border-ledger-700 dark:bg-ink-900 dark:text-white"><option value="all">All types</option>{requestTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label className="flex h-9 flex-1 items-center gap-2 rounded-lg border border-ledger-200 px-3 text-ledger-400 dark:border-ledger-700"><Search className="h-4 w-4" /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search request ID, branch, user or request type..." className="w-full bg-transparent text-xs outline-none" /></label>
          <Button variant="outline" onClick={() => setShowFilters((value) => !value)}><ChevronDown className={`mr-2 h-4 w-4 transition-transform ${showFilters ? "rotate-180" : ""}`} />More filters</Button>
          <Button variant="ghost" onClick={clearFilters}>Clear filters</Button>
        </div>
        {showFilters && <p className="mt-3 text-xs text-ledger-500">Filters apply immediately to the request history and summary cards.</p>}
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {([
          ["Total requests", "all", FileText, "text-blue-600 bg-blue-50"],
          ["Pending approval", "pending_approval", ClipboardList, "text-amber-600 bg-amber-50"],
          ["Approved", "approved", Check, "text-emerald-600 bg-emerald-50"],
          ["Rejected", "rejected", X, "text-red-600 bg-red-50"],
          ["Fulfilled", "completed", Package, "text-violet-600 bg-violet-50"],
        ] as const).map(([title, key, Icon, colors]) => (
          <button key={key} type="button" onClick={() => { setStatus(key === "all" ? "all" : key); setPage(1); }} className="rounded-2xl border border-ledger-100 bg-white p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover dark:border-ledger-700 dark:bg-ink-900">
            <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${colors}`}><Icon className="h-4 w-4" /></span>
            <p className="mt-3 text-xs font-medium text-ledger-500">{title}</p>
            <p className="mt-1 text-2xl font-bold text-ink-900 dark:text-white">{counts[key] ?? 0}</p>
            <p className="mt-1 text-[10px] text-ledger-400">{filtered.length ? `${Math.round(((counts[key] ?? 0) / filtered.length) * 100)}% of filtered records` : "No records"}</p>
          </button>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
        <div className="flex flex-col gap-2 border-b border-ledger-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-ledger-700">
          <div><h2 className="font-display text-base font-bold text-ink-900 dark:text-white">Request History</h2><p className="mt-1 text-xs text-ledger-500">{filtered.length} total records</p></div>
          <div className="flex items-center gap-2 text-xs text-ledger-500"><span>Show</span><select value={size} onChange={(event) => { setSize(Number(event.target.value)); setPage(1); }} className="h-8 rounded-lg border border-ledger-200 bg-white px-2 dark:border-ledger-700 dark:bg-ink-900"><option value="10">10</option><option value="25">25</option><option value="50">50</option></select><span>records</span></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left">
            <thead className="sticky top-0 z-10 border-b border-ledger-100 bg-ledger-50/90 text-[10px] uppercase tracking-wide text-ledger-400 backdrop-blur dark:border-ledger-700 dark:bg-ink-900/90">
              <tr><th className="px-5 py-3">Request ID</th><th className="px-3 py-3">Branch</th><th className="px-3 py-3">Request type</th><th className="px-3 py-3">Requested by</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Items</th><th className="px-3 py-3">Total quantity</th><th className="px-5 py-3 text-right">Actions</th></tr>
            </thead>
            <tbody>
              {visible.map((request) => {
                const meta = STATUS_META[request.status];
                return <tr key={request.id} className="border-b border-ledger-50 last:border-0 hover:bg-ledger-50/50 dark:border-ledger-700/50">
                  <td className="px-5 py-4 font-semibold text-ink-900 dark:text-white">{request.label}</td>
                  <td className="px-3 py-4"><span className="flex items-center gap-2"><Building2 className="h-4 w-4 text-signal" />{request.destination}</span></td>
                  <td className="px-3 py-4 text-xs text-ledger-600 dark:text-ledger-300">{request.requestType}</td>
                  <td className="px-3 py-4"><span className="flex items-center gap-2 text-xs"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-signal-soft text-signal"><UserRound className="h-3.5 w-3.5" /></span>{request.requestedBy}</span></td>
                  <td className="px-3 py-4 whitespace-nowrap text-xs text-ledger-500">{formatDate(request.createdAt)}</td>
                  <td className="px-3 py-4"><Badge tone={meta?.tone ?? "neutral"} className={meta?.className}>{meta?.label ?? request.status}</Badge></td>
                  <td className="px-3 py-4 text-xs">{request.itemCount}</td>
                  <td className="px-3 py-4 text-xs font-semibold">{request.totalQuantity.toLocaleString()}</td>
                  <td className="relative px-5 py-4 text-right"><button type="button" aria-label={`Actions for ${request.label}`} onClick={() => setMenu(menu === request.id ? null : request.id)} className="rounded-lg p-2 text-ledger-500 hover:bg-ledger-100 hover:text-ink-900"><MoreHorizontal className="h-4 w-4" /></button>
                    {menu === request.id && <div className="absolute right-5 top-12 z-30 w-48 rounded-xl border border-ledger-100 bg-white p-1 text-left shadow-xl dark:border-ledger-700 dark:bg-ink-900">
                      <button type="button" onClick={() => { setViewing(request); setMenu(null); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs hover:bg-ledger-50"><Eye className="h-4 w-4" />View details</button>
                      {canApprove && request.status === "pending_approval" && <><button disabled={pending} type="button" onClick={() => decide(request.id, "approve")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-signal hover:bg-signal-soft"><Check className="h-4 w-4" />Approve</button><button disabled={pending} type="button" onClick={() => decide(request.id, "reject")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-alert hover:bg-alert-soft"><X className="h-4 w-4" />Reject</button></>}
                      {request.transferId && <Link href={`/inventory/transfers/${request.transferId}`} onClick={() => setMenu(null)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-signal hover:bg-signal-soft"><ArrowRight className="h-4 w-4" />View transfer</Link>}
                    </div>}
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
          {!visible.length && <div className="p-12 text-center text-sm text-ledger-400">No stock requests match your filters.</div>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ledger-100 px-5 py-4 text-xs text-ledger-500 dark:border-ledger-700">
          <span>Showing {filtered.length ? (currentPage - 1) * size + 1 : 0}–{Math.min(currentPage * size, filtered.length)} of {filtered.length}</span>
          <div className="flex items-center gap-1"><Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ArrowLeft className="mr-1 h-3.5 w-3.5" />Previous</Button>{Array.from({ length: Math.min(pages, 5) }, (_, index) => index + 1).map((number) => <button key={number} type="button" onClick={() => setPage(number)} className={`h-8 min-w-8 rounded-lg px-2 text-xs font-semibold ${number === currentPage ? "bg-signal text-white" : "hover:bg-ledger-100"}`}>{number}</button>)}<Button variant="outline" size="sm" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Next<ArrowRight className="ml-1 h-3.5 w-3.5" /></Button></div>
        </div>
      </section>

      {viewing && <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-xl overflow-y-auto border-l border-ledger-100 bg-white p-6 shadow-2xl dark:border-ledger-700 dark:bg-ink-900" role="dialog" aria-modal="true">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-medium text-ledger-500">Request details</p><h2 className="mt-1 font-display text-xl font-bold text-ink-900 dark:text-white">{viewing.label}</h2></div><button type="button" onClick={() => setViewing(null)} aria-label="Close details" className="rounded-lg p-2 hover:bg-ledger-100"><X className="h-5 w-5" /></button></div>
        <div className="mt-5 flex items-center justify-between"><Badge tone={STATUS_META[viewing.status]?.tone ?? "neutral"}>{statusLabel(viewing.status)}</Badge><span className="text-xs text-ledger-500">{formatDate(viewing.createdAt)}</span></div>
        <div className="mt-6 grid grid-cols-2 gap-3"><Info label="Branch" value={viewing.destination} icon={Building2} /><Info label="Source branch" value={viewing.source} icon={Building2} /><Info label="Requested by" value={viewing.requestedBy} icon={UserRound} /><Info label="Request type" value={viewing.requestType} icon={FileText} /></div>
        <div className="mt-6"><h3 className="text-xs font-bold uppercase tracking-wide text-ledger-400">Requested items</h3><div className="mt-2 divide-y divide-ledger-100 rounded-xl border border-ledger-100 dark:divide-ledger-700 dark:border-ledger-700">{viewing.items.map((item) => <div key={`${item.sku}-${item.productName}`} className="flex items-center justify-between gap-3 px-3 py-3"><div><p className="text-sm font-semibold">{item.productName}</p><p className="text-xs text-ledger-500">{item.sku ?? "No SKU"}{item.reason ? ` · ${item.reason}` : ""}</p></div><span className="font-semibold">{item.quantity.toLocaleString()}</span></div>)}</div></div>
        <div className="mt-6 grid grid-cols-2 gap-3"><Info label="Items" value={String(viewing.itemCount)} icon={Package} /><Info label="Total quantity" value={viewing.totalQuantity.toLocaleString()} icon={ClipboardList} /><Info label="Created" value={formatDate(viewing.createdAt)} icon={CalendarDays} /><Info label="Transfer" value={viewing.transferId ? "Generated" : "Not generated"} icon={ArrowRight} /></div>
        {viewing.notes && <div className="mt-6 rounded-xl bg-ledger-50 p-4 text-sm text-ledger-600 dark:bg-ink-800 dark:text-ledger-300"><p className="mb-1 text-xs font-bold uppercase tracking-wide text-ledger-400">Comments</p>{viewing.notes}</div>}
        <div className="mt-6 flex gap-2">{canApprove && viewing.status === "pending_approval" && <><Button disabled={pending} onClick={() => decide(viewing.id, "approve")} className="bg-signal text-white"><Check className="mr-2 h-4 w-4" />Approve</Button><Button disabled={pending} variant="outline" onClick={() => decide(viewing.id, "reject")} className="text-alert"><X className="mr-2 h-4 w-4" />Reject</Button></>}{viewing.transferId && <Link href={`/inventory/transfers/${viewing.transferId}`}><Button variant="outline">Open transfer</Button></Link>}</div>
      </aside>}
      {viewing && <button type="button" aria-label="Close details overlay" onClick={() => setViewing(null)} className="fixed inset-0 z-40 bg-ink-950/30" />}
    </div>
  );
}

function Info({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Building2 }) {
  return <div className="rounded-xl bg-ledger-50 p-3 dark:bg-ink-800"><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-ledger-400"><Icon className="h-3.5 w-3.5" />{label}</div><p className="mt-1 truncate text-sm font-semibold text-ink-900 dark:text-white">{value}</p></div>;
}
