import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import ReservationConfirmationView from "@/components/restaurant/reservation-confirmation-view";

export const dynamic = "force-dynamic";

export default async function OnlineReservationConfirmationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) notFound();

  const { data: confirmations, error } = await createAdminClient()
    .rpc("get_restaurant_online_reservation_confirmation", { p_token: token });
  if (error) throw new Error(`Could not load reservation confirmation: ${error.message}`);
  const confirmation = confirmations?.[0];
  if (!confirmation) notFound();

  return <ReservationConfirmationView
    token={token}
    guestName={confirmation.guest_name}
    partySize={confirmation.party_size}
    startsAt={confirmation.starts_at}
    status={confirmation.status}
    branchName={confirmation.branch_name}
  />;
}
