"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, BookOpen, Clock3, Mail, MessageCircle, Phone, Plus, Send, ShieldCheck, X } from "lucide-react";
import { submitSupportComplaint } from "./actions";
import { SUPPORT_CATEGORIES, type SupportPriority } from "@/lib/support/constants";
import type { PlatformDatabase } from "@/types/platform-database";

export type SupportTicket = Pick<
  PlatformDatabase["public"]["Tables"]["platform_complaints"]["Row"],
  "id" | "ticket_number" | "category" | "subject" | "description" | "priority" | "status" | "created_at" | "updated_at"
>;

export type Contact = {
  id: string;
  contact_type: string;
  name: string;
  position: string | null;
  department: string | null;
  specialty: string | null;
  role: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  availability_status: string;
  assigned_region: string | null;
};

export default function SupportPageClient({
  contacts,
  tickets,
  contactDirectoryError,
  ticketHistoryError,
}: {
  contacts: Contact[];
  tickets: SupportTicket[];
  contactDirectoryError: string | null;
  ticketHistoryError: string | null;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ category: "Technical Support", subject: "", description: "", priority: "medium" as SupportPriority });
  const support = contacts.filter((contact) => contact.contact_type === "support_team");
  const emergency = contacts.filter((contact) => contact.contact_type === "emergency");
  const technical = contacts.filter((contact) => contact.contact_type === "technical");
  const sales = contacts.filter((contact) => contact.contact_type === "sales_subscription");
  const primary = support[0] ?? technical[0] ?? sales[0];

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const result = await submitSupportComplaint(form);
      setNotice(`Complaint ${result.ticket_number} was submitted successfully.`);
      setShowForm(false);
      setForm({ category: "Technical Support", subject: "", description: "", priority: "medium" });
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not submit your complaint.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="workspace-hub-support support-page mx-auto max-w-6xl space-y-6">
      <section className="workspace-hub-support-hero relative min-h-[270px] overflow-hidden rounded-3xl border border-emerald-100 bg-[#eaf7ee] shadow-xl">
        <img src="/support-center-artwork.jpeg" alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover object-right" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#effaf2]/95 via-[#effaf2]/75 to-transparent" />
        <div className="relative max-w-2xl px-6 py-10 sm:px-10">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-emerald-800"><ShieldCheck className="h-3.5 w-3.5" /> Official support center</div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">We are here to keep your business moving.</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-700">Contact the support team for product guidance, technical support, account questions, and implementation help.</p>
          <button type="button" onClick={() => setShowForm(true)} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-800"><Plus className="h-4 w-4" /> Submit Complaint</button>
        </div>
      </section>

      {notice && <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">{notice}</div>}
      {contactDirectoryError && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{contactDirectoryError}</p>}

      <section className="grid gap-4 md:grid-cols-3">
        {primary && <ContactCard contact={primary} icon={Clock3} label="Primary support" />}
        {technical[0] && <ContactCard contact={technical[0]} icon={MessageCircle} label="Technical support" />}
        {sales[0] && <ContactCard contact={sales[0]} icon={Mail} label="Sales & subscriptions" />}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-1 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Support history</p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">Your support tickets</h2>
          </div>
          <p className="text-xs text-slate-500">Latest 10 requests for this organization</p>
        </div>
        {ticketHistoryError ? (
          <p role="alert" className="px-5 py-6 text-sm text-rose-700">{ticketHistoryError}</p>
        ) : tickets.length ? (
          <div className="divide-y divide-slate-100">
            {tickets.map((ticket) => (
              <details key={ticket.id} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-blue-700">{ticket.ticket_number} · {ticket.category}</span>
                    <span className="mt-1 block truncate text-sm font-semibold text-slate-900">{ticket.subject}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${ticket.priority === "critical" || ticket.priority === "high" ? "bg-rose-50 text-rose-700" : ticket.priority === "medium" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                      {ticket.priority}
                    </span>
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">
                      {ticket.status.replaceAll("_", " ")}
                    </span>
                    <span className="hidden text-xs text-slate-500 sm:inline">{new Date(ticket.created_at).toLocaleDateString()}</span>
                  </span>
                </summary>
                <p className="mt-3 whitespace-pre-wrap border-l-2 border-blue-100 pl-3 text-sm leading-6 text-slate-600">{ticket.description}</p>
              </details>
            ))}
          </div>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-slate-500">No support tickets have been submitted for this organization yet.</p>
        )}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <ContactGroup title="Support Team Contacts" contacts={support} />
        <ContactGroup title="Technical Support Contacts" contacts={technical} />
        <ContactGroup title="Emergency Contacts" contacts={emergency} />
        <ContactGroup title="Sales & Subscription Contacts" contacts={sales} />
      </section>

      <section className="rounded-2xl border border-blue-100 bg-blue-50/70 p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Self-service</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <a href={`tel:${primary?.phone ?? ""}`} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-800"><Phone className="h-4 w-4 text-blue-600" /> Call Support</a>
          <a href={`https://wa.me/${(primary?.whatsapp ?? "").replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-800"><MessageCircle className="h-4 w-4 text-emerald-600" /> WhatsApp Support</a>
          <a href={`mailto:${primary?.email ?? ""}`} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-800"><Mail className="h-4 w-4 text-blue-600" /> Email Support</a>
          <a href="/support/knowledge-base" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-800"><BookOpen className="h-4 w-4 text-violet-600" /> Knowledge Base <ArrowUpRight className="h-3.5 w-3.5" /></a>
        </div>
      </section>

      {showForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
        <form onSubmit={submit} className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
          <div className="flex items-center justify-between"><h2 className="text-lg font-bold text-slate-950">Submit Complaint</h2><button type="button" onClick={() => setShowForm(false)} aria-label="Close"><X className="h-5 w-5 text-slate-400" /></button></div>
          <div className="mt-5 space-y-3">
            <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="h-11 w-full rounded-lg border px-3 text-sm">{SUPPORT_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select>
            <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as SupportPriority })} className="h-11 w-full rounded-lg border px-3 text-sm"><option value="low">Low priority</option><option value="medium">Medium priority</option><option value="high">High priority</option><option value="critical">Critical priority</option></select>
            <input required value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder="Subject" className="h-11 w-full rounded-lg border px-3 text-sm" />
            <textarea required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Describe the issue and where it happened..." rows={5} className="w-full rounded-lg border px-3 py-2 text-sm" />
            <button disabled={busy} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Submitting..." : "Submit Complaint"} {!busy && <Send className="h-4 w-4" />}</button>
          </div>
        </form>
      </div>}
    </div>
  );
}

function ContactCard({ contact, icon: Icon, label }: { contact: Contact; icon: typeof MessageCircle; label: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Icon className="h-5 w-5" /></div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-sm font-bold text-slate-800">{contact.name}</p><p className="text-xs text-slate-500">{contact.position ?? contact.specialty ?? contact.role ?? contact.department ?? "Support contact"}</p><ContactLinks contact={contact} /></div>;
}

function ContactGroup({ title, contacts }: { title: string; contacts: Contact[] }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-bold text-slate-900">{title}</h2>{contacts.length ? <div className="mt-4 divide-y">{contacts.map((contact) => <div key={contact.id} className="py-3 first:pt-0 last:pb-0"><div className="flex items-center justify-between"><p className="text-sm font-semibold text-slate-800">{contact.name}</p><span className="text-[10px] font-semibold uppercase text-emerald-600">{contact.availability_status}</span></div><p className="text-xs text-slate-500">{contact.position ?? contact.specialty ?? contact.role ?? contact.department ?? "Support contact"}{contact.assigned_region ? ` · ${contact.assigned_region}` : ""}</p><ContactLinks contact={contact} /></div>)}</div> : <p className="mt-4 text-sm text-slate-400">No active contacts have been configured yet.</p>}</section>;
}

function ContactLinks({ contact }: { contact: Contact }) {
  return <div className="mt-3 flex flex-wrap gap-3 text-xs">{contact.phone && <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1 text-slate-600 hover:text-blue-700"><Phone className="h-3.5 w-3.5" />{contact.phone}</a>}{contact.whatsapp && <a href={`https://wa.me/${contact.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-slate-600 hover:text-emerald-700"><MessageCircle className="h-3.5 w-3.5" />WhatsApp</a>}{contact.email && <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1 text-slate-600 hover:text-blue-700"><Mail className="h-3.5 w-3.5" />{contact.email}</a>}</div>;
}
