"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import type { CustomerOrderStatus } from "@/types/database";

export interface SimpleResult {
  ok: boolean;
  error?: string;
}

export async function setOrderStatus(orderId: string, status: CustomerOrderStatus): Promise<SimpleResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("customer_orders").update({ status }).eq("id", orderId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

export interface UpdateOrderItemInput {
  itemId: string;
  quantity: number;
  unitPrice: number;
}

export async function updateOrderItem(orderId: string, input: UpdateOrderItemInput): Promise<SimpleResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("customer_order_items")
    .update({ quantity: input.quantity, unit_price: input.unitPrice, line_total: input.quantity * input.unitPrice })
    .eq("id", input.itemId);
  if (error) return { ok: false, error: error.message };

  // Recompute the order's subtotal/total from its (now-edited) items.
  const { data: items } = await supabase.from("customer_order_items").select("line_total").eq("order_id", orderId);
  const subtotal = (items ?? []).reduce((sum, i) => sum + i.line_total, 0);
  const { data: order } = await supabase.from("customer_orders").select("delivery_fee").eq("id", orderId).single();
  const total = subtotal + (order?.delivery_fee ?? 0);

  await supabase.from("customer_orders").update({ subtotal, total }).eq("id", orderId);

  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

export async function removeOrderItem(orderId: string, itemId: string): Promise<SimpleResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("customer_order_items").delete().eq("id", itemId);
  if (error) return { ok: false, error: error.message };

  const { data: items } = await supabase.from("customer_order_items").select("line_total").eq("order_id", orderId);
  const subtotal = (items ?? []).reduce((sum, i) => sum + i.line_total, 0);
  const { data: order } = await supabase.from("customer_orders").select("delivery_fee").eq("id", orderId).single();
  const total = subtotal + (order?.delivery_fee ?? 0);
  await supabase.from("customer_orders").update({ subtotal, total }).eq("id", orderId);

  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

export interface StockCheckResult {
  ok: boolean;
  allInStock: boolean;
  shortages: { productName: string; requested: number; available: number }[];
}

export async function checkOrderStock(orderId: string): Promise<StockCheckResult> {
  const supabase = await createClient();
  const { data: items } = await supabase
    .from("customer_order_items")
    .select("product_id, product_name, quantity")
    .eq("order_id", orderId);

  if (!items || items.length === 0) return { ok: true, allInStock: true, shortages: [] };

  const { data: products } = await supabase.from("products").select("id, stock_quantity").in("id", items.map((i) => i.product_id));
  const stockById = new Map((products ?? []).map((p) => [p.id, p.stock_quantity]));

  const shortages = items
    .filter((i) => (stockById.get(i.product_id) ?? 0) < i.quantity)
    .map((i) => ({ productName: i.product_name, requested: i.quantity, available: stockById.get(i.product_id) ?? 0 }));

  await supabase.from("customer_orders").update({ stock_checked: true }).eq("id", orderId);
  revalidatePath(`/orders/${orderId}`);

  return { ok: true, allInStock: shortages.length === 0, shortages };
}

export async function setAdminNotes(orderId: string, notes: string): Promise<SimpleResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("customer_orders").update({ admin_notes: notes }).eq("id", orderId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

export interface ApproveOrderInput {
  orderId: string;
  locationId: string;
}

export interface ApproveOrderResult extends SimpleResult {
  saleId?: string;
}

export async function approveAndProcessOrder({ orderId, locationId }: ApproveOrderInput): Promise<ApproveOrderResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "No active organization." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: order, error: orderError } = await supabase
    .from("customer_orders")
    .select("*")
    .eq("id", orderId)
    .single();
  if (orderError || !order) return { ok: false, error: "Order not found." };
  if (order.status === "completed") return { ok: false, error: "This order has already been processed." };

  const { data: items, error: itemsError } = await supabase
    .from("customer_order_items")
    .select("product_id, product_name, quantity, unit_price, line_total")
    .eq("order_id", orderId);
  if (itemsError || !items || items.length === 0) return { ok: false, error: "This order has no items." };

  // Re-verify stock right before committing — the review screen's check
  // could be stale by the time someone clicks Approve.
  const { data: products } = await supabase.from("products").select("id, stock_quantity").in("id", items.map((i) => i.product_id));
  const stockById = new Map((products ?? []).map((p) => [p.id, p.stock_quantity]));
  for (const item of items) {
    const available = stockById.get(item.product_id) ?? 0;
    if (item.quantity > available) {
      return { ok: false, error: `Only ${available} unit(s) of "${item.product_name}" in stock — adjust the order before approving.` };
    }
  }

  const { data: sale, error: saleError } = await supabase
    .from("sales")
    .insert({
      org_id: context.orgId,
      customer_name: order.guest_name,
      customer_id: order.customer_id,
      location_id: locationId,
      reference: `Customer order ${order.order_number}`,
      subtotal: order.subtotal,
      discount_amount: 0,
      tax_amount: 0,
      shipping_amount: order.delivery_fee,
      total: order.total,
      payment_method: order.payment_method,
      amount_paid: 0, // approval ≠ payment collected — COD/other methods settle at delivery
      sold_by: user.id,
      status: "completed",
    })
    .select("id")
    .single();
  if (saleError || !sale) return { ok: false, error: saleError?.message ?? "Couldn't create the sale." };

  const { error: saleItemsError } = await supabase.from("sale_items").insert(
    items.map((i) => ({
      sale_id: sale.id,
      product_id: i.product_id,
      org_id: context.orgId,
      quantity: i.quantity,
      unit_price: i.unit_price,
      discount_percent: 0,
      tax_percent: 0,
      line_total: i.line_total,
    }))
  );
  if (saleItemsError) {
    await supabase.from("sales").delete().eq("id", sale.id);
    return { ok: false, error: saleItemsError.message };
  }

  for (const item of items) {
    const { error: rpcError } = await supabase.rpc("adjust_product_stock_at_location", {
      p_product_id: item.product_id,
      p_location_id: locationId,
      p_org_id: context.orgId,
      p_delta: -item.quantity,
    });
    if (rpcError) {
      return { ok: false, error: `Sale created, but stock update failed: ${rpcError.message}. Adjust inventory manually.`, saleId: sale.id };
    }
  }

  const { error: updateError } = await supabase
    .from("customer_orders")
    .update({ status: "completed", approved_by: user.id, approved_at: new Date().toISOString(), linked_sale_id: sale.id, location_id: locationId })
    .eq("id", orderId);
  if (updateError) return { ok: false, error: updateError.message, saleId: sale.id };

  await supabase.from("audit_logs").insert({
    org_id: context.orgId,
    actor_id: user.id,
    action: "customer_order.approved",
    entity_type: "customer_orders",
    entity_id: orderId,
    metadata: { order_number: order.order_number, sale_id: sale.id },
  });

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/sales");
  revalidatePath("/inventory");
  return { ok: true, saleId: sale.id };
}

export async function declineOrder(orderId: string, reason?: string): Promise<SimpleResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "No active organization." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { error } = await supabase
    .from("customer_orders")
    .update({ status: "cancelled", admin_notes: reason ?? null })
    .eq("id", orderId);
  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_logs").insert({
    org_id: context.orgId,
    actor_id: user.id,
    action: "customer_order.declined",
    entity_type: "customer_orders",
    entity_id: orderId,
    metadata: { reason },
  });

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}