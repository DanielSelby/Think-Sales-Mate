"use server";

import { headers } from "next/headers";
import { getRegistrationIpHash } from "@/lib/organizations/registration-rate-limit";
import { getEnabledOrganizationModules } from "@/lib/supabase/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";

type OnlineReservationInput = {
  guestName: string;
  guestPhone: string;
  partySize: number;
  startsAt: string;
  notes: string;
  companyWebsite?: string;
};

function getClientIp(requestHeaders: Headers) {
  const realIp = requestHeaders.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 128);
  const forwardedIp = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwardedIp) return forwardedIp.slice(0, 128);
  return "unknown";
}

export async function submitRestaurantOnlineReservation(
  orgSlug: string,
  branchSlug: string,
  input: OnlineReservationInput,
) {
  if (typeof orgSlug !== "string" || typeof branchSlug !== "string"
    || orgSlug.length > 120 || branchSlug.length > 120
    || !input || typeof input !== "object"
    || typeof input.guestName !== "string" || typeof input.guestPhone !== "string"
    || typeof input.startsAt !== "string" || typeof input.notes !== "string"
    || (input.companyWebsite !== undefined && typeof input.companyWebsite !== "string")) {
    throw new Error("The reservation request is invalid.");
  }
  if (input.companyWebsite?.trim()) throw new Error("Unable to submit this reservation.");

  const guestName = input.guestName.trim();
  const guestPhone = input.guestPhone.trim();
  const notes = input.notes.trim();
  if (!guestName || guestName.length > 120 || guestPhone.length < 7 || guestPhone.length > 40
    || notes.length > 500) {
    throw new Error("Enter a valid name, phone number, and reservation note.");
  }
  if (!Number.isInteger(input.partySize) || input.partySize < 1 || input.partySize > 20) {
    throw new Error("Party size must be between 1 and 20.");
  }
  const startsAt = new Date(input.startsAt);
  const now = Date.now();
  if (!Number.isFinite(startsAt.getTime()) || startsAt.getTime() < now + 30 * 60_000
    || startsAt.getTime() > now + 60 * 24 * 60 * 60_000) {
    throw new Error("Choose a reservation time at least 30 minutes from now and within the next 60 days.");
  }

  const admin = createAdminClient();
  const { data: organization, error: organizationError } = await admin.from("organizations")
    .select("id").eq("slug", orgSlug).maybeSingle();
  if (organizationError) throw new Error(`Could not load restaurant: ${organizationError.message}`);
  if (!organization || !(await getEnabledOrganizationModules(organization.id)).includes("Restaurant")) {
    throw new Error("This restaurant reservation page is unavailable.");
  }
  const { data: location, error: locationError } = await admin.from("business_locations")
    .select("id").eq("org_id", organization.id).eq("customer_portal_slug", branchSlug)
    .eq("is_active", true).maybeSingle();
  if (locationError) throw new Error(`Could not load restaurant branch: ${locationError.message}`);
  if (!location) throw new Error("This restaurant branch is unavailable.");

  const requestHeaders = await headers();
  const ipHash = getRegistrationIpHash(getClientIp(requestHeaders));
  const { data: withinLimit, error: limitError } = await admin.rpc("consume_restaurant_online_order_rate_limit", {
    p_location_id: location.id,
    p_ip_hash: ipHash,
  });
  if (limitError) throw new Error(`Could not verify reservation request limit: ${limitError.message}`);
  if (!withinLimit) throw new Error("Too many reservation attempts. Please wait before trying again.");

  const { data: reservation, error: reservationError } = await admin.rpc("create_restaurant_online_reservation", {
    p_org_id: organization.id,
    p_branch_slug: branchSlug,
    p_guest_name: guestName,
    p_guest_phone: guestPhone,
    p_party_size: input.partySize,
    p_starts_at: startsAt.toISOString(),
    p_notes: notes || "",
  });
  if (reservationError) throw new Error(`Could not create reservation: ${reservationError.message}`);
  const result = reservation?.[0];
  if (!result) throw new Error("Reservation creation returned no confirmation.");
  return { confirmationToken: result.confirmation_token, startsAt: result.starts_at };
}
