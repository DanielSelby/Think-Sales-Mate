"use client";

import { useMemo, useState } from "react";
import {
  Archive, Bell, Check, CheckCheck, ChevronDown, FileText, Hash, Info, MoreVertical,
  Paperclip, Phone, Pin, Plus, Search, Send, Smile, Sparkles, Star, Video,
  Users, X, Zap
} from "lucide-react";
import { useAppStore, THEMES } from "@/store/useAppStore";

type Conversation = {
  id: string;
  name: string;
  type: "Branch" | "Group" | "Direct";
  preview: string;
  time: string;
  unread?: number;
  online?: boolean;
  priority?: "Important" | "Critical";
  color: string;
};

type Message = { id: string; author: string; initials: string; text: string; time: string; mine?: boolean; reaction?: string };

const conversations: Conversation[] = [
  { id: "accra", name: "Accra Main Branch", type: "Branch", preview: "Please confirm stock delivery for the new products…", time: "10:30 AM", unread: 2, online: true, color: "#2563eb" },
  { id: "kumasi", name: "Kumasi Branch", type: "Branch", preview: "Sales target for this week has been…", time: "09:15 AM", unread: 1, priority: "Important", color: "#22c55e" },
  { id: "admin", name: "Management Team", type: "Group", preview: "Company meeting this Friday at 10:00 AM", time: "Yesterday", online: true, color: "#8b5cf6" },
  { id: "mary", name: "Mary Addo", type: "Direct", preview: "Kindly approve the purchase order.", time: "May 16", online: true, color: "#f97316" },
  { id: "all", name: "All Branches", type: "Group", preview: "Monthly operational update is ready.", time: "May 14", color: "#0891b2" },
];

const initialMessages: Message[] = [
  { id: "1", author: "Michael Owusu", initials: "MO", text: "Please confirm stock delivery for the new products we requested.", time: "10:30 AM" },
  { id: "2", author: "You", initials: "JD", text: "Hi Michael, we have received the items and will update the system shortly.", time: "10:32 AM", mine: true },
  { id: "3", author: "Michael Owusu", initials: "MO", text: "Great! Also, kindly share this week's sales report when it's ready.", time: "10:33 AM" },
  { id: "4", author: "You", initials: "JD", text: "Sure, I'll send it by end of day.", time: "10:35 AM", mine: true, reaction: "👍 2" },
  { id: "5", author: "Sarah Johnson", initials: "SJ", text: "Don't forget about the staff meeting tomorrow at 9 AM.", time: "10:40 AM" },
];

const tabs = ["All", "Unread", "Direct", "Groups", "Branches", "Announcements", "Archived"];

export default function CommunicationPage() {
  const { activeTheme } = useAppStore();
  const theme = THEMES[activeTheme];
  const [activeId, setActiveId] = useState("accra");
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState(initialMessages);
  const [showDetails, setShowDetails] = useState(true);
  const [pinned, setPinned] = useState(true);
  const [showComposerMenu, setShowComposerMenu] = useState(false);

  const visibleConversations = useMemo(() => conversations.filter((item) => {
    const matchesSearch = `${item.name} ${item.preview}`.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "All" || (filter === "Unread" && item.unread) || (filter === item.type) || (filter === "Announcements" && item.id === "all");
    return matchesSearch && matchesFilter;
  }), [filter, search]);

  const active = conversations.find((item) => item.id === activeId) ?? conversations[0];
  const sendMessage = () => {
    const text = message.trim();
    if (!text) return;
    setMessages((current) => [...current, { id: String(Date.now()), author: "You", initials: "JD", text, time: "Now", mine: true }]);
    setMessage("");
  };

  return (
    <div className="flex h-[calc(100vh-6.5rem)] min-h-[620px] min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <aside className="flex w-[300px] shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-4">
          <div className="flex items-center justify-between">
            <div><p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Workspace</p><h1 className="mt-1 text-lg font-bold text-slate-900">Communication</h1></div>
            <button className="rounded-xl p-2 text-blue-600 hover:bg-blue-50"><Plus className="h-4 w-4" /></button>
          </div>
          <div className="relative mt-4"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations..." className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs outline-none focus:border-blue-400" /></div>
          <div className="mt-3 flex gap-1 overflow-x-auto pb-1">{tabs.map((tab) => <button key={tab} onClick={() => setFilter(tab)} className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[10px] font-semibold ${filter === tab ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50"}`}>{tab}{tab === "Unread" && <span className="ml-1 rounded-full bg-red-100 px-1 text-red-600">3</span>}</button>)}</div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">{visibleConversations.map((item) => <button key={item.id} onClick={() => setActiveId(item.id)} className={`flex w-full items-start gap-3 rounded-xl p-3 text-left transition ${activeId === item.id ? "bg-blue-50" : "hover:bg-slate-50"}`}><Avatar label={item.name[0]} color={item.color} online={item.online} /><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><strong className="truncate text-xs text-slate-800">{item.name}</strong><span className="shrink-0 text-[10px] text-slate-400">{item.time}</span></span><span className="mt-1 block truncate text-[11px] text-slate-500">{item.preview}</span><span className="mt-1 flex items-center gap-1">{item.priority && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">{item.priority}</span>}{item.unread && <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-bold text-white">{item.unread}</span>}</span></span></button>)}</div>
        <div className="border-t border-slate-100 p-3"><button className="flex w-full items-center gap-2 rounded-xl border border-dashed border-blue-200 bg-blue-50/50 p-3 text-left text-xs font-semibold text-blue-700"><Plus className="h-4 w-4" /> New branch channel</button></div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3"><div className="flex items-center gap-3"><Avatar label={active.name[0]} color={active.color} online /><div><h2 className="text-sm font-bold text-slate-900">{active.name}</h2><p className="text-[10px] text-slate-400">{active.type} · 12 members · <span className="text-emerald-600">4 online</span></p></div></div><div className="flex items-center gap-1 text-slate-500"><button className="rounded-lg p-2 hover:bg-slate-50"><Phone className="h-4 w-4" /></button><button className="rounded-lg p-2 hover:bg-slate-50"><Video className="h-4 w-4" /></button><button onClick={() => setShowDetails((value) => !value)} className="rounded-lg p-2 hover:bg-slate-50"><Info className="h-4 w-4" /></button><button className="rounded-lg p-2 hover:bg-slate-50"><MoreVertical className="h-4 w-4" /></button></div></header>
        {pinned && <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50/60 px-5 py-2 text-[11px] text-slate-600"><Pin className="h-3.5 w-3.5 text-amber-600" /><span className="font-semibold text-slate-700">Pinned by Admin</span><span className="truncate">Company meeting this Friday at 10:00 AM in the main conference room.</span><button onClick={() => setPinned(false)} className="ml-auto text-slate-400"><X className="h-3.5 w-3.5" /></button></div>}
        <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/40 p-5">{messages.map((item) => <div key={item.id} className={`flex gap-2.5 ${item.mine ? "justify-end" : ""}`}><Avatar label={item.initials} color={item.mine ? theme.colors.primary : "#64748b"} /><div className={`max-w-[68%] ${item.mine ? "items-end" : ""}`}><p className={`mb-1 text-[10px] font-semibold ${item.mine ? "text-right text-blue-700" : "text-slate-600"}`}>{item.author}</p><div className={`rounded-2xl px-3.5 py-2.5 text-xs leading-5 ${item.mine ? "rounded-tr-sm bg-blue-600 text-white" : "rounded-tl-sm border border-slate-100 bg-white text-slate-700 shadow-sm"}`}>{item.text}<div className={`mt-1 flex items-center justify-end gap-1 text-[9px] ${item.mine ? "text-blue-100" : "text-slate-400"}`}>{item.time}{item.mine && <CheckCheck className="h-3 w-3" />}</div></div>{item.reaction && <span className="mt-1 inline-block rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px]">{item.reaction}</span>}</div></div>)}</div>
        <div className="border-t border-slate-200 bg-white p-3"><div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5"><button onClick={() => setShowComposerMenu((value) => !value)} className="rounded-lg p-2 text-slate-500 hover:bg-white"><Paperclip className="h-4 w-4" /></button><input value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()} placeholder="Type a message..." className="min-w-0 flex-1 bg-transparent px-1 text-xs outline-none" /><button className="rounded-lg p-2 text-slate-500 hover:bg-white"><Smile className="h-4 w-4" /></button><button onClick={sendMessage} className="rounded-lg p-2 text-white" style={{ background: theme.colors.primary }}><Send className="h-4 w-4" /></button></div>{showComposerMenu && <div className="mt-2 flex gap-2 text-[10px] text-slate-500"><button className="rounded-lg bg-white px-2 py-1 shadow-sm"><FileText className="mr-1 inline h-3 w-3" />Share document</button><button className="rounded-lg bg-white px-2 py-1 shadow-sm"><Zap className="mr-1 inline h-3 w-3" />Create task</button><button className="rounded-lg bg-white px-2 py-1 shadow-sm"><Check className="mr-1 inline h-3 w-3" />Request approval</button></div>}</div>
      </section>

      {showDetails && <aside className="hidden w-[255px] shrink-0 border-l border-slate-200 bg-white xl:block"><div className="flex items-center justify-between border-b border-slate-100 p-4"><h3 className="text-xs font-bold text-slate-900">Conversation details</h3><button onClick={() => setShowDetails(false)} className="text-slate-400"><X className="h-4 w-4" /></button></div><div className="space-y-6 p-4"><div className="flex items-center gap-3"><Avatar label={active.name[0]} color={active.color} /><div><p className="text-xs font-bold text-slate-800">{active.name}</p><p className="text-[10px] text-slate-400">Official communication channel</p></div></div><div><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">About</p><p className="text-xs leading-5 text-slate-500">Coordinate branch operations, share records, and resolve approvals with your team.</p></div><div><div className="mb-3 flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Members (12)</p><button className="text-[10px] font-semibold text-blue-600">View all</button></div><div className="space-y-2">{["John Doe", "Sarah Johnson", "Michael Owusu", "Mary Addo"].map((name) => <div key={name} className="flex items-center gap-2"><Avatar label={name.split(" ").map((part) => part[0]).join("")} color="#64748b" online /><span className="text-xs text-slate-600">{name}</span></div>)}</div></div><div><p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Shared files</p><div className="space-y-2">{["Sales_Report_May_2025.pdf", "Stock_Update.xlsx", "Meeting_Notes.docx"].map((file) => <div key={file} className="flex items-center gap-2 rounded-lg bg-slate-50 p-2"><FileText className="h-4 w-4 text-blue-500" /><span className="truncate text-[10px] font-medium text-slate-600">{file}</span></div>)}</div></div><div className="rounded-xl border border-blue-100 bg-blue-50 p-3"><div className="flex items-center gap-2 text-xs font-bold text-blue-700"><Sparkles className="h-3.5 w-3.5" /> AI assistant</div><p className="mt-1 text-[10px] leading-4 text-blue-700/70">Summarize this conversation or extract action items.</p></div></div></aside>}
    </div>
  );
}

function Avatar({ label, color, online }: { label: string; color: string; online?: boolean }) {
  return <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: color }}>{label.toUpperCase()} {online && <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-white bg-emerald-500" />}</span>;
}
