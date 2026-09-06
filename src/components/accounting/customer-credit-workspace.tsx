"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BriefcaseBusiness,
  ClipboardList,
  CreditCard,
  FileText,
  FolderOpen,
  History,
  LayoutDashboard,
  MessageSquare,
  Receipt,
  Send,
  Users,
} from "lucide-react";
import { useAccountingStore } from "@/lib/accounting/accounting-store";
import { AccountsReceivableTab } from "./accounts-receivable-tab";

type WorkspaceTab =
  | "overview"
  | "balances"
  | "ledger"
  | "invoices"
  | "payments"
  | "collections"
  | "statements"
  | "activities"
  | "opportunities"
  | "tickets"
  | "documents"
  | "audit";

const TABS: { key: WorkspaceTab; label: string; icon: typeof LayoutDashboard }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "balances", label: "Customer Balances", icon: Users },
  { key: "ledger", label: "Customer Ledger", icon: History },
  { key: "invoices", label: "Invoices", icon: Receipt },
  { key: "payments", label: "Payments", icon: CreditCard },
  { key: "collections", label: "Collections", icon: Send },
  { key: "statements", label: "Statements", icon: FileText },
  { key: "activities", label: "CRM Activities", icon: Activity },
  { key: "opportunities", label: "Opportunities", icon: BriefcaseBusiness },
  { key: "tickets", label: "Support Tickets", icon: MessageSquare },
  { key: "documents", label: "Documents", icon: FolderOpen },
  { key: "audit", label: "Audit Log", icon: ClipboardList },
];

const money = (currency: string, value: number) =>
  `${currency} ${value.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

export function CustomerCreditWorkspace() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { receivables, currentCurrency, auditLogs } = useAccountingStore();

  const totalReceivables = receivables.reduce((sum, item) => sum + item.outstandingAmount, 0);
  const overdue = receivables
    .filter((item) => item.daysOutstanding > 0)
    .reduce((sum, item) => sum + item.outstandingAmount, 0);
  const customers = new Set(receivables.map((item) => item.customerName)).size;
  const selected = receivables.find((item) => item.id === selectedId) ?? receivables[0];
  const customerRows = useMemo(() => {
    const map = new Map<string, typeof receivables>();
    receivables.forEach((item) => map.set(item.customerName, [...(map.get(item.customerName) ?? []), item]));
    return Array.from(map.entries()).map(([name, items]) => ({
      name,
      branch: items[0].branch,
      balance: items.reduce((sum, item) => sum + item.outstandingAmount, 0),
      creditLimit: items.reduce((sum, item) => sum + item.totalAmount, 0) * 1.5,
      lastPayment: items[0].issueDate,
      items,
    }));
  }, [receivables]);

  return (
    <div className="space-y-5 pb-16">
      <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">CRM & Accounts Receivable</p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Customer Credit Management</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Manage balances, receivables, collections, communications, and customer relationships from one workspace.</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          {customers} customers · {receivables.length} invoices
        </div>
      </div>

      <nav className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex min-w-max">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-3 text-xs font-semibold transition ${
                activeTab === key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </nav>

      {activeTab === "balances" ? (
        <AccountsReceivableTab />
      ) : activeTab === "overview" ? (
        <Overview
          currency={currentCurrency}
          totalReceivables={totalReceivables}
          overdue={overdue}
          customers={customers}
          receivables={receivables}
          onOpen={(id) => {
            setSelectedId(id);
            setActiveTab("balances");
          }}
        />
      ) : (
        <WorkspaceSection
          tab={activeTab}
          currency={currentCurrency}
          receivables={receivables}
          auditLogs={auditLogs}
          customerRows={customerRows}
          onSelect={setSelectedId}
        />
      )}

      {selected && activeTab !== "balances" && (
        <aside className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-950 dark:bg-blue-950/20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Selected Customer Profile</p>
              <h2 className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{selected.customerName}</h2>
              <p className="text-xs text-slate-500">{selected.branch} · {selected.invoiceNumber}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-right text-xs">
              <Metric label="Credit Limit" value={money(currentCurrency, selected.totalAmount * 1.5)} />
              <Metric label="Outstanding" value={money(currentCurrency, selected.outstandingAmount)} />
              <Metric label="Risk" value={selected.daysOutstanding > 60 ? "High" : selected.daysOutstanding > 0 ? "Medium" : "Low"} />
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}

function Overview({ currency, totalReceivables, overdue, customers, receivables, onOpen }: {
  currency: string;
  totalReceivables: number;
  overdue: number;
  customers: number;
  receivables: ReturnType<typeof useAccountingStore.getState>["receivables"];
  onOpen: (id: string) => void;
}) {
  const cards = [
    ["Total Receivables", money(currency, totalReceivables), "All outstanding invoices", "text-blue-600"],
    ["Overdue Receivables", money(currency, overdue), `${receivables.filter((r) => r.daysOutstanding > 0).length} invoices need attention`, "text-rose-600"],
    ["Customers on Credit", String(customers), "Active customer accounts", "text-emerald-600"],
    ["Payments Received", money(currency, receivables.reduce((sum, r) => sum + r.paidAmount, 0)), "Recorded against invoices", "text-violet-600"],
    ["Credit Utilization", totalReceivables ? `${Math.round((overdue / totalReceivables) * 100)}%` : "0%", "Outstanding vs. invoice value", "text-amber-600"],
    ["High Risk Customers", String(new Set(receivables.filter((r) => r.daysOutstanding > 60).map((r) => r.customerName)).size), "Over 60 days outstanding", "text-rose-600"],
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map(([label, value, hint, color]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className={`mt-2 font-display text-lg font-bold ${color}`}>{value}</p><p className="mt-1 text-[10px] text-slate-500">{hint}</p></div>)}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between"><h2 className="text-sm font-bold text-slate-900 dark:text-white">Receivables Trend</h2><BarChart3 className="h-4 w-4 text-blue-600" /></div>
          <div className="mt-6 flex h-32 items-end gap-2">{receivables.slice(0, 12).map((item) => <button key={item.id} title={item.customerName} onClick={() => onOpen(item.id)} className="flex-1 rounded-t-md bg-blue-500/70 transition hover:bg-blue-600" style={{ height: `${Math.max(12, Math.min(100, (item.outstandingAmount / Math.max(totalReceivable(receivables), 1)) * 100))}%` }} />)}</div>
          <p className="mt-2 text-[10px] text-slate-400">Invoice balances by receivable record · select a bar to open the customer.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"><h2 className="text-sm font-bold text-slate-900 dark:text-white">Aging Analysis</h2><div className="mt-4 space-y-3">{[["Current", 0], ["1–30 days", 1], ["31–60 days", 31], ["61–90 days", 61], ["90+ days", 91]].map(([label, days]) => { const value = receivables.filter((r) => r.daysOutstanding >= Number(days) && (Number(days) === 0 || r.daysOutstanding < Number(days) + 30)).reduce((sum, r) => sum + r.outstandingAmount, 0); return <div key={label}><div className="flex justify-between text-xs"><span className="text-slate-500">{label}</span><span className="font-semibold text-slate-900 dark:text-white">{money(currency, value)}</span></div><div className="mt-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-2 rounded-full bg-blue-500" style={{ width: `${totalReceivables ? Math.min(100, value / totalReceivables * 100) : 0}%` }} /></div></div>; })}</div></div>
      </div>
    </div>
  );
}

function WorkspaceSection({ tab, currency, receivables, auditLogs, customerRows, onSelect }: {
  tab: WorkspaceTab;
  currency: string;
  receivables: ReturnType<typeof useAccountingStore.getState>["receivables"];
  auditLogs: ReturnType<typeof useAccountingStore.getState>["auditLogs"];
  customerRows: { name: string; branch: string; balance: number; creditLimit: number; lastPayment: string; items: typeof receivables }[];
  onSelect: (id: string) => void;
}) {
  const title = TABS.find((item) => item.key === tab)?.label ?? tab;
  if (tab === "audit") return <TableCard title={title} columns={["User", "Action", "Module", "Date & Time"]} rows={auditLogs.map((log) => [log.userName, log.action, log.module, log.createdAt])} />;
  if (tab === "ledger") return <TableCard title={title} columns={["Date", "Reference", "Description", "Debit", "Credit", "Balance", "User"]} rows={receivables.map((r) => [r.issueDate, r.invoiceNumber, `Invoice for ${r.customerName}`, money(currency, r.totalAmount), "—", money(currency, r.outstandingAmount), "System"]) } />;
  if (tab === "payments") return <TableCard title={title} columns={["Receipt Number", "Customer", "Invoice", "Amount", "Date", "Method", "User"]} rows={receivables.filter((r) => r.paidAmount > 0).map((r) => [`RCPT-${r.id.slice(-6)}`, r.customerName, r.invoiceNumber, money(currency, r.paidAmount), r.issueDate, "Recorded payment", "System"])} />;
  if (tab === "collections") return <TableCard title={title} columns={["Customer", "Amount Due", "Days Overdue", "Priority", "Assigned Staff", "Last Contact"]} rows={receivables.filter((r) => r.outstandingAmount > 0).sort((a, b) => b.daysOutstanding - a.daysOutstanding).map((r) => [r.customerName, money(currency, r.outstandingAmount), String(r.daysOutstanding), r.daysOutstanding > 60 ? "High" : "Normal", "Unassigned", "Not contacted"])} />;
  if (tab === "invoices") return <TableCard title={title} columns={["Invoice Number", "Customer", "Invoice Date", "Due Date", "Amount", "Paid Amount", "Balance", "Status"]} rows={receivables.map((r) => [r.invoiceNumber, r.customerName, r.issueDate, r.dueDate, money(currency, r.totalAmount), money(currency, r.paidAmount), money(currency, r.outstandingAmount), r.status])} />;
  if (tab === "statements") return <ActionCard title={title} text="Generate current, monthly, quarterly, annual, or custom-date customer statements from the selected customer profile." actions={["Preview", "Download PDF", "Email", "WhatsApp"]} />;
  if (tab === "activities") return <ActionCard title={title} text="Record calls, meetings, emails, WhatsApp messages, notes, and follow-ups against a customer." actions={["Add Note", "Schedule Meeting", "Log Call", "Create Task"]} />;
  if (tab === "opportunities") return <KanbanCard title={title} stages={["Lead", "Qualified", "Proposal", "Negotiation", "Won", "Lost"]} />;
  if (tab === "tickets") return <TableCard title={title} columns={["Ticket Number", "Customer", "Subject", "Priority", "Assigned User", "Status", "Created Date"]} rows={[]} />;
  if (tab === "documents") return <ActionCard title={title} text="Upload and manage agreements, credit applications, IDs, contracts, statements, and signed invoices." actions={["Upload", "Preview", "Download", "Share"]} />;
  return <TableCard title={title} columns={["Customer", "Branch", "Credit Limit", "Outstanding Balance", "Available Credit", "Last Payment", "Status", "Actions"]} rows={customerRows.map((r) => [r.name, r.branch, money(currency, r.creditLimit), money(currency, r.balance), money(currency, Math.max(0, r.creditLimit - r.balance)), r.lastPayment, r.balance > r.creditLimit ? "Over Limit" : "On Credit", "View Ledger"])} onRowClick={(index) => onSelect(customerRows[index].items[0].id)} />;
}

function TableCard({ title, columns, rows, onRowClick }: { title: string; columns: string[]; rows: string[][]; onRowClick?: (index: number) => void }) {
  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800"><h2 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h2></div><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-100 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/60">{columns.map((column) => <th key={column} className="whitespace-nowrap px-4 py-3 font-semibold">{column}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{rows.length ? rows.map((row, index) => <tr key={`${index}-${row[0]}`} onClick={() => onRowClick?.(index)} className={onRowClick ? "cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-950/20" : ""}>{row.map((cell, cellIndex) => <td key={cellIndex} className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{cell}</td>)}</tr>) : <tr><td colSpan={columns.length} className="px-4 py-12 text-center text-slate-400">No records available yet.</td></tr>}</tbody></table></div></div>;
}

function ActionCard({ title, text, actions }: { title: string; text: string; actions: string[] }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"><h2 className="text-base font-bold text-slate-900 dark:text-white">{title}</h2><p className="mt-2 max-w-2xl text-sm text-slate-500">{text}</p><div className="mt-5 flex flex-wrap gap-2">{actions.map((action) => <button key={action} type="button" className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">{action}</button>)}</div></div>;
}

function KanbanCard({ title, stages }: { title: string; stages: string[] }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"><h2 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h2><div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">{stages.map((stage) => <div key={stage} className="min-h-28 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{stage}</p><p className="mt-8 text-xs text-slate-400">No opportunities</p></div>)}</div></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] text-slate-500">{label}</p><p className="font-semibold text-slate-900 dark:text-white">{value}</p></div>;
}

function totalReceivable(items: ReturnType<typeof useAccountingStore.getState>["receivables"]) {
  return items.reduce((sum, item) => sum + item.outstandingAmount, 0);
}
