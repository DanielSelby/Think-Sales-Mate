import { formatMoney } from "@/lib/currency";
import type { InvoiceFormat, SalesInvoiceTemplate } from "@/lib/sales/invoice-format";
import { formatInvoiceDate } from "@/lib/sales/payment-terms";

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
  if (data.invoiceTemplate === "think-sales" && !thermal) {
    return buildThinkSalesInvoiceHtml(data);
  }
  const paperWidth = printFormat === "thermal-58mm" ? 58 : 80;
  const { date, time } = formatDateTime(data.saleDate);
  const invoiceNo = formatInvoiceNumber(data.saleNumber);
  const paymentDue = data.amountPaid >= data.total
    ? "Paid in full"
    : data.dueDate ? formatInvoiceDate(data.dueDate) : "Due on receipt";
  const change = Math.max(0, data.amountPaid - data.total);
  const balanceDue = Math.max(0, data.total - data.amountPaid);
  const hasBalanceDue = balanceDue > 0.005;
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
        <div class="invoice-title">INVOICE</div>
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

    <div class="footer-note">Powered by ${esc(data.systemName || "ThinkSales ERP Pro")}</div>
  </div>
</body>
</html>`;
}

function buildThinkSalesInvoiceHtml(data: BrandedInvoiceData): string {
  const invoiceNo = formatInvoiceNumber(data.saleNumber);
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
  @page { size: A4 portrait; margin: 9mm; }
  body { margin: 0; background: #fff; color: #17313b; font: 11px Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .invoice { max-width: 960px; margin: 0 auto; overflow: hidden; }
  .masthead { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; padding: 18px 6px 20px; border-bottom: 1px solid #e5edf0; position: relative; }
  .masthead:after { content: ""; position: absolute; right: -28px; top: -60px; width: 160px; height: 150px; border-radius: 0 0 0 100%; background: linear-gradient(135deg,#42c69c,#087563); opacity: .18; }
  .brand { display: flex; align-items: center; gap: 12px; position: relative; z-index: 1; }
  .logo,.logo-placeholder { width: 54px; height: 48px; object-fit: contain; }
  .logo-placeholder { display: grid; place-items: center; border-radius: 8px; background: #0b806b; color: #fff; font-size: 15px; font-weight: 800; }
  .brand-name { color: #12313b; font-size: 22px; font-weight: 800; }
  .brand-caption { margin-top: 6px; color: #087d69; font-size: 9px; font-weight: 600; }
  .branch-details { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 19px; padding: 8px 10px; border-left: 3px solid #087d69; border-radius: 4px; background: #e8f6f2; color: #075d53; font-size: 10px; font-weight: 700; }
  .branch-phone { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; }
  .branch-phone-icon { font-size: 12px; line-height: 1; }
  .organization-contact { display: grid; gap: 7px; position: relative; z-index: 1; color: #344d56; font-size: 10px; }
  .contact-line { display: flex; gap: 8px; align-items: center; }
  .contact-icon { width: 14px; color: #087d69; font-weight: 700; text-align: center; }
  .title-row { display: grid; grid-template-columns: 1fr 300px; gap: 18px; align-items: center; padding: 20px 6px 16px; }
  h1 { margin: 0; color: #102f3a; font-size: 23px; line-height: 1.2; letter-spacing: -.3px; }
  .subtitle { margin: 8px 0 0; color: #70838a; font-size: 14px; }
  .title-rule { width: 65px; height: 3px; margin-top: 12px; background: #15a780; }
  .invoice-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; border-radius: 10px; background: #eef8f7; padding: 15px; }
  .meta-item span { display: block; margin-bottom: 4px; color: #72848a; font-size: 9px; }
  .meta-item strong { color: #17313b; font-size: 12px; }
  .recipient-grid { display: grid; grid-template-columns: 1fr 1fr; margin: 0 6px 16px; border-top: 1px solid #e2eaed; border-bottom: 1px solid #e2eaed; }
  .recipient { padding: 13px 8px; min-height: 88px; }
  .recipient + .recipient { border-left: 1px solid #e2eaed; padding-left: 20px; }
  .recipient-label { color: #087d69; font-size: 10px; font-weight: 700; text-transform: uppercase; }
  .recipient-name { margin-top: 8px; color: #19333d; font-size: 14px; font-weight: 700; }
  .recipient-note { margin-top: 6px; color: #617780; font-size: 10px; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; }
  thead { background: #087b68; color: white; }
  th { padding: 10px 8px; text-align: left; font-size: 9px; }
  th.num { text-align: right; }
  td { padding: 10px 8px; border-bottom: 1px solid #e7edef; vertical-align: middle; font-size: 9px; }
  tbody tr:nth-child(even) { background: #fbfcfc; }
  .index { width: 30px; }
  .product-cell { display: flex; align-items: center; gap: 9px; min-width: 145px; }
  .product-image,.product-placeholder { width: 42px; height: 38px; flex: 0 0 42px; object-fit: contain; border-radius: 5px; background: #f0f5f5; }
  .product-placeholder { display: grid; place-items: center; color: #087b68; font-weight: 700; }
  .product-cell strong { display: block; color: #18343e; font-size: 9px; }
  .product-cell small,.tax-rate { display: block; margin-top: 3px; color: #72848a; font-size: 8px; }
  .num { text-align: right; white-space: nowrap; }
  .total { color: #17313b; font-weight: 700; }
  .lower-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
  .details-card,.totals-card,.due-card { border-radius: 9px; background: #f1f8f7; padding: 13px 15px; }
  .details-card h2 { margin: 0 0 12px; color: #087b68; font-size: 11px; }
  .details-row { margin-top: 7px; color: #405a63; font-size: 9px; }
  .totals-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 6px 0; color: #405a63; }
  .totals-row > :last-child { text-align: right; }
  .totals-row strong { color: #19333d; }
  .totals-row.paid,.totals-row.paid strong { color: #15803d; }
  .totals-row.grand { margin: 5px -15px 0; padding: 11px 15px; border-radius: 0; background: #087b68; color: #fff; font-size: 13px; font-weight: 700; }
  .totals-row.grand strong { color: #fff; font-size: 16px; }
  .terms { margin-top: 9px; white-space: pre-line; line-height: 1.45; }
  .terms strong { display: block; margin-bottom: 4px; color: #087b68; }
  .footer-bottom { display: grid; grid-template-columns: 1fr 1fr; align-items: center; gap: 16px; }
  .served-by { grid-column: 2; justify-self: center; color: #fff; text-align: center; }
  .served-by-label { display: block; font-size: 13px; font-weight: 700; }
  .served-by-name { display: block; margin-top: 4px; color: #d9eeea; font-size: 11px; font-weight: 600; }
  .due-card { display: flex; justify-content: space-between; align-items: center; grid-column: 2; color: #087b68; }
  .due-card.balance-due,.due-card.balance-due strong { color: #b91c1c; }
  .due-card span { display: block; margin-bottom: 5px; color: #52716f; font-size: 9px; }
  .due-card strong { color: #19333d; font-size: 11px; }
  .footer { margin: 17px -9mm -9mm; padding: 19px 9mm 14px; background: #075d53; color: white; }
  .footer-thanks { font-size: 19px; font-style: italic; font-weight: 700; }
  .footer-note { margin-top: 5px; color: #c8e5df; font-size: 12px; font-style: italic; font-weight: 700; }
  .footer-contact { margin-top: 12px; color: #d9eeea; font-size: 9px; }
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
    <div><h1>Sales Invoice</h1><p class="subtitle">Thank you for your business!</p><div class="title-rule"></div></div>
    <div class="invoice-meta">
      <div class="meta-item"><span>Invoice No.</span><strong>${esc(invoiceNo)}</strong></div>
      <div class="meta-item"><span>Status</span><strong>${data.amountPaid >= data.total ? "Paid" : "Payment due"}</strong></div>
      <div class="meta-item"><span>Invoice Date</span><strong>${esc(invoiceDate)}</strong></div>
      <div class="meta-item"><span>Due Date</span><strong>${esc(paymentDue)}</strong></div>
    </div>
  </section>
  <section class="recipient-grid">
    <div class="recipient"><div class="recipient-label">Customer</div><div class="recipient-name">${esc(data.customerName)}</div><div class="recipient-note">${data.customerPhone ? esc(data.customerPhone) : ""}</div></div>
    <div class="recipient"><div class="recipient-label">Ship To</div><div class="recipient-name">${esc(data.customerName)}</div><div class="recipient-note">Same as billing address</div></div>
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
  <footer class="footer"><div class="footer-bottom"><div><div class="footer-thanks">Thank You!</div><div class="footer-note">${esc(data.invoiceThankYouMessage || "Your support drives our success.")}</div></div><div class="served-by"><span class="served-by-label">Served By</span><span class="served-by-name">${esc(data.cashierName || "—")}</span></div><div></div></div>${data.showOrganizationContact !== false && contactItems.length ? `<div class="footer-contact">${contactItems.map((item) => esc(item)).join(" · ")}</div>` : ""}</footer>
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