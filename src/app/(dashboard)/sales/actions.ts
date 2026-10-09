"use server";

import { canPermission } from "@/lib/rbac/permissions";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canAccessLocation, canUseLocation } from "@/lib/organizations/location-access";
import type { SaleStatus } from "@/types/database";
import { dispatchAutomatedCustomerMessage } from "@/lib/communication/automation";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";
import { checkCustomerCreditLimit } from "@/lib/sales/customer-outstanding";
import { postOperationalJournal, resolveOperationalAccounts } from "@/lib/accounting/post-operational-journal";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function getPrimaryLocationId(supabase: SupabaseClient, orgId: string): Promise<string | null> {
  const { data } = await supabase
    .from("business_locations")
    .select("id")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

// ---------------------------------------------------------------------------
// Fetch line items for the "Mark as Returned" picker
// ---------------------------------------------------------------------------

export interface ReturnableLine {
  saleItemId: string;
  productId: string;
  productName: string;
  quantitySold: number;
  alreadyReturned: number;
  remaining: number;
  unitPrice: number;
}

export async function getSaleReturnableItems(saleId: string): Promise<ReturnableLine[]> {
  if (!await canPermission("sales", "view")) throw new Error("You do not have permission to view sales.");
  const supabase = await createClient();

  const { data: items } = await supabase
    .from("sale_items")
    .select("id, product_id, quantity, unit_price, product:products ( name )")
    .eq("sale_id", saleId);

  if (!items || items.length === 0) return [];

  const { data: returns } = await supabase
    .from("sale_return_items")
    .select("sale_item_id, quantity")
    .eq("sale_id", saleId);

  const returnedByLine = new Map<string, number>();
  for (const r of returns ?? []) {
    returnedByLine.set(r.sale_item_id, (returnedByLine.get(r.sale_item_id) ?? 0) + r.quantity);
  }

  return items.map((item) => {
    const alreadyReturned = returnedByLine.get(item.id) ?? 0;
    return {
      saleItemId: item.id,
      productId: item.product_id,
      productName: (item.product as { name: string } | null)?.name ?? "Unknown product",
      quantitySold: item.quantity,
      alreadyReturned,
      remaining: Math.max(0, item.quantity - alreadyReturned),
      unitPrice: item.unit_price,
    };
  });
}

// ---------------------------------------------------------------------------
// Update sale status (+ restock / reverse restock as needed)
// ---------------------------------------------------------------------------

export interface UpdateSaleStatusInput {
  saleId: string;
  status: SaleStatus;
  refundedAmount?: number;
  refundPaymentMethod?: string | null;
  note?: string;
  /** Only used when status === "returned": quantity being returned per line, > 0 only. */
  returnLines?: { saleItemId: string; productId: string; quantity: number }[];
}

export interface UpdateSaleStatusResult {
  ok: boolean;
  error?: string;
}

export async function updateSaleStatus({
  saleId,
  status,
  refundedAmount,
  refundPaymentMethod,
  note,
  returnLines,
}: UpdateSaleStatusInput): Promise<UpdateSaleStatusResult> {
  if (!await canPermission("sales", "approve")) throw new Error("You do not have permission to approve sales.");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in to change a sale's status." };

  // Same pattern as updateSale: writes here go through the admin
  // (service-role) client, since the regular client's UPDATE on `sales`
  // can silently match 0 rows under RLS with no error — the dialog would
  // close as if it worked while nothing actually changed.
  const admin = createAdminClient();

  const { data: sale, error: fetchError } = await supabase
    .from("sales")
    .select("id, org_id, sale_number, total, status, location_id")
    .eq("id", saleId)
    .single();
  if (fetchError || !sale) return { ok: false, error: "Sale not found." };
  const context = await getCurrentOrgContext();
  if (!context || sale.org_id !== context.orgId || !canAccessLocation(context, sale.location_id)) {
    return { ok: false, error: "You are not authorized to change this sale." };
  }

  const restockLocationId = sale.location_id ?? (await getPrimaryLocationId(supabase, sale.org_id));
  if (!restockLocationId) {
    return { ok: false, error: "This sale has no location and the org has no active location to restock to." };
  }
  if (!canAccessLocation(context, restockLocationId)) {
    return { ok: false, error: "You do not have access to the branch required to process this return." };
  }

  const nextRefundedAmount = status === "returned" ? Math.max(0, refundedAmount ?? 0) : 0;
  if (status === "returned" && (!Number.isFinite(nextRefundedAmount) || nextRefundedAmount < 0)) {
    return { ok: false, error: "Enter a valid refund amount." };
  }
  if (nextRefundedAmount > sale.total) {
    return { ok: false, error: "Refund amount can't exceed the sale total." };
  }
  const refundTender = status === "returned" ? refundPaymentMethod?.trim() || null : null;
  const allowedRefundTenders = ["Cash", "Card", "Mobile Money", "Bank Transfer", "Cheque", "Other"];
  if (status === "returned" && nextRefundedAmount > 0 && !refundTender) {
    return { ok: false, error: "Select how the refund is being paid." };
  }
  if (refundTender && !allowedRefundTenders.includes(refundTender)) {
    return { ok: false, error: "Select a valid refund payment method." };
  }
  let refundSessionId: string | null = null;
  if (status === "returned" && nextRefundedAmount > 0 && refundTender === "Cash") {
    const { data: session, error: sessionError } = await (supabase as any)
      .from("pos_register_sessions")
      .select("id")
      .eq("org_id", sale.org_id)
      .eq("cashier_id", user.id)
      .eq("location_id", restockLocationId)
      .eq("status", "open")
      .maybeSingle();
    if (sessionError) return { ok: false, error: "Could not verify an open register for this cash refund." };
    if (!session) return { ok: false, error: "Open a register at this sale's branch before issuing a cash refund." };
    refundSessionId = session.id;
  }
  let refundAuditWarning: string | null = null;

  try {
    if (status === "returned") {
      const lines = (returnLines ?? []).filter((l) => l.quantity > 0);
      if (!lines.length) return { ok: false, error: "Select at least one item to return." };
      const { data: saleItems } = await supabase
        .from("sale_items")
        .select("id, product_id, quantity, product:products(cost_price)")
        .eq("sale_id", saleId);
      const { data: existingReturns } = await supabase
        .from("sale_return_items")
        .select("sale_item_id, quantity")
        .eq("sale_id", saleId);
      const returnedByItem = new Map<string, number>();
      for (const item of existingReturns ?? []) {
        returnedByItem.set(item.sale_item_id, (returnedByItem.get(item.sale_item_id) ?? 0) + Number(item.quantity));
      }
      const saleItemById = new Map((saleItems ?? []).map((item) => [item.id, item]));
      for (const line of lines) {
        if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
          return { ok: false, error: "Return quantities must be positive whole numbers." };
        }
        const saleItem = saleItemById.get(line.saleItemId);
        const alreadyReturned = returnedByItem.get(line.saleItemId) ?? 0;
        if (!saleItem || saleItem.product_id !== line.productId || line.quantity > Number(saleItem.quantity) - alreadyReturned) {
          return { ok: false, error: "One or more return quantities exceed the remaining quantity for that sale line." };
        }
      }
    }

    if (status === "cancelled") {
      const lines = await getSaleReturnableItems(saleId);
      for (const line of lines.filter((l) => l.remaining > 0)) {
        const { error: insertError } = await admin.from("sale_return_items").insert({
          org_id: sale.org_id,
          sale_id: saleId,
          sale_item_id: line.saleItemId,
          product_id: line.productId,
          quantity: line.remaining,
          location_id: restockLocationId,
          created_by: user.id,
        });
        if (insertError) throw new Error(insertError.message);

        const { error: rpcError } = await supabase.rpc("adjust_product_stock_at_location", {
          p_product_id: line.productId,
          p_location_id: restockLocationId,
          p_org_id: sale.org_id,
          p_delta: line.remaining,
        });
        if (rpcError) throw new Error(rpcError.message);
      }
    }

    if (status === "completed" && sale.status !== "completed") {
      const { data: existingReturns } = await supabase
        .from("sale_return_items")
        .select("product_id, quantity, location_id")
        .eq("sale_id", saleId);

      for (const r of existingReturns ?? []) {
        const reversalLocationId = r.location_id ?? restockLocationId;
        const { error: rpcError } = await supabase.rpc("adjust_product_stock_at_location", {
          p_product_id: r.product_id,
          p_location_id: reversalLocationId,
          p_org_id: sale.org_id,
          p_delta: -r.quantity,
        });
        if (rpcError) throw new Error(rpcError.message);
      }

      const { error: deleteError } = await admin.from("sale_return_items").delete().eq("sale_id", saleId);
      if (deleteError) throw new Error(deleteError.message);
    }

    if (status === "returned") {
      const { data: movementId, error: refundError } = await (admin as any).rpc("record_pos_sale_refund", {
        p_sale_id: saleId,
        p_org_id: sale.org_id,
        p_actor_id: user.id,
        p_amount: nextRefundedAmount,
        p_payment_method: refundTender,
        p_session_id: refundSessionId,
        p_location_id: restockLocationId,
        p_return_lines: returnLines ?? [],
        p_note: note?.trim() || null,
      });
      if (refundError) throw new Error(refundError.message);
      const refundAudit = await recordAuditEvent(supabase, {
        orgId: sale.org_id,
        actorId: user.id,
        action: "sales.refund_recorded",
        entityType: "sales",
        entityId: sale.id,
        module: "Sales",
        description: "Sale return and refund method recorded.",
        branchId: sale.location_id,
        newValues: { refunded_amount: nextRefundedAmount, refund_payment_method: refundTender, cash_movement_id: movementId },
      });
      if (refundAudit.error) refundAuditWarning = "Return saved, but its audit event could not be recorded. Notify an administrator.";
    } else {
      const { error: updateError, count: updatedCount } = await admin
        .from("sales")
        .update({
          status,
          refunded_amount: nextRefundedAmount,
          refund_payment_method: null,
          refund_register_session_id: null,
          status_note: note?.trim() || null,
          status_changed_by: user.id,
        }, { count: "exact" })
        .eq("id", saleId);
      if (updateError) throw new Error(updateError.message);
      if ((updatedCount ?? 0) === 0) {
        throw new Error("The status update didn't apply to any row — check the sales table's UPDATE policy.");
      }
    }

    if (status === "returned" || status === "cancelled") {
      const accounts = await resolveOperationalAccounts(supabase, sale.org_id, "sale");
      if (accounts.error || !accounts.debitAccountId || !accounts.creditAccountId) {
        console.error("Automatic sale return journal was not posted:", accounts.error ?? "Sales accounts are not configured.");
      } else {
        const refundValue = status === "returned" ? nextRefundedAmount : Number(sale.total);
        const returnLinesValue = (returnLines ?? []).reduce((sum, line) => sum + Math.max(0, line.quantity), 0);
        const reversalValue = refundValue > 0 ? refundValue : Number(sale.total);
        const journal = await postOperationalJournal(supabase, {
          orgId: sale.org_id,
          actorId: user.id,
          sourceModule: status === "cancelled" ? "sale_cancellation" : "sale_return",
          sourceId: sale.id,
          date: new Date().toISOString().slice(0, 10),
          locationId: restockLocationId,
          reference: `SALE-${sale.id}`,
          description: status === "cancelled" ? "Cancelled sale reversal" : `Sale return${returnLinesValue ? ` (${returnLinesValue} item(s))` : ""}`,
          lines: [
            { account_id: accounts.creditAccountId, description: "Reverse sales revenue", debit: reversalValue, credit: 0 },
            { account_id: accounts.debitAccountId, description: "Refund or reverse sale proceeds", debit: 0, credit: reversalValue },
          ],
        });
        if (journal.error) console.error("Automatic sale return journal was not posted:", journal.error);
      }
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong. Try again." };
  }

  revalidatePath("/sales");
  revalidatePath("/inventory");
  if (refundSessionId) revalidatePath("/pos/cash-drawer");
  return { ok: true, ...(refundAuditWarning ? { error: refundAuditWarning } : {}) };
}
// ---------------------------------------------------------------------------
// Record a new sale
// ---------------------------------------------------------------------------
export interface RecordSaleInput {
  orgId:           string;
  offlineOperationId?: string;
  offlineSync?: boolean;
  documentStatus?: "draft" | "quotation" | "proforma" | "final";
  customerId?:     string | null;
  customerName?:   string | null;
  customerPhone?:  string | null;
  locationId?:     string | null;
  posRegisterSessionId?: string | null;
  reference?:      string | null;
  note?:           string | null;
  notes?:          string | null;
  saleDate?:       string | null;
  dueDate?:        string | null;
  paymentMethod?:  string | null;
  amountPaid?:     number | null;
  paymentAllocations?: { paymentMethod: string; accountId?: string | null; amount: number }[];
  shippingAmount?: number | null;
  discountAmount?: number | null;
  taxAmount?:      number | null;
  subtotal:        number;
  total:           number;
  priceTier?:      "retail" | "wholesale" | "vip" | "special";
  lines?: {
    productId:        string;
    quantity:         number;
    unitPrice:        number;
    lineTotal:        number;
    discountAmount?:  number | null;
    taxAmount?:       number | null;
  }[];
  items?: {
    productId:          string;
    quantity:           number;
    unitPrice?:         number;
    unitPriceOverride?: number | null;
    discountPercent?:   number;
    discountAmount?:    number | null;
    taxPercent?:        number;
    taxAmount?:         number | null;
    lineTotal?:         number;
    notes?:             string | null;
  }[];
}

export interface RecordSaleResult {
  ok:         boolean;
  saleId?:    string;
  saleNumber?: number;
  error?:     string;
}

export async function recordSale(input: RecordSaleInput): Promise<RecordSaleResult> {
  const canCreateSales = await canPermission("sales", "create");
  const canCreatePosSales = input.offlineSync && await canPermission("pos", "create");
  if (!canCreateSales && !canCreatePosSales) throw new Error("You do not have permission to create sales.");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const context = await getCurrentOrgContext();
  if (!context || context.orgId !== input.orgId) {
    return { ok: false, error: "You are not authorized to create sales in this organization." };
  }
  if (!input.locationId && context.isBranchScoped) {
    return { ok: false, error: "Select an assigned branch before creating the sale." };
  }
  if (input.locationId && !canUseLocation(context, input.locationId)) {
    return { ok: false, error: "You are not assigned to this branch." };
  }
  if (input.offlineSync) {
    const { data: offlineSettings, error: offlineSettingsError } = await supabase
      .from("org_general_settings")
      .select("offline_enabled")
      .eq("org_id", context.orgId)
      .maybeSingle();
    if (offlineSettingsError) {
      return { ok: false, error: `Could not verify offline transaction settings: ${offlineSettingsError.message}` };
    }
    if (offlineSettings?.offline_enabled === false) {
      return { ok: false, error: "Offline transactions are disabled for this organization." };
    }
  }
  if (input.offlineOperationId) {
    const { data: existingSale, error: existingSaleError } = await supabase
      .from("sales")
      .select("id, sale_number, offline_sync_completed_at")
      .eq("org_id", input.orgId)
      .eq("offline_operation_id", input.offlineOperationId)
      .maybeSingle();
    if (existingSaleError) return { ok: false, error: `Could not verify whether this offline sale was already synced: ${existingSaleError.message}` };
    if (existingSale) {
      if (!existingSale.offline_sync_completed_at) {
        return { ok: false, error: "This offline sale was only partially processed. It needs administrator review before it can be retried." };
      }
      return { ok: true, saleId: existingSale.id, saleNumber: existingSale.sale_number };
    }
  }
  if ((input.documentStatus ?? "final") === "final") {
    const creditCheck = await checkCustomerCreditLimit(
      supabase,
      context.orgId,
      input.customerId ?? null,
      input.customerName ?? null,
      Math.max(0, input.total - (input.amountPaid ?? 0))
    );
    if (!creditCheck.allowed) return { ok: false, error: creditCheck.error };
  }
  if (input.posRegisterSessionId) {
    if (!input.locationId) {
      return { ok: false, error: "Select a branch/location before processing the POS sale." };
    }
    const sessionQuery = input.offlineSync
      ? supabase.from("pos_register_sessions").select("id")
      : supabase.from("pos_register_sessions").select("id").eq("status", "open");
    const { data: session, error: sessionError } = await sessionQuery
      .eq("id", input.posRegisterSessionId)
      .eq("org_id", context.orgId)
      .eq("cashier_id", user.id)
      .eq("location_id", input.locationId)
      .maybeSingle();
    if (sessionError || !session) {
      return { ok: false, error: input.offlineSync
        ? "The original POS register session could not be verified for this offline sale."
        : "The POS register session is closed or unavailable. Reopen the register and retry sync." };
    }
  }

  try {
    const { data: sale, error: saleError } = await supabase
      .from("sales")
      .insert({
        org_id:          input.orgId,
        customer_name:   input.customerName ?? null,
        customer_id:     input.customerId ?? null,
        location_id:     input.locationId ?? null,
        register_session_id: input.posRegisterSessionId ?? null,
        offline_operation_id: input.offlineOperationId ?? null,
        reference:       input.reference ?? null,
        sale_date:       input.saleDate ?? new Date().toISOString().slice(0, 10),
        due_date: (input.documentStatus ?? "final") === "final" && (input.amountPaid ?? 0) >= input.total
          ? null
          : input.dueDate || null,
        document_status: input.documentStatus ?? "final",
        subtotal:        input.subtotal,
        discount_amount: input.discountAmount ?? 0,
        tax_amount:      input.taxAmount ?? 0,
        shipping_amount: input.shippingAmount ?? 0,
        total:           input.total,
        payment_method:  input.paymentMethod ?? null,
        amount_paid:     input.amountPaid ?? null,
        sold_by:         user.id,
        status:          "completed",
      })
      .select("id, sale_number")
      .single();

    if (saleError || !sale) {
      if (input.offlineOperationId && saleError?.code === "23505") {
        const { data: existingSale, error: existingSaleError } = await supabase
          .from("sales")
          .select("id, sale_number, offline_sync_completed_at")
          .eq("org_id", input.orgId)
          .eq("offline_operation_id", input.offlineOperationId)
          .maybeSingle();
        if (existingSaleError) throw new Error(existingSaleError.message);
        if (existingSale) {
          if (!existingSale.offline_sync_completed_at) {
            return { ok: false, error: "This offline sale was only partially processed. It needs administrator review before it can be retried." };
          }
          return { ok: true, saleId: existingSale.id, saleNumber: existingSale.sale_number };
        }
      }
      throw new Error(saleError?.message ?? "Failed to create sale.");
    }

    if (input.paymentAllocations?.length) {
      const { error: allocationsError } = await supabase.from("sale_payment_allocations").insert(
        input.paymentAllocations.map((allocation) => ({
          org_id: input.orgId,
          sale_id: sale.id,
          payment_method: allocation.paymentMethod,
          account_id: allocation.accountId ?? null,
          amount: allocation.amount,
        }))
      );
      if (allocationsError) throw new Error(allocationsError.message);
    }

    const allLines = [
      ...(input.lines ?? []).map(l => ({
        sale_id:          sale.id,
        org_id:           input.orgId,
        product_id:       l.productId,
        quantity:         l.quantity,
        unit_price:       l.unitPrice ?? 0,
        discount_percent: 0,
        tax_percent:      0,
        line_total:       l.lineTotal ?? 0,
      })),
      ...(input.items ?? []).map(l => ({
        sale_id:          sale.id,
        org_id:           input.orgId,
        product_id:       l.productId,
        quantity:         l.quantity,
        unit_price:       l.unitPriceOverride ?? l.unitPrice ?? 0,
        discount_percent: l.discountPercent ?? 0,
        tax_percent:      l.taxPercent ?? 0,
        line_total:       l.lineTotal ?? 0,
      })),
    ];

    if (allLines.length > 0) {
      const { error: itemsError } = await supabase.from("sale_items").insert(allLines);
      if (itemsError) throw new Error(itemsError.message);
    }

    const productIds = [...new Set(allLines.map((line) => line.product_id))];
    if (productIds.length) {
      const { data: products, error: productsError } = await supabase
        .from("products")
        .select("id, name, unit_price, wholesale_price, vip_price, cost_price")
        .in("id", productIds);
      if (productsError) throw new Error(productsError.message);

      const systemPrices = new Map((products ?? []).map((product) => [product.id, { name: product.name, price: Number(product.unit_price), cost: Number(product.cost_price ?? 0), prices: [product.unit_price, product.wholesale_price, product.vip_price] }]));
      const lowMarginItems = allLines.filter((line) => systemPrices.get(line.product_id)?.prices.some((price) => price != null && Number(price) <= (systemPrices.get(line.product_id)?.cost ?? 0))).map((line) => ({
        productId: line.product_id,
        productName: systemPrices.get(line.product_id)?.name ?? "Unknown product",
        price: Number(line.unit_price),
        cost: systemPrices.get(line.product_id)?.cost ?? 0,
      }));
      if (lowMarginItems.length) {
        const lowMarginAudit = await recordAuditEvent(supabase, {
          orgId: input.orgId,
          actorId: user.id,
          action: "sale.low_margin_flagged",
          entityType: "sale",
          entityId: sale.id,
          module: "Sales",
          description: `Low-margin items flagged on sale #${sale.sale_number}`,
          newValues: { price_tier: input.priceTier ?? "retail", items: lowMarginItems },
        });
        if (lowMarginAudit.error) throw new Error(lowMarginAudit.error);
      }
      const priceOverrides = allLines.flatMap((line) => {
        const product = systemPrices.get(line.product_id);
        if (!product || Number(line.unit_price) === product.price) return [];
        return [{
          product_id: line.product_id,
          product_name: product.name,
          system_price: product.price,
          transaction_price: Number(line.unit_price),
          quantity: line.quantity,
        }];
      });

      if (priceOverrides.length) {
        const overrideAudit = await recordAuditEvent(supabase, {
          orgId: input.orgId,
          actorId: user.id,
          action: "price_override",
          entityType: "sale",
          entityId: sale.id,
          module: "Sales",
          description: `Transaction price override on sale #${sale.sale_number}`,
          branchId: input.locationId,
          previousValues: { price_source: "system catalog price" },
          newValues: { price_overrides: priceOverrides },
          metadata: { sale_number: sale.sale_number },
        });
        if (overrideAudit.error) throw new Error(overrideAudit.error);
      }
    }

    // Only a "final" document is a real sale — drafts, quotations, and
    // proformas must not touch inventory until they're actually finalized.
    if ((input.documentStatus ?? "final") === "final") {
      let targetLocationId = input.locationId;
      if (!targetLocationId) {
        const { data: primaryLoc } = await supabase
          .from("business_locations")
          .select("id")
          .eq("org_id", input.orgId)
          .eq("is_primary", true)
          .maybeSingle();
        targetLocationId = primaryLoc?.id ?? null;
      }
      if (targetLocationId) {
        for (const l of [...(input.lines ?? []), ...(input.items ?? [])]) {
          const { error: stockError } = await supabase.rpc("adjust_product_stock_at_location", {
            p_product_id: l.productId,
            p_location_id: targetLocationId,
            p_org_id: input.orgId,
            p_delta: -l.quantity,
          });
          if (stockError) throw new Error(`Could not update product stock: ${stockError.message}`);
        }
      }

      if ((input.documentStatus ?? "final") === "final" && input.customerId) {
        try {
          await dispatchAutomatedCustomerMessage({
            orgId: input.orgId,
            event: "Customer Places Order",
            customerId: input.customerId,
            transactionPhone: input.customerPhone,
            actorId: user.id,
            variables: {
              customer_name: input.customerName,
              order_number: sale.sale_number,
              amount: input.total,
              balance: Math.max(0, input.total - (input.amountPaid ?? 0)),
              current_date: new Date().toISOString().slice(0, 10)
            }
          });
        } catch (messageError) {
          console.error("Automated customer message failed after sale creation", messageError);
        }

        const accounts = await resolveOperationalAccounts(supabase, input.orgId, "sale");
        if (accounts.error) {
          console.error("Automatic sales journal was not posted:", accounts.error);
        } else if (accounts.debitAccountId && accounts.creditAccountId) {
          const journal = await postOperationalJournal(supabase, {
            orgId: input.orgId,
            actorId: user.id,
            sourceModule: "sales",
            sourceId: sale.id,
            date: input.saleDate ?? new Date().toISOString().slice(0, 10),
            locationId: input.locationId ?? null,
            reference: `SALE-${sale.sale_number}`,
            description: `Sale #${sale.sale_number}`,
            lines: [
              { account_id: accounts.debitAccountId, description: "Sale proceeds", debit: Number(input.total), credit: 0 },
              { account_id: accounts.creditAccountId, description: "Sales revenue", debit: 0, credit: Number(input.total) },
            ],
          });
          if (journal.error) {
            console.error("Automatic sales journal was not posted:", journal.error);
            if (input.offlineSync) throw new Error(`Could not post the sales journal: ${journal.error}`);
          }
        }
      }
    }

    revalidatePath("/sales");
    revalidatePath("/inventory");
    if (input.offlineOperationId) {
      const admin = createAdminClient();
      const { error: completionError } = await admin
        .from("sales")
        .update({ offline_sync_completed_at: new Date().toISOString() })
        .eq("id", sale.id)
        .eq("org_id", input.orgId)
        .eq("offline_operation_id", input.offlineOperationId);
      if (completionError) {
        throw new Error(`Sale was created but its offline sync completion could not be recorded: ${completionError.message}`);
      }
    }
    return { ok: true, saleId: sale.id, saleNumber: sale.sale_number };

  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

// ---------------------------------------------------------------------------
// Fetch line items for invoice display
// ---------------------------------------------------------------------------
// Edit an existing sale — load + save
// ---------------------------------------------------------------------------
export interface SaleEditData {
  id:            string;
  saleNumber:    number;
  documentStatus: "draft" | "quotation" | "proforma" | "final";
  customerId:    string | null;
  customerName:  string | null;
  locationId:    string | null;
  reference:     string | null;
  saleDate:      string;
  dueDate:       string | null;
  paymentMethod: string | null;
  amountPaid:    number | null;
  shippingAmount: number;
  discountAmount: number;
  taxAmount:      number;
  items: { productId: string; quantity: number; unitPrice: number; discountPercent: number; taxPercent: number }[];
}

export async function getSaleForEdit(saleId: string): Promise<SaleEditData | null> {
  const supabase = await createClient();
  const context = await getCurrentOrgContext();

  const { data: sale } = await supabase
    .from("sales")
    .select("id, org_id, sale_number, document_status, status, customer_id, customer_name, location_id, reference, sale_date, due_date, payment_method, amount_paid, shipping_amount, discount_amount, tax_amount")
    .eq("id", saleId)
    .single();
  if (!sale) return null;
  if (!context || sale.org_id !== context.orgId || !canAccessLocation(context, sale.location_id) || (sale.document_status === "final" && sale.status !== "completed")) return null;

  const { data: items } = await supabase
    .from("sale_items")
    .select("product_id, quantity, unit_price, discount_percent, tax_percent")
    .eq("sale_id", saleId);

  return {
    id: sale.id,
    saleNumber: sale.sale_number,
    documentStatus: sale.document_status ?? "final",
    customerId: sale.customer_id,
    customerName: sale.customer_name,
    locationId: sale.location_id,
    reference: sale.reference,
    saleDate: sale.sale_date,
    dueDate: sale.due_date,
    paymentMethod: sale.payment_method,
    amountPaid: sale.amount_paid,
    shippingAmount: sale.shipping_amount ?? 0,
    discountAmount: sale.discount_amount ?? 0,
    taxAmount: sale.tax_amount ?? 0,
    items: (items ?? []).map((i) => ({
      productId: i.product_id,
      quantity: i.quantity,
      unitPrice: i.unit_price,
      discountPercent: i.discount_percent,
      taxPercent: i.tax_percent,
    })),
  };
}

export interface UpdateSaleInput {
  saleId:          string;
  documentStatus?: "draft" | "quotation" | "proforma" | "final";
  customerId?:     string | null;
  customerName?:   string | null;
  locationId?:     string | null;
  reference?:      string | null;
  saleDate?:       string | null;
  dueDate?:        string | null;
  paymentMethod?:  string | null;
  amountPaid?:     number | null;
  shippingAmount?: number | null;
  discountAmount?: number | null;
  taxAmount?:      number | null;
  subtotal:        number;
  total:           number;
  priceTier?:      "retail" | "wholesale" | "vip" | "special";
  items: { productId: string; quantity: number; unitPrice: number; discountPercent?: number; taxPercent?: number; lineTotal: number }[];
}

export async function updateSale(input: UpdateSaleInput): Promise<RecordSaleResult> {
  if (!await canPermission("sales", "edit")) return { ok: false, error: "You do not have permission to edit sales." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "Your organization access could not be verified." };

  // sale_items' RLS appears to cover select/insert but not delete — the
  // user's identity/authorization is already verified above via
  // getUser(), so the delete+reinsert step runs through the admin
  // (service-role) client to avoid it silently matching 0 rows.
  const admin = createAdminClient();

  try {
    const { data: existingSale } = await supabase.from("sales").select("org_id, location_id, document_status, status, customer_id, customer_name, total, amount_paid").eq("id", input.saleId).single();
    if (!existingSale) throw new Error("Sale not found.");
    if (existingSale.org_id !== context.orgId || !canAccessLocation(context, existingSale.location_id)) {
      return { ok: false, error: "You are not authorized to edit this sale." };
    }
    if (existingSale.document_status === "final" && existingSale.status !== "completed") {
      return { ok: false, error: "Returned or cancelled sales cannot be changed through normal sale editing." };
    }
    const nextLocationId = input.locationId ?? existingSale.location_id;
    if (!nextLocationId && context.isBranchScoped) {
      return { ok: false, error: "Select an assigned branch before updating the sale." };
    }
    if (nextLocationId && !canUseLocation(context, nextLocationId)) {
      return { ok: false, error: "You are not assigned to this branch." };
    }

    const wasFinal = existingSale.document_status === "final";
    const nextDocumentStatus = input.documentStatus ?? existingSale.document_status;
    const willBeFinal = nextDocumentStatus === "final";
    if (willBeFinal) {
      const creditCheck = await checkCustomerCreditLimit(
        supabase,
        context.orgId,
        input.customerId ?? existingSale.customer_id,
        input.customerName ?? existingSale.customer_name,
        Math.max(0, input.total - (input.amountPaid ?? 0)),
        input.saleId
      );
      if (!creditCheck.allowed) return { ok: false, error: creditCheck.error };
    }

    const { data: existingItems } = await supabase.from("sale_items").select("product_id, quantity").eq("sale_id", input.saleId);
    // Only reverse stock if this sale had actually deducted it before —
    // a draft/quotation never touched inventory in the first place.
    if (wasFinal && existingSale.location_id) {
      for (const item of existingItems ?? []) {
        await supabase.rpc("adjust_product_stock_at_location", {
          p_product_id: item.product_id,
          p_location_id: existingSale.location_id,
          p_org_id: existingSale.org_id,
          p_delta: item.quantity,
        });
      }
    }

    const { error: deleteError, count: deletedCount } = await admin
      .from("sale_items")
      .delete({ count: "exact" })
      .eq("sale_id", input.saleId)
      .eq("org_id", existingSale.org_id);
    if (deleteError) throw new Error(deleteError.message);
    if ((deletedCount ?? 0) !== (existingItems?.length ?? 0)) {
      throw new Error(
        `Expected to remove ${existingItems?.length ?? 0} old line item(s) but removed ${deletedCount ?? 0} — aborting to avoid duplicate rows.`
      );
    }

    const { error: updateError } = await supabase
      .from("sales")
      .update({
        customer_name:   input.customerName ?? null,
        customer_id:     input.customerId ?? null,
        location_id:     nextLocationId ?? null,
        reference:       input.reference ?? null,
        sale_date:       input.saleDate ?? new Date().toISOString().slice(0, 10),
        due_date: willBeFinal && (input.amountPaid ?? existingSale.amount_paid ?? 0) >= input.total
          ? null
          : input.dueDate || null,
        subtotal:        input.subtotal,
        discount_amount: input.discountAmount ?? 0,
        tax_amount:      input.taxAmount ?? 0,
        shipping_amount: input.shippingAmount ?? 0,
        total:           input.total,
        document_status: nextDocumentStatus,
        payment_method:  input.paymentMethod ?? null,
        amount_paid:     input.amountPaid ?? null,
      })
      .eq("id", input.saleId);
    if (updateError) throw new Error(updateError.message);

    if (input.items.length > 0) {
      const rows = input.items.map((l) => ({
        sale_id:          input.saleId,
        org_id:           existingSale.org_id,
        product_id:       l.productId,
        quantity:         l.quantity,
        unit_price:       l.unitPrice,
        discount_percent: l.discountPercent ?? 0,
        tax_percent:      l.taxPercent ?? 0,
        line_total:       l.lineTotal,
      }));
      const { error: itemsError } = await admin.from("sale_items").insert(rows);
      if (itemsError) throw new Error(itemsError.message);

      const { data: products } = await supabase
        .from("products")
        .select("id, name, unit_price, wholesale_price, vip_price, cost_price")
        .in("id", input.items.map((item) => item.productId));
      const productById = new Map((products ?? []).map((product) => [product.id, product]));
      const lowMarginItems = input.items
        .filter((item) => {
          const product = productById.get(item.productId);
          const cost = Number(product?.cost_price ?? 0);
          return [product?.unit_price, product?.wholesale_price, product?.vip_price].some((price) => price != null && Number(price) <= cost);
        })
        .map((item) => ({
          productId: item.productId,
          productName: productById.get(item.productId)?.name ?? "Unknown product",
          price: item.unitPrice,
          cost: Number(productById.get(item.productId)?.cost_price ?? 0),
        }));
      if (lowMarginItems.length > 0) {
        const { error: lowMarginError } = await admin.from("audit_logs").insert({
          org_id: existingSale.org_id,
          actor_id: user.id,
          action: "sale.low_margin_flagged",
          entity_type: "sale",
          entity_id: input.saleId,
          metadata: { price_tier: input.priceTier ?? "retail", items: lowMarginItems },
        });
        if (lowMarginError) throw new Error(lowMarginError.message);
      }
    }

    // Only deduct stock if the sale is (or is becoming) final — this is
    // what makes finalizing a draft actually reserve inventory, exactly
    // once, at the moment it's finalized.
    if (willBeFinal) {
      const targetLocationId = nextLocationId;
      if (targetLocationId) {
        for (const l of input.items) {
          await supabase.rpc("adjust_product_stock_at_location", {
            p_product_id: l.productId,
            p_location_id: targetLocationId,
            p_org_id: existingSale.org_id,
            p_delta: -l.quantity,
          });
        }
      }
    }

    revalidatePath("/sales");
    revalidatePath(`/sales/${input.saleId}`);
    revalidatePath("/inventory");
    return { ok: true, saleId: input.saleId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

// ---------------------------------------------------------------------------
// Drafts / Quotations / Proformas list
// ---------------------------------------------------------------------------
export interface DraftSaleRow {
  id: string;
  saleNumber: number;
  documentStatus: "draft" | "quotation" | "proforma";
  locationId: string | null;
  locationName: string | null;
  locationCode: string | null;
  locationPhone: string | null;
  locationEmail: string | null;
  customerName: string;
  saleDate: string;
  dueDate: string | null;
  total: number;
  createdAt: string;
  createdByName: string;
}

export async function getDraftSales(orgId: string): Promise<DraftSaleRow[]> {
  const context = await getCurrentOrgContext();
  const supabase = await createClient();
  let q = supabase
    .from("sales")
    .select("id, sale_number, document_status, customer_name, sale_date, due_date, total, created_at, location_id, sold_by")
    .eq("org_id", orgId)
    .in("document_status", ["draft", "quotation", "proforma"])
    .order("created_at", { ascending: false });

  if (context && context.isBranchScoped && context.allowedLocationIds.length > 0) {
    q = q.in("location_id", context.allowedLocationIds);
  }

  if (context && !context.canViewOtherTransactions) {
    q = q.eq("sold_by", context.userId);
  }

  const { data } = await q;
  const soldByIds = Array.from(new Set((data ?? []).map((sale) => sale.sold_by).filter(Boolean)));
  const { data: profiles } = soldByIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", soldByIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const profileNames = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name ?? "Unknown"]));

  return (data ?? []).map((s) => ({
    id: s.id,
    saleNumber: s.sale_number,
    documentStatus: s.document_status as "draft" | "quotation" | "proforma",
    locationId: s.location_id,
    locationName: null,
    locationCode: null,
    locationPhone: null,
    locationEmail: null,
    customerName: s.customer_name ?? "Walk-in Customer",
    saleDate: s.sale_date,
    dueDate: s.due_date,
    total: s.total,
    createdAt: s.created_at,
    createdByName: profileNames.get(s.sold_by) ?? "Unknown",
  }));
}

export async function deleteDraftSale(saleId: string): Promise<{ ok: boolean; error?: string }> {
  if (!await canPermission("sales", "delete")) throw new Error("You do not have permission to delete sales.");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Only ever deletes rows still in a non-final state — a safety check
  // against accidentally deleting a real, finalized sale from this screen.
  const { data: sale } = await supabase.from("sales").select("document_status").eq("id", saleId).single();
  if (!sale) return { ok: false, error: "Not found." };
  if (sale.document_status === "final") return { ok: false, error: "This is a finalized sale — it can't be deleted from here." };

  const { error: itemsError } = await supabase.from("sale_items").delete().eq("sale_id", saleId);
  if (itemsError) return { ok: false, error: itemsError.message };

  const { error } = await supabase.from("sales").delete().eq("id", saleId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/sales/drafts");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Add a customer from the Add Sale screen
// ---------------------------------------------------------------------------
export interface AddCustomerInput {
  name: string;
  contactType: "individual" | "business";
  contactId: string | null;
  phone: string;
  alternatePhone: string | null;
  landline: string | null;
  email: string | null;
  creditLimit: number | null;
}

export interface AddCustomerResult {
  ok: boolean;
  customer?: { id: string; name: string; email: string | null; phone: string | null };
  error?: string;
}

export async function addCustomer(orgId: string, input: AddCustomerInput): Promise<AddCustomerResult> {
  if (input.creditLimit !== null && (!Number.isFinite(input.creditLimit) || input.creditLimit < 0)) {
    return { ok: false, error: "Credit limit must be a non-negative amount." };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  try {
    const { data, error } = await supabase
      .from("customers")
      .insert({
        org_id: orgId,
        name: input.name,
        phone: input.phone || null,
        alternate_phone: input.alternatePhone || null,
        landline: input.landline || null,
        email: input.email || null,
        contact_type: input.contactType,
        contact_id: input.contactId || null,
        credit_limit: input.creditLimit,
        created_by: user.id,
      })
      .select("id, name, email, phone")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Failed to add customer.");

    revalidatePath("/sales/new");
    return { ok: true, customer: { id: data.id, name: data.name, email: data.email, phone: data.phone } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

// ---------------------------------------------------------------------------
// Fetch line items for invoice display
// ---------------------------------------------------------------------------
export interface SaleInvoiceLine {
  productId:   string;
  productName: string;
  sku:         string;
  imageUrl: string | null;
  quantity:    number;
  unitPrice:   number;
  discount:    number;
  tax:         number;
  lineTotal:   number;
}

export async function getSaleInvoiceItems(saleId: string): Promise<SaleInvoiceLine[]> {
  const supabase = await createClient();
  const { data: items } = await supabase
    .from("sale_items")
    .select("id, product_id, quantity, unit_price, discount_percent, tax_percent, line_total, product:products(name, sku, image_urls)")
    .eq("sale_id", saleId);

  if (!items || items.length === 0) return [];

  return items.map((item) => {
    const gross = Number(item.quantity) * Number(item.unit_price);
    const discountAmount = gross * (Number(item.discount_percent) / 100);
    return {
      productId:   item.product_id,
      productName: (item.product as { name: string; sku: string; image_urls: string[] } | null)?.name ?? "Unknown product",
      sku:         (item.product as { name: string; sku: string; image_urls: string[] } | null)?.sku ?? "",
      imageUrl:    (item.product as { name: string; sku: string; image_urls: string[] } | null)?.image_urls?.[0] ?? null,
      quantity:    item.quantity,
      unitPrice:   item.unit_price,
      discount:    item.discount_percent,
      tax:         item.tax_percent,
      // Keep the item row pre-tax; tax is shown separately in the totals box.
      lineTotal:   Math.max(0, gross - discountAmount),
    };
  });
}
