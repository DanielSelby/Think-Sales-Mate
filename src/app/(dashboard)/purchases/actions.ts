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

  const supabase = createClient();
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
      const { error: rpcError } = await supabase.rpc("adjust_product_stock", {
        p_product_id: line.productId,
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

  revalidatePath("/purchases");
  revalidatePath("/inventory");

  return { ok: true, purchaseId: purchase.id, purchaseNumber: formatPurchaseNumber(purchase.purchase_number) };
}