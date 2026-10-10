import { describe, expect, it } from "vitest";
import { buildInvoiceHtml } from "./invoice-template";

const invoice = {
  orgName: "Example Store",
  saleNumber: 12,
  saleDate: "2026-10-07T10:00:00.000Z",
  customerName: "Walk-in Customer",
  soldByName: "Cashier",
  locationName: "Main Branch",
  paymentMethod: "Cash",
  paymentStatus: "paid",
  subtotal: 20,
  total: 20,
  amountPaid: 20,
  currency: "GHS",
  items: [{
    productId: "product-1",
    productName: "Sample Product",
    sku: "SKU-1",
    quantity: 2,
    unitPrice: 10,
    discount: 0,
    tax: 0,
    lineTotal: 20,
  }],
};

describe("invoice print formats", () => {
  it("keeps the A4 invoice layout as the default", () => {
    const html = buildInvoiceHtml(invoice);
    expect(html).toContain("@page { size: A4 portrait; margin: 10mm; }");
    expect(html).toContain('<body class="a4">');
    expect(html).toContain("<th class=\"num\">Unit price</th>");
  });

  it("uses the organization-branded ThinkSales layout when selected", () => {
    const html = buildInvoiceHtml({
      ...invoice,
      invoiceTemplate: "think-sales",
      logoUrl: "https://example.test/logo.png",
      organizationPhone: "+233 20 000 0000",
      organizationEmail: "office@example.test",
      organizationWebsite: "https://example.test",
      showOrganizationContact: true,
      items: [{ ...invoice.items[0], imageUrl: "https://example.test/product.png", tax: 15 }],
    });

    expect(html).toContain("<h1>Sales Invoice</h1>");
    expect(html).toContain("Example Store");
    expect(html).toContain('src="https://example.test/logo.png"');
    expect(html).toContain("+233 20 000 0000");
    expect(html).toContain("office@example.test");
    expect(html).toContain('src="https://example.test/product.png"');
    expect(html).not.toContain("<th>SKU</th>");
    expect(html).not.toContain("SKU-1");
    expect(html).not.toContain("ThinkSales ERP");
    expect(html).toContain('<div class="recipient-label">Customer</div>');
    expect(html).toContain('<div class="totals-row paid"><span>Amount Paid</span>');
    expect(html).toContain(".totals-row.paid,.totals-row.paid strong { color: #15803d; }");
    expect(html).not.toContain('class="due-card balance-due"');
  });

  it("highlights only an outstanding customer balance in red", () => {
    const unpaid = buildInvoiceHtml({
      ...invoice,
      invoiceTemplate: "think-sales",
      amountPaid: 8,
      total: 20,
    });
    expect(unpaid).toContain('class="due-card balance-due"');
    expect(unpaid).toContain("<span>Customer Balance</span>");
    expect(unpaid).toContain("12.00");
    expect(unpaid).toContain(".due-card.balance-due,.due-card.balance-due strong { color: #b91c1c; }");

    const thermal = buildInvoiceHtml({ ...invoice, amountPaid: 8, total: 20, printFormat: "thermal-80mm" });
    expect(thermal).toContain('<div class="totals-row balance-due"><span>Customer balance</span>');
    expect(thermal).toContain("body.thermal .totals-row.balance-due { color: #b91c1c; }");
    expect(thermal).toContain("body.thermal .totals-row.paid, body.thermal .totals-row.paid > :last-child { color: #15803d; }");

    const paid = buildInvoiceHtml({ ...invoice, invoiceTemplate: "think-sales" });
    expect(paid).not.toContain("Customer Balance");
    expect(paid).toContain('<div class="due-card"><div><span>Payment Due</span>');
  });

  it("renders organization invoice copy, terms, cashier, and separated totals", () => {
    const html = buildInvoiceHtml({
      ...invoice,
      invoiceTemplate: "think-sales",
      invoiceSlogan: "Fresh goods, fair prices",
      invoiceThankYouMessage: "We hope to see you again.",
      invoiceTermsAndConditions: "Returns accepted within 7 days.",
    });

    expect(html).toContain("Fresh goods, fair prices");
    expect(html).toContain("We hope to see you again.");
    expect(html).toContain(".footer-note { margin-top: 5px; color: #c8e5df; font-size: 12px; font-style: italic; font-weight: 700;");
    expect(html).toContain("Returns accepted within 7 days.");
    expect(html).toContain('<span class="served-by-label">Served By</span><span class="served-by-name">Cashier</span>');
    expect(html).toContain(".served-by-label { display: block; font-size: 13px; font-weight: 700;");
    expect(html).toContain(".footer-bottom { display: grid; grid-template-columns: 1fr 1fr;");
    expect(html).toContain(".served-by { grid-column: 2; justify-self: center;");
    expect(html).toContain(".totals-row.grand { margin: 5px -15px 0;");
    expect(html).not.toContain("margin: 5px -15px -13px");
  });

  it("places highlighted branch details under the organization name and shows payment due status", () => {
    const paidHtml = buildInvoiceHtml({
      ...invoice,
      invoiceTemplate: "think-sales",
      locationName: "East Legon Branch",
      locationCode: "BR-004",
      locationPhone: "0245555555",
      organizationPhone: "+233 30 000 0000",
    });
    const orgName = paidHtml.indexOf("Example Store");
    const branchDetails = paidHtml.indexOf('<div class="branch-details">');
    const branchName = paidHtml.indexOf("East Legon Branch");
    const branchPhone = paidHtml.indexOf("0245555555");
    const dueDate = paidHtml.indexOf("<span>Due Date</span>");

    expect(branchDetails).toBeGreaterThan(orgName);
    expect(branchName).toBeGreaterThan(branchDetails);
    expect(branchPhone).toBeGreaterThan(branchName);
    expect(branchPhone).toBeLessThan(paidHtml.indexOf("<div class=\"organization-contact\">"));
    expect(paidHtml).toContain(".brand-caption { margin-top: 6px;");
    expect(paidHtml).toContain(".branch-details { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 19px; padding: 8px 10px;");
    expect(paidHtml).toContain('<span class="branch-phone-icon" aria-hidden="true">☎</span>');
    expect(paidHtml).toContain(".branch-phone { display: inline-flex; align-items: center; gap: 4px; font-size: 11px;");
    expect(paidHtml.slice(dueDate, dueDate + 100)).toContain("Paid in full");

    const unpaidHtml = buildInvoiceHtml({
      ...invoice,
      invoiceTemplate: "think-sales",
      amountPaid: 0,
    });
    expect(unpaidHtml.slice(unpaidHtml.indexOf("<span>Due Date</span>"), unpaidHtml.indexOf("<span>Due Date</span>") + 100))
      .toContain("Due on receipt");

    const creditHtml = buildInvoiceHtml({
      ...invoice,
      invoiceTemplate: "think-sales",
      amountPaid: 0,
      dueDate: "2026-10-17",
    });
    expect(creditHtml.slice(creditHtml.indexOf("<span>Due Date</span>"), creditHtml.indexOf("<span>Due Date</span>") + 100))
      .toContain("17/10/2026");
  });

  it.each([
    ["thermal-80mm", "80mm", "76mm"],
    ["thermal-58mm", "58mm", "54mm"],
  ] as const)("renders %s at the configured paper width", (printFormat, paperWidth, sheetWidth) => {
    const html = buildInvoiceHtml({ ...invoice, printFormat });
    expect(html).toContain(`@page { size: ${paperWidth} auto; margin: 2mm; }`);
    expect(html).toContain(`body.thermal { width: ${paperWidth};`);
    expect(html).toContain(`body.thermal .sheet { width: ${sheetWidth};`);
    expect(html).toContain('<body class="thermal">');
    expect(html).toContain("<th class=\"num\">Total</th>");
    expect(html).toContain("Sample Product");
  });

  it("prints branch and enabled organization contacts in the invoice footer", () => {
    const html = buildInvoiceHtml({
      ...invoice,
      invoiceTemplate: "think-sales",
      locationName: "Main Branch",
      locationCode: "BR-001",
      locationPhone: "+233 20 000 0000",
      locationEmail: "branch@example.test",
      organizationPhone: "+233 30 000 0000",
      organizationEmail: "office@example.test",
      organizationWebsite: "https://example.test",
      showOrganizationContact: true,
    });
    const branchContact = html.indexOf("+233 20 000 0000");
    const branchNumber = html.indexOf("Branch No. BR-001");
    const organizationContact = html.indexOf("+233 30 000 0000");
    expect(branchContact).toBeGreaterThan(html.indexOf("<header class=\"masthead\">"));
    expect(branchNumber).toBeGreaterThan(html.indexOf("<header class=\"masthead\">"));
    expect(organizationContact).toBeGreaterThan(branchContact);
  });

  it("prints the branch number on the standard A4 invoice", () => {
    const html = buildInvoiceHtml({
      ...invoice,
      locationCode: "BR-001",
    });

    expect(html).toContain("Branch No. BR-001");
  });

  it("omits organization contacts when disabled but keeps branch contacts", () => {
    const html = buildInvoiceHtml({
      ...invoice,
      locationPhone: "+233 20 000 0000",
      organizationPhone: "+233 30 000 0000",
      showOrganizationContact: false,
    });
    expect(html).toContain("+233 20 000 0000");
    expect(html).not.toContain("+233 30 000 0000");
  });
});
