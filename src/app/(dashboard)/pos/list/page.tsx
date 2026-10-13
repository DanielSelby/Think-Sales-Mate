import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowDown, ArrowDownRight, ArrowUp, ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight,
  CircleDollarSign, ClipboardList, Search, ShoppingBag, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PosSalesSearchInput } from "@/components/pos/pos-sales-search-input";
import { SaleStatusMenu } from "@/components/sales/sale-status-menu";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission, requirePermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDateTime, formatInvoiceNumber } from "@/lib/sales/format";
import { PosReceiptPrintButton } from "@/components/pos/pos-receipt-print-button";
import type { SaleStatus } from "@/types/database";

export const metadata = { title: "List POS Sales · SalesMate ERP" };

const PAGE_SIZE = 25;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAYMENT_METHODS = ["Cash", "Card", "MoMo", "Mobile Money", "Bank Transfer", "Cheque", "Multi Payment"];
const STATUSES = ["all", "completed", "pending", "returned", "voided"] as const;
const PAYMENT_STATUSES = ["all", "paid", "partial", "unpaid"] as const;
const SORT_KEYS = ["date", "total"] as const;

type Query = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function validDate(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    ? value
    : null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function statusLabel(status: string) {
  if (status === "cancelled") return "Voided";
  if (status === "returned") return "Returned";
  return status === "completed" ? "Completed" : status;
}

function isSaleStatus(status: string): status is SaleStatus {
  return status === "completed" || status === "returned" || status === "cancelled";
}

function statusTone(status: string) {
  if (status === "cancelled") return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300";
  if (status === "returned") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300";
  return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300";
}

function makePageHref(params: Record<string, string>, page: number) {
  const next = new URLSearchParams(params);
  next.set("page", String(page));
  return `/pos/list?${next.toString()}`;
}

function makeSortHref(params: Record<string, string>, sort: "date" | "total", direction: "asc" | "desc") {
  const next = new URLSearchParams(params);
  next.set("sort", sort);
  next.set("direction", direction);
  next.set("page", "1");
  return `/pos/list?${next.toString()}`;
}

function nextDirection(sort: string, currentSort: string, currentDirection: string) {
  return sort === currentSort && currentDirection === "desc" ? "asc" : "desc";
}

function Kpi({
  label, value, detail, icon: Icon, tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof ShoppingBag;
  tone: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-start justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0">
          <p className="text-xs font-medium text-ledger-500 dark:text-ledger-400">{label}</p>
          <p className="mt-2 truncate font-display text-2xl font-bold text-ink-900 dark:text-white">{value}</p>
          <p className="mt-1 text-[11px] text-ledger-400">{detail}</p>
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>
          <Icon className="h-5 w-5" />
        </span>
      </CardContent>
    </Card>
  );
}

export default async function PosSalesListPage({ searchParams }: { searchParams: Query }) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  await requirePermission("pos", "view");
  const canManageSaleStatus = await canPermission("sales", "approve");

  const query = await searchParams;
  const search = (first(query.search) ?? "").trim().slice(0, 100);
  const from = validDate(first(query.from));
  const to = validDate(first(query.to));
  const requestedLocationId = first(query.branch) ?? "";
  const requestedCashierId = first(query.cashier) ?? "";
  const requestedMethod = first(query.method) ?? "all";
  const requestedStatus = first(query.status) ?? "all";
  const requestedPaymentStatus = first(query.paymentStatus) ?? "all";
  const requestedSort = first(query.sort) ?? "date";
  const sort = (SORT_KEYS as readonly string[]).includes(requestedSort) ? requestedSort : "date";
  const direction = first(query.direction) === "asc" ? "asc" : "desc";
  const page = Math.max(1, Math.min(100000, Number.parseInt(first(query.page) ?? "1", 10) || 1));

  const supabase = await createClient();
  const allowedLocationIds = context.isBranchScoped
    ? context.allowedLocationIds.filter((id) => UUID_PATTERN.test(id))
    : null;

  const locationsQuery = supabase
    .from("business_locations")
    .select("id, name")
    .eq("org_id", context.orgId)
    .eq("is_active", true)
    .order("name");
  const scopedLocationsQuery = context.isBranchScoped
    ? allowedLocationIds?.length
      ? locationsQuery.in("id", allowedLocationIds)
      : null
    : locationsQuery;

  const [locationResult, membersResult] = await Promise.all([
    scopedLocationsQuery ?? Promise.resolve({ data: [], error: null }),
    context.canViewOtherTransactions
      ? supabase.from("organization_members")
          .select("user_id, branch_scope, location_id, secondary_location_ids, profiles(id, full_name)")
          .eq("org_id", context.orgId)
          .eq("status", "active")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (locationResult.error) throw new Error(`Could not load POS branch filters: ${locationResult.error.message}`);
  if (membersResult.error) throw new Error(`Could not load POS cashier filters: ${membersResult.error.message}`);

  const locations = locationResult.data ?? [];
  const members = (membersResult.data ?? []).filter((member) => {
    if (!context.isBranchScoped) return true;
    const memberships = [member.location_id, ...(member.secondary_location_ids ?? [])].filter((id): id is string => Boolean(id));
    return member.branch_scope === "all" || memberships.some((id) => allowedLocationIds?.includes(id));
  });
  const cashierOptions = context.canViewOtherTransactions
    ? members.flatMap((member) => {
        const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
      return profile && member.user_id ? [{ id: member.user_id, name: profile.full_name || "Staff member" }] : [];
      })
    : [];

  const locationId = requestedLocationId && locations.some((location) => location.id === requestedLocationId)
    ? requestedLocationId
    : context.masterLocationId;
  const cashierId = context.canViewOtherTransactions && cashierOptions.some((cashier) => cashier.id === requestedCashierId)
    ? requestedCashierId
    : context.canViewOtherTransactions ? null : context.userId;
  const status = (STATUSES as readonly string[]).includes(requestedStatus) ? requestedStatus : "all";
  const paymentStatus = (PAYMENT_STATUSES as readonly string[]).includes(requestedPaymentStatus) ? requestedPaymentStatus : "all";
  const paymentMethod = requestedMethod === "all" || PAYMENT_METHODS.includes(requestedMethod) ? requestedMethod : "all";

  const { data, error } = await supabase.rpc("list_pos_sales", {
    p_org_id: context.orgId,
    p_from: from,
    p_to: to,
    p_location_ids: allowedLocationIds,
    p_location_id: locationId,
    p_cashier_id: cashierId,
    p_payment_method: paymentMethod,
    p_status: status,
    p_payment_status: paymentStatus,
    p_search: search,
    p_sort_by: sort,
    p_sort_direction: direction,
    p_page: page,
    p_page_size: PAGE_SIZE,
  });
  if (error) throw new Error(`Could not load POS sales: ${error.message}`);

  const result = asObject(data);
  if (!result) throw new Error("The POS sales query returned an invalid response.");
  const rows = Array.isArray(result.rows)
    ? result.rows.map(asObject).filter((row): row is Record<string, unknown> => row !== null)
    : [];
  const totalTransactions = numberValue(result.totalTransactions);
  const totalPages = Math.max(1, Math.ceil(totalTransactions / PAGE_SIZE));
  const rangeStart = totalTransactions ? (page - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min(page * PAGE_SIZE, totalTransactions);
  const linkParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    const item = first(value);
    if (item) linkParams[key] = item;
  }
  if (totalTransactions > 0 && page > totalPages) {
    redirect(makePageHref(linkParams, totalPages));
  }

  return (
    <main className="mx-auto max-w-[1600px] space-y-6 pb-10">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ledger-400">Point of sale</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-ink-900 dark:text-white sm:text-3xl">List POS Sales</h1>
          <p className="mt-1 max-w-2xl text-sm text-ledger-500 dark:text-ledger-400">
            Completed register transactions only. Invoices and sales entered through other channels are excluded.
          </p>
        </div>
        <Link href="/pos" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-signal px-4 text-sm font-semibold text-white hover:brightness-95">
          <ShoppingBag className="h-4 w-4" /> Open POS register
        </Link>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi label="Total POS Transactions" value={totalTransactions.toLocaleString()} detail="Matching current filters" icon={ClipboardList} tone="bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300" />
        <Kpi label="Today’s POS Sales" value={formatCurrency(numberValue(result.todaySales), context.currency)} detail="Net of recorded refunds" icon={CalendarDays} tone="bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300" />
        <Kpi label="Total POS Sales Value" value={formatCurrency(numberValue(result.totalSalesValue), context.currency)} detail="Net of refunds; voids excluded" icon={CircleDollarSign} tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300" />
        <Kpi label="Completed Transactions" value={numberValue(result.completedTransactions).toLocaleString()} detail="Sale status: completed" icon={ArrowUpRight} tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300" />
        <Kpi label="Pending Transactions" value={numberValue(result.pendingTransactions).toLocaleString()} detail="Completed sales with balance due" icon={ArrowDownRight} tone="bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300" />
        <Kpi label="Voided Transactions" value={numberValue(result.voidedTransactions).toLocaleString()} detail="Cancelled POS sales" icon={XCircle} tone="bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300" />
      </section>

      <Card>
        <CardContent className="p-4 sm:p-5">
          <form method="get" action="/pos/list" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            <PosSalesSearchInput initialValue={search} />
            <label>
              <span className="sr-only">From date</span>
              <Input type="date" name="from" defaultValue={from ?? ""} aria-label="From date" />
            </label>
            <label>
              <span className="sr-only">To date</span>
              <Input type="date" name="to" defaultValue={to ?? ""} aria-label="To date" />
            </label>
            <Select name="branch" defaultValue={locationId ?? ""} aria-label="Branch">
              <option value="">All permitted branches</option>
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </Select>
            <Select name="cashier" defaultValue={cashierId ?? ""} aria-label="Cashier" disabled={!context.canViewOtherTransactions}>
              <option value="">All cashiers</option>
              {!context.canViewOtherTransactions && <option value={context.userId}>You</option>}
              {cashierOptions.map((cashier) => <option key={cashier.id} value={cashier.id}>{cashier.name}</option>)}
            </Select>
            <Select name="method" defaultValue={paymentMethod} aria-label="Payment method">
              <option value="all">All payment methods</option>
              {PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
            </Select>
            <Select name="status" defaultValue={status} aria-label="Transaction status">
              <option value="all">All statuses</option>
              {STATUSES.filter((value) => value !== "all").map((value) => (
                <option key={value} value={value}>{value === "voided" ? "Voided" : value[0].toUpperCase() + value.slice(1)}</option>
              ))}
            </Select>
            <Select name="paymentStatus" defaultValue={paymentStatus} aria-label="Payment status">
              <option value="all">All payment statuses</option>
              <option value="paid">Paid</option>
              <option value="partial">Partially paid</option>
              <option value="unpaid">Unpaid</option>
            </Select>
            <input type="hidden" name="page" value="1" />
            <div className="flex gap-2 sm:col-span-2 lg:col-span-4 xl:col-span-8">
              <Button type="submit" className="gap-2"><Search className="h-4 w-4" /> Apply filters</Button>
              <Link href="/pos/list" className="inline-flex h-10 items-center justify-center rounded-md border border-ledger-200 px-4 text-sm font-medium text-ink-800 hover:bg-ledger-50 dark:border-ledger-700 dark:text-white dark:hover:bg-ink-800">
                Reset
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-col justify-between gap-2 border-b border-ledger-100 px-4 py-4 dark:border-ledger-800 sm:flex-row sm:items-center sm:px-5">
          <div>
            <h2 className="font-semibold text-ink-900 dark:text-white">POS transactions</h2>
            <p className="text-xs text-ledger-500 dark:text-ledger-400">{totalTransactions.toLocaleString()} matching register sales</p>
          </div>
          <p className="text-xs text-ledger-500 dark:text-ledger-400">
            Showing {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} of {totalTransactions.toLocaleString()}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] text-left text-sm">
            <thead className="bg-ledger-50 text-[11px] uppercase tracking-wide text-ledger-500 dark:bg-ink-800 dark:text-ledger-300">
              <tr>
                <th className="px-4 py-3 font-semibold">Receipt No.</th>
                <th className="px-4 py-3 font-semibold">
                  <Link href={makeSortHref(linkParams, "date", nextDirection("date", sort, direction))} className="inline-flex items-center gap-1 hover:text-signal">
                    Date &amp; Time {sort === "date" && (direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </Link>
                </th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Cashier</th>
                <th className="px-4 py-3 font-semibold">Branch</th>
                <th className="px-4 py-3 text-right font-semibold">Items / Units</th>
                <th className="px-4 py-3 text-right font-semibold">Subtotal</th>
                <th className="px-4 py-3 text-right font-semibold">Discount</th>
                <th className="px-4 py-3 text-right font-semibold">Tax</th>
                <th className="px-4 py-3 text-right font-semibold">
                  <Link href={makeSortHref(linkParams, "total", nextDirection("total", sort, direction))} className="inline-flex items-center gap-1 hover:text-signal">
                    Total {sort === "total" && (direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </Link>
                </th>
                <th className="px-4 py-3 font-semibold">Payment</th>
                <th className="px-4 py-3 font-semibold">Paid status</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ledger-100 dark:divide-ledger-800">
              {rows.map((row) => {
                const id = stringValue(row.id);
                const saleNumber = numberValue(row.saleNumber);
                const total = numberValue(row.total);
                const amountPaid = numberValue(row.amountPaid);
                const rawStatus = stringValue(row.status);
                const paidStatus = amountPaid >= total ? "Paid" : amountPaid > 0 ? "Partial" : "Unpaid";
                const date = stringValue(row.createdAt) || stringValue(row.saleDate);
                const time = date ? formatDateTime(date) : null;
                return (
                  <tr key={id} className="hover:bg-ledger-50/70 dark:hover:bg-ink-800/60">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold text-signal">
                      <Link href={`/pos/list/${id}`} className="hover:underline">{formatInvoiceNumber(saleNumber)}</Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-700 dark:text-ledger-200">
                      {time ? <>{time.date}<span className="ml-1 text-ledger-400">{time.time}</span></> : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink-900 dark:text-white">{stringValue(row.customerName) || "Walk-in customer"}</p>
                      {stringValue(row.customerPhone) && <p className="text-xs text-ledger-400">{stringValue(row.customerPhone)}</p>}
                    </td>
                    <td className="px-4 py-3 text-ink-700 dark:text-ledger-200">{stringValue(row.cashierName) || "Unknown cashier"}</td>
                    <td className="px-4 py-3 text-ink-700 dark:text-ledger-200">{stringValue(row.branchName) || "Unassigned"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-ink-700 dark:text-ledger-200">
                      {numberValue(row.itemCount)} items · {numberValue(row.unitCount)} units
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right figure">{formatCurrency(numberValue(row.subtotal), context.currency)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right figure">{formatCurrency(numberValue(row.discountAmount), context.currency)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right figure">{formatCurrency(numberValue(row.taxAmount), context.currency)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold figure">{formatCurrency(total, context.currency)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-700 dark:text-ledger-200">{stringValue(row.paymentMethod) || "—"}</td>
                    <td className="px-4 py-3"><span className="rounded-full border border-ledger-200 px-2 py-1 text-[11px] text-ledger-600 dark:border-ledger-700 dark:text-ledger-300">{paidStatus}</span></td>
                    <td className="px-4 py-3"><span className={`whitespace-nowrap rounded-full border px-2 py-1 text-[11px] font-medium ${statusTone(rawStatus)}`}>{statusLabel(rawStatus)}</span></td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Link href={`/pos/list/${id}`} className="rounded-lg px-2 py-1.5 text-xs font-medium text-signal hover:bg-signal/10">View</Link>
                        <PosReceiptPrintButton saleId={id} userId={context.userId} />
                        {canManageSaleStatus && isSaleStatus(rawStatus) && (
                          <SaleStatusMenu saleId={id} status={rawStatus} total={total} currency={context.currency} />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={14} className="px-6 py-16 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-ledger-50 text-ledger-400 dark:bg-ink-800"><ShoppingBag className="h-5 w-5" /></div>
                  <p className="mt-3 font-medium text-ink-800 dark:text-white">No POS transactions found</p>
                  <p className="mt-1 text-sm text-ledger-500">Try changing your filters or search terms.</p>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-ledger-100 px-4 py-3 dark:border-ledger-800 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <span className="text-xs text-ledger-500 dark:text-ledger-400">Page {page} of {totalPages} · {PAGE_SIZE} rows per page</span>
          <div className="flex items-center gap-2">
            <Link
              aria-disabled={page <= 1}
              className={`inline-flex h-9 items-center gap-1 rounded-lg border border-ledger-200 px-3 text-xs dark:border-ledger-700 ${page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-ledger-50 dark:hover:bg-ink-800"}`}
              href={makePageHref(linkParams, Math.max(1, page - 1))}
            ><ChevronLeft className="h-4 w-4" /> Previous</Link>
            <Link
              aria-disabled={page >= totalPages}
              className={`inline-flex h-9 items-center gap-1 rounded-lg border border-ledger-200 px-3 text-xs dark:border-ledger-700 ${page >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-ledger-50 dark:hover:bg-ink-800"}`}
              href={makePageHref(linkParams, Math.min(totalPages, page + 1))}
            >Next <ChevronRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </Card>
    </main>
  );
}
