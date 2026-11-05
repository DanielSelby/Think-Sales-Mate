"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendServiceAppointmentReminder } from "@/app/(dashboard)/service-center/actions";

const CHANNELS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "sms", label: "SMS" },
  { value: "email", label: "Email" },
] as const;

export function ServiceAppointmentReminder({
  appointmentId,
  title,
  customerName,
  startsAt,
}: {
  appointmentId: string;
  title: string;
  customerName: string;
  startsAt: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]["value"]>("whatsapp");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openComposer() {
    const appointmentTime = new Date(startsAt).toLocaleString();
    setMessage(`Hello ${customerName}, this is a reminder of your service appointment "${title}" on ${appointmentTime}. Please contact our service team if you need to make changes.`);
    setError(null);
    setNotice(null);
    setOpen(true);
  }

  function sendReminder(formData: FormData) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await sendServiceAppointmentReminder(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(`Reminder sent to ${result.recipient} via ${result.provider}.`);
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div className="mt-2">
        <button type="button" onClick={openComposer} className="rounded border border-sky-300 px-2 py-1 text-xs font-medium text-sky-800 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-200 dark:hover:bg-sky-950/30">
          Prepare reminder
        </button>
        {notice && <p role="status" className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">{notice}</p>}
      </div>
    );
  }

  return (
    <form action={sendReminder} className="mt-2 min-w-64 space-y-2 rounded-lg border border-sky-200 bg-sky-50/60 p-3 dark:border-sky-900 dark:bg-sky-950/20">
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <p className="text-xs text-ledger-500 dark:text-ledger-400">This sends only when you confirm. Provider charges may apply.</p>
      <label className="block text-xs text-ledger-600 dark:text-ledger-300">
        Channel
        <select
          name="reminderChannel"
          value={channel}
          onChange={(event) => {
            const selected = CHANNELS.find((item) => item.value === event.target.value);
            if (selected) setChannel(selected.value);
          }}
          disabled={isPending}
          className="mt-1 block w-full rounded border border-ledger-300 bg-white px-2 py-1.5 dark:border-ledger-600 dark:bg-ink-800"
        >
          {CHANNELS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <label className="block text-xs text-ledger-600 dark:text-ledger-300">
        Message
        <textarea
          name="reminderMessage"
          required
          maxLength={1800}
          rows={4}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          disabled={isPending}
          className="mt-1 block w-full rounded border border-ledger-300 bg-white px-2 py-1.5 dark:border-ledger-600 dark:bg-ink-800"
        />
      </label>
      {error && <p role="alert" className="text-xs text-alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={isPending || !message.trim()} className="rounded bg-sky-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-800 disabled:opacity-50">
          {isPending ? "Sending..." : "Send reminder"}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={isPending} className="rounded px-3 py-1.5 text-xs text-ledger-600 hover:bg-white dark:text-ledger-300 dark:hover:bg-ink-800">
          Cancel
        </button>
      </div>
    </form>
  );
}
