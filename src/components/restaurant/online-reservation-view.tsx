"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitRestaurantOnlineReservation } from "@/app/restaurant-reservation/[orgSlug]/branch/[branchSlug]/actions";

function localDateTimeValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function OnlineReservationView({
  orgSlug,
  branchSlug,
  organizationName,
  branchName,
  maximumPartySize,
  bookingNow,
}: {
  orgSlug: string;
  branchSlug: string;
  organizationName: string;
  branchName: string;
  maximumPartySize: number;
  bookingNow: number;
}) {
  const router = useRouter();
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [partySize, setPartySize] = useState(String(Math.min(2, maximumPartySize)));
  const [startsAt, setStartsAt] = useState("");
  const [notes, setNotes] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [confirmationToken, setConfirmationToken] = useState("");
  const minimumDateTime = localDateTimeValue(new Date(bookingNow + 30 * 60_000));
  const maximumDateTime = localDateTimeValue(new Date(bookingNow + 60 * 24 * 60 * 60_000));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const result = await submitRestaurantOnlineReservation(orgSlug, branchSlug, {
        guestName,
        guestPhone,
        partySize: Number(partySize),
        startsAt: new Date(startsAt).toISOString(),
        notes,
        companyWebsite,
      });
      setConfirmationToken(result.confirmationToken);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not create the reservation.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (confirmationToken) {
    return <main className="mx-auto max-w-xl px-4 py-16">
      <section className="rounded-2xl border bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-bold uppercase tracking-wide text-emerald-700">Reservation confirmed</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">{organizationName}</h1>
        <p className="mt-4 text-slate-700">Your table at {branchName} has been reserved.</p>
        <p className="mt-2 text-sm text-slate-600">{new Date(startsAt).toLocaleString()} · Party of {partySize}</p>
        <button type="button" onClick={() => router.push(`/restaurant-reservation/confirmation/${encodeURIComponent(confirmationToken)}`)} className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">View reservation details</button>
      </section>
    </main>;
  }

  if (maximumPartySize < 1) {
    return <main className="mx-auto max-w-xl px-4 py-16"><section className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-600">Reservations are temporarily unavailable at this branch. Please contact the restaurant.</section></main>;
  }

  return <main className="mx-auto max-w-xl space-y-6 px-4 py-8">
    <header className="rounded-2xl bg-slate-950 p-6 text-white">
      <p className="text-sm font-semibold text-orange-300">{branchName}</p>
      <h1 className="mt-1 text-3xl font-bold">{organizationName}</h1>
      <p className="mt-2 text-sm text-slate-300">Book a restaurant table · 90-minute reservation</p>
    </header>
    <form onSubmit={submit} className="space-y-4 rounded-2xl border bg-white p-6 shadow-sm">
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <label className="block text-xs font-semibold text-slate-600">Name
        <input required maxLength={120} value={guestName} onChange={(event) => setGuestName(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" />
      </label>
      <label className="block text-xs font-semibold text-slate-600">Phone number
        <input required type="tel" minLength={7} maxLength={40} value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-slate-600">Party size
          <input required type="number" min={1} max={maximumPartySize} step={1} value={partySize} onChange={(event) => setPartySize(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" />
        </label>
        <label className="block text-xs font-semibold text-slate-600">Date and time
          <input required type="datetime-local" min={minimumDateTime} max={maximumDateTime} value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" />
        </label>
      </div>
      <label className="block text-xs font-semibold text-slate-600">Notes (optional)
        <textarea maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
      </label>
      <label className="sr-only" aria-hidden="true">Website
        <input tabIndex={-1} autoComplete="off" value={companyWebsite} onChange={(event) => setCompanyWebsite(event.target.value)} />
      </label>
      <p className="text-xs text-slate-500">A table is assigned when you submit. If no suitable table is free for that time, choose another time.</p>
      <button type="submit" disabled={isSubmitting || !startsAt} className="h-11 w-full rounded-lg bg-orange-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
        {isSubmitting ? "Checking availability..." : "Reserve table"}
      </button>
    </form>
  </main>;
}
