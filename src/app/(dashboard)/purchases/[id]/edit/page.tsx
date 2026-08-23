import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { AddPurchaseForm, type Recommendation } from "@/components/purchases/add-purchase-form";
import type { PurchaseEditInitialValues } from "@/components/purchases/add-purchase-form";

export const metadata = { title: "Edit Purchase · SalesMate ERP" };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditPurchasePage({ params }: PageProps) {
  const { id } = await params;

  const context = await getCurrentOrgContext();
  if (!context) return null;

  const orgId = context.orgId;
  const supabase = await createClient();

  const { data: purchase, error } = await supabase
    .from("purchases")
    .select(`
      id, status, supplier_id, purchase_date, expected_delivery_date, reference, invoice_number,
      shipping_method, project_id, location_id, delivery_address, delivery_notes, discount_amount,
      shipping_cost, payment_method, payment_account, pay_from_account, purchase_note, internal_note
    `)
    .eq("id", id)
    .eq("org_id", orgId)
    .single();

  if (error || !purchase) {
    notFound();
  }

  const { data: items } = await supabase
    .from("purchase_items")
    .select(`
      id, product_id, quantity, quantity_received, unit, unit_price, discount_percent, tax_percent,
      product:products ( name, sku, barcode )
    `)
    .eq("purchase_id", id);

  const [
    { data: suppliers },
    { data: locations },
    { data: projects },
    { data: products },
    { data: bankAccounts },
  ] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name, contact_person, phone, email, payment_terms, currency")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("name"),
    supabase.from("business_locations").select("id, name, address").eq("org_id", orgId).eq("is_active", true),
    supabase.from("projects").select("id, name").eq("org_id", orgId).order("name"),
    supabase
      .from("products")
      .select("id, name, sku, barcode, cost_price, stock_quantity, low_stock_threshold")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("name"),
    supabase.from("bank_accounts").select("id, name").eq("org_id", orgId),
  ]);

  const initialValues: PurchaseEditInitialValues = {
    status: purchase.status,
    supplierId: purchase.supplier_id,
    purchaseDate: purchase.purchase_date,
    expectedDeliveryDate: purchase.expected_delivery_date ?? "",
    reference: purchase.reference ?? "",
    invoiceNumber: purchase.invoice_number ?? "",
    shippingMethod: purchase.shipping_method ?? "",
    projectId: purchase.project_id ?? "",
    locationId: purchase.location_id,
    deliveryAddress: purchase.delivery_address ?? "",
    deliveryNotes: purchase.delivery_notes ?? "",
    discountAmount: purchase.discount_amount,
    shippingCost: purchase.shipping_cost,
    paymentMethod: purchase.payment_method ?? "Bank Transfer",
    paymentAccount: purchase.payment_account ?? "",
    payFromAccount: purchase.pay_from_account ?? "",
    purchaseNote: purchase.purchase_note ?? "",
    internalNote: purchase.internal_note ?? "",
    items: (items ?? []).map((item) => {
      const product = item.product as { name: string; sku: string | null; barcode: string | null } | null;
      return {
        itemId: item.id,
        productId: item.product_id,
        name: product?.name ?? "Unknown product",
        sku: product?.sku ?? "",
        barcode: product?.barcode ?? null,
        unit: item.unit,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        discountPercent: item.discount_percent,
        taxPercent: item.tax_percent,
        quantityReceived: item.quantity_received,
      };
    }),
  };

  // Recommendations aren't relevant while editing an existing purchase.
  const recommendations: Recommendation[] = [];

  return (
    <AddPurchaseForm
      mode="edit"
      purchaseId={id}
      initialValues={initialValues}
      suppliers={(suppliers ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        contactPerson: s.contact_person,
        phone: s.phone,
        email: s.email,
        paymentTerms: s.payment_terms,
        currency: s.currency,
      }))}
      locations={(locations ?? []).map((l) => ({ id: l.id, name: l.name, address: l.address }))}
      projects={(projects ?? []).map((p) => ({ id: p.id, name: p.name }))}
      products={(products ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        costPrice: p.cost_price ?? 0,
        stockQuantity: p.stock_quantity,
      }))}
      bankAccounts={(bankAccounts ?? []).map((a) => ({ id: a.id, name: a.name }))}
      currency={context.currency}
      recommendations={recommendations}
    />
  );
}