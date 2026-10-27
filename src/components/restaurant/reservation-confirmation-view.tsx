"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelOnlineRestaurantReservation } from "@/app/restaurant-reservation/confirmation/actions";

export default function ReservationConfirmationView({
  token,
  guestName,
  partySize,
  startsAt,
  status,
  branchName,
}: {
  token: string;
  guestName: string;
  partySize: number;
  startsAt: string;
  status: string;
  branchName: string;
}) {
  const router = useRouter();
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canCancel = status === "confirmed";

  async function cancelReservation() {
    if (!window.confirm("Cancel this reservation? The table will become available to other guests.")) return;
    setError("");
    setNotice("");
    setIsCancelling(true);
    try {
      const result = await cancelOnlineRestaurantReservation(token);
      if (result.emailNotification?.sent === false) {
        setNotice("Reservation cancelled, but the restaurant could not send you an email update.");
      } else {
        setNotice("The reservation has been cancelled and its table released.");
      }
      router.refresh();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Could not cancel reservation.");
    } finally {
      setIsCancelling(false);
    }
  }

  const statusHeading = status === "cancelled" ? "Reservation cancelled"
    : status === "seated" ? "Guest seated"
      : status === "completed" ? "Visit completed"
        : status === "no_show" ? "Reservation marked no-show"
          : "Reservation confirmed";
  const isFailure = status === "cancelled" || status === "no_show";

  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
    <section className="w-full max-w-lg rounded-2xl border bg-white p-8 text-center shadow-sm">
      <p className={`text-sm font-bold uppercase tracking-wide ${isFailure ? "text-red-700" : "text-emerald-700"}`}>
        {statusHeading}
      </p>
      <h1 className="mt-2 text-2xl font-bold text-slate-950">{branchName}</h1>
      <p className="mt-4 text-slate-700">Reservation for {guestName} · Party of {partySize}</p>
      <p className="mt-2 text-sm text-slate-600">{new Date(startsAt).toLocaleString()}</p>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {canCancel && <button type="button" disabled={isCancelling} onClick={cancelReservation} className="mt-6 rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">
        {isCancelling ? "Cancelling..." : "Cancel reservation"}
      </button>}
      {!canCancel && status !== "cancelled" && <p className="mt-4 text-xs text-slate-500">This reservation can no longer be cancelled online. Please contact the restaurant if you need help.</p>}
      {status === "cancelled" && <p className="mt-4 text-xs text-slate-500">The table has been released. Contact the restaurant if you need assistance.</p>}
    </section>
  </main>;
}
