"use client";

import { useMemo, useState } from "react";
import { Eye, Plus, RefreshCw, Search, ShieldAlert } from "lucide-react";
import { addSupportContact, deleteSupportContact, setSupportContactActive, updateComplaintPriority, updateComplaintStatus, updateSupportContact } from "./actions";
import { getSlaStatus, type SupportPriority } from "@/lib/support/constants";

type Complaint = {
  id: string;
  ticket_number: string;
  organization_id: string;
  organization_name: string;
  submitted_by: string;
  category: string;
  subject: string;
  description: string;
  priority: SupportPriority;
  status: "new" | "open" | "assigned" | "in_progress" | "awaiting_customer" | "resolved" | "closed";
  assigned_to: string | null;
  first_response_due: string;
  resolution_due: string;
  resolved_at: string | null;
  escalation_level: number;
  created_at: string;
  updated_at: string;
};

type Contact = {
  id: string;
  contact_type: "support_team" | "emergency" | "technical" | "sales_subscription";
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
  is_active: boolean;
};

export default function SupportCenter({ complaints, contacts }: { complaints: Complaint[]; contacts: Contact[] }) {
  const [tab, setTab] = useState<"complaints" | "contacts">("complaints");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Complaint | null>(null);
  const [contactModal, setContactModal] = useState<Contact | null | false>(false);
  const [busy, setBusy] = useState(false);
  const filtered = useMemo(() => complaints.filter((item) => `${item.ticket_number} ${item.organization_name} ${item.subject} ${item.category}`.toLowerCase().includes(search.toLowerCase())), [complaints, search]);
  const counts = { total: complaints.length, open: complaints.filter((item) => ["new", "open", "assigned"].includes(item.status)).length, progress: complaints.filter((item) => item.status === "in_progress").length, resolved: complaints.filter((item) => ["resolved", "closed"].includes(item.status)).length, breached: complaints.filter((item) => getSlaStatus(item) === "sla_breached").length };
  const run = async (task: () => Promise<unknown>) => { setBusy(true); try { await task(); window.location.reload(); } finally { setBusy(false); } };

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-blue-600">Complaints &amp; Support</p><h2 className="mt-1 text-2xl font-bold text-slate-950">{tab === "complaints" ? "Complaints" : "Contact Directory"}</h2><p className="mt-1 text-sm text-slate-500">Support requests submitted by organizations are collected and managed here.</p></div>
      <div className="flex gap-2">{tab === "contacts" && <button type="button" onClick={() => setContactModal(null)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white"><Plus className="h-3.5 w-3.5" /> Add Contact</button>}<button type="button" onClick={() => window.location.reload()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button></div>
    </div>
    <div className="flex gap-2 border-b border-slate-200"><button type="button" onClick={() => setTab("complaints")} className={`border-b-2 px-3 py-2 text-xs font-semibold ${tab === "complaints" ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500"}`}>Complaints</button><button type="button" onClick={() => setTab("contacts")} className={`border-b-2 px-3 py-2 text-xs font-semibold ${tab === "contacts" ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500"}`}>Contact Directory</button></div>
    {tab === "complaints" ? <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[["Total Complaints", counts.total], ["Open", counts.open], ["In Progress", counts.progress], ["Resolved", counts.resolved], ["SLA Breached", counts.breached]].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{value}</p></div>)}</div><div className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center gap-3 border-b border-slate-100 p-4"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ticket, organization, subject..." className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-blue-400" /></div></div><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr>{["Ticket", "Organization", "Category", "Subject", "Priority", "Status", "SLA Status", "Due", "Actions"].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((item) => <tr key={item.id} className="hover:bg-slate-50"><td className="px-4 py-3 font-semibold text-blue-700">{item.ticket_number}</td><td className="px-4 py-3 font-semibold text-slate-800">{item.organization_name}</td><td className="px-4 py-3">{item.category}</td><td className="max-w-[220px] truncate px-4 py-3">{item.subject}</td><td className="px-4 py-3"><select value={item.priority} disabled={busy} onChange={(event) => void run(() => updateComplaintPriority(item.id, event.target.value as SupportPriority))} className="rounded-full border-0 bg-amber-50 px-2 py-1 text-[10px] font-semibold"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></td><td className="px-4 py-3"><select value={item.status} disabled={busy} onChange={(event) => void run(() => updateComplaintStatus(item.id, event.target.value as Complaint["status"]))} className="rounded-full border-0 bg-blue-50 px-2 py-1 text-[10px] font-semibold"><option value="new">New</option><option value="open">Open</option><option value="assigned">Assigned</option><option value="in_progress">In Progress</option><option value="awaiting_customer">Awaiting Customer</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></td><td className={`px-4 py-3 font-semibold ${getSlaStatus(item) === "sla_breached" ? "text-rose-600" : getSlaStatus(item) === "approaching_sla" ? "text-amber-600" : "text-emerald-600"}`}>{getSlaStatus(item).replaceAll("_", " ")}</td><td className="px-4 py-3">{new Date(item.resolution_due).toLocaleString()}</td><td className="px-4 py-3"><button type="button" onClick={() => setSelected(item)} className="inline-flex items-center gap-1 text-blue-700"><Eye className="h-3.5 w-3.5" /> View</button></td></tr>)}</tbody></table>{!filtered.length && <p className="p-10 text-center text-sm text-slate-500">No complaints match the current search.</p>}</div></div></> : <div className="grid gap-4 md:grid-cols-2">{contacts.map((contact) => <div key={contact.id} className={`rounded-xl border bg-white p-5 shadow-sm ${contact.is_active ? "border-slate-200" : "border-dashed border-slate-300 opacity-60"}`}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold text-slate-900">{contact.name}</p><p className="text-xs text-slate-500">{contact.position ?? contact.specialty ?? contact.role ?? contact.department ?? contact.contact_type}</p></div><div className="flex items-center gap-3"><button type="button" disabled={busy} onClick={() => setContactModal(contact)} className="text-xs font-semibold text-blue-700">Edit</button><button type="button" disabled={busy} onClick={() => void run(() => setSupportContactActive(contact.id, !contact.is_active))} className="text-xs font-semibold text-blue-700">{contact.is_active ? "Suspend" : "Enable"}</button><button type="button" disabled={busy} onClick={() => window.confirm(`Delete ${contact.name}?`) && void run(() => deleteSupportContact(contact.id))} className="text-xs font-semibold text-rose-600">Delete</button></div></div><p className="mt-3 text-xs text-slate-600">{contact.email ?? "No email"} · {contact.phone ?? "No phone"}</p><p className="mt-1 text-[11px] text-slate-400">{contact.contact_type.replaceAll("_", " ")}</p></div>)}{!contacts.length && <p className="rounded-xl border border-dashed p-10 text-center text-sm text-slate-500">No contacts configured.</p>}</div>}
    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold text-blue-600">{selected.ticket_number}</p><h3 className="mt-1 text-xl font-bold text-slate-950">{selected.subject}</h3><p className="mt-1 text-xs text-slate-500">{selected.organization_name} · submitted by {selected.submitted_by}</p></div><button type="button" onClick={() => setSelected(null)} className="text-sm text-slate-400">Close</button></div><div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] uppercase text-slate-400">Priority</p><p className="mt-1 text-sm font-semibold">{selected.priority}</p></div><div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] uppercase text-slate-400">SLA</p><p className="mt-1 text-sm font-semibold">{getSlaStatus(selected).replaceAll("_", " ")}</p></div><div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] uppercase text-slate-400">Escalation</p><p className="mt-1 text-sm font-semibold">{selected.escalation_level}</p></div></div><div className="mt-5 rounded-xl border border-slate-200 p-4 text-sm leading-6 text-slate-700">{selected.description}</div></div></div>}
    {contactModal !== false && <ContactForm contact={contactModal} close={() => setContactModal(false)} />}
  </div>;
}

function ContactForm({ contact, close }: { contact: Contact | null; close: () => void }) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    contactType: contact?.contact_type ?? "support_team" as Contact["contact_type"],
    name: contact?.name ?? "",
    position: contact?.position ?? "",
    email: contact?.email ?? "",
    phone: contact?.phone ?? "",
    whatsapp: contact?.whatsapp ?? "",
    department: contact?.department ?? "",
    specialty: contact?.specialty ?? "",
    role: contact?.role ?? "",
    assignedRegion: contact?.assigned_region ?? "",
    availabilityStatus: contact?.availability_status ?? "available",
  });
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (contact) await updateSupportContact(contact.id, form);
      else await addSupportContact(form);
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><form onSubmit={save} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><h3 className="text-lg font-bold">{contact ? "Edit Contact" : "Add Contact"}</h3><button type="button" onClick={close}>Close</button></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{(["name", "position", "department", "specialty", "role", "email", "phone", "whatsapp", "assignedRegion"] as const).map((field) => <input key={field} required={field === "name"} placeholder={field.replace(/([A-Z])/g, " $1")} value={form[field]} onChange={(event) => setForm({ ...form, [field]: event.target.value })} className="h-10 rounded-lg border px-3 text-sm" />)}<select value={form.contactType} onChange={(event) => setForm({ ...form, contactType: event.target.value as Contact["contact_type"] })} className="h-10 rounded-lg border px-3 text-sm"><option value="support_team">Support Team</option><option value="emergency">Emergency</option><option value="technical">Technical</option><option value="sales_subscription">Sales &amp; Subscription</option></select><select value={form.availabilityStatus} onChange={(event) => setForm({ ...form, availabilityStatus: event.target.value })} className="h-10 rounded-lg border px-3 text-sm"><option value="available">Available</option><option value="away">Away</option><option value="offline">Offline</option></select></div><button disabled={busy} className="mt-4 h-10 w-full rounded-lg bg-blue-600 text-sm font-semibold text-white">{busy ? "Saving..." : contact ? "Save Changes" : "Save Contact"}</button></form></div>;
}
