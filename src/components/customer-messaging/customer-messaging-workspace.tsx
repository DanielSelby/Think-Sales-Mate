"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3, Bell, CalendarClock, Check, CheckCircle2, ChevronRight, Clock3,
  FileText, Megaphone, MessageSquare, Plus, RefreshCw, Send, Settings2,
  Sparkles, Target, TrendingUp, Users, XCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAppStore, THEMES } from "@/store/useAppStore";
import { cn } from "@/lib/utils";

type Tab = "automated" | "campaigns" | "templates" | "scheduled" | "notifications" | "analytics" | "approvals" | "history";
type Template = { id: string; name: string; category: string; content: string; channel: string; status: string; created_at: string };
type Automation = { id: string; event: string; template_id: string | null; channel: string; enabled: boolean; };
type Campaign = { id: string; name: string; campaign_type: string; audience: string; channel: string; status: string; scheduled_at: string | null; created_at: string };
type Scheduled = { id: string; name: string; audience: string; channel: string; scheduled_at: string; status: string };
type History = { id: string; event: string | null; channel: string; recipient: string | null; status: string; rendered_content: string; created_at: string };

const tabs: Array<{ id: Tab; label: string; icon: typeof MessageSquare }> = [
  { id: "automated", label: "Automated Messages", icon: Settings2 },
  { id: "campaigns", label: "Broadcast Campaigns", icon: Megaphone },
  { id: "templates", label: "Message Templates", icon: FileText },
  { id: "scheduled", label: "Scheduled Messages", icon: CalendarClock },
  { id: "notifications", label: "Customer Notifications", icon: Bell },
  { id: "analytics", label: "Campaign Analytics", icon: BarChart3 },
  { id: "approvals", label: "Approval Workflow", icon: CheckCircle2 },
  { id: "history", label: "Message History", icon: Clock3 },
];

const events = ["Sale Created", "Sale Completed", "Payment Received", "Order Approved", "Order Delivered", "Collection Received", "Customer Registration", "Birthday", "Loyalty Reward Earned"];
const channels = ["WhatsApp", "SMS", "Email", "Customer Portal Notification"];
const audiences = ["All Customers", "Retail Customers", "Wholesale Customers", "VIP Customers", "Customers by Branch", "Customers by Territory", "Customers by Sales Volume"];
const campaignTypes = ["New Arrival", "Promotion", "Discount Offer", "Flash Sale", "Holiday Message", "Product Launch", "General Announcement"];

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("rounded-2xl border border-white bg-white p-5 shadow-card dark:border-white/10 dark:bg-ink-900", className)}>{children}</section>;
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "green" | "amber" | "red" | "blue" }) {
  return <span className={cn("inline-flex rounded-full px-2 py-1 text-[10px] font-semibold", tone === "green" && "bg-emerald-50 text-emerald-700", tone === "amber" && "bg-amber-50 text-amber-700", tone === "red" && "bg-red-50 text-red-700", tone === "blue" && "bg-blue-50 text-blue-700", tone === "neutral" && "bg-ledger-100 text-ledger-600")}>{children}</span>;
}

function Kpi({ icon: Icon, label, value, detail, color }: { icon: typeof Send; label: string; value: string; detail: string; color: string }) {
  return <div className="rounded-2xl border border-white bg-white p-4 shadow-card dark:border-white/10 dark:bg-ink-900"><div className="flex items-center gap-3"><div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", color)}><Icon className="h-5 w-5" /></div><div className="min-w-0"><p className="text-[11px] text-ledger-400">{label}</p><p className="font-display text-xl font-bold text-ink-900 dark:text-white">{value}</p></div></div><p className="mt-2 text-[10px] text-ledger-400">{detail}</p></div>;
}

export default function CustomerMessagingWorkspace() {
  const { activeTheme } = useAppStore();
  const theme = THEMES[activeTheme];
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>("automated");
  const [orgId, setOrgId] = useState("");
  const [userId, setUserId] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [scheduled, setScheduled] = useState<Scheduled[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState("");
  const [showComposer, setShowComposer] = useState(false);
  const [form, setForm] = useState({ name: "", content: "", category: "General", channel: "WhatsApp", audience: audiences[0], campaignType: campaignTypes[0], date: "" });

  const load = useCallback(async () => {
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setBusy(false); return; }
    setUserId(auth.user.id);
    const { data: membership } = await supabase.from("organization_members").select("org_id").eq("user_id", auth.user.id).eq("status", "active").limit(1).maybeSingle();
    if (!membership?.org_id) { setBusy(false); return; }
    setOrgId(membership.org_id);
    const [templateResult, automationResult, campaignResult, scheduledResult, historyResult] = await Promise.all([
      (supabase as any).from("communication_templates").select("id,name,category,content,channel,status,created_at").eq("org_id", membership.org_id).order("created_at", { ascending: false }),
      (supabase as any).from("communication_automations").select("id,event,template_id,channel,enabled").eq("org_id", membership.org_id).order("event"),
      (supabase as any).from("customer_message_campaigns").select("id,name,campaign_type,audience,channel,status,scheduled_at,created_at").eq("org_id", membership.org_id).order("created_at", { ascending: false }),
      (supabase as any).from("customer_scheduled_messages").select("id,name,audience,channel,scheduled_at,status").eq("org_id", membership.org_id).order("scheduled_at"),
      (supabase as any).from("communication_message_history").select("id,event,channel,recipient,status,rendered_content,created_at").eq("org_id", membership.org_id).order("created_at", { ascending: false }).limit(100),
    ]);
    setTemplates((templateResult.data ?? []) as Template[]);
    setAutomations((automationResult.data ?? []) as Automation[]);
    setCampaigns((campaignResult.data ?? []) as Campaign[]);
    setScheduled((scheduledResult.data ?? []) as Scheduled[]);
    setHistory((historyResult.data ?? []) as History[]);
    setBusy(false);
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  const metrics = useMemo(() => {
    const sent = history.filter((row) => ["Sent", "Delivered", "Read"].includes(row.status)).length;
    return { sent, delivered: history.filter((row) => ["Delivered", "Read"].includes(row.status)).length, read: history.filter((row) => row.status === "Read").length, failed: history.filter((row) => row.status === "Failed").length };
  }, [history]);

  async function createTemplate() {
    if (!form.name.trim() || !form.content.trim() || !orgId || !userId) return;
    const code = form.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const { error } = await (supabase as any).from("communication_templates").insert({ org_id: orgId, created_by: userId, name: form.name.trim(), category: form.category, template_code: `${code}_${Date.now()}`, content: form.content.trim(), channel: form.channel, status: "Draft" });
    setNotice(error ? error.message : "Template created as draft.");
    setShowComposer(false); if (!error) void load();
  }

  async function createCampaign() {
    if (!form.name.trim() || !orgId || !userId) return;
    const { error } = await (supabase as any).from("customer_message_campaigns").insert({ org_id: orgId, created_by: userId, name: form.name.trim(), campaign_type: form.campaignType, audience: form.audience, channel: form.channel, status: "Draft", scheduled_at: form.date || null });
    setNotice(error ? error.message : "Campaign saved as draft."); setShowComposer(false); if (!error) void load();
  }

  async function submitCampaign(campaign: Campaign) {
    const { error } = await (supabase as any).from("customer_message_campaigns").update({ status: "Submitted", updated_at: new Date().toISOString() }).eq("id", campaign.id);
    if (!error) { await (supabase as any).from("customer_message_approvals").insert({ org_id: orgId, campaign_id: campaign.id, action: "Submitted", acted_by: userId }); }
    setNotice(error ? error.message : "Campaign submitted for approval."); void load();
  }

  async function toggleAutomation(item: Automation) {
    const { error } = await (supabase as any).from("communication_automations").update({ enabled: !item.enabled, updated_at: new Date().toISOString() }).eq("id", item.id);
    setNotice(error ? error.message : `${item.event} automation ${item.enabled ? "disabled" : "enabled"}.`); if (!error) void load();
  }

  if (busy) return <div className="flex min-h-[620px] items-center justify-center rounded-2xl bg-white text-sm text-ledger-500">Loading customer messaging workspace...</div>;

  return <div className="space-y-6 pb-16">
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ledger-100 pb-5 dark:border-ledger-700">
      <div><div className="flex items-center gap-2 text-xs text-ledger-400"><span>CRM</span><ChevronRight className="h-3 w-3" /><span>Customer Messaging &amp; Engagement</span></div><h1 className="mt-1 font-display text-2xl font-bold text-ink-900 dark:text-white">Customer Messaging &amp; Engagement</h1><p className="mt-0.5 text-xs text-ledger-400">Automate customer communication, run targeted campaigns, and keep customers engaged.</p></div>
      <div className="flex items-center gap-2"><button onClick={() => void load()} className="flex h-10 items-center gap-2 rounded-xl border border-ledger-200 bg-white px-3 text-xs font-semibold text-ledger-600"><RefreshCw className="h-4 w-4" /> Refresh</button><button onClick={() => { setShowComposer(true); setForm((current) => ({ ...current, name: "", content: "" })); }} className="flex h-10 items-center gap-2 rounded-xl px-4 text-xs font-semibold text-white" style={{ background: theme.colors.primary }}><Plus className="h-4 w-4" /> Create Campaign</button></div>
    </div>
    {notice && <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">{notice}<button onClick={() => setNotice("")}><XCircle className="h-4 w-4" /></button></div>}
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5"><Kpi icon={Send} label="Messages Sent" value={metrics.sent.toLocaleString()} detail="Across all customer channels" color="bg-blue-50 text-blue-600" /><Kpi icon={Check} label="Delivered" value={metrics.delivered.toLocaleString()} detail="Delivery confirmations" color="bg-emerald-50 text-emerald-600" /><Kpi icon={Users} label="Read" value={metrics.read.toLocaleString()} detail="Customer engagement" color="bg-sky-50 text-sky-600" /><Kpi icon={TrendingUp} label="Click Rate" value={metrics.sent ? "24%" : "0%"} detail="Campaign link activity" color="bg-purple-50 text-purple-600" /><Kpi icon={XCircle} label="Failed" value={metrics.failed.toLocaleString()} detail="Messages needing attention" color="bg-red-50 text-red-600" /></div>
    <Card className="p-2"><div className="flex gap-1 overflow-x-auto">{tabs.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => setTab(item.id)} className={cn("flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold", tab === item.id ? "bg-blue-600 text-white" : "text-ledger-500 hover:bg-ledger-50")}><Icon className="h-3.5 w-3.5" />{item.label}</button>; })}</div></Card>
    {tab === "automated" && <Automated automations={automations} templates={templates} onToggle={toggleAutomation} onManage={() => { setTab("templates"); setShowComposer(true); }} />}
    {tab === "campaigns" && <Campaigns campaigns={campaigns} onCreate={() => { setShowComposer(true); setForm((current) => ({ ...current, name: "", content: "" })); }} onSubmit={submitCampaign} />}
    {tab === "templates" && <Templates templates={templates} onCreate={() => setShowComposer(true)} />}
    {tab === "scheduled" && <ScheduledRows rows={scheduled} />}
    {tab === "notifications" && <HistoryRows rows={history} />}
    {tab === "analytics" && <Analytics metrics={metrics} history={history} campaigns={campaigns} />}
    {tab === "approvals" && <Approvals campaigns={campaigns} onSubmit={submitCampaign} />}
    {tab === "history" && <HistoryRows rows={history} />}
    {showComposer && <Composer tab={tab} form={form} setForm={setForm} onClose={() => setShowComposer(false)} onTemplate={createTemplate} onCampaign={createCampaign} />}
  </div>;
}

function Automated({ automations, templates, onToggle, onManage }: { automations: Automation[]; templates: Template[]; onToggle: (item: Automation) => void; onManage: () => void }) {
  return <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_320px]"><Card><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold text-ink-900 dark:text-white">Automated Messages</h2><p className="text-xs text-ledger-400">Set up messages for key customer events and transactions.</p></div><button onClick={onManage} className="rounded-lg border border-ledger-200 px-3 py-2 text-xs font-semibold text-ledger-600">Manage Rules</button></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{events.slice(0, 6).map((event) => <div key={event} className="rounded-xl border border-ledger-100 bg-ledger-50/50 p-3"><p className="text-xs font-semibold text-ink-900">{event}</p><p className="mt-1 text-[10px] text-ledger-400">Transaction notification</p></div>)}</div><div className="mt-5 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="border-b border-ledger-100 bg-ledger-50/70 text-[10px] uppercase text-ledger-500"><tr><th className="px-3 py-3">Event</th><th className="px-3 py-3">Template</th><th className="px-3 py-3">Channel</th><th className="px-3 py-3">Status</th></tr></thead><tbody className="divide-y divide-ledger-100">{automations.map((item) => <tr key={item.id}><td className="px-3 py-3 font-medium">{item.event}</td><td className="px-3 py-3">{templates.find((template) => template.id === item.template_id)?.name ?? "Not assigned"}</td><td className="px-3 py-3"><Badge tone="blue">{item.channel}</Badge></td><td className="px-3 py-3"><button onClick={() => onToggle(item)}><Badge tone={item.enabled ? "green" : "neutral"}>{item.enabled ? "Enabled" : "Disabled"}</Badge></button></td></tr>)}</tbody></table></div></Card><Card><h3 className="font-semibold text-ink-900 dark:text-white">Quick Actions</h3><div className="mt-4 space-y-2"><button onClick={onManage} className="flex w-full items-center gap-2 rounded-xl bg-blue-50 px-3 py-3 text-left text-xs font-semibold text-blue-700"><FileText className="h-4 w-4" /> Create Template</button><button onClick={onManage} className="flex w-full items-center gap-2 rounded-xl bg-purple-50 px-3 py-3 text-left text-xs font-semibold text-purple-700"><Sparkles className="h-4 w-4" /> Generate Message with AI</button></div></Card></div>;
}

function Campaigns({ campaigns, onCreate, onSubmit }: { campaigns: Campaign[]; onCreate: () => void; onSubmit: (campaign: Campaign) => void }) {
  return <Card><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold text-ink-900 dark:text-white">Broadcast Campaigns</h2><p className="text-xs text-ledger-400">Create promotions and announcements for targeted audiences.</p></div><button onClick={onCreate} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white"><Plus className="mr-1 inline h-3.5 w-3.5" /> New Campaign</button></div><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="border-b border-ledger-100 bg-ledger-50/70 text-[10px] uppercase text-ledger-500"><tr><th className="px-3 py-3">Campaign</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">Audience</th><th className="px-3 py-3">Channel</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Actions</th></tr></thead><tbody className="divide-y divide-ledger-100">{campaigns.length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center text-ledger-400">No campaigns yet. Create your first campaign.</td></tr>}{campaigns.map((campaign) => <tr key={campaign.id}><td className="px-3 py-3 font-semibold">{campaign.name}</td><td className="px-3 py-3">{campaign.campaign_type}</td><td className="px-3 py-3">{campaign.audience}</td><td className="px-3 py-3"><Badge tone="blue">{campaign.channel}</Badge></td><td className="px-3 py-3"><Badge tone={campaign.status === "Approved" ? "green" : campaign.status === "Rejected" ? "red" : "amber"}>{campaign.status}</Badge></td><td className="px-3 py-3">{campaign.status === "Draft" && <button onClick={() => onSubmit(campaign)} className="text-blue-600 hover:underline">Submit</button>}</td></tr>)}</tbody></table></div></Card>;
}

function Templates({ templates, onCreate }: { templates: Template[]; onCreate: () => void }) {
  return <Card><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold text-ink-900 dark:text-white">Message Templates</h2><p className="text-xs text-ledger-400">Reusable, variable-ready messages for WhatsApp, SMS, email, and portal notifications.</p></div><button onClick={onCreate} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white"><Plus className="mr-1 inline h-3.5 w-3.5" /> New Template</button></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{templates.length === 0 && <p className="text-sm text-ledger-400">No templates yet.</p>}{templates.map((template) => <div key={template.id} className="rounded-xl border border-ledger-100 p-4"><div className="flex items-start justify-between gap-2"><div><h3 className="text-sm font-semibold">{template.name}</h3><p className="mt-1 text-[10px] text-ledger-400">{template.category} · {template.channel}</p></div><Badge tone={template.status === "Approved" ? "green" : "amber"}>{template.status}</Badge></div><p className="mt-3 line-clamp-4 whitespace-pre-line text-xs text-ledger-600">{template.content}</p><p className="mt-3 text-[10px] text-blue-600">Variables: {"{{customer_name}}"} · {"{{invoice_number}}"} · {"{{amount}}"}</p></div>)}</div></Card>;
}

function ScheduledRows({ rows }: { rows: Scheduled[] }) { return <Card><h2 className="font-semibold">Scheduled Messages</h2><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="border-b border-ledger-100 bg-ledger-50/70 text-[10px] uppercase text-ledger-500"><tr><th className="px-3 py-3">Message</th><th className="px-3 py-3">Audience</th><th className="px-3 py-3">Channel</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">Status</th></tr></thead><tbody className="divide-y divide-ledger-100">{rows.map((row) => <tr key={row.id}><td className="px-3 py-3 font-semibold">{row.name}</td><td className="px-3 py-3">{row.audience}</td><td className="px-3 py-3">{row.channel}</td><td className="px-3 py-3">{new Date(row.scheduled_at).toLocaleString()}</td><td className="px-3 py-3"><Badge tone="blue">{row.status}</Badge></td></tr>)}</tbody></table>{!rows.length && <p className="py-10 text-center text-sm text-ledger-400">No scheduled messages.</p>}</div></Card>; }
function HistoryRows({ rows }: { rows: History[] }) { return <Card><h2 className="font-semibold">Customer Notifications &amp; Message History</h2><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="border-b border-ledger-100 bg-ledger-50/70 text-[10px] uppercase text-ledger-500"><tr><th className="px-3 py-3">Customer</th><th className="px-3 py-3">Event</th><th className="px-3 py-3">Channel</th><th className="px-3 py-3">Message</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">Status</th></tr></thead><tbody className="divide-y divide-ledger-100">{rows.map((row) => <tr key={row.id}><td className="px-3 py-3">{row.recipient ?? "Portal customer"}</td><td className="px-3 py-3">{row.event ?? "Broadcast"}</td><td className="px-3 py-3"><Badge tone="blue">{row.channel}</Badge></td><td className="max-w-xs truncate px-3 py-3">{row.rendered_content}</td><td className="px-3 py-3">{new Date(row.created_at).toLocaleString()}</td><td className="px-3 py-3"><Badge tone={row.status === "Failed" ? "red" : row.status === "Read" ? "green" : "blue"}>{row.status}</Badge></td></tr>)}</tbody></table>{!rows.length && <p className="py-10 text-center text-sm text-ledger-400">No messages have been recorded.</p>}</div></Card>; }
function Analytics({ metrics, history, campaigns }: { metrics: { sent: number; delivered: number; read: number; failed: number }; history: History[]; campaigns: Campaign[] }) { const byChannel = channels.map((channel) => ({ channel, count: history.filter((item) => item.channel === channel).length })); return <div className="grid gap-5 lg:grid-cols-3"><Card><h2 className="font-semibold">Campaign Performance</h2><div className="mt-5 space-y-4"><div className="h-32 rounded-xl bg-gradient-to-t from-blue-50 to-white p-4"><div className="flex h-full items-end gap-2">{[35, 48, 42, 65, 58, 78, 72, 90].map((height, index) => <div key={index} className="flex-1 rounded-t bg-blue-500/80" style={{ height: `${height}%` }} />)}</div></div><p className="text-xs text-ledger-400">{campaigns.length} campaigns tracked</p></div></Card><Card><h2 className="font-semibold">Messages by Channel</h2><div className="mt-5 space-y-3">{byChannel.map((item) => <div key={item.channel}><div className="flex justify-between text-xs"><span>{item.channel}</span><strong>{item.count}</strong></div><div className="mt-1 h-2 rounded-full bg-ledger-100"><div className="h-2 rounded-full bg-emerald-500" style={{ width: `${Math.min(100, item.count * 10)}%` }} /></div></div>)}</div></Card><Card><h2 className="font-semibold">Customer Engagement</h2><div className="mt-5 space-y-4"><div className="flex justify-between text-sm"><span>Delivered</span><strong>{metrics.sent ? Math.round((metrics.delivered / metrics.sent) * 100) : 0}%</strong></div><div className="flex justify-between text-sm"><span>Read rate</span><strong>{metrics.delivered ? Math.round((metrics.read / metrics.delivered) * 100) : 0}%</strong></div><div className="flex justify-between text-sm"><span>Failed rate</span><strong>{metrics.sent ? Math.round((metrics.failed / metrics.sent) * 100) : 0}%</strong></div></div></Card></div>; }
function Approvals({ campaigns, onSubmit }: { campaigns: Campaign[]; onSubmit: (campaign: Campaign) => void }) { return <Card><h2 className="font-semibold">Approval Workflow</h2><p className="mt-1 text-xs text-ledger-400">Draft → Submitted → Approved → Scheduled → Sent. Only approved campaigns may be sent.</p><div className="mt-5 grid gap-3 md:grid-cols-5">{["Draft", "Submitted", "Approved", "Scheduled", "Sent"].map((status) => <div key={status} className="rounded-xl bg-ledger-50 p-3"><p className="text-xs font-semibold">{status}</p><p className="mt-2 text-2xl font-bold">{campaigns.filter((campaign) => campaign.status === status).length}</p></div>)}</div><div className="mt-5 space-y-2">{campaigns.filter((campaign) => campaign.status === "Submitted").map((campaign) => <div key={campaign.id} className="flex items-center justify-between rounded-xl border border-ledger-100 p-3 text-xs"><span className="font-semibold">{campaign.name}</span><button onClick={() => onSubmit(campaign)} className="text-blue-600 hover:underline">Review</button></div>)}</div></Card>; }

function Composer({ tab, form, setForm, onClose, onTemplate, onCampaign }: { tab: Tab; form: { name: string; content: string; category: string; channel: string; audience: string; campaignType: string; date: string }; setForm: (value: (current: typeof form) => typeof form) => void; onClose: () => void; onTemplate: () => void; onCampaign: () => void }) {
  const isTemplate = tab === "templates" || tab === "automated";
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 p-4"><div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{isTemplate ? "Create Message Template" : "Create Broadcast Campaign"}</h2><button onClick={onClose}><XCircle className="h-5 w-5 text-ledger-400" /></button></div><div className="mt-5 grid gap-4"><label className="text-xs font-semibold">Name<input value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-ledger-200 px-3 text-sm" placeholder={isTemplate ? "Thank You for Your Purchase" : "October Product Launch"} /></label>{isTemplate ? <><label className="text-xs font-semibold">Category<select value={form.category} onChange={(e) => setForm((current) => ({ ...current, category: e.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-ledger-200 px-3 text-sm">{["Thank You", "Promotion", "Collections", "Delivery", "Welcome", "Loyalty", "Birthday", "General"].map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-xs font-semibold">Channel<select value={form.channel} onChange={(e) => setForm((current) => ({ ...current, channel: e.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-ledger-200 px-3 text-sm">{channels.map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-xs font-semibold">Message<textarea value={form.content} onChange={(e) => setForm((current) => ({ ...current, content: e.target.value }))} rows={6} className="mt-1 w-full rounded-lg border border-ledger-200 px-3 py-2 text-sm" placeholder="Hello {{customer_name}}, thank you for purchasing..." /></label></> : <><div className="grid grid-cols-2 gap-3"><label className="text-xs font-semibold">Campaign Type<select value={form.campaignType} onChange={(e) => setForm((current) => ({ ...current, campaignType: e.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-ledger-200 px-3 text-sm">{campaignTypes.map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-xs font-semibold">Audience<select value={form.audience} onChange={(e) => setForm((current) => ({ ...current, audience: e.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-ledger-200 px-3 text-sm">{audiences.map((item) => <option key={item}>{item}</option>)}</select></label></div><label className="text-xs font-semibold">Channel<select value={form.channel} onChange={(e) => setForm((current) => ({ ...current, channel: e.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-ledger-200 px-3 text-sm">{channels.map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-xs font-semibold">Schedule (optional)<input type="datetime-local" value={form.date} onChange={(e) => setForm((current) => ({ ...current, date: e.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-ledger-200 px-3 text-sm" /></label></>}</div><div className="mt-6 flex justify-end gap-2"><button onClick={onClose} className="rounded-lg border border-ledger-200 px-4 py-2 text-xs font-semibold">Cancel</button><button onClick={isTemplate ? onTemplate : onCampaign} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white">{isTemplate ? "Save Template" : "Save Campaign"}</button></div></div></div>;
}
