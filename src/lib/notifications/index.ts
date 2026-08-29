import { createClient } from "@/lib/supabase/server";

export interface CreateNotificationParams {
  orgId: string;
  userId?: string | null;
  locationId?: string | null;
  title: string;
  message: string;
  type: "order_received" | "order_assigned" | "order_approved" | "order_rejected" | "out_for_delivery" | "delivered" | "general";
  channel?: "in_app" | "email" | "whatsapp";
  entityType?: string;
  entityId?: string | null;
  recipientContact?: string | null;
}

export async function createNotification(params: CreateNotificationParams) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("notifications").insert({
      org_id: params.orgId,
      user_id: params.userId ?? null,
      location_id: params.locationId ?? null,
      title: params.title,
      message: params.message,
      type: params.type,
      channel: params.channel ?? "in_app",
      entity_type: params.entityType ?? "customer_orders",
      entity_id: params.entityId ?? null,
      recipient_contact: params.recipientContact ?? null,
      is_read: false,
      status: "delivered",
    }).select("id").single();

    if (error) {
      console.error("[notifications] Failed to insert notification:", error);
    }
    return data;
  } catch (err) {
    console.error("[notifications] Error creating notification:", err);
    return null;
  }
}

export async function notifyNewCustomerOrder(params: {
  orgId: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  total: number;
  currency: string;
  locationId?: string | null;
  branchName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  sendEmail?: boolean;
  sendWhatsApp?: boolean;
}) {
  // 1. In-App Notification to Admins
  await createNotification({
    orgId: params.orgId,
    title: "New Customer Order",
    message: `Order ${params.orderNumber} received from ${params.customerName} (${params.currency} ${params.total.toFixed(2)})${params.branchName ? ` for ${params.branchName}` : " (Unassigned)"}`,
    type: "order_received",
    channel: "in_app",
    entityId: params.orderId,
    locationId: params.locationId ?? null,
  });

  // 2. In-App Notification to Branch (if location assigned)
  if (params.locationId) {
    await createNotification({
      orgId: params.orgId,
      title: "New Branch Order",
      message: `Order ${params.orderNumber} placed for ${params.branchName ?? "your branch"} by ${params.customerName}.`,
      type: "order_assigned",
      channel: "in_app",
      locationId: params.locationId,
      entityId: params.orderId,
    });
  }

  // 3. Customer notification: Order Received
  if (params.customerEmail && params.sendEmail !== false) {
    await createNotification({
      orgId: params.orgId,
      title: `Order Received - ${params.orderNumber}`,
      message: `Hi ${params.customerName}, we received your order ${params.orderNumber}. Our team is reviewing it.`,
      type: "order_received",
      channel: "email",
      entityId: params.orderId,
      recipientContact: params.customerEmail,
    });
  }

  if (params.customerPhone && params.sendWhatsApp) {
    await createNotification({
      orgId: params.orgId,
      title: `Order Received - ${params.orderNumber}`,
      message: `Hi ${params.customerName}, thanks for your order ${params.orderNumber} with ThinkSales Pro. Status: Pending Review.`,
      type: "order_received",
      channel: "whatsapp",
      entityId: params.orderId,
      recipientContact: params.customerPhone,
    });
  }
}

export async function notifyOrderAssignedToBranch(params: {
  orgId: string;
  orderId: string;
  orderNumber: string;
  locationId: string;
  branchName: string;
  assignedBy: string;
}) {
  await createNotification({
    orgId: params.orgId,
    title: "Order Assigned to Branch",
    message: `Order ${params.orderNumber} has been assigned to ${params.branchName} by ${params.assignedBy}.`,
    type: "order_assigned",
    channel: "in_app",
    locationId: params.locationId,
    entityId: params.orderId,
  });
}

export async function notifyCustomerOrderStatus(params: {
  orgId: string;
  orderId: string;
  orderNumber: string;
  status: "approved" | "rejected" | "picking" | "packing" | "delivery" | "completed";
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  notes?: string | null;
  sendEmail?: boolean;
  sendWhatsApp?: boolean;
}) {
  const statusTitles: Record<string, string> = {
    approved: "Order Approved",
    rejected: "Order Update: Not Accepted",
    picking: "Order Picking Started",
    packing: "Order Packing Completed",
    delivery: "Order Out for Delivery",
    completed: "Order Delivered",
  };

  const statusMessages: Record<string, string> = {
    approved: `Hi ${params.customerName}, your order ${params.orderNumber} has been approved and stock is reserved!`,
    rejected: `Hi ${params.customerName}, your order ${params.orderNumber} could not be processed.${params.notes ? ` Reason: ${params.notes}` : ""}`,
    picking: `Hi ${params.customerName}, we have started picking items for your order ${params.orderNumber}.`,
    packing: `Hi ${params.customerName}, your order ${params.orderNumber} is packed and ready for dispatch.`,
    delivery: `Hi ${params.customerName}, your order ${params.orderNumber} is on the way!`,
    completed: `Hi ${params.customerName}, your order ${params.orderNumber} has been delivered. Thank you!`,
  };

  const title = statusTitles[params.status] ?? `Order Status: ${params.status}`;
  const message = statusMessages[params.status] ?? `Status for order ${params.orderNumber} updated to ${params.status}.`;
  const typeKey = params.status === "delivery" ? "out_for_delivery" : params.status === "completed" ? "delivered" : (`order_${params.status}` as any);

  // In-app log
  await createNotification({
    orgId: params.orgId,
    title,
    message,
    type: typeKey,
    channel: "in_app",
    entityId: params.orderId,
  });

  // Email
  if (params.customerEmail && params.sendEmail !== false) {
    await createNotification({
      orgId: params.orgId,
      title: `${title} - ${params.orderNumber}`,
      message,
      type: typeKey,
      channel: "email",
      entityId: params.orderId,
      recipientContact: params.customerEmail,
    });
  }

  // WhatsApp
  if (params.customerPhone && params.sendWhatsApp) {
    await createNotification({
      orgId: params.orgId,
      title: `${title} - ${params.orderNumber}`,
      message,
      type: typeKey,
      channel: "whatsapp",
      entityId: params.orderId,
      recipientContact: params.customerPhone,
    });
  }
}
