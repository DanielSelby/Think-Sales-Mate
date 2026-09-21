"use server";

import { requirePermission } from "@/lib/rbac/permissions";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canUseLocation } from "@/lib/organizations/location-access";
import { formatPurchaseNumber } from "@/lib/purchases/format";
import type { PurchaseStatus } from "@/types/database";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";
import { postOperationalJournal, resolveOperationalAccounts } from "@/lib/accounting/post-operational-journal";

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
  await requirePermission("purchases", "create");
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
  if (!canUseLocation(context, input.locationId)) {
    return { ok: false, error: "You are not assigned to this branch." };
  }

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
      invoice_number: input.invoiceNumber,
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

  const creationAudit = await recordAuditEvent(supabase, {
    orgId: context.orgId,
    actorId: user.id,
    action: "purchase.created",
    entityType: "purchases",
    entityId: purchase.id,
    module: "Purchases",
    description: `Created purchase ${formatPurchaseNumber(purchase.purchase_number)}`,
    branchId: input.locationId,
    newValues: { status, purchase_number: purchase.purchase_number, total },
  });
  if (creationAudit.error) return { ok: false, error: creationAudit.error };

  if (status !== "draft") {
    const accounts = await resolveOperationalAccounts(supabase, context.orgId, "purchase");
    if (accounts.error) {
      console.error("Automatic purchase journal was not posted:", accounts.error);
    } else if (accounts.debitAccountId && accounts.creditAccountId) {
      const journal = await postOperationalJournal(supabase, {
        orgId: context.orgId,
        actorId: user.id,
        sourceModule: "purchases",
        sourceId: purchase.id,
        date: input.purchaseDate,
        locationId: input.locationId,
        reference: formatPurchaseNumber(purchase.purchase_number),
        description: `Purchase ${formatPurchaseNumber(purchase.purchase_number)}`,
        lines: [
          { account_id: accounts.debitAccountId, description: "Inventory purchased", debit: Number(total), credit: 0 },
          { account_id: accounts.creditAccountId, description: "Supplier payable", debit: 0, credit: Number(total) },
        ],
      });
      if (journal.error) console.error("Automatic purchase journal was not posted:", journal.error);
    }
  }

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

export interface PurchasePrintData {
  purchaseNumber: number;
  purchaseDate: string;
  supplierName: string;
  invoiceNumber: string | null;
  items: { name: string; quantity: number; unitPrice: number; lineTotal: number }[];
  subtotal: number;
  taxAmount: number;
  shippingCost: number;
  total: number;
}

export async function getPurchasePrintData(purchaseId: string): Promise<PurchasePrintData | null> {
  const context = await getCurrentOrgContext();
  if (!context) return null;
  const supabase = await createClient();
  const { data: purchase } = await supabase
    .from("purchases")
    .select("purchase_number, purchase_date, invoice_number, subtotal, tax_amount, shipping_cost, total, location_id, supplier:suppliers(name)")
    .eq("id", purchaseId)
    .eq("org_id", context.orgId)
    .single();
  if (!purchase || !canUseLocation(context, purchase.location_id)) return null;
  const { data: items } = await supabase
    .from("purchase_items")
    .select("quantity, unit_price, line_total, product:products(name)")
    .eq("purchase_id", purchaseId)
    .eq("org_id", context.orgId);
  return {
    purchaseNumber: purchase.purchase_number,
    purchaseDate: purchase.purchase_date,
    supplierName: (purchase.supplier as { name: string } | null)?.name ?? "Unknown supplier",
    invoiceNumber: purchase.invoice_number,
    items: (items ?? []).map((item) => ({
      name: (item.product as { name: string } | null)?.name ?? "Unknown product",
      quantity: item.quantity,
      unitPrice: item.unit_price,
      lineTotal: item.line_total,
    })),
    subtotal: purchase.subtotal,
    taxAmount: purchase.tax_amount,
    shippingCost: purchase.shipping_cost,
    total: purchase.total,
  };
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
  const context = await getCurrentOrgContext();
  if (!context || purchase.org_id !== context.orgId || !canUseLocation(context, purchase.location_id)) {
    return { ok: false, error: "Purchase not found." };
  }

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

    const receiveAudit = await recordAuditEvent(supabase, {
      orgId: purchase.org_id,
      actorId: user.id,
      action: "purchase.items_received",
      entityType: "purchases",
      entityId: purchaseId,
      module: "Purchases",
      description: `Received purchase items; status is now ${nextStatus}`,
      newValues: { lines: toReceive, note, resulting_status: nextStatus },
    });
    if (receiveAudit.error) throw new Error(receiveAudit.error);
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
  const context = await getCurrentOrgContext();
  if (!context || original.org_id !== context.orgId || !canUseLocation(context, original.location_id)) {
    return { ok: false, error: "Purchase not found." };
  }

  const { data: copy, error: insertError } = await supabase
    .from("purchases")
    .insert({
      org_id: original.org_id,
      supplier_id: original.supplier_id,
      status: "draft",
      purchase_date: new Date().toISOString().slice(0, 10),
      expected_delivery_date: null,
      reference: original.reference,
      invoice_number: original.invoice_number,
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

  const duplicateAudit = await recordAuditEvent(supabase, {
    orgId: original.org_id,
    actorId: user.id,
    action: "purchase.duplicated",
    entityType: "purchases",
    entityId: copy.id,
    module: "Purchases",
    description: "Duplicated a purchase",
    newValues: { duplicated_from: purchaseId, purchase_number: copy.purchase_number },
  });
  if (duplicateAudit.error) return { ok: false, error: duplicateAudit.error };

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
    .select("id, org_id, location_id, total, paid_amount")
    .eq("id", purchaseId)
    .single();
  if (fetchError || !purchase) return { ok: false, error: "Purchase not found." };
  const context = await getCurrentOrgContext();
  if (!context || purchase.org_id !== context.orgId || !canUseLocation(context, purchase.location_id)) {
    return { ok: false, error: "Purchase not found." };
  }

  const nextPaid = Math.min(purchase.total, purchase.paid_amount + amount);
  const appliedAmount = nextPaid - purchase.paid_amount;
  if (appliedAmount <= 0) return { ok: false, error: "This purchase is already fully paid." };

  const { error: updateError } = await supabase
    .from("purchases")
    .update({ paid_amount: nextPaid })
    .eq("id", purchaseId);
  if (updateError) return { ok: false, error: updateError.message };

  const accounts = await resolveOperationalAccounts(supabase, purchase.org_id, "purchase_payment");
  if (!accounts.error && accounts.debitAccountId && accounts.creditAccountId) {
    const journal = await postOperationalJournal(supabase, {
      orgId: purchase.org_id,
      actorId: user.id,
      sourceModule: "purchase_payments",
      sourceId: `${purchaseId}:${nextPaid}`,
      date: new Date().toISOString().slice(0, 10),
      locationId: purchase.location_id,
      reference: purchaseId,
      description: "Purchase payment",
      lines: [
        { account_id: accounts.debitAccountId, description: "Reduce supplier payable", debit: Number(appliedAmount), credit: 0 },
        { account_id: accounts.creditAccountId, description: "Payment from cash/bank", debit: 0, credit: Number(appliedAmount) },
      ],
    });
    if (journal.error) console.error("Automatic purchase payment journal was not posted:", journal.error);
  } else if (accounts.error) {
    console.error("Automatic purchase payment journal was not posted:", accounts.error);
  }

  const paymentAudit = await recordAuditEvent(supabase, {
    orgId: purchase.org_id,
    actorId: user.id,
    action: "purchase.payment_recorded",
    entityType: "purchases",
    entityId: purchaseId,
    module: "Purchases",
    description: "Recorded a payment against a purchase",
    previousValues: { paid_amount: purchase.paid_amount },
    newValues: { paid_amount: nextPaid, payment_amount: amount, note },
  });
  if (paymentAudit.error) return { ok: false, error: paymentAudit.error };

  revalidatePath("/purchases");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Update (edit) — header fields and un-received line items only. Deliberately
// does NOT touch quantity_received, received_at, paid_amount, or status:
// those are only ever changed through Receive Items / Record Payment /
// row-menu actions, so editing here can never silently corrupt stock or
// payment numbers already posted against this purchase.
// ---------------------------------------------------------------------------

export interface UpdatePurchaseItemInput {
  /** Existing purchase_items.id, or null for a line added during this edit. */
  id: string | null;
  productId: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountPercent: number;
  taxPercent: number;
}

export interface UpdatePurchaseInput {
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
  items: UpdatePurchaseItemInput[];
  discountAmount: number;
  shippingCost: number;
  paymentMethod: string | null;
  paymentAccount: string | null;
  payFromAccount: string | null;
  purchaseNote: string | null;
  internalNote: string | null;
  status: PurchaseStatus;
}

export interface UpdatePurchaseResult {
  ok: boolean;
  error?: string;
  purchaseId?: string;
}

export async function updatePurchase(purchaseId: string, input: UpdatePurchaseInput): Promise<UpdatePurchaseResult> {
  await requirePermission("purchases", "edit");
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
  if (!user) return { ok: false, error: "You must be signed in to edit a purchase." };

  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "No active organization." };

  const { data: purchase, error: fetchError } = await supabase
    .from("purchases")
    .select("id, org_id, location_id")
    .eq("id", purchaseId)
    .eq("org_id", context.orgId)
    .single();
  if (fetchError || !purchase) return { ok: false, error: "Purchase not found." };
  if (!canUseLocation(context, purchase.location_id) || !canUseLocation(context, input.locationId)) {
    return { ok: false, error: "You are not assigned to this branch." };
  }

  const { data: existingItems, error: existingItemsError } = await supabase
    .from("purchase_items")
    .select("id, product_id, quantity, quantity_received")
    .eq("purchase_id", purchaseId);
  if (existingItemsError || !existingItems) return { ok: false, error: "Couldn't load this purchase's line items." };

  const existingById = new Map(existingItems.map((i) => [i.id, i]));
  const submittedIds = new Set(input.items.map((i) => i.id).filter(Boolean) as string[]);

  // Block reducing an existing line below what's already been received,
  // and block removing a line that has any units received — both would
  // desync stock from what was actually posted.
  for (const item of input.items) {
    if (!item.id) continue;
    const existing = existingById.get(item.id);
    if (!existing) return { ok: false, error: "One of these line items no longer exists on this purchase." };
    if (item.quantity < existing.quantity_received) {
      return {
        ok: false,
        error: `Can't reduce quantity below the ${existing.quantity_received} unit(s) already received on that line.`,
      };
    }
  }
  const removedItems = existingItems.filter((e) => !submittedIds.has(e.id));
  const blockedRemoval = removedItems.find((e) => e.quantity_received > 0);
  if (blockedRemoval) {
    return {
      ok: false,
      error: "Can't remove a line that already has units received — process a purchase return instead.",
    };
  }

  const { lines: computedLines, subtotal, discount, tax, total } = computeTotals(
    input.items.map(({ productId, quantity, unit, unitPrice, discountPercent, taxPercent }) => ({
      productId, quantity, unit, unitPrice, discountPercent, taxPercent,
    })),
    input.discountAmount,
    input.shippingCost
  );
  // computeTotals only knows about the pricing fields, so line `id`s are
  // zipped back in by index (input.items and computedLines stay in the
  // same order — computeTotals maps over the array without reordering).
  const lines = computedLines.map((line, i) => ({ ...line, id: input.items[i].id }));

  const { error: updateError } = await supabase
    .from("purchases")
    .update({
      supplier_id: input.supplierId,
      purchase_date: input.purchaseDate,
      expected_delivery_date: input.expectedDeliveryDate,
      reference: input.reference,
      invoice_number: input.invoiceNumber,
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
      status: input.status,
    })
    .eq("id", purchaseId);
  if (updateError) return { ok: false, error: updateError.message };

  if (removedItems.length > 0) {
    const { error: deleteError } = await supabase
      .from("purchase_items")
      .delete()
      .in("id", removedItems.map((i) => i.id));
    if (deleteError) return { ok: false, error: deleteError.message };
  }

  for (const line of lines) {
    if (line.id) {
      const { error: itemUpdateError } = await supabase
        .from("purchase_items")
        .update({
          product_id: line.productId,
          quantity: line.quantity,
          unit: line.unit,
          unit_price: line.unitPrice,
          discount_percent: line.discountPercent,
          tax_percent: line.taxPercent,
          line_total: line.lineTotal,
        })
        .eq("id", line.id);
      if (itemUpdateError) return { ok: false, error: itemUpdateError.message };
    } else {
      const { error: itemInsertError } = await supabase.from("purchase_items").insert({
        purchase_id: purchaseId,
        org_id: context.orgId,
        product_id: line.productId,
        quantity: line.quantity,
        quantity_received: 0,
        unit: line.unit,
        unit_price: line.unitPrice,
        discount_percent: line.discountPercent,
        tax_percent: line.taxPercent,
        line_total: line.lineTotal,
      });
      if (itemInsertError) return { ok: false, error: itemInsertError.message };
    }
  }

  const updateAudit = await recordAuditEvent(supabase, {
    orgId: context.orgId,
    actorId: context.userId,
    action: "purchase.updated",
    entityType: "purchases",
    entityId: purchaseId,
    module: "Purchases",
    description: "Updated purchase details",
    newValues: { total },
  });
  if (updateAudit.error) return { ok: false, error: updateAudit.error };

  revalidatePath("/purchases");
  revalidatePath(`/purchases/${purchaseId}`);

  return { ok: true, purchaseId };
}