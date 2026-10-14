import { formatMoney } from "@/lib/currency";
import type { InvoiceFormat, SalesInvoiceTemplate } from "@/lib/sales/invoice-format";
import { formatInvoiceDate } from "@/lib/sales/payment-terms";

const INVOICE_POWERED_BY = "Powered by Think-Digital Solution - 0244-707-120";

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
  imageUrl?: string | null;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxPercent?: number;
  lineTotal: number;
}

export interface BrandedInvoiceData {
  orgName: string;
  systemName?: string;
  logoUrl?: string | null;
  showLogoOnInvoices?: boolean;
  locationName: string | null;
  locationCode?: string | null;
  locationAddress: string | null;
  locationPhone: string | null;
  locationEmail: string | null;
  organizationPhone?: string | null;
  organizationEmail?: string | null;
  organizationWebsite?: string | null;
  showOrganizationContact?: boolean;
  invoiceTemplate?: SalesInvoiceTemplate;
  invoiceSlogan?: string | null;
  invoiceThankYouMessage?: string | null;
  invoiceTermsAndConditions?: string | null;
  customerPhone?: string | null;
  dueDate?: string | null;
  saleNumber: number;
  receiptNumberPrefix?: "POS";
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

function formatReceiptNumber(data: BrandedInvoiceData): string {
  if (data.receiptNumberPrefix === "POS") {
    const year = /^\d{4}/.test(data.saleDate) ? data.saleDate.slice(0, 4) : String(new Date().getFullYear());
    return `POS-${year}-${String(data.saleNumber).padStart(5, "0")}`;
  }
  return formatInvoiceNumber(data.saleNumber);
}

function formatCustomerName(name: string, phone?: string | null): string {
  return phone ? `${name} · ${phone}` : name;
}

export function buildBrandedInvoiceHtml(data: BrandedInvoiceData): string {
  const printFormat = data.printFormat ?? "a4";
  const thermal = printFormat !== "a4";
  if (data.invoiceTemplate === "retail" && !thermal) {
    return buildRetailInvoiceHtml(data);
  }
  if (data.invoiceTemplate === "think-sales" && !thermal) {
    return buildThinkSalesInvoiceHtml(data);
  }
  const paperWidth = printFormat === "thermal-58mm" ? 58 : 80;
  const { date, time } = formatDateTime(data.saleDate);
  const invoiceNo = formatReceiptNumber(data);
  const documentTitle = data.receiptNumberPrefix === "POS" ? "POS RECEIPT" : "INVOICE";
  const paymentDue = data.amountPaid >= data.total
    ? "Paid in full"
    : data.dueDate ? formatInvoiceDate(data.dueDate) : "Due on receipt";
  const change = Math.max(0, data.amountPaid - data.total);
  const balanceDue = Math.max(0, data.total - data.amountPaid);
  const hasBalanceDue = balanceDue > 0.005;
  const addressLine = [data.locationAddress].filter(Boolean).join(", ");
  const customerName = formatCustomerName(data.customerName, data.customerPhone);

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
  .brand { display: flex; align-items: flex-start; gap: 12px; position: relative; z-index: 1; }
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
  .totals-row.paid { background: #f3f9f3; color: #15803d; font-weight: 700; }
  .totals-row.paid > :last-child { color: #15803d; }
  .totals-row.balance-due { color: #b91c1c; font-weight: 700; }

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
  body.thermal .totals-row.paid, body.thermal .totals-row.paid > :last-child { color: #15803d; }
  body.thermal .totals-row.balance-due { color: #b91c1c; }
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
        <div class="invoice-title">${documentTitle}</div>
        <div class="invoice-no">${esc(invoiceNo)}</div>
        <div class="meta-list">
          <div><b>DATE</b>${esc(date)}</div>
          <div><b>TIME</b>${esc(time)}</div>
          <div><b>CASHIER</b>${esc(data.cashierName)}</div>
          <div><b>DUE</b>${esc(paymentDue)}</div>
        </div>
      </div>
    </div>

    <div class="cols">
      <div class="box">
        <div class="box-title">Customer</div>
        <div class="box-value">${esc(customerName)}</div>
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
        ${hasBalanceDue ? `<div class="totals-row balance-due"><span>Customer balance</span><span>${esc(formatCurrency(balanceDue, data.currency))}</span></div>` : ""}
        <div class="totals-row"><span>Change</span><span>${esc(formatCurrency(change, data.currency))}</span></div>
      </div>
    </div>

    ${(data.locationCode || data.locationPhone || data.locationEmail || (data.showOrganizationContact !== false && (data.organizationPhone || data.organizationEmail || data.organizationWebsite)))
      ? `<div class="contact-footer">
          ${data.locationCode || data.locationPhone || data.locationEmail
            ? `<div><b>${esc(data.locationName || "Branch")} contact</b>${data.locationCode ? `<span>Branch No. ${esc(data.locationCode)}</span>` : ""}${data.locationCode && data.locationPhone ? " · " : ""}${data.locationPhone ? `<span>${esc(data.locationPhone)}</span>` : ""}${data.locationPhone && data.locationEmail ? " · " : ""}${data.locationEmail ? `<span>${esc(data.locationEmail)}</span>` : ""}</div>`
            : ""}
          ${data.showOrganizationContact !== false && (data.organizationPhone || data.organizationEmail || data.organizationWebsite)
            ? `<div><b>Organization contact</b>${data.organizationPhone ? `<span>${esc(data.organizationPhone)}</span>` : ""}${data.organizationPhone && data.organizationEmail ? " · " : ""}${data.organizationEmail ? `<span>${esc(data.organizationEmail)}</span>` : ""}${(data.organizationPhone || data.organizationEmail) && data.organizationWebsite ? " · " : ""}${data.organizationWebsite ? `<span>${esc(data.organizationWebsite)}</span>` : ""}</div>`
            : ""}
        </div>`
      : ""}

    <div class="footer-note">${INVOICE_POWERED_BY}</div>
  </div>
</body>
</html>`;
}

function buildRetailInvoiceHtml(data: BrandedInvoiceData): string {
const receiptNumber = formatReceiptNumber(data);
const isPos = data.receiptNumberPrefix === "POS";
const { date, time } = formatDateTime(data.saleDate);
const paid = data.amountPaid >= data.total - 0.005;
const balance = Math.max(0, data.total - data.amountPaid);
const logo = data.logoUrl && data.showLogoOnInvoices !== false
  ? `<img class="brand-logo" src="${esc(data.logoUrl)}" alt="${esc(data.orgName)}" />`
  : `<div class="brand-mark">${esc(initials(data.orgName))}</div>`;
const branchContacts = [data.locationPhone, data.locationEmail].filter(Boolean);
const rows = data.items.map((item, index) => `
  <tr>
    <td class="row-number">${index + 1}</td>
    <td>
      <div class="product">
        ${item.imageUrl
          ? `<img class="product-image" src="${esc(item.imageUrl)}" alt="" />`
          : `<div class="product-image product-fallback">${esc(initials(item.productName))}</div>`}
        <div><strong>${esc(item.productName)}</strong></div>
      </div>
    </td>
    <td class="number">${item.quantity}</td>
    <td class="number">${esc(formatCurrency(item.unitPrice, data.currency))}</td>
    <td class="number">${esc(formatCurrency(item.discountAmount, data.currency))}</td>
    <td class="number">${esc(formatCurrency(Math.max(0, item.lineTotal) * ((item.taxPercent ?? 0) / 100), data.currency))}</td>
    <td class="number total">${esc(formatCurrency(item.lineTotal, data.currency))}</td>
  </tr>`).join("");
const documentTitle = isPos ? "Sales Receipt" : "Sales Invoice";
const paymentStatus = paid ? "Paid" : data.amountPaid > 0 ? "Partially Paid" : "Unpaid";
const paymentStatusClass = paid ? "paid" : data.amountPaid > 0 ? "partial" : "unpaid";
const customerName = formatCustomerName(data.customerName || "Walk-In Customer", data.customerPhone);
const brandContact = data.showOrganizationContact === false
  ? []
  : [data.organizationPhone, data.organizationEmail, data.organizationWebsite].filter(Boolean);
const thankYouMessage = data.invoiceThankYouMessage || "Thank you for your purchase!";

return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(receiptNumber)}</title>
<style>
* { box-sizing: border-box; }
@page { size: A4 portrait; margin: 8mm; }
body { margin: 0; background: #fff; color: #17313b; font: 11px Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.retail-invoice { max-width: 820px; margin: 0 auto; }
.top { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; padding: 4px 0 8px; }
.brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
.brand-logo { width: 48px; height: 44px; object-fit: contain; }
.brand-mark { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 10px; background: #087d69; color: #fff; font-size: 15px; font-weight: 800; }
.brand-name { color: #142f39; font-size: 20px; font-weight: 800; letter-spacing: -.6px; }
.brand-name span { color: #07856d; }
.brand-slogan { margin-top: 3px; color: #526d73; font-size: 10px; font-weight: 600; }
.contacts { display: grid; justify-items: end; gap: 4px; max-width: 300px; color: #263e45; font-size: 11px; font-weight: 700; line-height: 1.4; text-align: right; }
.contacts strong { color: #17313b; font-size: 12px; font-weight: 800; }
.contact-line { display: flex; align-items: center; gap: 4px; }
.contact-icon, .meta-label svg, .status svg { width: 12px; height: 12px; flex: 0 0 auto; }
.intro-grid { display: grid; grid-template-columns: 1fr minmax(300px, 360px); gap: 10px; margin: 0 0 8px; }
.intro { display: flex; align-items: center; padding: 4px 0; }
h1 { margin: 0; color: #142f39; font-size: 23px; line-height: 1.1; letter-spacing: -.4px; }
.meta-card { padding: 9px 11px; border-radius: 10px; background: #edf8f5; }
.meta-heading { display: flex; gap: 8px; align-items: center; margin-bottom: 7px; color: #173d3b; font-size: 12px; font-weight: 700; }
.meta-icon { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 8px; background: #087d69; color: white; }
.meta-icon svg { width: 17px; height: 17px; }
.meta-number { display: block; margin-top: 2px; font-size: 13px; font-weight: 800; }
.meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; }
.meta-item span, .customer-card span, .payment-card span { display: block; margin-bottom: 3px; color: #668087; font-size: 9px; }
.meta-item strong { color: #17313b; font-size: 10px; }
.meta-label { display: flex !important; align-items: center; gap: 4px; }
.meta-label svg { width: 11px; height: 11px; }
.detail-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 9px; margin-bottom: 8px; }
.customer-card, .payment-card { min-height: 0; padding: 9px 11px; border-radius: 9px; background: #f0f8fa; }
.customer-card strong { display: block; margin-top: 2px; color: #17313b; font-size: 12px; }
.customer-card small { display: block; margin-top: 3px; color: #71858a; font-size: 9px; }
.payment-card { display: flex; align-items: center; gap: 12px; background: #edf8f5; }
.payment-card > div { width: 100%; }
.status { display: flex; width: 100%; align-items: center; justify-content: center; gap: 5px; border: 1px solid rgba(0,0,0,.12); border-radius: 15px; padding: 5px 10px; color: #fff !important; font-size: 10px; font-weight: 800; line-height: 1.25; text-transform: uppercase; }
.status.paid { background: #087d69; color: #fff !important; }
.status.partial { background: #a85d00; color: #fff !important; }
.status.unpaid { background: #b42318; color: #fff !important; }
.status svg { color: #fff !important; stroke: #fff !important; }
.payment-method { margin-top: 5px; color: #17313b; font-size: 10px; font-weight: 700; }
table { width: 100%; border: 1px solid #dce9e7; border-collapse: separate; border-spacing: 0; overflow: hidden; border-radius: 10px; }
thead { background: #087d69; color: #fff; }
th { padding: 8px 8px; font-size: 9px; text-align: left; }
th.number, td.number { text-align: right; }
td { padding: 6px 8px; border-bottom: 1px solid #e7eeee; color: #243e45; font-size: 9px; }
tbody tr:last-child td { border-bottom: 0; }
.row-number { width: 28px; }
.total { font-weight: 700; }
.product { display: flex; align-items: center; gap: 7px; min-width: 150px; }
.product-image { width: 30px; height: 30px; flex: 0 0 auto; border-radius: 6px; background: #f1f6f6; object-fit: contain; }
.product-fallback { display: grid; place-items: center; color: #087d69; font-size: 9px; font-weight: 800; }
.product strong { display: block; color: #17313b; font-size: 9px; }
.bottom-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; margin-top: 8px; }
.sale-details, .totals { padding: 8px 10px; border-radius: 9px; background: #f0f8fa; }
.sale-details { display: grid; align-content: center; gap: 6px; }
.detail-line { color: #567077; }
.detail-line strong { display: block; margin-top: 2px; color: #17313b; font-size: 10px; }
.totals { overflow: hidden; background: #edf8f5; }
.total-line { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 4px 2px; border-bottom: 1px solid #dcebe7; font-size: 9px; }
.total-line > * { min-width: 0; }
.total-line strong { color: #17313b; text-align: right; white-space: nowrap; }
.grand-total { margin: 5px -10px -8px; padding: 9px 10px; border-radius: 0 0 9px 9px; background: #087d69; color: #fff; font-size: 12px; font-weight: 800; }
.grand-total strong { color: #fff; font-size: 14px; }
.footer { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 10px; margin-top: 8px; padding: 10px 12px; border-radius: 9px; background: linear-gradient(120deg, #075d53, #07866c); color: #fff; }
.footer strong { display: block; font-family: Georgia, serif; font-size: 16px; font-style: italic; }
.footer-message { margin-top: 3px; color: #d5f2e9; font-size: 9px; font-weight: 600; }
.footer-contact { color: #d5f2e9; font-size: 8px; line-height: 1.4; text-align: right; }
.footer-powered { grid-column: 1 / -1; color: #d5f2e9; font-size: 8px; font-weight: 700; text-align: center; }
.terms { margin-top: 8px; color: #71858a; font-size: 9px; line-height: 1.5; }
@media (max-width: 620px) {
  .top { flex-direction: column; }
  .footer { grid-template-columns: 1fr; }
  .contacts { justify-items: start; max-width: none; font-size: 11px; text-align: left; }
  .footer-contact { max-width: none; text-align: left; }
  .intro-grid, .detail-grid, .bottom-grid { grid-template-columns: 1fr; }
  .intro-grid { grid-template-columns: 1fr; }
  h1 { font-size: 21px; }
}
@media print {
  .retail-invoice { max-width: none; }
  .footer, .footer-message, .grand-total, thead, .status { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
</style>
</head>
<body>
<main class="retail-invoice">
  <header class="top">
    <div class="brand">${logo}<div><div class="brand-name">${esc(data.orgName)}</div>${data.invoiceSlogan ? `<div class="brand-slogan">${esc(data.invoiceSlogan)}</div>` : ""}</div></div>
    <div class="contacts">${data.locationName ? `<strong>${esc(data.locationName)}</strong>` : ""}${data.locationAddress ? `<span class="contact-line"><svg class="contact-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg><span>${esc(data.locationAddress)}</span></span>` : ""}${branchContacts.map((item) => `<span class="contact-line"><svg class="contact-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${item === data.locationPhone ? '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.4 2.8a2 2 0 0 1-.6 1.7L7 10.1a16 16 0 0 0 6 6l1.9-1.9a2 2 0 0 1 1.7-.6l2.8.4a2 2 0 0 1 1.7 1.9Z"/>' : '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'}</svg><span>${esc(item)}</span></span>`).join("")}</div>
  </header>
  <section class="intro-grid">
    <div class="intro">
      <h1>${documentTitle}</h1>
    </div>
    <div class="meta-card">
      <div class="meta-heading"><span class="meta-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></svg></span><div>Invoice No.<strong class="meta-number">${esc(receiptNumber)}</strong></div></div>
      <div class="meta-grid">
        <div class="meta-item"><span class="meta-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>Date</span><strong>${esc(date)}</strong></div>
        <div class="meta-item"><span class="meta-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>Time</span><strong>${esc(time)}</strong></div>
        <div class="meta-item"><span class="meta-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/></svg>Cashier</span><strong>${esc(data.cashierName)}</strong></div>
        <div class="meta-item"><span class="meta-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>Branch</span><strong>${esc(data.locationName || "—")}</strong></div>
      </div>
    </div>
  </section>
  <section class="detail-grid">
    <div class="customer-card"><span>Customer</span><strong>${esc(customerName)}</strong></div>
    <div class="payment-card"><div><span class="status ${paymentStatusClass}">${paid ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>' : data.amountPaid > 0 ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v4m0 4h.01"/></svg>'}${paymentStatus}</span><span style="margin-top:6px">Payment Method</span><div class="payment-method">${esc(data.paymentMethod || "—")}</div></div></div>
  </section>
  <table>
    <thead><tr><th>#</th><th>Product</th><th class="number">Qty.</th><th class="number">Unit Price</th><th class="number">Discount</th><th class="number">Tax</th><th class="number">Total</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="7" style="text-align:center;padding:14px">No line items</td></tr>`}</tbody>
  </table>
  <section class="bottom-grid">
    <div class="sale-details">
      <div class="detail-line">Sales Type<strong>${isPos ? "Point of Sale" : "Sales Invoice"}</strong></div>
      ${data.invoiceTermsAndConditions ? `<div class="detail-line">Terms<strong>${esc(data.invoiceTermsAndConditions)}</strong></div>` : ""}
    </div>
    <div class="totals">
      <div class="total-line"><span>Subtotal</span><strong>${esc(formatCurrency(data.subtotal, data.currency))}</strong></div>
      <div class="total-line"><span>Discount</span><strong>${esc(formatCurrency(data.discountAmount, data.currency))}</strong></div>
      <div class="total-line"><span>Tax</span><strong>${esc(formatCurrency(data.taxAmount, data.currency))}</strong></div>
      ${data.amountPaid > 0 ? `<div class="total-line"><span>Amount Paid</span><strong>${esc(formatCurrency(data.amountPaid, data.currency))}</strong></div>` : ""}
      ${balance > 0.005 ? `<div class="total-line"><span>Balance Due</span><strong>${esc(formatCurrency(balance, data.currency))}</strong></div>` : ""}
      <div class="total-line grand-total"><span>Grand Total</span><strong>${esc(formatCurrency(data.total, data.currency))}</strong></div>
    </div>
  </section>
  <footer class="footer"><div><strong>Thank You!</strong><div class="footer-message">${esc(thankYouMessage)}</div></div><div class="footer-contact">${brandContact.map((item) => `<div>${esc(item)}</div>`).join("")}</div><div class="footer-powered">${INVOICE_POWERED_BY}</div></footer>
</main>
</body>
</html>`;
}

function buildThinkSalesInvoiceHtml(data: BrandedInvoiceData): string {
  const invoiceNo = formatReceiptNumber(data);
  const documentTitle = data.receiptNumberPrefix === "POS" ? "Sales Receipt" : "Sales Invoice";
  const date = new Date(data.saleDate);
  const invoiceDate = date.toLocaleDateString("en-GB");
  const balanceDue = Math.max(0, data.total - data.amountPaid);
  const hasBalanceDue = balanceDue > 0.005;
  const paymentDue = data.amountPaid >= data.total
    ? "Paid in full"
    : data.dueDate ? formatInvoiceDate(data.dueDate) : "Due on receipt";
  const subtotal = data.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const discount = data.items.reduce((sum, item) => sum + item.discountAmount, 0);
  const tax = data.items.reduce((sum, item) => {
    const taxable = Math.max(0, item.unitPrice * item.quantity - item.discountAmount);
    return sum + taxable * ((item.taxPercent ?? 0) / 100);
  }, 0);
  const customerName = formatCustomerName(data.customerName, data.customerPhone);
  const rows = data.items.map((item, index) => {
    const taxable = Math.max(0, item.unitPrice * item.quantity - item.discountAmount);
    const taxAmount = taxable * ((item.taxPercent ?? 0) / 100);
    const itemTotal = item.lineTotal + taxAmount;
    return `<tr>
      <td class="index">${index + 1}</td>
      <td><div class="product-cell">
        ${item.imageUrl
          ? `<img class="product-image" src="${esc(item.imageUrl)}" alt="" />`
          : `<div class="product-placeholder">${esc(initials(item.productName))}</div>`}
        <div><strong>${esc(item.productName)}</strong></div>
      </div></td>
      <td class="num">${esc(formatCurrency(item.unitPrice, data.currency))}</td>
      <td class="num">${item.quantity}</td>
      <td class="num">${esc(formatCurrency(item.discountAmount, data.currency))}</td>
      <td class="num">${esc(formatCurrency(taxAmount, data.currency))}${item.taxPercent ? `<small class="tax-rate">${item.taxPercent}%</small>` : ""}</td>
      <td class="num total">${esc(formatCurrency(itemTotal, data.currency))}</td>
    </tr>`;
  }).join("");
  const contactItems = [
    data.organizationPhone,
    data.organizationEmail,
    data.organizationWebsite,
  ].filter(Boolean);
  const brandLogo = data.logoUrl && data.showLogoOnInvoices !== false
    ? `<img class="logo" src="${esc(data.logoUrl)}" alt="${esc(data.orgName)}" />`
    : `<div class="logo-placeholder">${esc(initials(data.orgName))}</div>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(invoiceNo)}</title>
<style>
  * { box-sizing: border-box; }
  @page { size: A4 portrait; margin: 6mm; }
  body { margin: 0; background: #fff; color: #17313b; font: 11px Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .invoice { max-width: 960px; margin: 0 auto; overflow: hidden; }
  .masthead { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; padding: 9px 6px 11px; border-bottom: 1px solid #e5edf0; position: relative; }
  .masthead:after { content: ""; position: absolute; right: -28px; top: -60px; width: 160px; height: 150px; border-radius: 0 0 0 100%; background: linear-gradient(135deg,#42c69c,#087563); opacity: .18; }
  .brand { display: flex; align-items: center; gap: 12px; position: relative; z-index: 1; }
  .logo,.logo-placeholder { width: 54px; height: 48px; object-fit: contain; }
  .logo-placeholder { display: grid; place-items: center; border-radius: 8px; background: #0b806b; color: #fff; font-size: 15px; font-weight: 800; }
  .brand-name { color: #12313b; font-size: 22px; font-weight: 800; }
  .brand-caption { margin-top: 6px; color: #087d69; font-size: 9px; font-weight: 600; }
  .branch-details { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 8px; padding: 6px 8px; border-left: 3px solid #087d69; border-radius: 4px; background: #e8f6f2; color: #075d53; font-size: 10px; font-weight: 700; }
  .branch-phone { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; }
  .branch-phone-icon { font-size: 12px; line-height: 1; }
  .organization-contact { display: grid; gap: 5px; position: relative; z-index: 1; color: #344d56; font-size: 10px; }
  .contact-line { display: flex; gap: 8px; align-items: center; }
  .contact-icon { width: 14px; color: #087d69; font-weight: 700; text-align: center; }
  .title-row { display: grid; grid-template-columns: 1fr 300px; gap: 14px; align-items: center; padding: 10px 6px 8px; }
  h1 { margin: 0; color: #102f3a; font-size: 23px; line-height: 1.2; letter-spacing: -.3px; }
  .subtitle { margin: 4px 0 0; color: #70838a; font-size: 12px; }
  .title-rule { width: 52px; height: 3px; margin-top: 7px; background: #15a780; }
  .invoice-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; border-radius: 10px; background: #eef8f7; padding: 10px; }
  .meta-item span { display: block; margin-bottom: 2px; color: #72848a; font-size: 9px; }
  .meta-item strong { color: #17313b; font-size: 12px; }
  .recipient-grid { display: grid; grid-template-columns: 1fr 1fr; margin: 0 6px 8px; border-top: 1px solid #e2eaed; border-bottom: 1px solid #e2eaed; }
  .recipient { padding: 8px; min-height: 0; }
  .recipient + .recipient { border-left: 1px solid #e2eaed; padding-left: 14px; }
  .recipient-label { color: #087d69; font-size: 10px; font-weight: 700; text-transform: uppercase; }
  .recipient-name { margin-top: 4px; color: #19333d; font-size: 13px; font-weight: 700; }
  .recipient-note { margin-top: 3px; color: #617780; font-size: 10px; line-height: 1.4; }
  table { width: 100%; border-collapse: collapse; }
  thead { background: #087b68; color: white; }
  th { padding: 7px 8px; text-align: left; font-size: 9px; }
  th.num { text-align: right; }
  td { padding: 6px 8px; border-bottom: 1px solid #e7edef; vertical-align: middle; font-size: 9px; }
  tbody tr:nth-child(even) { background: #fbfcfc; }
  .index { width: 30px; }
  .product-cell { display: flex; align-items: center; gap: 7px; min-width: 145px; }
  .product-image,.product-placeholder { width: 32px; height: 30px; flex: 0 0 32px; object-fit: contain; border-radius: 5px; background: #f0f5f5; }
  .product-placeholder { display: grid; place-items: center; color: #087b68; font-weight: 700; }
  .product-cell strong { display: block; color: #18343e; font-size: 9px; }
  .product-cell small,.tax-rate { display: block; margin-top: 3px; color: #72848a; font-size: 8px; }
  .num { text-align: right; white-space: nowrap; }
  .total { color: #17313b; font-weight: 700; }
  .lower-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
  .details-card,.totals-card,.due-card { border-radius: 9px; background: #f1f8f7; padding: 8px 10px; }
  .details-card h2 { margin: 0 0 6px; color: #087b68; font-size: 11px; }
  .details-row { margin-top: 4px; color: #405a63; font-size: 9px; }
  .totals-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 4px 0; color: #405a63; }
  .totals-row > :last-child { text-align: right; }
  .totals-row strong { color: #19333d; }
  .totals-row.paid,.totals-row.paid strong { color: #15803d; }
  .totals-row.grand { margin: 4px -10px 0; padding: 8px 10px; border-radius: 0; background: #087b68; color: #fff; font-size: 12px; font-weight: 700; }
  .totals-row.grand strong { color: #fff; font-size: 14px; }
  .terms { margin-top: 6px; white-space: pre-line; line-height: 1.35; }
  .terms strong { display: block; margin-bottom: 4px; color: #087b68; }
  .footer-bottom { display: grid; grid-template-columns: 1fr 1fr; align-items: center; gap: 16px; }
  .served-by { grid-column: 2; justify-self: center; color: #fff; text-align: center; }
  .served-by-label { display: block; font-size: 13px; font-weight: 700; }
  .served-by-name { display: block; margin-top: 4px; color: #d9eeea; font-size: 11px; font-weight: 600; }
  .due-card { display: flex; justify-content: space-between; align-items: center; grid-column: 2; color: #087b68; }
  .due-card.balance-due,.due-card.balance-due strong { color: #b91c1c; }
  .due-card span { display: block; margin-bottom: 5px; color: #52716f; font-size: 9px; }
  .due-card strong { color: #19333d; font-size: 11px; }
  .footer { margin: 10px -6mm -6mm; padding: 11px 6mm 9px; background: #075d53; color: white; }
  .footer-thanks { font-size: 19px; font-style: italic; font-weight: 700; }
  .footer-note { margin-top: 3px; color: #c8e5df; font-size: 10px; font-style: italic; font-weight: 700; }
  .footer-contact { margin-top: 8px; color: #d9eeea; font-size: 9px; }
  .footer-note.powered-by { font-style: normal; }
  @media print { .invoice { max-width: none; } .footer { break-inside: avoid; } }
  @media screen and (max-width: 650px) { .title-row { grid-template-columns: 1fr; } .recipient-grid { grid-template-columns: 1fr; } .recipient + .recipient { border-left: 0; border-top: 1px solid #e2eaed; padding-left: 8px; } .invoice { overflow-x: auto; } }
</style>
</head>
<body>
<main class="invoice">
  <header class="masthead">
    <div class="brand">${brandLogo}<div><div class="brand-name">${esc(data.orgName)}</div>${data.invoiceSlogan ? `<div class="brand-caption">${esc(data.invoiceSlogan)}</div>` : ""}${data.locationName || data.locationCode || data.locationPhone ? `<div class="branch-details">${data.locationName ? `<span>${esc(data.locationName)}</span>` : ""}${data.locationCode ? `<span>Branch No. ${esc(data.locationCode)}</span>` : ""}${data.locationPhone ? `<span class="branch-phone"><span class="branch-phone-icon" aria-hidden="true">☎</span>${esc(data.locationPhone)}</span>` : ""}</div>` : ""}</div></div>
    ${data.showOrganizationContact !== false && contactItems.length ? `<div class="organization-contact">
      ${data.organizationPhone ? `<div class="contact-line"><span class="contact-icon">☎</span>${esc(data.organizationPhone)}</div>` : ""}
      ${data.organizationEmail ? `<div class="contact-line"><span class="contact-icon">✉</span>${esc(data.organizationEmail)}</div>` : ""}
      ${data.organizationWebsite ? `<div class="contact-line"><span class="contact-icon">◎</span>${esc(data.organizationWebsite)}</div>` : ""}
    </div>` : ""}
  </header>
  <section class="title-row">
    <div><h1>${esc(documentTitle)}</h1><p class="subtitle">Thank you for your business!</p><div class="title-rule"></div></div>
    <div class="invoice-meta">
      <div class="meta-item"><span>Invoice No.</span><strong>${esc(invoiceNo)}</strong></div>
      <div class="meta-item"><span>Status</span><strong>${data.amountPaid >= data.total ? "Paid" : "Payment due"}</strong></div>
      <div class="meta-item"><span>Invoice Date</span><strong>${esc(invoiceDate)}</strong></div>
      <div class="meta-item"><span>Due Date</span><strong>${esc(paymentDue)}</strong></div>
    </div>
  </section>
  <section class="recipient-grid">
    <div class="recipient"><div class="recipient-label">Customer</div><div class="recipient-name">${esc(customerName)}</div><div class="recipient-note"></div></div>
    <div class="recipient"><div class="recipient-label">Ship To</div><div class="recipient-name">${esc(customerName)}</div><div class="recipient-note">Same as billing address</div></div>
  </section>
  <table>
    <thead><tr><th>#</th><th>Product</th><th class="num">Unit Price</th><th class="num">Quantity</th><th class="num">Discount</th><th class="num">Tax</th><th class="num">Total</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="7" style="text-align:center;padding:24px;color:#72848a">No line items on this sale.</td></tr>`}</tbody>
  </table>
  <section class="lower-grid">
    <div class="details-card"><h2>Payment Method</h2><div class="details-row">${esc(data.paymentMethod || "Not specified")}</div><h2 style="margin-top:15px">Notes</h2><div class="details-row">Thank you for choosing ${esc(data.orgName)}. We appreciate your business.</div>${data.invoiceTermsAndConditions ? `<div class="details-row terms"><strong>Terms &amp; Conditions</strong>${esc(data.invoiceTermsAndConditions)}</div>` : ""}</div>
    <div class="totals-card">
      <div class="totals-row"><span>Subtotal</span><strong>${esc(formatCurrency(subtotal, data.currency))}</strong></div>
      <div class="totals-row"><span>Discount</span><strong>${esc(formatCurrency(discount, data.currency))}</strong></div>
      <div class="totals-row"><span>Tax</span><strong>${esc(formatCurrency(tax, data.currency))}</strong></div>
      <div class="totals-row grand"><span>Total Amount</span><strong>${esc(formatCurrency(data.total, data.currency))}</strong></div>
      <div class="totals-row paid"><span>Amount Paid</span><strong>${esc(formatCurrency(data.amountPaid, data.currency))}</strong></div>
    </div>
    <div class="due-card${hasBalanceDue ? " balance-due" : ""}"><div><span>${hasBalanceDue ? "Customer Balance" : "Payment Due"}</span><strong>${esc(paymentDue)}</strong></div><strong>${esc(formatCurrency(balanceDue, data.currency))}</strong></div>
  </section>
  <footer class="footer"><div class="footer-bottom"><div><div class="footer-thanks">Thank You!</div><div class="footer-note">${esc(data.invoiceThankYouMessage || "Your support drives our success.")}</div></div><div class="served-by"><span class="served-by-label">Served By</span><span class="served-by-name">${esc(data.cashierName || "—")}</span></div><div></div></div><div class="footer-note powered-by">${INVOICE_POWERED_BY}</div></footer>
</main>
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
  imageUrl?: string | null;
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
  locationCode?: string | null;
  organizationPhone?: string | null;
  organizationEmail?: string | null;
  organizationWebsite?: string | null;
  showOrganizationContact?: boolean;
  invoiceTemplate?: SalesInvoiceTemplate;
  invoiceSlogan?: string | null;
  invoiceThankYouMessage?: string | null;
  invoiceTermsAndConditions?: string | null;
  customerPhone?: string | null;
  dueDate?: string | null;
  receiptNumberPrefix?: "POS";
}

export function buildInvoiceHtml(data: InvoiceData): string {
  const discountAmount = Math.max(0, data.subtotal - data.total);

  const items: BrandedInvoiceItem[] = data.items.map((item) => ({
    productName: item.productName,
    sku: item.sku || null,
    imageUrl: item.imageUrl,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discountAmount: item.discount ?? 0,
    taxPercent: item.tax,
    lineTotal: item.lineTotal,
  }));

  return buildBrandedInvoiceHtml({
    orgName: data.orgName,
    systemName: data.systemName,
    logoUrl: data.logoUrl,
    showLogoOnInvoices: data.showLogoOnInvoices,
    locationName: data.locationName,
    locationCode: data.locationCode,
    locationAddress: null,
    locationPhone: data.locationPhone ?? null,
    locationEmail: data.locationEmail ?? null,
    organizationPhone: data.organizationPhone,
    organizationEmail: data.organizationEmail,
    organizationWebsite: data.organizationWebsite,
    showOrganizationContact: data.showOrganizationContact,
    invoiceTemplate: data.invoiceTemplate,
    invoiceSlogan: data.invoiceSlogan,
    invoiceThankYouMessage: data.invoiceThankYouMessage,
    invoiceTermsAndConditions: data.invoiceTermsAndConditions,
    customerPhone: data.customerPhone,
    dueDate: data.dueDate,
    receiptNumberPrefix: data.receiptNumberPrefix,
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