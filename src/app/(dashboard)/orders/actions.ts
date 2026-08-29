"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { notifyCustomerOrderStatus, notifyOrderAssignedToBranch } from "@/lib/notifications";
import type { CustomerOrderStatus, OrderPaymentStatus, OrderDeliveryStatus } from "@/types/database";

export interface SimpleResult {
  ok: boolean;
  error?: string;
}

export async function setOrderStatus(orderId: string, status: CustomerOrderStatus): Promise<SimpleResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "No active organization." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = user ? await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle() : { data: null };
  const actorName = profile?.full_name || user?.email || "Staff";

  const { error } = await supabase.from("customer_orders").update({ status }).eq("id", orderId);
  if (error) return { ok: false, error: error.message };

  await supabase.from("customer_order_timeline").insert({
    order_id: orderId,
    org_id: context.orgId,
    title: `Status changed to ${status}`,
    actor_name: actorName,
    actor_id: user?.id ?? null,
    status: "completed",
  });

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

export async function assignOrderBranch(orderId: string, locationId: string): Promise<SimpleResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "No active organization." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: loc }, { data: profile }, { data: order }] = await Promise.all([
    supabase.from("business_locations").select("name").eq("id", locationId).single(),
    user ? supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("customer_orders").select("order_number, guest_name, guest_phone, guest_email").eq("id", orderId).single(),
  ]);

  if (!loc) return { ok: false, error: "Location not found." };
  const actorName = profile?.full_name || user?.email || "Admin";

  const { error } = await supabase
    .from("customer_orders")
    .update({ location_id: locationId })
    .eq("id", orderId);
  if (error) return { ok: false, error: error.message };

  // Add timeline record
  await supabase.from("customer_order_timeline").insert({
    order_id: orderId,
    org_id: context.orgId,
    title: `Branch assigned to ${loc.name}`,
    actor_name: actorName,
    actor_id: user?.id ?? null,
    status: "completed",
    notes: `Assigned for fulfillment and stock reservation.`,
  });

  // Notify branch
  if (order) {
    await notifyOrderAssignedToBranch({
      orgId: context.orgId,
      orderId,
      orderNumber: order.order_number,
      locationId,
      branchName: loc.name,
      assignedBy: actorName,
    });
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

export interface ApproveOrderInput {
  orderId: string;
  locationId?: string;
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

  const [{ data: order, error: orderError }, { data: settings }] = await Promise.all([
    supabase.from("customer_orders").select("*").eq("id", orderId).single(),
    supabase.from("customer_portal_settings").select("*").eq("org_id", context.orgId).maybeSingle(),
  ]);

  if (orderError || !order) return { ok: false, error: "Order not found." };
  if (order.status === "completed") return { ok: false, error: "This order has already been completed." };

  const targetLocationId = locationId || order.location_id;
  if (!targetLocationId) {
    return { ok: false, error: "Please assign a branch before approving the order." };
  }

  const { data: items, error: itemsError } = await supabase
    .from("customer_order_items")
    .select("product_id, product_name, quantity, unit_price, line_total")
    .eq("order_id", orderId);
  if (itemsError || !items || items.length === 0) return { ok: false, error: "This order has no items." };

  // Check and optionally reserve stock
  const { data: products } = await supabase.from("products").select("id, stock_quantity").in("id", items.map((i) => i.product_id));
  const stockById = new Map((products ?? []).map((p) => [p.id, p.stock_quantity]));
  for (const item of items) {
    const available = stockById.get(item.product_id) ?? 0;
    if (item.quantity > available) {
      return { ok: false, error: `Only ${available} unit(s) of "${item.product_name}" in stock — adjust order before approving.` };
    }
  }

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  const actorName = profile?.full_name || user.email || "Staff";

  // Auto Reserve Stock if enabled
  const autoReserve = settings?.auto_reserve_stock_on_approval !== false;

  const { error: updateError } = await supabase
    .from("customer_orders")
    .update({
      status: "approved",
      location_id: targetLocationId,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      stock_reserved: autoReserve,
    })
    .eq("id", orderId);
  if (updateError) return { ok: false, error: updateError.message };

  // Timeline entries
  await supabase.from("customer_order_timeline").insert([
    {
      order_id: orderId,
      org_id: context.orgId,
      title: "Order Approved",
      actor_name: actorName,
      actor_id: user.id,
      status: "completed",
    },
    ...(autoReserve
      ? [
          {
            order_id: orderId,
            org_id: context.orgId,
            title: "Stock Reserved",
            actor_name: "System",
            actor_id: null,
            status: "completed",
            notes: "Inventory reserved at assigned branch to prevent overselling.",
          },
        ]
      : []),
  ]);

  // Customer notification
  await notifyCustomerOrderStatus({
    orgId: context.orgId,
    orderId,
    orderNumber: order.order_number,
    status: "approved",
    customerName: order.guest_name,
    customerPhone: order.guest_phone,
    customerEmail: order.guest_email,
    locationId: targetLocationId,
    sendEmail: settings?.send_email_notifications,
    sendWhatsApp: settings?.send_whatsapp_notifications,
  });

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

export async function updateOrderFulfillmentStatus(
  orderId: string,
  status: CustomerOrderStatus,
  deliveryStatus?: OrderDeliveryStatus
): Promise<SimpleResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "No active organization." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: order } = await supabase.from("customer_orders").select("*").eq("id", orderId).single();
  if (!order) return { ok: false, error: "Order not found." };

  const { data: profile } = user ? await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle() : { data: null };
  const actorName = profile?.full_name || user?.email || "Staff";

  const statusTitleMap: Record<string, string> = {
    picking: "Picking Started",
    packing: "Packing Completed",
    delivery: "Out for Delivery",
    completed: "Order Delivered",
  };

  const determinedDeliveryStatus: OrderDeliveryStatus =
    deliveryStatus ??
    (status === "picking"
      ? "picking"
      : status === "packing"
      ? "packing"
      : status === "delivery"
      ? "in_delivery"
      : status === "completed"
      ? "delivered"
      : "not_shipped");

  const { error } = await supabase
    .from("customer_orders")
    .update({
      status,
      delivery_status: determinedDeliveryStatus,
    })
    .eq("id", orderId);
  if (error) return { ok: false, error: error.message };

  await supabase.from("customer_order_timeline").insert({
    order_id: orderId,
    org_id: context.orgId,
    title: statusTitleMap[status] ?? `Status: ${status}`,
    actor_name: actorName,
    actor_id: user?.id ?? null,
    status: "completed",
  });

  const { data: settings } = await supabase.from("customer_portal_settings").select("*").eq("org_id", context.orgId).maybeSingle();
  if (["picking", "packing", "delivery", "completed"].includes(status)) {
    await notifyCustomerOrderStatus({
      orgId: context.orgId,
      orderId,
      orderNumber: order.order_number,
      status: status as any,
      customerName: order.guest_name,
      customerPhone: order.guest_phone,
      customerEmail: order.guest_email,
      locationId: order.location_id,
      sendEmail: settings?.send_email_notifications,
      sendWhatsApp: settings?.send_whatsapp_notifications,
    });
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

export async function convertOrderToSale(orderId: string): Promise<ApproveOrderResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "No active organization." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: order, error: orderError } = await supabase.from("customer_orders").select("*").eq("id", orderId).single();
  if (orderError || !order) return { ok: false, error: "Order not found." };
  if (order.linked_sale_id) return { ok: false, error: "This order has already been converted to a sale." };
  if (!order.location_id) return { ok: false, error: "Please assign a branch to the order before converting to sale." };

  const { data: items, error: itemsError } = await supabase
    .from("customer_order_items")
    .select("product_id, product_name, quantity, unit_price, line_total")
    .eq("order_id", orderId);
  if (itemsError || !items || items.length === 0) return { ok: false, error: "Order has no items." };

  const { data: sale, error: saleError } = await supabase
    .from("sales")
    .insert({
      org_id: context.orgId,
      customer_name: order.guest_name,
      customer_id: order.customer_id,
      location_id: order.location_id,
      reference: `Customer order ${order.order_number}`,
      subtotal: order.subtotal,
      discount_amount: 0,
      tax_amount: 0,
      shipping_amount: order.delivery_fee,
      total: order.total,
      payment_method: order.payment_method,
      amount_paid: order.payment_status === "paid" ? order.total : 0,
      sold_by: user.id,
      status: "completed",
    })
    .select("id")
    .single();
  if (saleError || !sale) return { ok: false, error: saleError?.message ?? "Failed to create sale." };

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

  // Deduct inventory at location
  for (const item of items) {
    await supabase.rpc("adjust_product_stock_at_location", {
      p_product_id: item.product_id,
      p_location_id: order.location_id,
      p_org_id: context.orgId,
      p_delta: -item.quantity,
    });
  }

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  const actorName = profile?.full_name || user.email || "Staff";

  await supabase
    .from("customer_orders")
    .update({
      status: "completed",
      delivery_status: "delivered",
      linked_sale_id: sale.id,
    })
    .eq("id", orderId);

  await supabase.from("customer_order_timeline").insert({
    order_id: orderId,
    org_id: context.orgId,
    title: "Converted to Sale",
    actor_name: actorName,
    actor_id: user.id,
    status: "completed",
    notes: `Sale record #${sale.id.slice(0, 8)} generated.`,
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

  const { data: order } = await supabase.from("customer_orders").select("*").eq("id", orderId).single();
  if (!order) return { ok: false, error: "Order not found." };

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  const actorName = profile?.full_name || user.email || "Staff";

  const { error } = await supabase
    .from("customer_orders")
    .update({
      status: "cancelled",
      rejection_reason: reason ?? null,
      admin_notes: reason ?? order.admin_notes,
    })
    .eq("id", orderId);
  if (error) return { ok: false, error: error.message };

  await supabase.from("customer_order_timeline").insert({
    order_id: orderId,
    org_id: context.orgId,
    title: "Order Cancelled / Rejected",
    actor_name: actorName,
    actor_id: user.id,
    status: "completed",
    notes: reason ? `Reason: ${reason}` : undefined,
  });

  const { data: settings } = await supabase.from("customer_portal_settings").select("*").eq("org_id", context.orgId).maybeSingle();
  await notifyCustomerOrderStatus({
    orgId: context.orgId,
    orderId,
    orderNumber: order.order_number,
    status: "rejected",
    customerName: order.guest_name,
    customerPhone: order.guest_phone,
    customerEmail: order.guest_email,
    locationId: order.location_id,
    notes: reason,
    sendEmail: settings?.send_email_notifications,
    sendWhatsApp: settings?.send_whatsapp_notifications,
  });

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

export async function setOrderSalesPerson(orderId: string, salesPersonId: string | null): Promise<SimpleResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("customer_orders").update({ sales_person_id: salesPersonId }).eq("id", orderId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

export async function setOrderPaymentStatus(orderId: string, paymentStatus: OrderPaymentStatus): Promise<SimpleResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("customer_orders").update({ payment_status: paymentStatus }).eq("id", orderId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

export async function setExpectedDeliveryDate(orderId: string, expectedDeliveryDate: string | null): Promise<SimpleResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("customer_orders").update({ expected_delivery_date: expectedDeliveryDate }).eq("id", orderId);
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