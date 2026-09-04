"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, CheckCheck, FileText, Info, MoreVertical, Paperclip, Pin, Plus, Search, Send, Smile, Users, X } from "lucide-react";
import { useAppStore, THEMES } from "@/store/useAppStore";
import { createClient } from "@/lib/supabase/client";

type Channel = {
  id: string;
  name: string;
  channel_type: "Branch" | "Group" | "Direct" | "Announcement";
  location_id: string | null;
  archived: boolean;
  memberCount: number;
  latest?: Message;
};

type Message = {
  id: string;
  channel_id: string;
  user_id: string;
  body: string;
  pinned: boolean;
  created_at: string;
  author: string;
};

const tabs = ["All", "Unread", "Direct", "Groups", "Branches", "Announcements", "Archived"];

export default function CommunicationPage() {
  const { activeTheme } = useAppStore();
  const theme = THEMES[activeTheme];
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState("");
  const [orgId, setOrgId] = useState("");
  const [userName, setUserName] = useState("You");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [members, setMembers] = useState<Array<{ id: string; name: string }>>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeId, setActiveId] = useState("");
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [showDetails, setShowDetails] = useState(true);
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState("");

  const loadWorkspace = useCallback(async () => {
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setBusy(false);
      return;
    }
    setUserId(auth.user.id);
    const displayName = auth.user.user_metadata?.full_name || auth.user.user_metadata?.name || auth.user.email?.split("@")[0] || "You";
    setUserName(displayName);

    const { data: membership } = await supabase
      .from("organization_members")
      .select("org_id")
      .eq("user_id", auth.user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!membership?.org_id) {
      setBusy(false);
      return;
    }
    setOrgId(membership.org_id);

    let { data: channelRows } = await supabase
      .from("communication_channels")
      .select("id, name, channel_type, location_id, archived")
      .eq("org_id", membership.org_id)
      .order("created_at", { ascending: true });

    if (!channelRows?.length) {
      const { data: locations } = await supabase
        .from("business_locations")
        .select("id, name")
        .eq("org_id", membership.org_id)
        .eq("is_active", true)
        .order("name");
      const defaults: Array<{ org_id: string; name: string; channel_type: "Branch" | "Group"; location_id: string | null; created_by: string }> = (locations ?? []).map((location) => ({
        org_id: membership.org_id,
        name: location.name,
        channel_type: "Branch",
        location_id: location.id,
        created_by: auth.user.id,
      }));
      defaults.push({ org_id: membership.org_id, name: "Management Team", channel_type: "Group", location_id: null, created_by: auth.user.id });
      const { data: created } = await supabase.from("communication_channels").insert(defaults).select("id, name, channel_type, location_id, archived");
      channelRows = created ?? [];
    }

    const { data: memberRows } = await supabase
      .from("organization_members")
      .select("user_id")
      .eq("org_id", membership.org_id)
      .eq("status", "active");
    const memberIds = (memberRows ?? []).map((row) => row.user_id).filter((id): id is string => Boolean(id));
    const { data: profileRows } = memberIds.length ? await supabase.from("profiles").select("id, full_name").in("id", memberIds) : { data: [] };
    const profileNames = new Map((profileRows ?? []).map((profile) => [profile.id, profile.full_name || "Team member"]));
    const memberList = memberIds.map((id) => ({ id, name: profileNames.get(id) || "Team member" }));
    setMembers(memberList);

    const channelIds = (channelRows ?? []).map((row) => row.id);
    const { data: messageRows } = channelIds.length
      ? await supabase.from("communication_messages").select("id, channel_id, user_id, body, pinned, created_at").in("channel_id", channelIds).order("created_at", { ascending: true })
      : { data: [] };
    const names = new Map(memberList.map((member) => [member.id, member.name]));
    const loadedMessages = (messageRows ?? []).map((row) => ({ ...row, author: row.user_id === auth.user.id ? displayName : names.get(row.user_id) || "Team member" }));
    setMessages(loadedMessages);
    setChannels((channelRows ?? []).map((row) => ({
      ...row,
      memberCount: memberList.length,
      latest: loadedMessages.filter((item) => item.channel_id === row.id).at(-1),
    })));
    setActiveId((current) => current || channelRows?.[0]?.id || "");
    setBusy(false);
  }, [supabase]);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);

  const active = channels.find((item) => item.id === activeId) ?? channels[0];
  const activeMessages = messages.filter((item) => item.channel_id === active?.id);
  const visibleChannels = channels.filter((item) => {
    const matchesSearch = `${item.name} ${item.latest?.body ?? ""}`.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "All" || (filter === "Archived" && item.archived) || (filter === "Direct" && item.channel_type === "Direct") || (filter === "Groups" && item.channel_type === "Group") || (filter === "Branches" && item.channel_type === "Branch") || (filter === "Announcements" && item.channel_type === "Announcement");
    return matchesSearch && matchesFilter && (filter === "Archived" || !item.archived);
  });

  const sendMessage = async () => {
    const body = message.trim();
    if (!body || !active || !userId) return;
    const { data, error } = await supabase.from("communication_messages").insert({ channel_id: active.id, user_id: userId, body }).select("id, channel_id, user_id, body, pinned, created_at").single();
    if (error) { setNotice(error.message); return; }
    const next = { ...data, author: userName };
    setMessages((current) => [...current, next]);
    setChannels((current) => current.map((channel) => channel.id === active.id ? { ...channel, latest: next } : channel));
    setMessage("");
  };

  const createChannel = async () => {
    if (!orgId || !userId) return;
    const name = window.prompt("Channel name");
    if (!name?.trim()) return;
    const { data, error } = await supabase.from("communication_channels").insert({ org_id: orgId, name: name.trim(), channel_type: "Group", created_by: userId }).select("id, name, channel_type, location_id, archived").single();
    if (error) { setNotice(error.message); return; }
    const channel = { ...data, memberCount: members.length };
    setChannels((current) => [...current, channel]);
    setActiveId(channel.id);
  };

  const archiveChannel = async () => {
    if (!active) return;
    const { error } = await supabase.from("communication_channels").update({ archived: !active.archived }).eq("id", active.id);
    if (error) { setNotice(error.message); return; }
    setChannels((current) => current.map((channel) => channel.id === active.id ? { ...channel, archived: !channel.archived } : channel));
  };

  const togglePin = async (item: Message) => {
    const { error } = await supabase.from("communication_messages").update({ pinned: !item.pinned }).eq("id", item.id);
    if (error) { setNotice(error.message); return; }
    setMessages((current) => current.map((messageItem) => messageItem.id === item.id ? { ...messageItem, pinned: !item.pinned } : messageItem));
  };

  if (busy) return <div className="flex h-[calc(100vh-6.5rem)] items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">Loading communication workspace...</div>;

  return (
    <div className="flex h-[calc(100vh-6.5rem)] min-h-[620px] min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <aside className="flex w-[300px] shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-4">
          <div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Workspace</p><h1 className="mt-1 text-lg font-bold text-slate-900">Communication</h1></div><button onClick={createChannel} className="rounded-xl p-2 text-blue-600 hover:bg-blue-50" title="Create channel"><Plus className="h-4 w-4" /></button></div>
          <div className="relative mt-4"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations..." className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs outline-none focus:border-blue-400" /></div>
          <div className="mt-3 flex gap-1 overflow-x-auto pb-1">{tabs.map((tab) => <button key={tab} onClick={() => setFilter(tab)} className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[10px] font-semibold ${filter === tab ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50"}`}>{tab}</button>)}</div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">{visibleChannels.map((item) => <button key={item.id} onClick={() => setActiveId(item.id)} className={`flex w-full items-start gap-3 rounded-xl p-3 text-left transition ${active?.id === item.id ? "bg-blue-50" : "hover:bg-slate-50"}`}><Avatar label={item.name[0]} color={theme.colors.primary} /><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><strong className="truncate text-xs text-slate-800">{item.name}</strong><span className="shrink-0 text-[10px] text-slate-400">{item.latest ? formatTime(item.latest.created_at) : ""}</span></span><span className="mt-1 block truncate text-[11px] text-slate-500">{item.latest?.body || "No messages yet"}</span><span className="mt-1 flex items-center gap-1 text-[9px] text-slate-400"><Users className="h-3 w-3" /> {item.memberCount} members</span></span></button>)}</div>
        <div className="border-t border-slate-100 p-3"><button onClick={createChannel} className="flex w-full items-center gap-2 rounded-xl border border-dashed border-blue-200 bg-blue-50/50 p-3 text-left text-xs font-semibold text-blue-700"><Plus className="h-4 w-4" /> New team channel</button></div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        {active ? <><header className="flex items-center justify-between border-b border-slate-200 px-5 py-3"><div className="flex items-center gap-3"><Avatar label={active.name[0]} color={theme.colors.primary} /><div><h2 className="text-sm font-bold text-slate-900">{active.name}</h2><p className="text-[10px] text-slate-400">{active.channel_type} · {active.memberCount} members</p></div></div><div className="flex items-center gap-1 text-slate-500"><button onClick={() => setShowDetails((value) => !value)} className="rounded-lg p-2 hover:bg-slate-50" title="Conversation details"><Info className="h-4 w-4" /></button><button onClick={archiveChannel} className="rounded-lg p-2 hover:bg-slate-50" title={active.archived ? "Restore channel" : "Archive channel"}><Archive className="h-4 w-4" /></button><button onClick={() => setNotice("Use the message box to communicate with this channel.")} className="rounded-lg p-2 hover:bg-slate-50" title="More options"><MoreVertical className="h-4 w-4" /></button></div></header>
          <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/40 p-5">{activeMessages.length ? activeMessages.map((item) => <div key={item.id} className={`flex gap-2.5 ${item.user_id === userId ? "justify-end" : ""}`}><Avatar label={initials(item.author)} color={item.user_id === userId ? theme.colors.primary : "#64748b"} /><div className={`max-w-[68%] ${item.user_id === userId ? "items-end" : ""}`}><p className={`mb-1 text-[10px] font-semibold ${item.user_id === userId ? "text-right text-blue-700" : "text-slate-600"}`}>{item.author}</p><div className={`rounded-2xl px-3.5 py-2.5 text-xs leading-5 ${item.user_id === userId ? "rounded-tr-sm bg-blue-600 text-white" : "rounded-tl-sm border border-slate-100 bg-white text-slate-700 shadow-sm"}`}>{item.body}<div className={`mt-1 flex items-center justify-end gap-2 text-[9px] ${item.user_id === userId ? "text-blue-100" : "text-slate-400"}`}>{formatTime(item.created_at)}{item.user_id === userId && <CheckCheck className="h-3 w-3" />}<button onClick={() => togglePin(item)} title={item.pinned ? "Unpin message" : "Pin message"} className="opacity-70 hover:opacity-100"><Pin className={`h-3 w-3 ${item.pinned ? "fill-current" : ""}`} /></button></div></div></div></div>) : <div className="flex h-full items-center justify-center text-sm text-slate-400">Start the conversation in this channel.</div>}</div>
          <div className="border-t border-slate-200 bg-white p-3"><div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5"><button onClick={() => setMessage((current) => `${current}${current ? " " : ""}[Attachment: add a link or file reference]`)} className="rounded-lg p-2 text-slate-500 hover:bg-white" title="Add attachment reference"><Paperclip className="h-4 w-4" /></button><input value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void sendMessage()} placeholder="Type a message..." className="min-w-0 flex-1 bg-transparent px-1 text-xs outline-none" /><button onClick={() => setMessage((current) => `${current}${current ? " " : ""}🙂`)} className="rounded-lg p-2 text-slate-500 hover:bg-white" title="Add emoji"><Smile className="h-4 w-4" /></button><button onClick={() => void sendMessage()} className="rounded-lg p-2 text-white" style={{ background: theme.colors.primary }} title="Send message"><Send className="h-4 w-4" /></button></div></div>
        </> : <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Create a channel to start communicating.</div>}
      </section>
      {showDetails && active && <aside className="hidden w-[255px] shrink-0 border-l border-slate-200 bg-white xl:block"><div className="flex items-center justify-between border-b border-slate-100 p-4"><h3 className="text-xs font-bold text-slate-900">Conversation details</h3><button onClick={() => setShowDetails(false)} className="text-slate-400"><X className="h-4 w-4" /></button></div><div className="space-y-6 p-4"><div className="flex items-center gap-3"><Avatar label={active.name[0]} color={theme.colors.primary} /><div><p className="text-xs font-bold text-slate-800">{active.name}</p><p className="text-[10px] text-slate-400">{active.channel_type} channel</p></div></div><div><p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Members ({members.length})</p><div className="space-y-2">{members.slice(0, 8).map((member) => <div key={member.id} className="flex items-center gap-2"><Avatar label={initials(member.name)} color="#64748b" /><span className="truncate text-xs text-slate-600">{member.name}</span></div>)}</div></div><div><p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Pinned messages</p>{activeMessages.filter((item) => item.pinned).map((item) => <div key={item.id} className="mb-2 rounded-lg bg-amber-50 p-2 text-[10px] text-slate-600"><Pin className="mr-1 inline h-3 w-3 text-amber-600" />{item.body}</div>)}{!activeMessages.some((item) => item.pinned) && <p className="text-xs text-slate-400">No pinned messages.</p>}</div></div></aside>}
      {notice && <button onClick={() => setNotice("")} className="fixed bottom-5 right-5 rounded-xl bg-slate-900 px-4 py-3 text-xs text-white shadow-lg">{notice}</button>}
    </div>
  );
}

function initials(name: string) { return name.split(" ").map((part) => part[0]).join("").toUpperCase().slice(0, 2) || "U"; }
function formatTime(value: string) { return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value)); }
function Avatar({ label, color }: { label: string; color: string }) { return <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: color }}>{label.toUpperCase()}</span>; }
