"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { formatPurchaseNumber } from "@/lib/purchases/format";

export interface PurchaseItemInput {
  productId: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountPercent: number;
  taxPercent: number;
}

export interface CreatePurchaseInput {
  supplierId: string;
  purchaseDate: string;
  expectedDeliveryDate: string | null;
  reference: string | null;
  invoiceNumber: string | null;
  shippingMethod: string | null;
  projectId: string | null;
  locationId: string;
  deliveryAddress: string | null;
  deliveryNotes: string | null;
  items: PurchaseItemInput[];
  discountAmount: number;
  shippingCost: number;
  paymentMethod: string | null;
  paymentAccount: string | null;
  payFromAccount: string | null;
  purchaseNote: string | null;
  internalNote: string | null;
  /** draft = save without ordering, ordered = save as a live PO, received = save and post stock now */
  action: "draft" | "ordered" | "received";
}

export interface CreatePurchaseResult {
  ok: boolean;
  error?: string;
  purchaseId?: string;
  purchaseNumber?: string;
}

function computeTotals(items: PurchaseItemInput[], discountAmount: number, shippingCost: number) {
  let subtotal = 0;
  let tax = 0;
  let lineDiscountTotal = 0;

  const lines = items.map((item) => {
    const gross = item.quantity * item.unitPrice;
    const lineDiscount = gross * (item.discountPercent / 100);
    const taxable = gross - lineDiscount;
    const lineTax = taxable * (item.taxPercent / 100);
    const lineTotal = taxable + lineTax;

    subtotal += gross;
    tax += lineTax;
    lineDiscountTotal += lineDiscount;

    return { ...item, lineTotal };
  });

  const totalDiscount = lineDiscountTotal + Math.max(0, discountAmount);
  const total = subtotal - totalDiscount + tax + Math.max(0, shippingCost);

  return { lines, subtotal, discount: totalDiscount, tax, total };
}

export async function createPurchase(input: CreatePurchaseInput): Promise<CreatePurchaseResult> {
  if (input.items.length === 0) {
    return { ok: false, error: "Add at least one product before saving." };
  }
  for (const item of input.items) {
    if (!item.productId || item.quantity <= 0 || item.unitPrice < 0) {
      return { ok: false, error: "Every line needs a product, a quantity above zero, and a valid price." };
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in to save a purchase." };

  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "No active organization." };

  const { lines, subtotal, discount, tax, total } = computeTotals(
    input.items,
    input.discountAmount,
    input.shippingCost
  );

  const status = input.action === "draft" ? "draft" : input.action === "received" ? "received" : "ordered";

  const { data: purchase, error: purchaseError } = await supabase
    .from("purchases")
    .insert({
      org_id: context.orgId,
      supplier_id: input.supplierId,
      status,
      purchase_date: input.purchaseDate,
      expected_delivery_date: input.expectedDeliveryDate,
      reference: input.reference,
      
      shipping_method: input.shippingMethod,
      project_id: input.projectId,
      location_id: input.locationId,
      delivery_address: input.deliveryAddress,
      delivery_notes: input.deliveryNotes,
      subtotal,
      discount_amount: discount,
      tax_amount: tax,
      shipping_cost: Math.max(0, input.shippingCost),
      total,
      payment_method: input.paymentMethod,
      payment_account: input.paymentAccount,
      pay_from_account: input.payFromAccount,
      purchase_note: input.purchaseNote,
      internal_note: input.internalNote,
      received_at: status === "received" ? new Date().toISOString() : null,
      created_by: user.id,
    })
    .select("id, purchase_number")
    .single();

  if (purchaseError || !purchase) {
    return { ok: false, error: purchaseError?.message ?? "Couldn't create the purchase." };
  }

  const { error: itemsError } = await supabase.from("purchase_items").insert(
    lines.map((line) => ({
      purchase_id: purchase.id,
      org_id: context.orgId,
      product_id: line.productId,
      quantity: line.quantity,
      quantity_received: status === "received" ? line.quantity : 0,
      unit: line.unit,
      unit_price: line.unitPrice,
      discount_percent: line.discountPercent,
      tax_percent: line.taxPercent,
      line_total: line.lineTotal,
    }))
  );

  if (itemsError) {
    // Best-effort cleanup so a failed save doesn't leave an orphaned header row.
    await supabase.from("purchases").delete().eq("id", purchase.id);
    return { ok: false, error: itemsError.message };
  }

  if (status === "received") {
    for (const line of lines) {
      const { error: rpcError } = await supabase.rpc("adjust_product_stock_at_location", {
        p_product_id: line.productId,
        p_location_id: input.locationId,
        p_org_id: context.orgId,
        p_delta: line.quantity,
      });
      if (rpcError) {
        // Stock partially posted at this point — surfaced to the user rather
        // than silently swallowed; the purchase itself is still saved.
        return {
          ok: false,
          error: `Purchase saved, but stock update failed: ${rpcError.message}. Receive items manually from the purchase detail page.`,
          purchaseId: purchase.id,
          purchaseNumber: formatPurchaseNumber(purchase.purchase_number),
        };
      }
    }
  }

  await supabase.from("audit_logs").insert({
    org_id: context.orgId,
    actor_id: user.id,
    action: "purchase.created",
    entity_type: "purchases",
    entity_id: purchase.id,
    metadata: { status, purchase_number: purchase.purchase_number, total },
  });

  revalidatePath("/purchases");
  revalidatePath("/inventory");

  return { ok: true, purchaseId: purchase.id, purchaseNumber: formatPurchaseNumber(purchase.purchase_number) };
}

// ---------------------------------------------------------------------------
// Receiving (full or partial)
// ---------------------------------------------------------------------------

export interface ReceivableLine {
  purchaseItemId: string;
  productId: string;
  productName: string;
  quantityOrdered: number;
  alreadyReceived: number;
  remaining: number;
}

export async function getPurchaseReceivableItems(purchaseId: string): Promise<ReceivableLine[]> {
  const supabase = await createClient();
  const { data: items } = await supabase
    .from("purchase_items")
    .select("id, product_id, quantity, quantity_received, product:products ( name )")
    .eq("purchase_id", purchaseId);

  return (items ?? []).map((item) => ({
    purchaseItemId: item.id,
    productId: item.product_id,
    productName: (item.product as { name: string } | null)?.name ?? "Unknown product",
    quantityOrdered: item.quantity,
    alreadyReceived: item.quantity_received,
    remaining: Math.max(0, item.quantity - item.quantity_received),
  }));
}

export interface ReceivePurchaseItemsInput {
  purchaseId: string;
  lines: { purchaseItemId: string; productId: string; quantity: number }[];
  note?: string;
}

export interface ReceivePurchaseItemsResult {
  ok: boolean;
  error?: string;
}

export async function receivePurchaseItems({
  purchaseId,
  lines,
  note,
}: ReceivePurchaseItemsInput): Promise<ReceivePurchaseItemsResult> {
  const toReceive = lines.filter((l) => l.quantity > 0);
  if (toReceive.length === 0) return { ok: false, error: "Enter a quantity for at least one item." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in to receive items." };

  const { data: purchase, error: fetchError } = await supabase
    .from("purchases")
    .select("id, org_id, location_id, status")
    .eq("id", purchaseId)
    .single();
  if (fetchError || !purchase) return { ok: false, error: "Purchase not found." };

  const { data: allItems, error: itemsError } = await supabase
    .from("purchase_items")
    .select("id, quantity, quantity_received")
    .eq("purchase_id", purchaseId);
  if (itemsError || !allItems) return { ok: false, error: "Couldn't load this purchase's line items." };

  try {
    for (const line of toReceive) {
      const item = allItems.find((i) => i.id === line.purchaseItemId);
      if (!item) throw new Error("One of these line items no longer exists on this purchase.");
      const remaining = item.quantity - item.quantity_received;
      if (line.quantity > remaining) {
        throw new Error(`Can't receive more than the ${remaining} unit(s) still outstanding on this line.`);
      }

      const { error: updateError } = await supabase
        .from("purchase_items")
        .update({ quantity_received: item.quantity_received + line.quantity })
        .eq("id", line.purchaseItemId);
      if (updateError) throw new Error(updateError.message);

      const { error: rpcError } = await supabase.rpc("adjust_product_stock_at_location", {
        p_product_id: line.productId,
        p_location_id: purchase.location_id,
        p_org_id: purchase.org_id,
        p_delta: line.quantity,
      });
      if (rpcError) throw new Error(rpcError.message);
    }

    const { data: refreshedItems } = await supabase
      .from("purchase_items")
      .select("quantity, quantity_received")
      .eq("purchase_id", purchaseId);

    const allReceived = (refreshedItems ?? []).every((i) => i.quantity_received >= i.quantity);
    const anyReceived = (refreshedItems ?? []).some((i) => i.quantity_received > 0);
    const nextStatus = allReceived ? "received" : anyReceived ? "partially_received" : purchase.status;

    const { error: statusError } = await supabase
      .from("purchases")
      .update({
        status: nextStatus,
        received_at: nextStatus === "received" ? new Date().toISOString() : null,
      })
      .eq("id", purchaseId);
    if (statusError) throw new Error(statusError.message);

    await supabase.from("audit_logs").insert({
      org_id: purchase.org_id,
      actor_id: user.id,
      action: "purchase.items_received",
      entity_type: "purchases",
      entity_id: purchaseId,
      metadata: { lines: toReceive, note, resulting_status: nextStatus },
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong receiving items." };
  }

  revalidatePath("/purchases");
  revalidatePath("/inventory");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Duplicate
// ---------------------------------------------------------------------------

export interface DuplicatePurchaseResult {
  ok: boolean;
  error?: string;
  purchaseId?: string;
  purchaseNumber?: string;
}

export async function duplicatePurchase(purchaseId: string): Promise<DuplicatePurchaseResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in to duplicate a purchase." };

  const { data: original, error: fetchError } = await supabase
    .from("purchases")
    .select("*, items:purchase_items(*)")
    .eq("id", purchaseId)
    .single();
  if (fetchError || !original) return { ok: false, error: "Purchase not found." };

  const { data: copy, error: insertError } = await supabase
    .from("purchases")
    .insert({
      org_id: original.org_id,
      supplier_id: original.supplier_id,
      status: "draft",
      purchase_date: new Date().toISOString().slice(0, 10),
      expected_delivery_date: null,
      reference: original.reference,
      
      shipping_method: original.shipping_method,
      project_id: original.project_id,
      location_id: original.location_id,
      delivery_address: original.delivery_address,
      delivery_notes: original.delivery_notes,
      subtotal: original.subtotal,
      discount_amount: original.discount_amount,
      tax_amount: original.tax_amount,
      shipping_cost: original.shipping_cost,
      total: original.total,
      payment_method: original.payment_method,
      payment_account: original.payment_account,
      pay_from_account: original.pay_from_account,
      purchase_note: original.purchase_note,
      internal_note: original.internal_note,
      created_by: user.id,
    })
    .select("id, purchase_number")
    .single();

  if (insertError || !copy) return { ok: false, error: insertError?.message ?? "Couldn't duplicate the purchase." };

  const items = (original.items as { product_id: string; quantity: number; unit: string; unit_price: number; discount_percent: number; tax_percent: number; line_total: number }[]) ?? [];

  const { error: itemsError } = await supabase.from("purchase_items").insert(
    items.map((item) => ({
      purchase_id: copy.id,
      org_id: original.org_id,
      product_id: item.product_id,
      quantity: item.quantity,
      quantity_received: 0,
      unit: item.unit,
      unit_price: item.unit_price,
      discount_percent: item.discount_percent,
      tax_percent: item.tax_percent,
      line_total: item.line_total,
    }))
  );

  if (itemsError) {
    await supabase.from("purchases").delete().eq("id", copy.id);
    return { ok: false, error: itemsError.message };
  }

  await supabase.from("audit_logs").insert({
    org_id: original.org_id,
    actor_id: user.id,
    action: "purchase.duplicated",
    entity_type: "purchases",
    entity_id: copy.id,
    metadata: { duplicated_from: purchaseId, purchase_number: copy.purchase_number },
  });

  revalidatePath("/purchases");
  return { ok: true, purchaseId: copy.id, purchaseNumber: formatPurchaseNumber(copy.purchase_number) };
}

// ---------------------------------------------------------------------------
// Record payment (keeps payment status independent of purchase status)
// ---------------------------------------------------------------------------

export interface RecordPurchasePaymentResult {
  ok: boolean;
  error?: string;
}

export async function recordPurchasePayment(
  purchaseId: string,
  amount: number,
  note?: string
): Promise<RecordPurchasePaymentResult> {
  if (amount <= 0) return { ok: false, error: "Enter an amount greater than zero." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in to record a payment." };

  const { data: purchase, error: fetchError } = await supabase
    .from("purchases")
    .select("id, org_id, total, paid_amount")
    .eq("id", purchaseId)
    .single();
  if (fetchError || !purchase) return { ok: false, error: "Purchase not found." };

  const nextPaid = Math.min(purchase.total, purchase.paid_amount + amount);

  const { error: updateError } = await supabase
    .from("purchases")
    .update({ paid_amount: nextPaid })
    .eq("id", purchaseId);
  if (updateError) return { ok: false, error: updateError.message };

  await supabase.from("audit_logs").insert({
    org_id: purchase.org_id,
    actor_id: user.id,
    action: "purchase.payment_recorded",
    entity_type: "purchases",
    entity_id: purchaseId,
    metadata: { amount, note, resulting_paid_amount: nextPaid },
  });

  revalidatePath("/purchases");
  return { ok: true };
}