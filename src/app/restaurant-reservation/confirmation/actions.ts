"use server";

import { sendRestaurantReservationEmail } from "@/lib/restaurant/order-emails";
import { createAdminClient } from "@/lib/supabase/admin";

export async function cancelOnlineRestaurantReservation(token: string) {
  if (typeof token !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
    throw new Error("The reservation link is invalid.");
  }

  const admin = createAdminClient();
  const { data: reservation, error: loadError } = await admin.from("restaurant_reservations")
    .select("org_id, location_id, guest_name, guest_phone, customer_email, party_size, starts_at, customer_confirmation_token, status")
    .eq("customer_confirmation_token", token)
    .eq("reservation_source", "online")
    .maybeSingle();
  if (loadError) throw new Error(`Could not load reservation: ${loadError.message}`);
  if (!reservation) throw new Error("Reservation not found.");
  if (reservation.status === "cancelled") return { cancelled: true, emailNotification: null };

  const { data: cancelled, error } = await admin.rpc("cancel_restaurant_online_reservation", {
    p_token: token,
  });
  if (error) throw new Error(`Could not cancel reservation: ${error.message}`);
  if (!cancelled) throw new Error("This reservation can no longer be cancelled online. Please contact the restaurant.");
  let emailNotification: { sent: boolean; reason?: string } | null = null;
  if (reservation.customer_email) {
    const [{ data: settings, error: settingsError }, { data: location, error: locationError }] = await Promise.all([
      admin.from("restaurant_online_settings").select("send_order_emails")
        .eq("org_id", reservation.org_id).eq("location_id", reservation.location_id).maybeSingle(),
      admin.from("business_locations").select("name")
        .eq("org_id", reservation.org_id).eq("id", reservation.location_id).maybeSingle(),
    ]);
    if (settingsError || locationError) {
      console.error("[restaurant-reservation-email] Could not load cancellation email settings:", settingsError?.message ?? locationError?.message);
      emailNotification = { sent: false, reason: "Could not load email settings." };
    } else if (settings?.send_order_emails !== false && location) {
      const emailResult = await sendRestaurantReservationEmail({
        email: reservation.customer_email,
        guestName: reservation.guest_name,
        partySize: reservation.party_size,
        startsAt: reservation.starts_at,
        branchName: location.name,
        confirmationToken: reservation.customer_confirmation_token,
        status: "cancelled",
      });
      emailNotification = { sent: emailResult.sent, reason: emailResult.reason };
    }
  }
  return { cancelled: true, emailNotification };
}
