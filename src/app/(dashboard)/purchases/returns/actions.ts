"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { formatReturnNumber } from "@/lib/purchase-returns/format";

// ---------------------------------------------------------------------------
// Eligible purchases (for the "Original Purchase Order" picker)
// ---------------------------------------------------------------------------

export interface EligiblePurchase {
  id: string;
  purchaseNumber: number;
  supplierId: string;
  supplierName: string;
  purchaseDate: string;
}

export async function searchEligiblePurchases(query: string): Promise<EligiblePurchase[]> {
  const context = await getCurrentOrgContext();
  if (!context) return [];

  const supabase = createClient();
  const { data } = await supabase
    .from("purchases")
    .select("id, purchase_number, purchase_date, supplier:suppliers ( id, name )")
    .eq("org_id", context.orgId)
    .in("status", ["received", "partially_received"])
    .order("purchase_date", { ascending: false })
    .limit(50);

  const rows = (data ?? []).map((p) => ({
    id: p.id,
    purchaseNumber: p.purchase_number,
    supplierId: (p.supplier as { id: string; name: string } | null)?.id ?? "",
    supplierName: (p.supplier as { id: string; name: string } | null)?.name ?? "Unknown supplier",
    purchaseDate: p.purchase_date,
  }));

  const q = query.trim().toLowerCase();
  if (!q) return rows.slice(0, 8);
  return rows
    .filter((r) => formatReturnNumber(r.purchaseNumber).toLowerCase().includes(q) || r.supplierName.toLowerCase().includes(q))
    .slice(0, 8);
}

// ---------------------------------------------------------------------------
// Load a purchase for the return form
// ---------------------------------------------------------------------------

export interface ReturnableLine {
  purchaseItemId: string;
  productId: string;
  productName: string;
  sku: string;
  purchasedQty: number;
  alreadyReturned: number;
  remaining: number;
  unitCost: number;
}

export interface PurchaseForReturn {
  purchaseId: string;
  purchaseNumber: number;
  supplierId: string;
  supplierName: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  locationId: string;
  locationName: string;
  lines: ReturnableLine[];
}

export async function getPurchaseForReturn(purchaseId: string): Promise<PurchaseForReturn | null> {
  const supabase = createClient();

  const { data: purchase } = await supabase
    .from("purchases")
    .select(`
      id, purchase_number, supplier_id, location_id,
      supplier:suppliers ( name, contact_person, phone, email ),
      location:business_locations ( name )
    `)
    .eq("id", purchaseId)
    .single();
  if (!purchase) return null;

  const { data: items } = await supabase
    .from("purchase_items")
    .select("id, product_id, quantity_received, unit_price, product:products ( name, sku )")
    .eq("purchase_id", purchaseId);

  const { data: existingReturns } = (items ?? []).length
    ? await supabase
        .from("purchase_return_items")
        .select("purchase_item_id, return_qty, return:purchase_returns!inner ( status )")
        .in("purchase_item_id", (items ?? []).map((i) => i.id))
    : { data: [] as { purchase_item_id: string; return_qty: number; return: { status: string } | null }[] };

  const returnedByLine = new Map<string, number>();
  for (const r of existingReturns ?? []) {
    const status = (r.return as unknown as { status: string } | null)?.status;
    if (status === "draft" || status === "rejected") continue; // doesn't reserve quantity
    returnedByLine.set(r.purchase_item_id, (returnedByLine.get(r.purchase_item_id) ?? 0) + r.return_qty);
  }

  const supplier = purchase.supplier as { name: string; contact_person: string | null; phone: string | null; email: string | null } | null;
  const location = purchase.location as { name: string } | null;

  const lines: ReturnableLine[] = (items ?? []).map((item) => {
    const alreadyReturned = returnedByLine.get(item.id) ?? 0;
    const product = item.product as { name: string; sku: string } | null;
    return {
      purchaseItemId: item.id,
      productId: item.product_id,
      productName: product?.name ?? "Unknown product",
      sku: product?.sku ?? "",
      purchasedQty: item.quantity_received,
      alreadyReturned,
      remaining: Math.max(0, item.quantity_received - alreadyReturned),
      unitCost: item.unit_price,
    };
  });

  return {
    purchaseId: purchase.id,
    purchaseNumber: purchase.purchase_number,
    supplierId: purchase.supplier_id,
    supplierName: supplier?.name ?? "Unknown supplier",
    contactPerson: supplier?.contact_person ?? null,
    phone: supplier?.phone ?? null,
    email: supplier?.email ?? null,
    locationId: purchase.location_id,
    locationName: location?.name ?? "—",
    lines,
  };
}

// ---------------------------------------------------------------------------
// Create (draft or submitted)
// ---------------------------------------------------------------------------

export interface ReturnLineInput {
  purchaseItemId: string;
  productId: string;
  batchSerial: string | null;
  purchasedQty: number;
  returnQty: number;
  unitCost: number;
  returnReason: string | null;
  condition: string | null;
}

export interface CreatePurchaseReturnInput {
  purchaseId: string;
  supplierId: string;
  locationId: string;
  returnReason: string | null;
  invoiceNumber: string | null;
  reference: string | null;
  notes: string | null;
  internalNotes: string | null;
  paymentStatus: string | null;
  refundMethod: string | null;
  paymentAccount: string | null;
  refundStatus: string;
  restockingFee: number;
  taxAdjustment: number;
  lines: ReturnLineInput[];
  action: "draft" | "submitted";
}

export interface CreatePurchaseReturnResult {
  ok: boolean;
  error?: string;
  returnId?: string;
  returnNumber?: string;
}

export async function createPurchaseReturn(input: CreatePurchaseReturnInput): Promise<CreatePurchaseReturnResult> {
  const lines = input.lines.filter((l) => l.returnQty > 0);
  if (lines.length === 0) return { ok: false, error: "Add at least one item to return." };
  for (const l of lines) {
    if (l.returnQty > l.purchasedQty) {
      return { ok: false, error: "Return quantity can't exceed the quantity available to return." };
    }
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "No active organization." };

  const totalReturnValue = lines.reduce((sum, l) => sum + l.returnQty * l.unitCost, 0);
  const refundAmount = Math.max(0, totalReturnValue - input.restockingFee + input.taxAdjustment);

  const { data: created, error: insertError } = await supabase
    .from("purchase_returns")
    .insert({
      org_id: context.orgId,
      purchase_id: input.purchaseId,
      supplier_id: input.supplierId,
      location_id: input.locationId,
      status: input.action,
      return_reason: input.returnReason,
      invoice_number: input.invoiceNumber,
      reference: input.reference,
      notes: input.notes,
      internal_notes: input.internalNotes,
      payment_status: input.paymentStatus,
      refund_method: input.refundMethod,
      payment_account: input.paymentAccount,
      refund_status: input.refundStatus,
      restocking_fee: input.restockingFee,
      tax_adjustment: input.taxAdjustment,
      total_return_value: totalReturnValue,
      refund_amount: refundAmount,
      created_by: user.id,
    })
    .select("id, return_number")
    .single();

  if (insertError || !created) return { ok: false, error: insertError?.message ?? "Couldn't create the return." };

  const { error: itemsError } = await supabase.from("purchase_return_items").insert(
    lines.map((l) => ({
      return_id: created.id,
      org_id: context.orgId,
      purchase_item_id: l.purchaseItemId,
      product_id: l.productId,
      batch_serial: l.batchSerial,
      purchased_qty: l.purchasedQty,
      return_qty: l.returnQty,
      unit_cost: l.unitCost,
      return_value: l.returnQty * l.unitCost,
      return_reason: l.returnReason,
      condition: l.condition,
    }))
  );

  if (itemsError) {
    await supabase.from("purchase_returns").delete().eq("id", created.id);
    return { ok: false, error: itemsError.message };
  }

  await supabase.from("audit_logs").insert({
    org_id: context.orgId,
    actor_id: user.id,
    action: input.action === "draft" ? "purchase_return.created" : "purchase_return.submitted",
    entity_type: "purchase_returns",
    entity_id: created.id,
    metadata: { return_number: created.return_number, total_return_value: totalReturnValue },
  });

  revalidatePath("/purchases/returns");
  return { ok: true, returnId: created.id, returnNumber: formatReturnNumber(created.return_number) };
}

// ---------------------------------------------------------------------------
// Approve — this is what actually moves stock out and closes the loop
// ---------------------------------------------------------------------------

export interface ApprovePurchaseReturnResult {
  ok: boolean;
  error?: string;
}

export async function approvePurchaseReturn(returnId: string): Promise<ApprovePurchaseReturnResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: ret, error: fetchError } = await supabase
    .from("purchase_returns")
    .select("id, org_id, location_id, status, return_number")
    .eq("id", returnId)
    .single();
  if (fetchError || !ret) return { ok: false, error: "Return not found." };
  if (ret.status === "approved") return { ok: false, error: "This return is already approved." };

  const { data: items, error: itemsError } = await supabase
    .from("purchase_return_items")
    .select("product_id, return_qty")
    .eq("return_id", returnId);
  if (itemsError || !items) return { ok: false, error: "Couldn't load return line items." };

  try {
    for (const item of items) {
      const { error: rpcError } = await supabase.rpc("adjust_product_stock_at_location", {
        p_product_id: item.product_id,
        p_location_id: ret.location_id,
        p_org_id: ret.org_id,
        p_delta: -item.return_qty, // goods leaving back to the supplier
      });
      if (rpcError) throw new Error(rpcError.message);
    }

    const { error: updateError } = await supabase
      .from("purchase_returns")
      .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: user.id })
      .eq("id", returnId);
    if (updateError) throw new Error(updateError.message);

    await supabase.from("audit_logs").insert({
      org_id: ret.org_id,
      actor_id: user.id,
      action: "purchase_return.approved",
      entity_type: "purchase_returns",
      entity_id: returnId,
      metadata: { return_number: ret.return_number },
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong approving this return." };
  }

  revalidatePath("/purchases/returns");
  revalidatePath("/inventory");
  return { ok: true };
}