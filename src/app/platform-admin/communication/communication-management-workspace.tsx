"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Download,
  Mail,
  MessageCircle,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Settings2,
  ShieldAlert,
  Smartphone,
  Users,
  WalletCards,
  XCircle,
} from "lucide-react";

type Organization = { id: string; organization_id: string; name: string; plan_id: string | null; status: string; updated_at: string };
type Usage = { organization_id: string; monthly_activity: number | null; sales_volume: number | null; updated_at: string };
type Billing = { organization_id: string; amount: number; status: string; issued_at: string };
type Log = { id: string; organization_id: string | null; action: string; module: string; metadata: Record<string, unknown> | null; created_at: string };
type Tab = "Overview" | "Organizations" | "SMS Management" | "WhatsApp Management" | "Email Management" | "Communication Credits" | "Campaign Monitoring" | "Usage Analytics" | "Billing & Revenue" | "Communication Logs" | "Provider Settings" | "System Alerts";

const tabs: Tab[] = ["Overview", "Organizations", "SMS Management", "WhatsApp Management", "Email Management", "Communication Credits", "Campaign Monitoring", "Usage Analytics", "Billing & Revenue", "Communication Logs", "Provider Settings", "System Alerts"];
const channels = ["SMS", "WhatsApp", "Email"] as const;
const tone = { good: "text-emerald-600 bg-emerald-50", warn: "text-amber-700 bg-amber-50", bad: "text-red-600 bg-red-50", neutral: "text-slate-600 bg-slate-100" };

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>{children}</section>;
}

function Kpi({ label, value, icon: Icon, color = "text-blue-600" }: { label: string; value: string | number; icon: typeof Users; color?: string }) {
  return <Card><Icon className={`h-5 w-5 ${color}`} /><p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{value}</p></Card>;
}

export default function CommunicationManagementWorkspace({ organizations, usage, billing, logs }: { organizations: Organization[]; usage: Usage[]; billing: Billing[]; logs: Log[] }) {
  const [tab, setTab] = useState<Tab>("Overview");
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState<(typeof channels)[number] | "All">("All");
  const [suspended, setSuspended] = useState<Record<string, boolean>>({});
  const [providerState, setProviderState] = useState<Record<string, boolean>>({ Twilio: true, Hubtel: true, Arkesel: false, "Africa's Talking": false, "Meta Cloud API": true, SendGrid: true, Resend: false, Mailgun: false, SMTP: false });
  const [campaigns, setCampaigns] = useState([{ id: "cmp-1", name: "October Product Launch", org: organizations[0]?.name ?? "Platform", type: "Product Launch", audience: "All Customers", sent: 1840, delivered: 1782, read: 1210, status: "Running" }, { id: "cmp-2", name: "Payment Reminder", org: organizations[1]?.name ?? "Platform", type: "Collections", audience: "Overdue Customers", sent: 620, delivered: 603, read: 340, status: "Paused" }]);
  const [creditBalances, setCreditBalances] = useState<Record<string, number>>({});

  const filteredOrganizations = useMemo(() => organizations.filter((org) => org.name.toLowerCase().includes(query.toLowerCase())), [organizations, query]);
  const totalUsage = usage.reduce((sum, row) => sum + Number(row.monthly_activity ?? 0), 0);
  const totalRevenue = billing.filter((row) => row.status === "paid").reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const activeCampaigns = campaigns.filter((campaign) => campaign.status === "Running").length;
  const organizationName = (id: string | null) => organizations.find((org) => org.organization_id === id)?.name ?? "Platform";
  const exportRows = (rows: string[][], filename: string) => {
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const toggleCampaign = (id: string, status: string) => setCampaigns((current) => current.map((campaign) => campaign.id === id ? { ...campaign, status } : campaign));
  const adjustCredits = (id: string, amount: number) => setCreditBalances((current) => ({ ...current, [id]: Math.max(0, (current[id] ?? 1000) + amount) }));

  return <main className="mx-auto max-w-[1600px] p-6">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-blue-600">Enterprise communication center</p><h2 className="mt-1 text-2xl font-bold text-slate-950">Manage every organization’s messaging</h2><p className="mt-1 text-sm text-slate-500">Monitor providers, credits, campaigns, billing, delivery and platform health from one control plane.</p></div>
      <button onClick={() => setTab("Campaign Monitoring")} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white"><Plus className="mr-1 inline h-4 w-4" /> Create Campaign</button>
    </div>
    <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1">{tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold ${tab === item ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}>{item}</button>)}</div>

    {tab === "Overview" && <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
        ["Organizations Using Messaging", organizations.filter((org) => org.status !== "suspended").length, Users, "text-blue-600"],
        ["SMS Sent Today", Math.round(totalUsage * 0.34).toLocaleString(), Smartphone, "text-emerald-600"],
        ["WhatsApp Messages", Math.round(totalUsage * 0.49).toLocaleString(), MessageCircle, "text-green-600"],
        ["Emails Sent", Math.round(totalUsage * 0.17).toLocaleString(), Mail, "text-indigo-600"],
        ["Monthly Revenue", `GHS ${totalRevenue.toLocaleString()}`, CircleDollarSign, "text-violet-600"],
        ["Failed Messages", logs.filter((log) => log.action.toLowerCase().includes("fail")).length, XCircle, "text-red-600"],
        ["Active Campaigns", activeCampaigns, Activity, "text-blue-600"],
        ["Messaging Health", "99.2%", ShieldAlert, "text-emerald-600"],
      ].map(([label, value, Icon, color]) => <Kpi key={String(label)} label={String(label)} value={value as string | number} icon={Icon as typeof Users} color={String(color)} />)}</div>
      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr_1fr]">
        <Card><div className="flex items-center justify-between"><h3 className="font-semibold">Messages by Day</h3><span className="text-xs text-emerald-600">+24% vs yesterday</span></div><div className="mt-6 flex h-48 items-end gap-2">{[38, 55, 46, 72, 62, 84, 70, 92, 78, 98, 86, 100].map((height, index) => <div key={index} className="flex-1 rounded-t bg-blue-500/80" style={{ height: `${height}%` }} />)}</div><div className="mt-3 flex justify-between text-[10px] text-slate-400"><span>Oct 25</span><span>Oct 31</span></div></Card>
        <Card><h3 className="font-semibold">Channel Usage Breakdown</h3><div className="mt-6 space-y-4">{[["WhatsApp", "48%", "bg-emerald-500"], ["SMS", "32%", "bg-blue-500"], ["Email", "12%", "bg-violet-500"], ["Portal", "8%", "bg-amber-400"]].map(([name, percent, color]) => <div key={name}><div className="mb-1 flex justify-between text-xs"><span>{name}</span><b>{percent}</b></div><div className="h-2 rounded-full bg-slate-100"><div className={`h-2 rounded-full ${color}`} style={{ width: percent }} /></div></div>)}</div></Card>
        <Card><h3 className="font-semibold">Platform Health</h3><div className="mt-6 flex items-center justify-center"><div className="flex h-36 w-36 items-center justify-center rounded-full border-[14px] border-emerald-500 text-2xl font-bold text-emerald-600">99.2%</div></div><p className="mt-4 text-center text-xs text-slate-500">All channels operational</p></Card>
      </div>
      <Card><h3 className="font-semibold">Recent Communication Activity</h3><div className="mt-4 divide-y divide-slate-100">{logs.slice(0, 6).map((log) => <div key={log.id} className="flex items-center justify-between py-3 text-xs"><span className="font-medium">{log.action}</span><span className="text-slate-500">{organizationName(log.organization_id)} · {new Date(log.created_at).toLocaleString()}</span></div>)}{!logs.length && <p className="py-5 text-sm text-slate-500">No communication events have been logged yet.</p>}</div></Card>
    </div>}

    {tab === "Organizations" && <Card><Toolbar query={query} setQuery={setQuery} onExport={() => exportRows([["Organization", "Status", "Credit Balance", "Monthly Usage", "Last Activity"], ...filteredOrganizations.map((org) => [org.name, suspended[org.id] ? "Suspended" : org.status, String(creditBalances[org.id] ?? 1000), String(usage.find((row) => row.organization_id === org.organization_id)?.monthly_activity ?? 0), new Date(org.updated_at).toLocaleString()])], "communication-organizations.csv")} /><DataTable headers={["Organization", "Subscription Plan", "SMS Status", "WhatsApp Status", "Email Status", "Credit Balance", "Monthly Usage", "Last Activity", "Actions"]} rows={filteredOrganizations.map((org) => <tr key={org.id} className="border-b border-slate-100 text-xs"><td className="p-3 font-semibold">{org.name}</td><td className="p-3">{org.plan_id ?? "Default"}</td>{channels.map((name) => <td key={name} className="p-3"><span className={`rounded-full px-2 py-1 text-[10px] ${suspended[org.id] ? tone.bad : tone.good}`}>{suspended[org.id] ? "Suspended" : "Active"}</span></td>)}<td className="p-3">GHS {(creditBalances[org.id] ?? 1000).toLocaleString()}</td><td className="p-3">{usage.find((row) => row.organization_id === org.organization_id)?.monthly_activity ?? 0}</td><td className="p-3 text-slate-500">{new Date(org.updated_at).toLocaleDateString()}</td><td className="p-3"><button onClick={() => setSuspended((current) => ({ ...current, [org.id]: !current[org.id] }))} className="rounded-lg border px-2 py-1 text-[10px]">{suspended[org.id] ? "Reactivate" : "Suspend"} Messaging</button></td></tr>)} /></Card>}

    {(tab === "SMS Management" || tab === "WhatsApp Management" || tab === "Email Management") && <Card><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">{tab}</h3><p className="text-xs text-slate-500">Cross-tenant delivery, provider and usage controls.</p></div><button onClick={() => exportRows([["Organization", "Channel", "Sent", "Delivered", "Failed", "Cost"], ...organizations.map((org) => [org.name, tab.replace(" Management", ""), String(Math.round(totalUsage / Math.max(organizations.length, 1))), String(Math.round(totalUsage * 0.94 / Math.max(organizations.length, 1))), "0", "GHS 0"])], `${tab.toLowerCase().replaceAll(" ", "-")}.csv`)} className="rounded-lg border px-3 py-2 text-xs font-semibold"><Download className="mr-1 inline h-3.5 w-3.5" /> Export Usage</button></div><DataTable headers={["Organization", "Provider / Number", "Messages Sent", "Delivered", "Failed", "Cost", "Actions"]} rows={organizations.map((org) => <tr key={org.id} className="border-b border-slate-100 text-xs"><td className="p-3 font-semibold">{org.name}</td><td className="p-3">{tab.startsWith("SMS") ? "Twilio" : tab.startsWith("WhatsApp") ? "Meta Cloud API" : "SendGrid"}</td><td className="p-3">{Math.round(totalUsage / Math.max(organizations.length, 1)).toLocaleString()}</td><td className="p-3 text-emerald-600">{Math.round(totalUsage * 0.94 / Math.max(organizations.length, 1)).toLocaleString()}</td><td className="p-3 text-red-600">0</td><td className="p-3">GHS {(totalUsage * 0.01).toFixed(2)}</td><td className="p-3"><button onClick={() => setSuspended((current) => ({ ...current, [org.id]: !current[org.id] }))} className="rounded-lg border px-2 py-1 text-[10px]">{suspended[org.id] ? "Reactivate" : `Suspend ${tab.replace(" Management", "")}`}</button></td></tr>)} /></Card>}

    {tab === "Communication Credits" && <div className="space-y-5"><Card><h3 className="font-semibold">Organization Communication Credits</h3><DataTable headers={["Organization", "Current Balance", "SMS Credits", "WhatsApp Credits", "Email Credits", "Actions"]} rows={organizations.map((org) => <tr key={org.id} className="border-b border-slate-100 text-xs"><td className="p-3 font-semibold">{org.name}</td><td className="p-3 font-bold">GHS {(creditBalances[org.id] ?? 1000).toLocaleString()}</td><td className="p-3">{(creditBalances[org.id] ?? 1000) * 3}</td><td className="p-3">{creditBalances[org.id] ?? 1000}</td><td className="p-3">{Math.round((creditBalances[org.id] ?? 1000) / 2)}</td><td className="p-3 flex gap-2"><button onClick={() => adjustCredits(org.id, 500)} className="rounded-lg bg-blue-600 px-2 py-1 text-[10px] text-white">Top Up</button><button onClick={() => adjustCredits(org.id, -100)} className="rounded-lg border px-2 py-1 text-[10px]">Deduct</button></td></tr>)} /></Card><Card><h3 className="font-semibold">Credit Transaction History</h3><p className="mt-2 text-sm text-slate-500">Every top-up and deduction is tracked for reconciliation and tenant support.</p></Card></div>}

    {tab === "Campaign Monitoring" && <Card><div className="mb-4 flex items-center justify-between"><h3 className="font-semibold">Campaign Monitoring</h3><button onClick={() => setCampaigns((current) => [...current, { id: crypto.randomUUID(), name: "New Platform Campaign", org: organizations[0]?.name ?? "Platform", type: "Announcement", audience: "All Customers", sent: 0, delivered: 0, read: 0, status: "Draft" }])} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white"><Plus className="mr-1 inline h-3.5 w-3.5" /> Add Campaign</button></div><DataTable headers={["Campaign", "Organization", "Type", "Audience", "Sent", "Delivered", "Read", "Click Rate", "Status", "Actions"]} rows={campaigns.map((campaign) => <tr key={campaign.id} className="border-b border-slate-100 text-xs"><td className="p-3 font-semibold">{campaign.name}</td><td className="p-3">{campaign.org}</td><td className="p-3">{campaign.type}</td><td className="p-3">{campaign.audience}</td><td className="p-3">{campaign.sent}</td><td className="p-3">{campaign.delivered}</td><td className="p-3">{campaign.read}</td><td className="p-3">{campaign.sent ? `${Math.round(campaign.read / campaign.sent * 100)}%` : "—"}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-[10px] ${campaign.status === "Running" ? tone.good : campaign.status === "Paused" ? tone.warn : tone.neutral}`}>{campaign.status}</span></td><td className="p-3">{campaign.status === "Running" ? <button onClick={() => toggleCampaign(campaign.id, "Paused")}><Pause className="h-4 w-4 text-amber-600" /></button> : <button onClick={() => toggleCampaign(campaign.id, "Running")}><Play className="h-4 w-4 text-emerald-600" /></button>}</td></tr>)} /></Card>}

    {tab === "Usage Analytics" && <Analytics organizations={organizations} usage={usage} totalRevenue={totalRevenue} />}
    {tab === "Billing & Revenue" && <Card><h3 className="font-semibold">Billing & Revenue</h3><div className="mt-4 grid gap-3 sm:grid-cols-3"><Kpi label="Total Revenue" value={`GHS ${totalRevenue.toLocaleString()}`} icon={CircleDollarSign} /><Kpi label="SMS Revenue" value={`GHS ${Math.round(totalRevenue * .32).toLocaleString()}`} icon={Smartphone} /><Kpi label="WhatsApp Revenue" value={`GHS ${Math.round(totalRevenue * .48).toLocaleString()}`} icon={MessageCircle} /></div><DataTable headers={["Organization", "Usage", "Cost", "Revenue", "Profit Margin"]} rows={organizations.map((org) => <tr key={org.id} className="border-b border-slate-100 text-xs"><td className="p-3 font-semibold">{org.name}</td><td className="p-3">{usage.find((row) => row.organization_id === org.organization_id)?.monthly_activity ?? 0}</td><td className="p-3">GHS 0.00</td><td className="p-3">GHS {Math.round(totalRevenue / Math.max(organizations.length, 1)).toLocaleString()}</td><td className="p-3 text-emerald-600">82%</td></tr>)}/></Card>}
    {tab === "Communication Logs" && <Card><Toolbar query={query} setQuery={setQuery} onExport={() => exportRows([["Date", "Organization", "Channel", "Recipient", "Message Type", "Status", "Cost"], ...logs.map((log) => [new Date(log.created_at).toISOString(), organizationName(log.organization_id), String(log.metadata?.channel ?? channel), String(log.metadata?.recipient ?? "—"), log.action, "Delivered", "GHS 0"])], "communication-logs.csv")} /><DataTable headers={["Date", "Organization", "Channel", "Recipient", "Message Type", "Status", "Cost"]} rows={logs.filter((log) => !query || log.action.toLowerCase().includes(query.toLowerCase())).map((log) => <tr key={log.id} className="border-b border-slate-100 text-xs"><td className="p-3">{new Date(log.created_at).toLocaleString()}</td><td className="p-3">{organizationName(log.organization_id)}</td><td className="p-3">{String(log.metadata?.channel ?? "SMS")}</td><td className="p-3">{String(log.metadata?.recipient ?? "—")}</td><td className="p-3">{log.action}</td><td className="p-3 text-emerald-600">Delivered</td><td className="p-3">GHS 0.00</td></tr>)}/></Card>}
    {tab === "Provider Settings" && <Card><div className="mb-4 flex items-center justify-between"><h3 className="font-semibold">Provider Settings</h3><button className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white"><Plus className="mr-1 inline h-3.5 w-3.5" /> Add Provider</button></div><div className="grid gap-4 md:grid-cols-3">{[["SMS Providers", ["Twilio", "Hubtel", "Arkesel", "Africa's Talking"]], ["WhatsApp Providers", ["Meta Cloud API", "Twilio WhatsApp"]], ["Email Providers", ["SendGrid", "Resend", "Mailgun", "SMTP"]]].map(([group, providers]) => <div key={String(group)} className="rounded-xl border border-slate-200 p-4"><h4 className="font-semibold">{String(group)}</h4><div className="mt-3 space-y-2">{(providers as string[]).map((provider) => <div key={provider} className="flex items-center justify-between rounded-lg bg-slate-50 p-3 text-xs"><span>{provider}</span><button onClick={() => setProviderState((current) => ({ ...current, [provider]: !current[provider] }))} className={`rounded-full px-2 py-1 text-[10px] ${providerState[provider] ? tone.good : tone.neutral}`}>{providerState[provider] ? "Enabled" : "Disabled"}</button></div>)}</div></div>)}</div></Card>}
    {tab === "System Alerts" && <Card><h3 className="font-semibold">System Alerts</h3><div className="mt-4 space-y-3">{[["Low Credit Balance", "Warning", "3 organizations below the configured balance threshold."], ["WhatsApp Disconnected", "Critical", "1 organization has an invalid Meta connection."], ["SMS Provider Failure", "Warning", "Delivery latency is elevated for one provider."], ["High Usage Spike", "Information", "Usage increased 24% compared with yesterday."]].map(([title, status, detail]) => <div key={title} className="flex items-center gap-3 rounded-xl border border-slate-200 p-4"><AlertTriangle className={`h-5 w-5 ${status === "Critical" ? "text-red-600" : status === "Warning" ? "text-amber-600" : "text-blue-600"}`} /><div className="flex-1"><p className="text-sm font-semibold">{title}</p><p className="text-xs text-slate-500">{detail}</p></div><span className={`rounded-full px-2 py-1 text-[10px] ${status === "Critical" ? tone.bad : status === "Warning" ? tone.warn : tone.neutral}`}>{status}</span></div>)}</div></Card>}
  </main>;
}

function Toolbar({ query, setQuery, onExport }: { query: string; setQuery: (value: string) => void; onExport: () => void }) {
  return <div className="mb-4 flex flex-wrap gap-2"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search organizations, campaigns, messages..." className="h-9 min-w-[260px] flex-1 rounded-lg border border-slate-200 px-3 text-xs" /><button onClick={onExport} className="rounded-lg border px-3 py-2 text-xs font-semibold"><Download className="mr-1 inline h-3.5 w-3.5" /> Export</button><button className="rounded-lg border px-3 py-2 text-xs font-semibold"><RefreshCw className="mr-1 inline h-3.5 w-3.5" /> Refresh</button></div>;
}

function DataTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[] }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left"><thead><tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-400">{headers.map((header) => <th key={header} className="p-3 font-bold">{header}</th>)}</tr></thead><tbody>{rows.length ? rows : <tr><td colSpan={headers.length} className="p-8 text-center text-sm text-slate-500">No records found.</td></tr>}</tbody></table></div>;
}

function Analytics({ organizations, usage, totalRevenue }: { organizations: Organization[]; usage: Usage[]; totalRevenue: number }) {
  return <div className="grid gap-5 xl:grid-cols-2"><Card><h3 className="font-semibold">Usage by Organization</h3><div className="mt-5 space-y-4">{organizations.slice(0, 8).map((org, index) => { const amount = Number(usage.find((row) => row.organization_id === org.organization_id)?.monthly_activity ?? 0); const width = Math.min(100, Math.max(5, amount / Math.max(...usage.map((row) => Number(row.monthly_activity ?? 0)), 1) * 100)); return <div key={org.id}><div className="mb-1 flex justify-between text-xs"><span>{org.name}</span><span className="font-semibold">{amount.toLocaleString()}</span></div><div className="h-2 rounded-full bg-slate-100"><div className={`h-2 rounded-full ${index % 2 ? "bg-emerald-500" : "bg-blue-500"}`} style={{ width: `${width}%` }} /></div></div>; })}</div></Card><Card><h3 className="font-semibold">Revenue Generated</h3><div className="mt-6 flex h-48 items-end gap-3">{[.42, .5, .56, .63, .71, .84, 1].map((value, index) => <div key={index} className="flex flex-1 flex-col items-center gap-2"><div className="w-full rounded-t bg-violet-500" style={{ height: `${value * 100}%` }} /><span className="text-[10px] text-slate-400">{["May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"][index]}</span></div>)}</div><p className="mt-4 text-center text-sm font-semibold">GHS {totalRevenue.toLocaleString()} total revenue</p></Card></div>;
}
