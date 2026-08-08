import { formatCurrency, formatDateTime, formatInvoiceNumber, PAYMENT_STATUS_LABEL, type PaymentStatus } from "@/lib/sales/format";

export interface InvoiceLineItem {
  productName: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
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
  paymentStatus: PaymentStatus;
  subtotal: number;
  total: number;
  amountPaid: number;
  currency: string;
  items: InvoiceLineItem[];
}

const STATUS_COLOR: Record<PaymentStatus, string> = {
  paid: "#16a34a",
  partially_paid: "#d97706",
  pending: "#dc2626"
};

const STATUS_BG: Record<PaymentStatus, string> = {
  paid: "#f0fdf4",
  partially_paid: "#fffbeb",
  pending: "#fef2f2"
};

function esc(value: string | number | null | undefined) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

export function buildInvoiceHtml(data: InvoiceData): string {
  const { date } = formatDateTime(data.saleDate);
  const invoiceNo = formatInvoiceNumber(data.saleNumber);
  const balanceDue = Math.max(0, data.total - data.amountPaid);
  const statusColor = STATUS_COLOR[data.paymentStatus];
  const statusBg = STATUS_BG[data.paymentStatus];

  const rows = data.items
    .map(
      (item) => `
        <tr>
          <td>
            <div class="item-name">${esc(item.productName)}</div>
            ${item.sku ? `<div class="item-sku">${esc(item.sku)}</div>` : ""}
          </td>
          <td class="num">${item.quantity}</td>
          <td class="num">${esc(formatCurrency(item.unitPrice, data.currency))}</td>
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
    color: #1a1f2b;
    margin: 0;
    padding: 40px;
    max-width: 720px;
    margin: 0 auto;
  }
  .top-bar { height: 6px; background: linear-gradient(90deg, #0f172a, #334155); border-radius: 3px; margin-bottom: 28px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
  .org-name { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
  .invoice-title { font-size: 28px; font-weight: 700; letter-spacing: -0.03em; text-align: right; color: #0f172a; }
  .invoice-no { font-size: 13px; color: #64748b; text-align: right; margin-top: 2px; font-family: monospace; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; }
  .meta-block { background: #f8fafc; border-radius: 10px; padding: 14px 16px; }
  .meta-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; font-weight: 600; margin-bottom: 4px; }
  .meta-value { font-size: 14px; font-weight: 600; color: #1a1f2b; }
  .meta-sub { font-size: 12px; color: #64748b; margin-top: 2px; }
  .status-badge {
    display: inline-block; padding: 3px 10px; border-radius: 999px;
    font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
    color: ${statusColor}; background: ${statusBg};
  }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  thead th {
    text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em;
    color: #94a3b8; font-weight: 600; padding: 0 4px 10px; border-bottom: 2px solid #e2e8f0;
  }
  thead th.num { text-align: right; }
  tbody td { padding: 12px 4px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
  tbody td.strong { font-weight: 600; }
  .item-name { font-size: 13.5px; font-weight: 500; }
  .item-sku { font-size: 11px; color: #94a3b8; font-family: monospace; margin-top: 1px; }
  .totals { display: flex; justify-content: flex-end; margin-top: 20px; }
  .totals-box { width: 260px; }
  .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; color: #475569; }
  .totals-row.grand {
    border-top: 2px solid #0f172a; margin-top: 6px; padding-top: 10px;
    font-size: 16px; font-weight: 700; color: #0f172a;
  }
  .totals-row.due { color: ${data.paymentStatus === "pending" ? "#dc2626" : "#16a34a"}; font-weight: 600; }
  .footer { margin-top: 48px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 11.5px; }
  @media print {
    body { padding: 20px; }
    @page { margin: 16mm; }
  }
</style>
</head>
<body>
  <div class="top-bar"></div>

  <div class="header">
    <div>
      <div class="org-name">${esc(data.orgName)}</div>
      ${data.locationName ? `<div class="meta-sub">${esc(data.locationName)}</div>` : ""}
    </div>
    <div>
      <div class="invoice-title">INVOICE</div>
      <div class="invoice-no">${esc(invoiceNo)}</div>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-block">
      <div class="meta-label">Billed to</div>
      <div class="meta-value">${esc(data.customerName)}</div>
    </div>
    <div class="meta-block">
      <div class="meta-label">Invoice details</div>
      <div class="meta-value">${esc(date)}</div>
      <div class="meta-sub">Sold by ${esc(data.soldByName)}</div>
      <div class="meta-sub" style="margin-top:6px;">
        <span class="status-badge">${esc(PAYMENT_STATUS_LABEL[data.paymentStatus])}</span>
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th class="num">Qty</th>
        <th class="num">Unit price</th>
        <th class="num">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:24px;">No line items on this sale.</td></tr>`}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-box">
      <div class="totals-row">
        <span>Subtotal</span>
        <span>${esc(formatCurrency(data.subtotal, data.currency))}</span>
      </div>
      <div class="totals-row grand">
        <span>Total</span>
        <span>${esc(formatCurrency(data.total, data.currency))}</span>
      </div>
      <div class="totals-row">
        <span>Amount paid</span>
        <span>${esc(formatCurrency(data.amountPaid, data.currency))}</span>
      </div>
      ${
        balanceDue > 0
          ? `<div class="totals-row due"><span>Balance due</span><span>${esc(formatCurrency(balanceDue, data.currency))}</span></div>`
          : ""
      }
    </div>
  </div>

  <div class="footer">
    Thank you for your business — generated by ${esc(data.orgName)}
  </div>
</body>
</html>`;
}