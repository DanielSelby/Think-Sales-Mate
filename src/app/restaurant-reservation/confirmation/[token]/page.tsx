import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const statusHeading = confirmation.status === "cancelled" ? "Reservation cancelled"
    : confirmation.status === "seated" ? "Guest seated"
      : confirmation.status === "completed" ? "Visit completed"
        : confirmation.status === "no_show" ? "Reservation marked no-show"
          : "Reservation confirmed";

  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
    <section className="w-full max-w-lg rounded-2xl border bg-white p-8 text-center shadow-sm">
      <p className={`text-sm font-bold uppercase tracking-wide ${confirmation.status === "cancelled" || confirmation.status === "no_show" ? "text-red-700" : "text-emerald-700"}`}>
        {statusHeading}
      </p>
      <h1 className="mt-2 text-2xl font-bold text-slate-950">{confirmation.branch_name}</h1>
      <p className="mt-4 text-slate-700">Reservation for {confirmation.guest_name} · Party of {confirmation.party_size}</p>
      <p className="mt-2 text-sm text-slate-600">{new Date(confirmation.starts_at).toLocaleString()}</p>
      <p className="mt-2 text-xs text-slate-500">Please contact the restaurant if you need to change or cancel this reservation.</p>
    </section>
  </main>;
}
