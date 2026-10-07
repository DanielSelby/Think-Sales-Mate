import { formatMoney } from "@/lib/currency";
import type { InvoiceFormat } from "@/lib/sales/invoice-format";

// ---------------------------------------------------------------------------
// Branded POS receipt — black/green diagonal-header style, used by the POS
// module (both the post-sale receipt and Recent Transactions → Print).
// Separate from buildInvoiceHtml above (which the main Sales list still
// uses) since this one needs branch contact info and a cashier/terminal
// line that the plain invoice doesn't.
// ---------------------------------------------------------------------------

export interface BrandedInvoiceItem {
  productName: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  lineTotal: number;
}

export interface BrandedInvoiceData {
  orgName: string;
  systemName?: string;
  logoUrl?: string | null;
  showLogoOnInvoices?: boolean;
  locationName: string | null;
  locationAddress: string | null;
  locationPhone: string | null;
  locationEmail: string | null;
  organizationPhone?: string | null;
  organizationEmail?: string | null;
  organizationWebsite?: string | null;
  showOrganizationContact?: boolean;
  saleNumber: number;
  saleDate: string;
  cashierName: string;
  customerName: string;
  paymentMethod: string | null;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  currency: string;
  items: BrandedInvoiceItem[];
  printFormat?: InvoiceFormat;
}

export async function waitForInvoiceImages(win: Window): Promise<void> {
  const images = Array.from(win.document.images);
  await Promise.all(images.map((image) => {
    if (image.complete) return Promise.resolve();
    return new Promise<void>((resolve) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
    });
  }));
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function esc(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatCurrency(amount: number, currency: string): string {
  return formatMoney(Number(amount) || 0, currency || "GHS");
}

function formatDateTime(value: string): { date: string; time: string } {
  const d = new Date(value);

  return {
    date: d.toLocaleDateString("en-GB"),
    time: d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

function formatInvoiceNumber(saleNumber: number): string {
  return `INV-${new Date().getFullYear()}-${String(saleNumber).padStart(5, "0")}`;
}

export function buildBrandedInvoiceHtml(data: BrandedInvoiceData): string {
  const printFormat = data.printFormat ?? "a4";
  const thermal = printFormat !== "a4";
  const paperWidth = printFormat === "thermal-58mm" ? 58 : 80;
  const { date, time } = formatDateTime(data.saleDate);
  const invoiceNo = formatInvoiceNumber(data.saleNumber);
  const change = Math.max(0, data.amountPaid - data.total);
  const addressLine = [data.locationAddress].filter(Boolean).join(", ");

  const rows = data.items.map((item, index) => thermal
    ? `
      <tr>
        <td>
          <div class="item-name">${esc(item.productName)}</div>
          ${item.sku ? `<div class="item-sku">${esc(item.sku)}</div>` : ""}
          <div class="thermal-unit">${esc(formatCurrency(item.unitPrice, data.currency))} × ${item.quantity}</div>
        </td>
        <td class="num">${item.quantity}</td>
        <td class="num strong">${esc(formatCurrency(item.lineTotal, data.currency))}</td>
      </tr>`
    : `
      <tr>
        <td class="num idx">${index + 1}</td>
        <td>
          <div class="item-row">
            <div class="item-avatar">${esc(initials(item.productName))}</div>
            <div>
              <div class="item-name">${esc(item.productName)}</div>
              ${item.sku ? `<div class="item-sku">${esc(item.sku)}</div>` : ""}
            </div>
          </div>
        </td>
          <td class="num">${item.quantity}</td>
          <td class="num">${esc(formatCurrency(item.unitPrice, data.currency))}</td>
          <td class="num">${esc(formatCurrency(item.discountAmount, data.currency))}</td>
          <td class="num strong">${esc(formatCurrency(item.lineTotal, data.currency))}</td>
        </tr>`
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(invoiceNo)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
    color: #14210f;
    margin: 0;
    padding: 0;
    background: #fff;
  }
  .sheet { max-width: 800px; margin: 0 auto; padding: 24px; }
  .header {
    display: flex; justify-content: space-between; align-items: flex-start;
    background: #111c14; color: #fff; border-radius: 14px; padding: 24px 28px; margin-bottom: 20px;
    position: relative; overflow: hidden;
  }
  .header::after {
    content: ""; position: absolute; right: -60px; top: -60px; width: 220px; height: 220px;
    background: #1e7d34; opacity: 0.35; transform: rotate(20deg);
  }
  .brand { display: flex; align-items: center; gap: 12px; position: relative; z-index: 1; }
  .brand-mark {
    width: 46px; height: 46px; border-radius: 50%; background: #2fae4e; color: #fff;
    display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 15px; flex-shrink: 0;
    overflow: hidden;
  }
  .brand-mark img { width: 100%; height: 100%; object-fit: contain; background: #fff; }
  .brand-name { font-size: 22px; font-weight: 800; letter-spacing: -0.01em; }
  .brand-sub { font-size: 11px; color: #b7ccb9; margin-top: 1px; }
  .brand-contact { font-size: 11px; color: #d7e5d8; margin-top: 8px; line-height: 1.6; }
  .header-right { text-align: right; position: relative; z-index: 1; }
  .invoice-title { font-size: 26px; font-weight: 800; letter-spacing: 0.02em; }
  .invoice-no { display: inline-block; margin-top: 6px; background: #2fae4e; color: #fff; font-weight: 700; font-size: 12px; padding: 4px 12px; border-radius: 999px; }
  .meta-list { margin-top: 12px; font-size: 12px; line-height: 2; text-align: left; display: inline-block; }
  .meta-list b { color: #cdeccf; font-weight: 700; display: inline-block; width: 78px; }

  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 18px; }
  .box { border: 1px solid #e4ece5; border-radius: 12px; padding: 14px 16px; }
  .box-title { font-size: 11px; font-weight: 800; letter-spacing: 0.04em; color: #2fae4e; text-transform: uppercase; margin-bottom: 6px; }
  .box-value { font-size: 14px; font-weight: 600; }

  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  thead tr { background: #111c14; color: #fff; }
  thead th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; padding: 10px 10px; font-weight: 700; }
  thead th.num { text-align: right; }
  thead th.idx { width: 28px; }
  tbody td { padding: 12px 10px; border-bottom: 1px solid #f0f5f0; vertical-align: middle; }
  tbody tr:nth-child(odd) { background: #fafcfa; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.strong { font-weight: 700; }
  .item-row { display: flex; align-items: center; gap: 10px; }
  .item-avatar { width: 30px; height: 30px; border-radius: 8px; background: #eaf5eb; color: #1e7d34; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 800; flex-shrink: 0; }
  .item-name { font-size: 13px; font-weight: 600; }
  .item-sku { font-size: 10.5px; color: #94a3b8; font-family: monospace; margin-top: 1px; }

  .bottom { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 18px; align-items: start; }
  .thanks { background: #111c14; color: #fff; border-radius: 12px; padding: 18px; }
  .thanks b { color: #4ec86a; }
  .thanks p { margin: 4px 0 0; font-size: 12px; color: #cbd8cc; }
  .totals-box { border: 1px solid #e4ece5; border-radius: 12px; overflow: hidden; }
  .totals-row { display: flex; justify-content: space-between; padding: 8px 16px; font-size: 12.5px; color: #46564a; }
  .totals-row.grand { background: #2fae4e; color: #fff; font-weight: 800; font-size: 15px; padding: 12px 16px; }
  .totals-row.paid { background: #f3f9f3; font-weight: 700; }

  .contact-footer { display: flex; justify-content: space-between; gap: 14px; margin-top: 18px; padding-top: 10px; border-top: 1px solid #e4ece5; font-size: 10px; color: #46564a; }
  .contact-footer div { min-width: 0; }
  .contact-footer b { display: block; margin-bottom: 3px; color: #14210f; font-size: 9px; text-transform: uppercase; }
  .footer-note { text-align: center; margin-top: 12px; font-size: 11px; color: #9aa79c; }
  @media print {
    .sheet { padding: 8px; }
  }
  @page { size: ${thermal ? `${paperWidth}mm auto` : "A4 portrait"}; margin: ${thermal ? "2mm" : "10mm"}; }
  ${thermal ? `
  body.thermal { width: ${paperWidth}mm; font-size: 10px; }
  body.thermal .sheet { width: ${paperWidth - 4}mm; max-width: none; margin: 0 auto; padding: 0; }
  body.thermal .header { display: block; padding: 3mm 0; margin: 0 0 2mm; background: #fff; color: #111; border-radius: 0; border-bottom: 1px solid #222; }
  body.thermal .header::after, body.thermal .item-avatar, body.thermal .thanks { display: none; }
  body.thermal .brand { gap: 2mm; }
  body.thermal .brand-mark { width: 8mm; height: 8mm; font-size: 10px; }
  body.thermal .brand-name { font-size: 13px; }
  body.thermal .brand-sub, body.thermal .brand-contact { color: #333; font-size: 9px; }
  body.thermal .brand-contact { margin-top: 2px; }
  body.thermal .header-right { margin-top: 2mm; text-align: left; }
  body.thermal .invoice-title { display: inline; font-size: 14px; }
  body.thermal .invoice-no { display: inline; margin: 0 0 0 2mm; padding: 0; background: none; color: #111; font-size: 10px; }
  body.thermal .meta-list { display: grid; grid-template-columns: 1fr 1fr; gap: 0 2mm; margin-top: 1mm; font-size: 9px; line-height: 1.5; }
  body.thermal .meta-list b { width: auto; margin-right: 1mm; color: #333; }
  body.thermal .cols { display: block; margin: 0 0 2mm; }
  body.thermal .box { border: 0; border-bottom: 1px dashed #aaa; border-radius: 0; padding: 1.5mm 0; }
  body.thermal .box-title { display: inline; margin: 0 1mm 0 0; font-size: 8px; }
  body.thermal .box-value { display: inline; font-size: 10px; }
  body.thermal table { table-layout: fixed; margin: 0; }
  body.thermal thead tr { background: #eee; color: #111; }
  body.thermal thead th { padding: 1.5mm 1mm; font-size: 8px; }
  body.thermal tbody td { padding: 1.5mm 1mm; border-bottom: 1px dashed #bbb; font-size: 9px; }
  body.thermal .receipt-items th:first-child, body.thermal .receipt-items td:first-child { width: 64%; text-align: left; }
  body.thermal .receipt-items th:nth-child(2), body.thermal .receipt-items td:nth-child(2) { width: 10%; }
  body.thermal .receipt-items th:nth-child(3), body.thermal .receipt-items td:nth-child(3) { width: 26%; }
  body.thermal .item-name { font-size: 9px; }
  body.thermal .item-sku, body.thermal .thermal-unit { margin-top: 1px; font-size: 8px; color: #555; }
  body.thermal .bottom { display: block; margin-top: 2mm; }
  body.thermal .totals-box { border: 0; border-radius: 0; }
  body.thermal .totals-row { padding: 1mm 0; font-size: 9px; color: #111; }
  body.thermal .totals-row.grand { padding: 1.5mm 0; background: #fff; color: #111; font-size: 12px; border-top: 1px solid #222; border-bottom: 1px solid #222; }
  body.thermal .contact-footer { display: block; margin-top: 2mm; padding-top: 1.5mm; border-top: 1px solid #222; font-size: 8px; color: #111; }
  body.thermal .contact-footer div + div { margin-top: 1.5mm; }
  body.thermal .contact-footer b { display: inline; margin: 0 1mm 0 0; font-size: 8px; }
  body.thermal .footer-note { margin: 2mm 0 0; font-size: 8px; color: #555; }
  @media print {
    body.thermal { width: ${paperWidth}mm; }
    body.thermal .sheet { width: ${paperWidth - 4}mm; padding: 0; }
  }
  ` : ""}
</style>
</head>
<body class="${thermal ? "thermal" : "a4"}">
  <div class="sheet">
    <div class="header">
      <div class="brand">
        <div class="brand-mark">
          ${data.logoUrl && data.showLogoOnInvoices !== false
            ? `<img src="${esc(data.logoUrl)}" alt="${esc(data.orgName)}" />`
            : esc(initials(data.orgName))}
        </div>
        <div>
          <div class="brand-name">${esc(data.orgName)}</div>
          ${data.locationName ? `<div class="brand-sub">${esc(data.locationName)}</div>` : ""}
          <div class="brand-contact">
            ${addressLine ? esc(addressLine) + "<br/>" : ""}
          </div>
        </div>
      </div>
      <div class="header-right">
        <div class="invoice-title">INVOICE</div>
        <div class="invoice-no">${esc(invoiceNo)}</div>
        <div class="meta-list">
          <div><b>DATE</b>${esc(date)}</div>
          <div><b>TIME</b>${esc(time)}</div>
          <div><b>CASHIER</b>${esc(data.cashierName)}</div>
        </div>
      </div>
    </div>

    <div class="cols">
      <div class="box">
        <div class="box-title">Customer</div>
        <div class="box-value">${esc(data.customerName)}</div>
      </div>
      <div class="box">
        <div class="box-title">Payment method</div>
        <div class="box-value">${esc(data.paymentMethod ?? "—")}</div>
      </div>
    </div>

    <table class="${thermal ? "receipt-items" : ""}">
      <thead>
        ${thermal
          ? "<tr><th>Item</th><th class=\"num\">Qty</th><th class=\"num\">Total</th></tr>"
          : `<tr>
            <th class="idx">#</th>
            <th>Item</th>
            <th class="num">Qty</th>
            <th class="num">Unit price</th>
            <th class="num">Discount</th>
            <th class="num">Total</th>
          </tr>`}
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="${thermal ? 3 : 6}" style="text-align:center;color:#94a3b8;padding:24px;">No line items on this sale.</td></tr>`}
      </tbody>
    </table>

    <div class="bottom">
      <div class="thanks">
        <b>Thank you for shopping with us!</b>
        <p>We appreciate your business.</p>
      </div>
      <div class="totals-box">
        <div class="totals-row"><span>Subtotal</span><span>${esc(formatCurrency(data.subtotal, data.currency))}</span></div>
        <div class="totals-row"><span>Discount</span><span>${esc(formatCurrency(data.discountAmount, data.currency))}</span></div>
        <div class="totals-row"><span>Tax</span><span>${esc(formatCurrency(data.taxAmount, data.currency))}</span></div>
        <div class="totals-row grand"><span>Total</span><span>${esc(formatCurrency(data.total, data.currency))}</span></div>
        <div class="totals-row paid"><span>Amount paid</span><span>${esc(formatCurrency(data.amountPaid, data.currency))}</span></div>
        <div class="totals-row"><span>Change</span><span>${esc(formatCurrency(change, data.currency))}</span></div>
      </div>
    </div>

    ${(data.locationPhone || data.locationEmail || (data.showOrganizationContact !== false && (data.organizationPhone || data.organizationEmail || data.organizationWebsite)))
      ? `<div class="contact-footer">
          ${data.locationPhone || data.locationEmail
            ? `<div><b>${esc(data.locationName || "Branch")} contact</b>${data.locationPhone ? `<span>${esc(data.locationPhone)}</span>` : ""}${data.locationPhone && data.locationEmail ? " · " : ""}${data.locationEmail ? `<span>${esc(data.locationEmail)}</span>` : ""}</div>`
            : ""}
          ${data.showOrganizationContact !== false && (data.organizationPhone || data.organizationEmail || data.organizationWebsite)
            ? `<div><b>Organization contact</b>${data.organizationPhone ? `<span>${esc(data.organizationPhone)}</span>` : ""}${data.organizationPhone && data.organizationEmail ? " · " : ""}${data.organizationEmail ? `<span>${esc(data.organizationEmail)}</span>` : ""}${(data.organizationPhone || data.organizationEmail) && data.organizationWebsite ? " · " : ""}${data.organizationWebsite ? `<span>${esc(data.organizationWebsite)}</span>` : ""}</div>`
            : ""}
        </div>`
      : ""}

    <div class="footer-note">Powered by ${esc(data.systemName || "ThinkSales ERP Pro")}</div>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Sales list invoice builder
// Compatibility wrapper used by sales-list-view.tsx
// ---------------------------------------------------------------------------

export interface InvoiceItem {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  tax: number;
  lineTotal: number;
}

export interface InvoiceData {
  orgName: string;
  systemName?: string;
  logoUrl?: string | null;
  showLogoOnInvoices?: boolean;
  saleNumber: number;
  saleDate: string;
  customerName: string;
  soldByName: string;
  locationName: string | null;
  paymentMethod: string | null;
  paymentStatus: string;
  subtotal: number;
  total: number;
  amountPaid: number;
  currency: string;
  items: InvoiceItem[];
  printFormat?: InvoiceFormat;
  locationPhone?: string | null;
  locationEmail?: string | null;
  organizationPhone?: string | null;
  organizationEmail?: string | null;
  organizationWebsite?: string | null;
  showOrganizationContact?: boolean;
}

export function buildInvoiceHtml(data: InvoiceData): string {
  const discountAmount = Math.max(0, data.subtotal - data.total);

  const items: BrandedInvoiceItem[] = data.items.map((item) => ({
    productName: item.productName,
    sku: item.sku || null,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discountAmount: item.discount ?? 0,
    lineTotal: item.lineTotal,
  }));

  return buildBrandedInvoiceHtml({
    orgName: data.orgName,
    systemName: data.systemName,
    logoUrl: data.logoUrl,
    showLogoOnInvoices: data.showLogoOnInvoices,
    locationName: data.locationName,
    locationAddress: null,
    locationPhone: data.locationPhone ?? null,
    locationEmail: data.locationEmail ?? null,
    organizationPhone: data.organizationPhone,
    organizationEmail: data.organizationEmail,
    organizationWebsite: data.organizationWebsite,
    showOrganizationContact: data.showOrganizationContact,
    saleNumber: data.saleNumber,
    saleDate: data.saleDate,
    cashierName: data.soldByName,
    customerName: data.customerName,
    paymentMethod: data.paymentMethod,
    subtotal: data.subtotal,
    discountAmount,
    taxAmount: 0,
    total: data.total,
    amountPaid: data.amountPaid,
    currency: data.currency,
    items,
    printFormat: data.printFormat,
  });
}