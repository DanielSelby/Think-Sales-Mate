"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, CheckCheck, Download, FileText, Info, Mic, MoreVertical, Paperclip, Pin, Plus, Search, Send, Smile, Users, Volume2, X } from "lucide-react";
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
  body: string | null;
  attachment_name: string | null;
  attachment_path: string | null;
  attachment_type: string | null;
  attachment_size: number | null;
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
  const [readAt, setReadAt] = useState<Record<string, string>>({});
  const [unreadCount, setUnreadCount] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previousMessageIds = useRef<Set<string>>(new Set());

  const loadWorkspace = useCallback(async (silent = false) => {
    if (!silent) setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      if (!silent) setBusy(false);
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
      if (!silent) setBusy(false);
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
      const defaults = [
        ...(locations ?? []).map((location) => ({ name: location.name, channelType: "Branch" as const, locationId: location.id })),
        { name: "Management Team", channelType: "Group" as const, locationId: null },
      ];
      const createdRows = [];
      for (const channel of defaults) {
        const { data: created, error: createError } = await supabase.rpc("create_communication_channel", {
          p_org_id: membership.org_id,
          p_name: channel.name,
          p_channel_type: channel.channelType,
          p_location_id: channel.locationId,
        });
        if (createError) {
          setNotice(createError.message);
          break;
        }
        if (created?.[0]) {
          const row = created[0];
          createdRows.push({
            id: row.id,
            name: row.name,
            channel_type: row.channel_type,
            location_id: row.location_id,
            archived: row.archived,
          });
        }
      }
      channelRows = createdRows;
    }

    const { data: memberRows } = await supabase
      .from("organization_members")
      .select("user_id, invited_email, username")
      .eq("org_id", membership.org_id)
      .eq("status", "active");
    const memberIds = (memberRows ?? []).map((row) => row.user_id).filter((id): id is string => Boolean(id));
    const { data: profileRows } = memberIds.length ? await supabase.from("profiles").select("id, full_name").in("id", memberIds) : { data: [] };
    const profileNames = new Map((profileRows ?? []).map((profile) => [profile.id, profile.full_name]));
    const memberList = memberIds.map((id) => {
      const row = (memberRows ?? []).find((member) => member.user_id === id);
      return { id, name: id === auth.user.id ? displayName : profileNames.get(id) || row?.username || row?.invited_email?.split("@")[0] || `User ${id.slice(0, 6)}` };
    });
    setMembers(memberList);

    const { data: directMemberships } = await supabase
      .from("communication_channel_members")
      .select("channel_id")
      .eq("user_id", auth.user.id);
    const directIds = new Set((directMemberships ?? []).map((row) => row.channel_id));
    channelRows = (channelRows ?? []).filter((row) => row.channel_type !== "Direct" || directIds.has(row.id));
    const channelIds = channelRows.map((row) => row.id);
    const { data: messageRows } = channelIds.length
      ? await supabase.from("communication_messages").select("id, channel_id, user_id, body, pinned, created_at, attachment_name, attachment_path, attachment_type, attachment_size").in("channel_id", channelIds).order("created_at", { ascending: true })
      : { data: [] };
    const names = new Map(memberList.map((member) => [member.id, member.name]));
    const loadedMessages = (messageRows ?? []).map((row) => ({ ...row, author: row.user_id === auth.user.id ? displayName : names.get(row.user_id) || `User ${row.user_id.slice(0, 6)}` }));
    const storedReadAt = JSON.parse(window.localStorage.getItem(`communication-read-${membership.org_id}-${auth.user.id}`) || "{}") as Record<string, string>;
    setReadAt(storedReadAt);
    const incoming = loadedMessages.filter((item) => item.user_id !== auth.user.id && (!storedReadAt[item.channel_id] || item.created_at > storedReadAt[item.channel_id]));
    setUnreadCount(incoming.length);
    if (silent && incoming.some((item) => !previousMessageIds.current.has(item.id))) playBeep();
    previousMessageIds.current = new Set(loadedMessages.map((item) => item.id));
    setMessages(loadedMessages);
    setChannels(channelRows.map((row) => ({
      ...row,
      memberCount: memberList.length,
      latest: loadedMessages.filter((item) => item.channel_id === row.id).at(-1),
    })));
    setActiveId((current) => current || channelRows?.[0]?.id || "");
    if (!silent) setBusy(false);
  }, [supabase]);

  useEffect(() => {
    void loadWorkspace();
    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadWorkspace(true);
    }, 5000);
    return () => window.clearInterval(refreshTimer);
  }, [loadWorkspace]);

  const active = channels.find((item) => item.id === activeId) ?? channels[0];
  const activeMessages = messages.filter((item) => item.channel_id === active?.id);
  const visibleChannels = channels.filter((item) => {
    const matchesSearch = `${item.name} ${item.latest?.body ?? ""}`.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "All" || (filter === "Unread" && Boolean(item.latest && item.latest.user_id !== userId && (!readAt[item.id] || item.latest.created_at > readAt[item.id]))) || (filter === "Archived" && item.archived) || (filter === "Direct" && item.channel_type === "Direct") || (filter === "Groups" && item.channel_type === "Group") || (filter === "Branches" && item.channel_type === "Branch") || (filter === "Announcements" && item.channel_type === "Announcement");
    return matchesSearch && matchesFilter && (filter === "Archived" || !item.archived);
  });

  useEffect(() => {
    if (active?.id) markRead(active.id);
  }, [active?.id]);

  const markRead = (channelId: string) => {
    const timestamp = new Date().toISOString();
    const next = { ...readAt, [channelId]: timestamp };
    setReadAt(next);
    setUnreadCount(messages.filter((item) => item.user_id !== userId && item.channel_id !== channelId && (!next[item.channel_id] || item.created_at > next[item.channel_id])).length);
    if (orgId && userId) window.localStorage.setItem(`communication-read-${orgId}-${userId}`, JSON.stringify(next));
  };

  const sendMessage = async () => {
    const body = message.trim();
    if (!body || !active || !userId) return;
    const { data, error } = await supabase.from("communication_messages").insert({ channel_id: active.id, user_id: userId, body }).select("id, channel_id, user_id, body, pinned, created_at, attachment_name, attachment_path, attachment_type, attachment_size").single();
    if (error) { setNotice(error.message); return; }
    const next = { ...data, author: userName };
    setMessages((current) => [...current, next]);
    setChannels((current) => current.map((channel) => channel.id === active.id ? { ...channel, latest: next } : channel));
    setMessage("");
  };

  const sendVoiceNote = async (blob: Blob) => {
    if (!active || !userId || !orgId) return;
    const path = `${orgId}/${active.id}/${userId}/${Date.now()}-voice.webm`;
    const file = new File([blob], "voice-note.webm", { type: blob.type || "audio/webm" });
    const { error: uploadError } = await supabase.storage.from("communication-files").upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) { setNotice(uploadError.message); return; }
    const { data, error } = await supabase.from("communication_messages").insert({ channel_id: active.id, user_id: userId, body: null, attachment_name: file.name, attachment_path: path, attachment_type: file.type, attachment_size: file.size }).select("id, channel_id, user_id, body, pinned, created_at, attachment_name, attachment_path, attachment_type, attachment_size").single();
    if (error || !data) { setNotice(error?.message ?? "Could not send voice note."); return; }
    const next = { ...data, author: userName };
    setMessages((current) => [...current, next]);
    setChannels((current) => current.map((channel) => channel.id === active.id ? { ...channel, latest: next } : channel));
  };

  const toggleVoiceRecording = async () => {
    if (isRecording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) { setNotice("Voice recording is not supported in this browser."); return; }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    recordingChunksRef.current = [];
    recorder.ondataavailable = (event) => { if (event.data.size) recordingChunksRef.current.push(event.data); };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      void sendVoiceNote(new Blob(recordingChunksRef.current, { type: recorder.mimeType || "audio/webm" }));
    };
    mediaRecorderRef.current = recorder;
    recorder.start();
    setIsRecording(true);
  };

  const addFileReference = async (file: File | undefined) => {
    if (!file) return;
    if (!active || !orgId || !userId) return;
    if (file.size > 25 * 1024 * 1024) { setNotice("Files must be 25 MB or smaller."); return; }
    setNotice(`Uploading ${file.name}...`);
    const path = `${orgId}/${active.id}/${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: uploadError } = await supabase.storage.from("communication-files").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (uploadError) { setNotice(uploadError.message); return; }
    const { data, error } = await supabase.from("communication_messages").insert({ channel_id: active.id, user_id: userId, body: message.trim() || null, attachment_name: file.name, attachment_path: path, attachment_type: file.type || "application/octet-stream", attachment_size: file.size }).select("id, channel_id, user_id, body, pinned, created_at, attachment_name, attachment_path, attachment_type, attachment_size").single();
    if (error) { setNotice(error.message); return; }
    const next = { ...data, author: userName };
    setMessages((current) => [...current, next]);
    setChannels((current) => current.map((channel) => channel.id === active.id ? { ...channel, latest: next } : channel));
    setMessage("");
    setNotice(`Attached ${file.name}.`);
  };

  const createChannel = async () => {
    if (!orgId || !userId) return;
    const name = window.prompt("Channel name");
    if (!name?.trim()) return;
    const { data: created, error } = await supabase.rpc("create_communication_channel", { p_org_id: orgId, p_name: name.trim(), p_channel_type: "Group", p_location_id: null });
    const data = created?.[0];
    if (error || !data) { setNotice(error?.message ?? "Could not create the channel."); return; }
    const channel = { ...data, memberCount: members.length };
    setChannels((current) => [...current, channel]);
    setActiveId(channel.id);
  };

  const startDirectChat = async (member: { id: string; name: string }) => {
    if (!orgId || !userId) return;
    const existing = channels.find((channel) => channel.channel_type === "Direct" && channel.name === member.name);
    if (existing) { setActiveId(existing.id); return; }
    const { data: created, error } = await supabase.rpc("create_communication_channel", { p_org_id: orgId, p_name: member.name, p_channel_type: "Direct", p_location_id: null });
    const data = created?.[0];
    if (error || !data) { setNotice(error?.message ?? "Could not create the direct channel."); return; }
    const { error: memberError } = await supabase.from("communication_channel_members").insert([{ channel_id: data.id, user_id: userId }, { channel_id: data.id, user_id: member.id }]);
    if (memberError) { setNotice(memberError.message); return; }
    const channel = { ...data, memberCount: 2 };
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
          <div className="mt-3 flex gap-1 overflow-x-auto pb-1">{tabs.map((tab) => <button key={tab} onClick={() => setFilter(tab)} className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[10px] font-semibold ${filter === tab ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50"}`}>{tab}{tab === "Unread" && unreadCount > 0 && <span className="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] text-white">{unreadCount}</span>}</button>)}</div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">{filter === "Direct" && <div className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Start a direct chat</div>}{filter === "Direct" && members.filter((member) => member.id !== userId).map((member) => <button key={member.id} onClick={() => void startDirectChat(member)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-slate-50"><Avatar label={initials(member.name)} color={theme.colors.primary} /><span className="text-xs font-semibold text-slate-800">{member.name}</span></button>)}{visibleChannels.map((item) => <button key={item.id} onClick={() => { setActiveId(item.id); markRead(item.id); }} className={`flex w-full items-start gap-3 rounded-xl p-3 text-left transition ${active?.id === item.id ? "bg-blue-50" : "hover:bg-slate-50"}`}><Avatar label={item.name[0]} color={theme.colors.primary} /><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><strong className="truncate text-xs text-slate-800">{item.name}</strong><span className="shrink-0 text-[10px] text-slate-400">{item.latest ? formatTime(item.latest.created_at) : ""}</span></span><span className="mt-1 block truncate text-[11px] text-slate-500">{item.latest?.body || (item.latest?.attachment_name ? `📎 ${item.latest.attachment_name}` : "No messages yet")}</span><span className="mt-1 flex items-center gap-1 text-[9px] text-slate-400"><Users className="h-3 w-3" /> {item.memberCount} members</span></span></button>)}</div>
        <div className="border-t border-slate-100 p-3"><button onClick={createChannel} className="flex w-full items-center gap-2 rounded-xl border border-dashed border-blue-200 bg-blue-50/50 p-3 text-left text-xs font-semibold text-blue-700"><Plus className="h-4 w-4" /> {filter === "Groups" ? "Create group" : "New team channel"}</button></div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        {active ? <><header className="flex items-center justify-between border-b border-slate-200 px-5 py-3"><div className="flex items-center gap-3"><Avatar label={active.name[0]} color={theme.colors.primary} /><div><h2 className="text-sm font-bold text-slate-900">{active.name}</h2><p className="text-[10px] text-slate-400">{active.channel_type} · {active.memberCount} members</p></div></div><div className="flex items-center gap-1 text-slate-500"><button onClick={() => setShowDetails((value) => !value)} className="rounded-lg p-2 hover:bg-slate-50" title="Conversation details"><Info className="h-4 w-4" /></button><button onClick={archiveChannel} className="rounded-lg p-2 hover:bg-slate-50" title={active.archived ? "Restore channel" : "Archive channel"}><Archive className="h-4 w-4" /></button><button onClick={() => setNotice("Use the message box to communicate with this channel.")} className="rounded-lg p-2 hover:bg-slate-50" title="More options"><MoreVertical className="h-4 w-4" /></button></div></header>
          <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/40 p-5">{activeMessages.length ? activeMessages.map((item) => <div key={item.id} className={`flex gap-2.5 ${item.user_id === userId ? "justify-end" : ""}`}><Avatar label={initials(item.author)} color={item.user_id === userId ? theme.colors.primary : "#64748b"} /><div className={`max-w-[68%] ${item.user_id === userId ? "items-end" : ""}`}><p className={`mb-1 text-[10px] font-semibold ${item.user_id === userId ? "text-right text-blue-700" : "text-slate-600"}`}>{item.author}</p><div className={`rounded-2xl px-3.5 py-2.5 text-xs leading-5 ${item.user_id === userId ? "rounded-tr-sm bg-blue-600 text-white" : "rounded-tl-sm border border-slate-100 bg-white text-slate-700 shadow-sm"}`}>{item.body && <p>{item.body}</p>}{item.attachment_path && (item.attachment_type?.startsWith("audio/") ? <audio controls src={supabase.storage.from("communication-files").getPublicUrl(item.attachment_path).data.publicUrl} className="mt-1 max-w-full" /> : <a href={supabase.storage.from("communication-files").getPublicUrl(item.attachment_path).data.publicUrl} target="_blank" rel="noreferrer" download={item.attachment_name ?? undefined} className="mt-1 flex items-center gap-2 rounded-lg bg-black/10 px-2 py-1.5 underline"><FileText className="h-4 w-4 shrink-0" />{item.attachment_name}<Download className="ml-auto h-3 w-3" /></a>)}<div className={`mt-1 flex items-center justify-end gap-2 text-[9px] ${item.user_id === userId ? "text-blue-100" : "text-slate-400"}`}>{formatTime(item.created_at)}{item.user_id === userId && <CheckCheck className="h-3 w-3" />}<button onClick={() => togglePin(item)} title={item.pinned ? "Unpin message" : "Pin message"} className="opacity-70 hover:opacity-100"><Pin className={`h-3 w-3 ${item.pinned ? "fill-current" : ""}`} /></button></div></div></div></div>) : <div className="flex h-full items-center justify-center text-sm text-slate-400">Start the conversation in this channel.</div>}</div>
          <div className="border-t border-slate-200 bg-white p-3">
            <input ref={fileInputRef} type="file" className="hidden" onChange={(event) => { addFileReference(event.target.files?.[0]); event.currentTarget.value = ""; }} />
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5">
              <button onClick={() => fileInputRef.current?.click()} className="rounded-lg p-2 text-slate-500 hover:bg-white" title="Attach a file"><Paperclip className="h-4 w-4" /></button>
              <button onClick={() => void toggleVoiceRecording()} className={`rounded-lg p-2 ${isRecording ? "bg-red-100 text-red-600" : "text-slate-500 hover:bg-white"}`} title={isRecording ? "Stop recording" : "Record voice note"}><Mic className="h-4 w-4" /></button>
              <input value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void sendMessage()} placeholder="Type a message..." className="min-w-0 flex-1 bg-transparent px-1 text-xs outline-none" />
              <button onClick={() => setMessage((current) => `${current}${current ? " " : ""}🙂`)} className="rounded-lg p-2 text-slate-500 hover:bg-white" title="Add emoji"><Smile className="h-4 w-4" /></button>
              <button onClick={() => void sendMessage()} className="rounded-lg p-2 text-white" style={{ background: theme.colors.primary }} title="Send message"><Send className="h-4 w-4" /></button>
            </div>
          </div>
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
function playBeep() {
  if (typeof window === "undefined") return;
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.035, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.15);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.15);
}
