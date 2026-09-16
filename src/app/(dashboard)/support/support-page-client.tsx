"use client";

import { useState, type FormEvent } from "react";
import { ArrowUpRight, BookOpen, Clock3, Mail, MessageCircle, Phone, Plus, Send, ShieldCheck, X } from "lucide-react";
import { submitSupportComplaint } from "./actions";
import { SUPPORT_CATEGORIES, type SupportPriority } from "@/lib/support/constants";

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

export default function SupportPageClient({ contacts }: { contacts: Contact[] }) {
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
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not submit your complaint.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-slate-950 px-6 py-10 text-white shadow-xl sm:px-10">
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="relative max-w-2xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-blue-100"><ShieldCheck className="h-3.5 w-3.5" /> Official support center</div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">We are here to keep your business moving.</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">Contact the support team for product guidance, technical support, account questions, and implementation help.</p>
          <button type="button" onClick={() => setShowForm(true)} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-900 hover:bg-blue-50"><Plus className="h-4 w-4" /> Submit Complaint</button>
        </div>
      </section>

      {notice && <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">{notice}</div>}

      <section className="grid gap-4 md:grid-cols-3">
        {primary && <ContactCard contact={primary} icon={Clock3} label="Primary support" />}
        {technical[0] && <ContactCard contact={technical[0]} icon={MessageCircle} label="Technical support" />}
        {sales[0] && <ContactCard contact={sales[0]} icon={Mail} label="Sales & subscriptions" />}
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
        <form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
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
