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
    expect(html).toContain("Returns accepted within 7 days.");
    expect(html).toContain("Served by Cashier");
    expect(html).toContain(".totals-row.grand { margin: 5px -15px 0;");
    expect(html).not.toContain("margin: 5px -15px -13px");
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
      locationPhone: "+233 20 000 0000",
      locationEmail: "branch@example.test",
      organizationPhone: "+233 30 000 0000",
      organizationEmail: "office@example.test",
      organizationWebsite: "https://example.test",
      showOrganizationContact: true,
    });
    const branchContact = html.indexOf("+233 20 000 0000");
    const organizationContact = html.indexOf("+233 30 000 0000");
    const poweredBy = html.indexOf("Powered by");
    expect(branchContact).toBeGreaterThan(html.indexOf("</table>"));
    expect(organizationContact).toBeGreaterThan(branchContact);
    expect(poweredBy).toBeGreaterThan(organizationContact);
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
