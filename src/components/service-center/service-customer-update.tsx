"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordServiceCustomerUpdate, sendServiceCustomerUpdate } from "@/app/(dashboard)/service-center/actions";
import type { ServiceJobStatus } from "@/types/database";

const CONTACT_METHODS = [
  { value: "sms", label: "SMS" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
] as const;

const STATUS_UPDATES: Partial<Record<ServiceJobStatus, string>> = {
  received: "We have received your equipment and recorded the repair request.",
  inspection: "Our team is inspecting your equipment.",
  awaiting_quotation: "We are preparing an estimate for your repair.",
  awaiting_customer_approval: "Your repair estimate is ready for your review.",
  approved: "Your estimate has been approved and the repair is ready to proceed.",
  rejected: "The proposed repair was declined. Please contact our team if you would like to discuss next steps.",
  in_progress: "Work on your repair is in progress.",
  awaiting_parts: "Your repair is waiting for parts. We will share another update when work can continue.",
  quality_check: "The repair work is complete and your equipment is undergoing a final quality check.",
  ready_for_collection: "Your equipment is ready for collection. Please contact our team to arrange pickup.",
  awaiting_payment: "Your repair invoice is ready. Please contact our team about the outstanding balance before collection.",
  completed: "Your repair invoice has been paid. Your equipment is awaiting collection.",
  closed: "Your equipment has been handed over.",
  cancelled: "Your repair job has been cancelled. Please contact our team if you need more information.",
};

export function ServiceCustomerUpdate({
  jobId,
  jobNumber,
  customerName,
  status,
}: {
  jobId: string;
  jobNumber: string;
  customerName: string;
  status: ServiceJobStatus;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [method, setMethod] = useState<(typeof CONTACT_METHODS)[number]["value"]>("whatsapp");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function openComposer() {
    setMessage(
      `Hello ${customerName}, update on repair job ${jobNumber}: ${STATUS_UPDATES[status] ?? `the current status is ${status.replaceAll("_", " ")}.`} If you have questions, please contact our service team.`
    );
    setError(null);
    setNotice(null);
    setIsOpen(true);
  }

  function copyMessage() {
    void navigator.clipboard.writeText(message).then(
      () => setNotice("Message copied. Send it using your normal communication app, then log it here."),
      () => setError("Could not copy automatically. Select and copy the message, then send it using your normal communication app.")
    );
  }

  function logSentMessage(formData: FormData) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await recordServiceCustomerUpdate(formData);
      if (!result.ok) {
        setError(result.error ?? "Could not log the customer update.");
        return;
      }
      setNotice("Customer update logged.");
      setIsOpen(false);
      router.refresh();
    });
  }

  function sendNow() {
    if (!formRef.current || !message.trim()) return;
    const formData = new FormData(formRef.current);
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await sendServiceCustomerUpdate(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(`Message sent to ${result.recipient} via ${result.provider}.`);
      setIsOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="mt-3 print:hidden">
      {!isOpen ? (
        <button
          type="button"
          onClick={openComposer}
          className="rounded border border-ledger-300 px-2 py-1 text-xs font-medium text-ledger-700 hover:bg-ledger-50 dark:border-ledger-600 dark:text-ledger-200 dark:hover:bg-ink-800"
        >
          Prepare customer update
        </button>
      ) : (
        <form ref={formRef} action={logSentMessage} className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/60 p-3 dark:border-sky-900 dark:bg-sky-950/20">
          <input type="hidden" name="contactJobId" value={jobId} />
          <input type="hidden" name="contactDirection" value="outgoing" />
          <input type="hidden" name="contactOutcome" value="completed" />
          <p className="text-xs font-semibold text-sky-900 dark:text-sky-200">Prepare customer update</p>
          <p className="text-xs text-ledger-500 dark:text-ledger-400">Send immediately through your configured provider (provider charges may apply), or copy and log a message you send yourself.</p>
          <label className="block text-xs text-ledger-600 dark:text-ledger-300">
            Channel
            <select
              name="contactMethod"
              value={method}
              onChange={(event) => {
                const selectedMethod = CONTACT_METHODS.find((option) => option.value === event.target.value);
                if (selectedMethod) setMethod(selectedMethod.value);
              }}
              disabled={isPending}
              className="mt-1 block w-full rounded border border-ledger-300 bg-white px-2 py-1.5 dark:border-ledger-600 dark:bg-ink-800"
            >
              {CONTACT_METHODS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="block text-xs text-ledger-600 dark:text-ledger-300">
            Message
            <textarea
              name="contactDetails"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              required
              maxLength={1800}
              rows={5}
              disabled={isPending}
              className="mt-1 block w-full rounded border border-ledger-300 bg-white px-2 py-1.5 dark:border-ledger-600 dark:bg-ink-800"
            />
          </label>
          <button
            type="button"
            onClick={copyMessage}
            disabled={isPending || !message}
            className="rounded border border-ledger-300 px-2 py-1.5 text-xs font-medium text-ledger-700 hover:bg-white disabled:opacity-50 dark:border-ledger-600 dark:text-ledger-200 dark:hover:bg-ink-800"
          >
            Copy message
          </button>
          <label className="flex items-start gap-2 text-xs text-ledger-600 dark:text-ledger-300">
            <input type="checkbox" name="customerUpdateSent" value="yes" required disabled={isPending} className="mt-0.5" />
            I sent this message myself using the selected channel.
          </label>
          {error && <p role="alert" className="text-xs text-alert">{error}</p>}
          {notice && <p role="status" className="text-xs text-signal">{notice}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={sendNow} disabled={isPending || !message.trim()} className="rounded bg-sky-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-800 disabled:opacity-50">
              {isPending ? "Sending..." : `Send ${method === "whatsapp" ? "WhatsApp" : method.toUpperCase()} now`}
            </button>
            <button type="submit" disabled={isPending || !message.trim()} className="rounded border border-sky-700 px-3 py-1.5 text-xs font-medium text-sky-800 hover:bg-white disabled:opacity-50 dark:text-sky-200 dark:hover:bg-ink-800">
              {isPending ? "Logging..." : "I sent it myself — log"}
            </button>
            <button type="button" onClick={() => setIsOpen(false)} disabled={isPending} className="rounded px-3 py-1.5 text-xs text-ledger-600 hover:bg-white dark:text-ledger-300 dark:hover:bg-ink-800">
              Cancel
            </button>
          </div>
        </form>
      )}
      {!isOpen && notice && <p role="status" className="mt-1 text-xs text-signal">{notice}</p>}
      {!isOpen && error && <p role="alert" className="mt-1 text-xs text-alert">{error}</p>}
    </div>
  );
}
