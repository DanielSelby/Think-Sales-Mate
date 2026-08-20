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
  locationName: string | null;
  locationAddress: string | null;
  locationPhone: string | null;
  locationEmail: string | null;
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
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: currency || "GH₵",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);
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
  const { date, time } = formatDateTime(data.saleDate);
  const invoiceNo = formatInvoiceNumber(data.saleNumber);
  const change = Math.max(0, data.amountPaid - data.total);
  const addressLine = [data.locationAddress].filter(Boolean).join(", ");

  const rows = data.items
  .map(
    (item, index) => `
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
  }
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

  .footer-note { text-align: center; margin-top: 20px; font-size: 11px; color: #9aa79c; }
  @media print {
    .sheet { padding: 8px; }
    @page { margin: 10mm; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div class="brand">
        <div class="brand-mark">${esc(initials(data.orgName))}</div>
        <div>
          <div class="brand-name">${esc(data.orgName)}</div>
          ${data.locationName ? `<div class="brand-sub">${esc(data.locationName)}</div>` : ""}
          <div class="brand-contact">
            ${addressLine ? esc(addressLine) + "<br/>" : ""}
            ${data.locationPhone ? esc(data.locationPhone) + (data.locationEmail ? " · " : "") : ""}${data.locationEmail ? esc(data.locationEmail) : ""}
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

    <table>
      <thead>
        <tr>
          <th class="idx">#</th>
          <th>Item</th>
          <th class="num">Qty</th>
          <th class="num">Unit price</th>
          <th class="num">Discount</th>
          <th class="num">Total</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:24px;">No line items on this sale.</td></tr>`}
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

    <div class="footer-note">Powered by ${esc(data.orgName)} POS System</div>
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
    locationName: data.locationName,
    locationAddress: null,
    locationPhone: null,
    locationEmail: null,
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
  });
}