import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { derivePaymentStatus } from "@/lib/sales/format";
import {
  PurchaseDetailView, type PurchaseDetail, type PurchaseDetailItem,
} from "@/components/purchases/purchase-detail-view";

export const metadata = { title: "Purchase Details · SalesMate ERP" };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PurchaseDetailPage({ params }: PageProps) {
  // Next.js 15: `params` is a Promise and must be awaited — a common
  // source of a silent undefined id (and therefore a 404) if skipped.
  const { id } = await params;

  const context = await getCurrentOrgContext();
  if (!context) return null; // layout redirects when there's no org

  const supabase = await createClient();

  const { data: purchase, error } = await supabase
    .from("purchases")
    .select(`
      id, purchase_number, purchase_date, expected_delivery_date, reference, shipping_method,
      location_id, delivery_address, delivery_notes, subtotal, discount_amount,
      tax_amount, shipping_cost, total, paid_amount, payment_method, payment_account,
      pay_from_account, purchase_note, internal_note, status, received_at, created_by, created_at,
      supplier:suppliers ( id, name, contact_person, phone, email, payment_terms, currency ),
      location:business_locations ( id, name, address ),
      project:projects ( id, name )
    `)
    .eq("id", id)
    // Scoping by org here means a valid UUID from another org 404s too,
    // instead of leaking another organization's purchase.
    .eq("org_id", context.orgId)
    .single();

  if (error || !purchase) {
    notFound();
  }

  const { data: items } = await supabase
    .from("purchase_items")
    .select(`
      id, product_id, quantity, quantity_received, unit, unit_price, discount_percent, tax_percent, line_total,
      product:products ( name, sku, barcode )
    `)
    .eq("purchase_id", id);

  let createdByName = "—";
  if (purchase.created_by) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", purchase.created_by)
      .single();
    createdByName = profile?.full_name ?? "—";
  }

  const detailItems: PurchaseDetailItem[] = (items ?? []).map((item) => {
    const product = item.product as { name: string; sku: string | null; barcode: string | null } | null;
    return {
      id: item.id,
      productId: item.product_id,
      name: product?.name ?? "Unknown product",
      sku: product?.sku ?? null,
      barcode: product?.barcode ?? null,
      quantity: item.quantity,
      quantityReceived: item.quantity_received,
      unit: item.unit,
      unitPrice: item.unit_price,
      discountPercent: item.discount_percent,
      taxPercent: item.tax_percent,
      lineTotal: item.line_total,
    };
  });

  const supplier = purchase.supplier as {
    id: string; name: string; contact_person: string | null; phone: string | null;
    email: string | null; payment_terms: string | null; currency: string;
  } | null;
  const location = purchase.location as { id: string; name: string; address: string | null } | null;
  const project = purchase.project as { id: string; name: string } | null;

  const detail: PurchaseDetail = {
    id: purchase.id,
    purchaseNumber: purchase.purchase_number,
    purchaseDate: purchase.purchase_date,
    expectedDeliveryDate: purchase.expected_delivery_date,
    reference: purchase.reference,
    shippingMethod: purchase.shipping_method,
    deliveryAddress: purchase.delivery_address,
    deliveryNotes: purchase.delivery_notes,
    subtotal: purchase.subtotal,
    discountAmount: purchase.discount_amount,
    taxAmount: purchase.tax_amount,
    shippingCost: purchase.shipping_cost,
    total: purchase.total,
    paidAmount: purchase.paid_amount,
    paymentStatus: derivePaymentStatus(purchase.total, purchase.paid_amount),
    paymentMethod: purchase.payment_method,
    paymentAccount: purchase.payment_account,
    payFromAccount: purchase.pay_from_account,
    purchaseNote: purchase.purchase_note,
    internalNote: purchase.internal_note,
    status: purchase.status,
    receivedAt: purchase.received_at,
    createdAt: purchase.created_at,
    createdByName,
    supplier: supplier
      ? {
          id: supplier.id,
          name: supplier.name,
          contactPerson: supplier.contact_person,
          phone: supplier.phone,
          email: supplier.email,
          paymentTerms: supplier.payment_terms,
          currency: supplier.currency,
        }
      : null,
    locationName: location?.name ?? "—",
    projectName: project?.name ?? null,
    items: detailItems,
  };

  return <PurchaseDetailView purchase={detail} currency={context.currency} />;
}