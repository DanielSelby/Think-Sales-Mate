import Link from "next/link";
import Image from "next/image";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, Circle, FileText, Globe2, Mail, MapPin, Phone, UserRound } from "lucide-react";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canPermission } from "@/lib/rbac/permissions";
import { Card, CardContent } from "@/components/ui/card";
import { TransferStatusActions } from "@/components/inventory/transfer-status-actions";
import { formatCurrency } from "@/lib/sales/format";
import { PrintTransferButton } from "@/components/inventory/print-transfer-button";

export default async function StockTransferDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ print?: string }>;
}) {
  const [{ id }, query] = await Promise.all([
    params,
    searchParams ?? Promise.resolve<{ print?: string }>({}),
  ]);
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) return null;

  const supabase = await createClient();
  const { data: transfer } = await supabase
    .from("stock_transfers")
    .select(
      "id, transfer_number, reference_no, status, reason, notes, transfer_date, created_at, completed_at, received_at, received_by, created_by, from_location_id, to_location_id, from:from_location_id(name, address, city, region, country, phone, email, manager_name), to:to_location_id(name, address, city, region, country, phone, email, manager_name)"
    )
    .eq("id", id)
    .eq("org_id", context.orgId)
    .single();

  if (!transfer) notFound();
  if (context.isBranchScoped &&
      !context.allowedLocationIds.includes(transfer.from_location_id) &&
      !context.allowedLocationIds.includes(transfer.to_location_id)) {
    notFound();
  }
  const canEditTransfers = await canPermission("transfers", "edit");
  const canManageTransfer = canEditTransfers && (
    !context.isBranchScoped
    || context.allowedLocationIds.includes(transfer.from_location_id)
    || context.allowedLocationIds.includes(transfer.to_location_id)
  );
  const canReceiveTransfer = !context.isBranchScoped
    || context.allowedLocationIds.includes(transfer.to_location_id);

  const from = Array.isArray(transfer.from) ? transfer.from[0] : transfer.from;
  const to = Array.isArray(transfer.to) ? transfer.to[0] : transfer.to;

  const [{ data: items }, { data: companyProfile }] = await Promise.all([
    supabase
      .from("stock_transfer_items")
      .select("id, quantity, unit_cost, products(name, sku, image_urls)")
      .eq("transfer_id", transfer.id),
    supabase
      .from("company_profile")
      .select("company_name, logo_url, show_logo_on_invoices, show_contact_on_invoices, business_email, business_phone, website, contact_email, contact_phone")
      .eq("org_id", context.orgId)
      .maybeSingle(),
  ]);

  let requestedByEmail = "—";
  let receivedByEmail = "—";
  const admin = createAdminClient();
  if (transfer.created_by) {
    const { data } = await admin.auth.admin.getUserById(transfer.created_by);
    requestedByEmail = data.user?.email ?? "—";
  }
  if (transfer.received_by) {
    const { data } = await admin.auth.admin.getUserById(transfer.received_by);
    receivedByEmail = data.user?.email ?? "—";
  }

  const totalValue = (items ?? []).reduce((sum, i) => sum + i.quantity * i.unit_cost, 0);
  const transferLabel = transfer.reference_no || `ST-${String(transfer.transfer_number).padStart(6, "0")}`;
  const organizationName = companyProfile?.company_name?.trim() || context.orgName;
  const showOrganizationContact = companyProfile?.show_contact_on_invoices ?? true;
  const showOrganizationLogo = companyProfile?.show_logo_on_invoices ?? true;
  const formatLocationAddress = (location: typeof from) =>
    [location?.address, location?.city, location?.region, location?.country].filter(Boolean).join(", ");
  const formatDisplayDate = (value: string | null) =>
    value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB") : "—";
  const statusLabel = transfer.status.replace("_", " ");

  // An honest timeline reflecting this app's actual 3-stage lifecycle —
  // created (in transit) then either completed or cancelled — rather than
  // a fabricated multi-stage approval workflow this schema doesn't have.
  const timelineSteps = [
    { label: "Created", by: requestedByEmail, at: transfer.created_at, done: true },
    {
      label: transfer.status === "cancelled" ? "Cancelled" : "Completed",
      by: transfer.status === "completed" || transfer.status === "cancelled" ? requestedByEmail : null,
      at: transfer.completed_at,
      done: transfer.status === "completed" || transfer.status === "cancelled"
    }
  ];

  return (
    <div className="stock-transfer-print-page mx-auto max-w-5xl space-y-5 pb-8">
      <div className="print:hidden">
        <Link
          href="/inventory/transfers"
          className="print:hidden inline-flex items-center gap-1 text-sm text-ledger-500 hover:text-ink-900 dark:hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to stock transfer history
        </Link>
        <p className="mt-2 text-sm text-ledger-500 dark:text-ledger-400">
          {from?.name ?? "Unknown"} → {to?.name ?? "Unknown"} · {formatDisplayDate(transfer.transfer_date)}
        </p>
        <div className="mt-3"><PrintTransferButton autoPrint={query.print === "1"} /></div>
      </div>

      {(canManageTransfer
        || ((transfer.status === "pending" || transfer.status === "in_transit") && canReceiveTransfer)) && (
        <div className="print:hidden">
          <TransferStatusActions
            transferId={transfer.id}
            status={transfer.status}
            canManage={canManageTransfer}
            canReceive={canReceiveTransfer}
          />
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-sm print:rounded-none print:border-0 print:shadow-none">
        <div className="space-y-5 p-5 sm:p-8 print:p-0">
          <header className="grid gap-5 border-b border-slate-200 pb-5 md:grid-cols-[1fr_auto] print:grid-cols-[1fr_auto]">
            <div>
              <div className="flex items-center gap-3">
                {showOrganizationLogo && companyProfile?.logo_url ? (
                  <Image src={companyProfile.logo_url} alt={`${organizationName} logo`} width={128} height={48} unoptimized className="h-12 max-w-32 object-contain" />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-800 text-white">
                    <Building2 className="h-6 w-6" />
                  </div>
                )}
                <h2 className="text-xl font-bold tracking-tight text-slate-900">{organizationName}</h2>
              </div>
              <p className="mt-2 text-xs font-medium uppercase tracking-[0.14em] text-emerald-800">Inventory Management</p>
            </div>
            {showOrganizationContact && (
              <div className="space-y-1.5 text-xs text-slate-600 md:min-w-60 print:min-w-60">
                {companyProfile?.business_phone && <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-emerald-800" />{companyProfile.business_phone}</p>}
                {(companyProfile?.contact_email || companyProfile?.business_email) && (
                  <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-emerald-800" />{companyProfile.contact_email || companyProfile.business_email}</p>
                )}
                {companyProfile?.website && <p className="flex items-center gap-2"><Globe2 className="h-3.5 w-3.5 text-emerald-800" />{companyProfile.website}</p>}
                {companyProfile?.contact_phone && companyProfile.contact_phone !== companyProfile.business_phone && (
                  <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-emerald-800" />{companyProfile.contact_phone}</p>
                )}
              </div>
            )}
          </header>

          <div className="grid gap-4 md:grid-cols-[1fr_270px] print:grid-cols-[1fr_270px]">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">Stock Transfer Invoice</h1>
              <p className="mt-1 text-lg font-medium text-slate-600">Branch to Branch Transfer</p>
              <p className="mt-3 max-w-xl text-xs leading-5 text-slate-500">
                This document confirms the transfer of stock items between locations within {organizationName}.
              </p>
            </div>
            <div className="space-y-2 rounded-xl bg-emerald-50 p-4 text-xs">
              <p className="flex justify-between gap-3"><span className="text-slate-500">Invoice No.</span><strong className="font-mono text-slate-900">{transferLabel}</strong></p>
              <p className="flex justify-between gap-3"><span className="text-slate-500">Transfer Date</span><strong className="text-slate-900">{formatDisplayDate(transfer.transfer_date)}</strong></p>
              <p className="flex justify-between gap-3 capitalize"><span className="text-slate-500">Status</span><strong className="text-emerald-800">{statusLabel}</strong></p>
            </div>
          </div>

          <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr] print:grid-cols-[1fr_auto_1fr]">
            {[{ label: "From Location", location: from, tone: "emerald" }, { label: "To Location", location: to, tone: "blue" }].map(({ label, location, tone }, index) => (
              <div key={label} className={`rounded-xl border p-4 ${index === 0 ? "md:col-start-1" : "md:col-start-3"} ${tone === "emerald" ? "border-emerald-100 bg-emerald-50/70" : "border-sky-100 bg-sky-50/70"}`}>
                <p className={`text-xs font-semibold uppercase tracking-wide ${tone === "emerald" ? "text-emerald-800" : "text-sky-800"}`}>{label}</p>
                <h3 className="mt-1 text-lg font-bold text-slate-900">{location?.name ?? "Unknown location"}</h3>
                <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                  {formatLocationAddress(location) && <p className="flex gap-2"><MapPin className="h-3.5 w-3.5 shrink-0" />{formatLocationAddress(location)}</p>}
                  {location?.manager_name && <p className="flex gap-2"><UserRound className="h-3.5 w-3.5 shrink-0" />{location.manager_name}</p>}
                  {location?.phone && <p className="flex gap-2"><Phone className="h-3.5 w-3.5 shrink-0" />{location.phone}</p>}
                  {location?.email && <p className="flex gap-2 break-all"><Mail className="h-3.5 w-3.5 shrink-0" />{location.email}</p>}
                </div>
                {index === 0 && <span className="sr-only">Transfer source</span>}
              </div>
            ))}
            <ArrowRight className="hidden h-6 w-6 text-emerald-800 md:col-start-2 md:row-start-1 md:block print:block" />
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 print:grid-cols-4">
            {[
              { label: "Total Items", value: String(items?.length ?? 0) },
              { label: "Total Quantity", value: String((items ?? []).reduce((sum, item) => sum + item.quantity, 0)) },
              { label: "Total Value", value: formatCurrency(totalValue, context.currency) },
              { label: "Transfer Reference", value: transfer.reference_no || transferLabel },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border border-slate-200 p-3">
                <p className="text-[10px] text-slate-500">{stat.label}</p>
                <p className="mt-1 break-words text-sm font-bold text-slate-900">{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-emerald-800 text-white">
                <tr>
                  <th className="px-3 py-3">#</th><th className="px-3 py-3">Product</th><th className="px-3 py-3">SKU</th>
                  <th className="px-3 py-3 text-right">Unit Price</th><th className="px-3 py-3 text-right">Quantity</th><th className="px-3 py-3 text-right">Total Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(items ?? []).map((item, index) => {
                  const product = Array.isArray(item.products) ? item.products[0] : item.products;
                  const imageUrl = product?.image_urls?.[0];
                  return (
                    <tr key={item.id}>
                      <td className="px-3 py-3 text-slate-500">{index + 1}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          {imageUrl ? <Image src={imageUrl} alt="" width={48} height={40} unoptimized className="h-10 w-12 rounded object-contain" /> : <div className="flex h-10 w-12 items-center justify-center rounded bg-slate-100"><FileText className="h-5 w-5 text-slate-400" /></div>}
                          <span className="font-semibold text-slate-900">{product?.name ?? "Deleted product"}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono text-slate-600">{product?.sku ?? "—"}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(item.unit_cost, context.currency)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{item.quantity}</td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatCurrency(item.unit_cost * item.quantity, context.currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_1fr] print:grid-cols-[1fr_1fr]">
            <div className="rounded-lg bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-emerald-900">Notes</h3>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">{transfer.notes || transfer.reason || "Stock transfer between the listed locations."}</p>
            </div>
            <div className="overflow-hidden rounded-lg border border-emerald-100 text-xs">
              <p className="flex justify-between px-4 py-2.5 text-slate-600"><span>Total Quantity</span><strong className="text-slate-900">{(items ?? []).reduce((sum, item) => sum + item.quantity, 0)}</strong></p>
              <p className="flex justify-between border-t border-emerald-100 px-4 py-2.5 text-slate-600"><span>Subtotal</span><strong className="text-slate-900">{formatCurrency(totalValue, context.currency)}</strong></p>
              <p className="flex justify-between bg-emerald-800 px-4 py-3 font-semibold text-white"><span>Grand Total</span><strong>{formatCurrency(totalValue, context.currency)}</strong></p>
            </div>
          </div>

          <div className="grid gap-4 border-t border-slate-200 pt-4 text-xs sm:grid-cols-2 print:grid-cols-2">
            <div>
              <div className="mb-2 h-7 border-b border-dashed border-slate-300" />
              <p className="text-slate-500">Prepared By</p>
              <p className="mt-1 font-semibold text-slate-900">{requestedByEmail}</p>
              <p className="mt-1 text-slate-500">{formatDisplayDate(transfer.created_at)}</p>
            </div>
            <div>
              <div className="mb-2 h-7 border-b border-dashed border-slate-300" />
              <p className="text-slate-500">Received By</p>
              <p className="mt-1 font-semibold text-slate-900">{transfer.received_by ? receivedByEmail : "Pending receipt confirmation"}</p>
              {transfer.received_at && <p className="mt-1 text-slate-500">{formatDisplayDate(transfer.received_at)}</p>}
            </div>
          </div>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-2 bg-emerald-950 px-5 py-3 text-[10px] text-white print:px-8">
          <span>{organizationName} <span className="mx-2 text-emerald-300">|</span> Inventory Management</span>
          <span>Stock transfer record · {transferLabel}</span>
        </footer>
      </section>

      <Card className="print:hidden">
        <CardContent className="pt-5">
          <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Timeline</h2>
          <ul className="mt-3 space-y-3">
            {timelineSteps.map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                {step.done ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-signal" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-ledger-300" />
                )}
                <div>
                  <p className={step.done ? "text-sm font-medium text-ink-900 dark:text-white" : "text-sm text-ledger-400"}>
                    {step.label}
                  </p>
                  {step.at && (
                    <p className="text-xs text-ledger-400">
                      {new Date(step.at).toLocaleString()}
                      {step.by ? ` · ${step.by}` : ""}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
