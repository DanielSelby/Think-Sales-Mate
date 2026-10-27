"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  getRestaurantOnlineReservationSlots,
  submitRestaurantOnlineReservation,
} from "@/app/restaurant-reservation/[orgSlug]/branch/[branchSlug]/actions";

function dateInTimezone(timestamp: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addCalendarDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatSlot(value: string, timezone: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

export default function OnlineReservationView({
  orgSlug,
  branchSlug,
  organizationName,
  branchName,
  maximumPartySize,
  bookingNow,
  reservationTimezone,
  reservationDurationMinutes,
  reservationSlotIntervalMinutes,
}: {
  orgSlug: string;
  branchSlug: string;
  organizationName: string;
  branchName: string;
  maximumPartySize: number;
  bookingNow: number;
  reservationTimezone: string;
  reservationDurationMinutes: number;
  reservationSlotIntervalMinutes: number;
}) {
  const router = useRouter();
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [partySize, setPartySize] = useState(String(Math.min(2, maximumPartySize)));
  const [reservationDate, setReservationDate] = useState(() => dateInTimezone(bookingNow, reservationTimezone));
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [startsAt, setStartsAt] = useState("");
  const [notes, setNotes] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [error, setError] = useState("");
  const [confirmationToken, setConfirmationToken] = useState("");
  const [emailNotification, setEmailNotification] = useState<boolean | null>(null);
  const minimumDate = dateInTimezone(bookingNow, reservationTimezone);
  const maximumDate = addCalendarDays(minimumDate, 60);

  async function findSlots() {
    setError("");
    setStartsAt("");
    setAvailableSlots([]);
    setIsLoadingSlots(true);
    try {
      const slots = await getRestaurantOnlineReservationSlots(
        orgSlug,
        branchSlug,
        reservationDate,
        Number(partySize),
      );
      setAvailableSlots(slots);
      if (slots.length === 0) setError("No suitable tables are available on that date. Choose another date or party size.");
    } catch (availabilityError) {
      setError(availabilityError instanceof Error ? availabilityError.message : "Could not check availability.");
    } finally {
      setIsLoadingSlots(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const result = await submitRestaurantOnlineReservation(orgSlug, branchSlug, {
        guestName,
        guestPhone,
        guestEmail,
        partySize: Number(partySize),
        startsAt: new Date(startsAt).toISOString(),
        notes,
        companyWebsite,
      });
      setConfirmationToken(result.confirmationToken);
      setEmailNotification(result.emailNotification?.sent ?? null);
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
        <p className="mt-2 text-sm text-slate-600">{formatSlot(startsAt, reservationTimezone)} · Party of {partySize}</p>
        {emailNotification === true && <p className="mt-3 text-sm text-emerald-700">A confirmation email with your reservation link has been sent.</p>}
        {emailNotification === false && <p className="mt-3 text-sm text-amber-700">Your reservation is confirmed, but we could not send the confirmation email. Keep this page link to manage your booking.</p>}
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
      <p className="mt-2 text-sm text-slate-300">Book a restaurant table · {reservationDurationMinutes}-minute reservation</p>
    </header>
    <form onSubmit={submit} className="space-y-4 rounded-2xl border bg-white p-6 shadow-sm">
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <label className="block text-xs font-semibold text-slate-600">Name
        <input required maxLength={120} value={guestName} onChange={(event) => setGuestName(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" />
      </label>
      <label className="block text-xs font-semibold text-slate-600">Phone number
        <input required type="tel" minLength={7} maxLength={40} value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" />
      </label>
      <label className="block text-xs font-semibold text-slate-600">Email
        <input required type="email" maxLength={254} value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-slate-600">Party size
          <input required type="number" min={1} max={maximumPartySize} step={1} value={partySize} disabled={isLoadingSlots} onChange={(event) => {
            setPartySize(event.target.value);
            setAvailableSlots([]);
            setStartsAt("");
          }} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" />
        </label>
        <label className="block text-xs font-semibold text-slate-600">Date
          <input required type="date" min={minimumDate} max={maximumDate} value={reservationDate} disabled={isLoadingSlots} onChange={(event) => {
            setReservationDate(event.target.value);
            setAvailableSlots([]);
            setStartsAt("");
          }} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" />
        </label>
      </div>
      <button type="button" disabled={isLoadingSlots || !reservationDate || Number(partySize) < 1 || Number(partySize) > maximumPartySize} onClick={findSlots} className="h-10 rounded-lg border px-4 text-sm font-semibold text-slate-700 disabled:opacity-50">
        {isLoadingSlots ? "Checking tables..." : "Show available times"}
      </button>
      {availableSlots.length > 0 && <fieldset className="space-y-2 rounded-lg border p-3">
        <legend className="px-1 text-xs font-semibold text-slate-700">Available times ({reservationSlotIntervalMinutes}-minute intervals · {reservationTimezone})</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {availableSlots.map((slot) => <label key={slot} className={`cursor-pointer rounded-lg border px-3 py-2 text-center text-sm ${startsAt === slot ? "border-orange-500 bg-orange-50 font-semibold text-orange-800" : "text-slate-700"}`}>
            <input className="sr-only" type="radio" name="reservation-slot" value={slot} checked={startsAt === slot} onChange={() => setStartsAt(slot)} />
            {formatSlot(slot, reservationTimezone)}
          </label>)}
        </div>
      </fieldset>}
      <label className="block text-xs font-semibold text-slate-600">Notes (optional)
        <textarea maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
      </label>
      <label className="sr-only" aria-hidden="true">Website
        <input tabIndex={-1} autoComplete="off" value={companyWebsite} onChange={(event) => setCompanyWebsite(event.target.value)} />
      </label>
      <p className="text-xs text-slate-500">Availability is rechecked when you book. A table is assigned after your reservation is confirmed.</p>
      <button type="submit" disabled={isSubmitting || !startsAt} className="h-11 w-full rounded-lg bg-orange-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
        {isSubmitting ? "Checking availability..." : "Reserve table"}
      </button>
    </form>
  </main>;
}
