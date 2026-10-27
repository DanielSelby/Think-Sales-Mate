import "server-only";

import { deliverMessage, type ProviderResult } from "@/lib/communication/providers";
import { getRestaurantOnlineBaseUrl, getRestaurantOrderTrackingUrl } from "@/lib/restaurant/online-ordering";

export type RestaurantEmailStatus =
  | "received"
  | "confirmed"
  | "preparing"
  | "ready"
  | "served"
  | "completed"
  | "cancelled";

const statusMessages: Record<RestaurantEmailStatus, { subject: string; message: string }> = {
  received: {
    subject: "Order received",
    message: "We have received your order and the restaurant will begin preparing it shortly.",
  },
  confirmed: {
    subject: "Order confirmed",
    message: "The restaurant has confirmed your order.",
  },
  preparing: {
    subject: "Your order is being prepared",
    message: "The restaurant has started preparing your order.",
  },
  ready: {
    subject: "Your order is ready",
    message: "Your order is ready for pickup or delivery.",
  },
  served: {
    subject: "Your order has been served",
    message: "Your order has been served. Thank you for dining with us.",
  },
  completed: {
    subject: "Your order is complete",
    message: "Your order is complete. Thank you for ordering with us.",
  },
  cancelled: {
    subject: "Your order was cancelled",
    message: "Your order has been cancelled. Please contact the restaurant if you need assistance.",
  },
};

export async function sendRestaurantOrderEmail(input: {
  email: string;
  orderNumber: number;
  branchName: string;
  status: RestaurantEmailStatus;
  trackingToken?: string | null;
}): Promise<ProviderResult> {
  const status = statusMessages[input.status];
  const trackingUrl = input.trackingToken
    ? getRestaurantOrderTrackingUrl(input.trackingToken)
    : null;
  const result = await deliverMessage({
    channel: "Email",
    recipient: input.email,
    subject: `${status.subject} #${input.orderNumber}`,
    content: `${status.message}\n\n${input.branchName}\nOrder #${input.orderNumber}${trackingUrl ? `\nTrack your order: ${trackingUrl}` : ""}`,
  });
  if (!result.sent) {
    console.error(`[restaurant-order-email] Could not send ${input.status} email for order #${input.orderNumber} via ${result.provider}: ${result.reason ?? "unknown provider error"}`);
  }
  return result;
}

export type RestaurantReservationEmailStatus = "confirmed" | "cancelled" | "seated" | "completed" | "no_show";

const reservationStatusMessages: Record<RestaurantReservationEmailStatus, { subject: string; message: string }> = {
  confirmed: {
    subject: "Reservation confirmed",
    message: "Your table reservation is confirmed.",
  },
  cancelled: {
    subject: "Reservation cancelled",
    message: "Your table reservation has been cancelled.",
  },
  seated: {
    subject: "You are seated",
    message: "The restaurant has marked your party as seated.",
  },
  completed: {
    subject: "Thank you for visiting",
    message: "Your reservation visit is complete. Thank you for dining with us.",
  },
  no_show: {
    subject: "Reservation update",
    message: "The restaurant marked this reservation as a no-show. Contact the restaurant if you think this is an error.",
  },
};

export async function sendRestaurantReservationEmail(input: {
  email: string;
  guestName: string;
  partySize: number;
  startsAt: string;
  branchName: string;
  confirmationToken?: string | null;
  status: RestaurantReservationEmailStatus;
}): Promise<ProviderResult> {
  const status = reservationStatusMessages[input.status];
  const baseUrl = getRestaurantOnlineBaseUrl();
  const confirmationUrl = baseUrl && input.confirmationToken
    ? new URL(`/restaurant-reservation/confirmation/${encodeURIComponent(input.confirmationToken)}`, baseUrl).toString()
    : null;
  const result = await deliverMessage({
    channel: "Email",
    recipient: input.email,
    subject: status.subject,
    content: `Hi ${input.guestName},\n\n${status.message}\n\n${input.branchName}\nParty size: ${input.partySize}\nReservation time: ${new Date(input.startsAt).toLocaleString()}${confirmationUrl ? `\nManage reservation: ${confirmationUrl}` : ""}`,
  });
  if (!result.sent) {
    console.error(`[restaurant-reservation-email] Could not send ${input.status} email via ${result.provider}: ${result.reason ?? "unknown provider error"}`);
  }
  return result;
}
