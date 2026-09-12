"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, BarChart3, CheckCheck, Download, FileText, Info, ListTodo, Megaphone, Mic, MoreVertical, MonitorUp, Paperclip, Phone, Pin, Plus, Search, Send, Smile, Users, Video, X, Workflow } from "lucide-react";
import { useAppStore, THEMES } from "@/store/useAppStore";
import { createClient } from "@/lib/supabase/client";

type Channel = {
  id: string;
  name: string;
  channel_type: "Branch" | "Group" | "Direct" | "Announcement";
  location_id: string | null;
  created_by: string | null;
  archived: boolean;
  memberCount: number;
  latest?: Message;
};

type Branch = { id: string; name: string };
type Member = { id: string; name: string; locationId: string | null; branchScope: "all" | "assigned" | "single"; secondaryLocationIds: string[] };

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
  reactions?: Array<{ reaction: string; count: number; reacted: boolean }>;
};

type Announcement = { id: string; title: string; body: string; announcement_type: string; priority: string; created_at: string; };
type Template = { id: string; name: string; category: string; template_code: string; subject: string | null; content: string; channel: string; branch_scope: string; status: string; version: number; created_at: string; };
type Automation = { id: string; event: string; template_id: string | null; channel: string; enabled: boolean; send_mode: string; };
type MessageHistory = { id: string; event: string | null; channel: string; recipient: string | null; status: string; rendered_content: string; created_at: string; };
const tabs = ["All", "Unread", "Direct", "Groups", "Branches", "Announcements", "Archived"];

export default function CommunicationPage() {
  const { activeTheme } = useAppStore();
  const theme = THEMES[activeTheme];
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState("");
  const [orgId, setOrgId] = useState("");
  const [userName, setUserName] = useState("You");
  const [canManageChannels, setCanManageChannels] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("all");
  const [channelMemberIds, setChannelMemberIds] = useState<Record<string, string[]>>({});
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
  const [workspaceTab, setWorkspaceTab] = useState<"chat" | "dashboard" | "announcements" | "templates" | "automations" | "history" | "approvals" | "template-analytics">("chat");
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [call, setCall] = useState<{ id?: string; type: "voice" | "video"; startedAt: number; stream?: MediaStream } | null>(null);
  const [incomingCall, setIncomingCall] = useState<{ id: string; type: "voice" | "video"; channelId: string; callerName: string } | null>(null);
  const [screenSharing, setScreenSharing] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [callMuted, setCallMuted] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const callVideoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [messageHistory, setMessageHistory] = useState<MessageHistory[]>([]);
  const [showTeamComposer, setShowTeamComposer] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamMemberIds, setTeamMemberIds] = useState<string[]>([]);
  const [managingMembers, setManagingMembers] = useState(false);
  const [managedMemberIds, setManagedMemberIds] = useState<string[]>([]);

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
      .select("org_id, role")
      .eq("user_id", auth.user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!membership?.org_id) {
      if (!silent) setBusy(false);
      return;
    }
    setOrgId(membership.org_id);
    setCanManageChannels(membership.role === "owner" || membership.role === "admin");
    const { data: locationRows } = await supabase
      .from("business_locations")
      .select("id, name")
      .eq("org_id", membership.org_id)
      .eq("is_active", true)
      .order("name");
    setBranches((locationRows ?? []) as Branch[]);
    setSelectedBranchId((current) => current === "all" || (locationRows ?? []).some((row) => row.id === current) ? current : "all");
    const [{ data: templateRows }, { data: automationRows }, { data: historyRows }] = await Promise.all([
      (supabase as any).from("communication_templates").select("id, name, category, template_code, subject, content, channel, branch_scope, status, version, created_at").eq("org_id", membership.org_id).order("created_at", { ascending: false }),
      (supabase as any).from("communication_automations").select("id, event, template_id, channel, enabled, send_mode").eq("org_id", membership.org_id).order("event"),
      (supabase as any).from("communication_message_history").select("id, event, channel, recipient, status, rendered_content, created_at").eq("org_id", membership.org_id).order("created_at", { ascending: false }).limit(100)
    ]);
    setTemplates((templateRows ?? []) as Template[]);
    setAutomations((automationRows ?? []) as Automation[]);
    setMessageHistory((historyRows ?? []) as MessageHistory[]);
    const { data: announcementRows } = await (supabase as any)
      .from("communication_announcements")
      .select("id, title, body, announcement_type, priority, created_at")
      .eq("org_id", membership.org_id)
      .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
      .order("created_at", { ascending: false });
    setAnnouncements((announcementRows ?? []) as Announcement[]);

    let { data: channelRows } = await supabase
      .from("communication_channels")
      .select("id, name, channel_type, location_id, created_by, archived")
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
            created_by: row.created_by,
            archived: row.archived,
          });
        }
      }
      channelRows = createdRows;
    }

    const { data: memberRows } = await supabase
      .from("organization_members")
      .select("user_id, invited_email, username, location_id, branch_scope, secondary_location_ids")
      .eq("org_id", membership.org_id)
      .eq("status", "active");
    const memberIds = (memberRows ?? []).map((row) => row.user_id).filter((id): id is string => Boolean(id));
    const { data: profileRows } = memberIds.length ? await supabase.from("profiles").select("id, full_name").in("id", memberIds) : { data: [] };
    const profileNames = new Map((profileRows ?? []).map((profile) => [profile.id, profile.full_name]));
    const memberList = memberIds.map((id) => {
      const row = (memberRows ?? []).find((member) => member.user_id === id);
      return {
        id,
        name: id === auth.user.id ? displayName : profileNames.get(id) || row?.username || row?.invited_email?.split("@")[0] || `User ${id.slice(0, 6)}`,
        locationId: row?.location_id ?? null,
        branchScope: (row?.branch_scope ?? "assigned") as Member["branchScope"],
        secondaryLocationIds: row?.secondary_location_ids ?? []
      };
    });
    setMembers(memberList);

    const { data: directMemberships } = await supabase
      .from("communication_channel_members")
      .select("channel_id")
      .eq("user_id", auth.user.id);
    const directIds = new Set((directMemberships ?? []).map((row) => row.channel_id));
    channelRows = (channelRows ?? []).filter((row) => row.channel_type !== "Direct" || directIds.has(row.id));
    const channelIds = channelRows.map((row) => row.id);
    const { data: channelMemberRows } = channelIds.length
      ? await supabase.from("communication_channel_members").select("channel_id, user_id").in("channel_id", channelIds)
      : { data: [] };
    const memberMap = (channelMemberRows ?? []).reduce<Record<string, string[]>>((result, row) => {
      (result[row.channel_id] ??= []).push(row.user_id);
      return result;
    }, {});
    setChannelMemberIds(memberMap);
    const { data: messageRows } = channelIds.length
      ? await supabase.from("communication_messages").select("id, channel_id, user_id, body, pinned, created_at, attachment_name, attachment_path, attachment_type, attachment_size").in("channel_id", channelIds).order("created_at", { ascending: true })
      : { data: [] };
    const names = new Map(memberList.map((member) => [member.id, member.name]));
    const messageIds = (messageRows ?? []).map((row) => row.id);
    const { data: reactionRowsRaw } = messageIds.length
      ? await (supabase as any).from("communication_reactions").select("message_id, reaction, user_id").in("message_id", messageIds)
      : { data: [] };
    const reactionRows = (reactionRowsRaw ?? []) as Array<{ message_id: string; reaction: string; user_id: string }>;
    const loadedMessages = (messageRows ?? []).map((row) => ({
      ...row,
      author: row.user_id === auth.user.id ? displayName : names.get(row.user_id) || `User ${row.user_id.slice(0, 6)}`,
      reactions: Array.from(new Set((reactionRows ?? []).filter((reaction) => reaction.message_id === row.id).map((reaction) => reaction.reaction))).map((reaction) => ({
        reaction,
        count: (reactionRows ?? []).filter((item) => item.message_id === row.id && item.reaction === reaction).length,
        reacted: (reactionRows ?? []).some((item) => item.message_id === row.id && item.reaction === reaction && item.user_id === auth.user.id)
      }))
    }));
    const storedReadAt = JSON.parse(window.localStorage.getItem(`communication-read-${membership.org_id}-${auth.user.id}`) || "{}") as Record<string, string>;
    setReadAt(storedReadAt);
    const incoming = loadedMessages.filter((item) => item.user_id !== auth.user.id && (!storedReadAt[item.channel_id] || item.created_at > storedReadAt[item.channel_id]));
    setUnreadCount(incoming.length);
    if (silent && incoming.some((item) => !previousMessageIds.current.has(item.id))) playBeep();
    previousMessageIds.current = new Set(loadedMessages.map((item) => item.id));
    setMessages(loadedMessages);
    setChannels(channelRows.map((row) => ({
      ...row,
      memberCount: memberMap[row.id]?.length || (row.channel_type === "Direct" ? 0 : memberList.length),
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

  useEffect(() => {
    if (!orgId || !activeId) return;
    const realtime = supabase
      .channel(`communication-messages:${orgId}:${activeId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "communication_messages", filter: `channel_id=eq.${activeId}` }, (payload) => {
        const incoming = payload.new as Message;
        if (!incoming.id) return;
        const author = members.find((member) => member.id === incoming.user_id)?.name || `User ${incoming.user_id.slice(0, 6)}`;
        let added = false;
        setMessages((current) => {
          if (current.some((item) => item.id === incoming.id)) return current;
          added = true;
          return [...current, { ...incoming, author }];
        });
        if (added) {
          setChannels((current) => current.map((channel) => channel.id === activeId ? { ...channel, latest: { ...incoming, author } } : channel));
          if (incoming.user_id !== userId) playBeep();
        }
      })
      .subscribe();
    return () => { void supabase.removeChannel(realtime); };
  }, [activeId, members, orgId, supabase, userId]);

  useEffect(() => {
    if (!orgId || !channels.length || !userId) return;
    let disposed = false;
    const findIncomingCall = async () => {
      const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { data, error } = await (supabase as any)
        .from("communication_calls")
        .select("id, channel_id, started_by, call_type, ended_at, started_at, metadata")
        .eq("org_id", orgId)
        .neq("started_by", userId)
        .is("ended_at", null)
        .gte("started_at", cutoff)
        .order("started_at", { ascending: false })
        .limit(10);
      if (error || disposed) return;
      const ringing = (data ?? []).find((candidate: {
        id: string;
        channel_id: string | null;
        started_by: string;
        call_type: "voice" | "video";
        ended_at: string | null;
        metadata?: { status?: string } | null;
      }) => candidate.channel_id
        && candidate.metadata?.status === "ringing"
        && channels.some((channel) => channel.id === candidate.channel_id));
      if (!ringing) return;
      const callerName = members.find((member) => member.id === ringing.started_by)?.name ?? "A team member";
      let isNew = false;
      setIncomingCall((current) => {
        if (current?.id === ringing.id) return current;
        isNew = true;
        return { id: ringing.id, type: ringing.call_type, channelId: ringing.channel_id as string, callerName };
      });
      if (isNew) playBeep();
    };
    void findIncomingCall();
    const pollTimer = window.setInterval(() => void findIncomingCall(), 2000);
    const realtime = supabase
      .channel(`communication-calls:${orgId}:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "communication_calls", filter: `org_id=eq.${orgId}` }, (payload) => {
        const incoming = payload.new as { id: string; channel_id: string | null; started_by: string; call_type: "voice" | "video"; ended_at: string | null; metadata?: { status?: string } | null };
        if (!incoming.id || incoming.started_by === userId || incoming.ended_at || incoming.metadata?.status !== "ringing" || !incoming.channel_id) return;
        const channel = channels.find((item) => item.id === incoming.channel_id);
        if (!channel) return;
        const callerName = members.find((member) => member.id === incoming.started_by)?.name ?? "A team member";
        let isNew = false;
        setIncomingCall((current) => {
          if (current?.id === incoming.id) return current;
          isNew = true;
          return { id: incoming.id, type: incoming.call_type, channelId: incoming.channel_id as string, callerName };
        });
        if (isNew) playBeep();
      })
      .subscribe();
    return () => {
      disposed = true;
      window.clearInterval(pollTimer);
      void supabase.removeChannel(realtime);
    };
  }, [channels, members, orgId, supabase, userId]);

  useEffect(() => {
    if (!call) return;
    const timer = window.setInterval(() => setCallSeconds(Math.floor((Date.now() - call.startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [call]);

  useEffect(() => {
    if (callVideoRef.current) {
      callVideoRef.current.srcObject = call?.type === "video" ? call.stream ?? null : null;
    }
  }, [call]);

  useEffect(() => {
    if (screenVideoRef.current) screenVideoRef.current.srcObject = screenStream;
  }, [screenStream]);

  useEffect(() => {
    const paths = messages.map((item) => item.attachment_path).filter((path): path is string => Boolean(path && !attachmentUrls[path]));
    if (!paths.length) return;
    let cancelled = false;
    void Promise.all(paths.map(async (path) => {
      const { data } = await supabase.storage.from("communication-files").createSignedUrl(path, 60 * 60);
      return [path, data?.signedUrl] as const;
    })).then((urls) => {
      if (cancelled) return;
      setAttachmentUrls((current) => Object.fromEntries([
        ...Object.entries(current),
        ...urls.filter((entry): entry is [string, string] => Boolean(entry[1]))
      ]));
    });
    return () => { cancelled = true; };
  }, [attachmentUrls, messages, supabase]);

  const active = channels.find((item) => item.id === activeId) ?? channels[0];
  const activeMessages = messages.filter((item) => item.channel_id === active?.id);
  const memberInBranchScope = (member: Member) => {
    if (member.id === userId) return false;
    if (member.branchScope === "all") return true;
    if (selectedBranchId === "all") {
      return branches.some((branch) => member.locationId === branch.id || member.secondaryLocationIds.includes(branch.id));
    }
    return member.locationId === selectedBranchId || member.secondaryLocationIds.includes(selectedBranchId);
  };
  const visibleMembers = members.filter(memberInBranchScope);
  const visibleChannels = channels.filter((item) => {
    const matchesSearch = `${item.name} ${item.latest?.body ?? ""}`.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "All" || (filter === "Unread" && Boolean(item.latest && item.latest.user_id !== userId && (!readAt[item.id] || item.latest.created_at > readAt[item.id]))) || (filter === "Archived" && item.archived) || (filter === "Direct" && item.channel_type === "Direct") || (filter === "Groups" && item.channel_type === "Group") || (filter === "Branches" && item.channel_type === "Branch") || (filter === "Announcements" && item.channel_type === "Announcement");
    const matchesBranch = selectedBranchId === "all" || item.location_id === selectedBranchId;
    return matchesSearch && matchesFilter && matchesBranch && (filter === "Archived" || !item.archived);
  });

  useEffect(() => {
    if (visibleChannels.length && !visibleChannels.some((channel) => channel.id === activeId)) {
      setActiveId(visibleChannels[0].id);
    }
  }, [activeId, visibleChannels]);

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

  const openTeamComposer = () => {
    setTeamName("");
    setTeamMemberIds([userId]);
    setShowTeamComposer(true);
  };

  const createChannel = async () => {
    if (!orgId || !userId || !teamName.trim()) return;
    const { data: created, error } = await supabase.rpc("create_communication_channel", {
      p_org_id: orgId,
      p_name: teamName.trim(),
      p_channel_type: "Group",
      p_location_id: selectedBranchId === "all" ? null : selectedBranchId
    });
    const data = created?.[0];
    if (error || !data) { setNotice(error?.message ?? "Could not create the channel."); return; }
    const selectedMembers = Array.from(new Set([userId, ...teamMemberIds]));
    const { error: memberError } = await supabase.from("communication_channel_members").insert(selectedMembers.map((memberId) => ({ channel_id: data.id, user_id: memberId })));
    if (memberError) { setNotice(memberError.message); return; }
    const channel = { ...data, memberCount: selectedMembers.length };
    setChannelMemberIds((current) => ({ ...current, [channel.id]: selectedMembers }));
    setChannels((current) => [...current, channel]);
    setActiveId(channel.id);
    setShowTeamComposer(false);
  };

  const startDirectChat = async (member: Member) => {
    if (!orgId || !userId) return;
    const existing = channels.find((channel) => channel.channel_type === "Direct"
      && (selectedBranchId === "all" || channel.location_id === selectedBranchId)
      && ((channelMemberIds[channel.id] ?? []).includes(member.id) || channel.name === member.name));
    if (existing) { setActiveId(existing.id); return; }
    const memberBranchId = member.locationId ?? branches.find((branch) => member.secondaryLocationIds.includes(branch.id))?.id ?? branches[0]?.id ?? null;
    const { data: created, error } = await supabase.rpc("create_communication_channel", {
      p_org_id: orgId,
      p_name: member.name,
      p_channel_type: "Direct",
      p_location_id: selectedBranchId === "all" ? memberBranchId : selectedBranchId
    });
    const data = created?.[0];
    if (error || !data) { setNotice(error?.message ?? "Could not create the direct channel."); return; }
    const { error: memberError } = await supabase.from("communication_channel_members").insert([{ channel_id: data.id, user_id: userId }, { channel_id: data.id, user_id: member.id }]);
    if (memberError) { setNotice(memberError.message); return; }
    const channel = { ...data, memberCount: 2 };
    setChannelMemberIds((current) => ({ ...current, [channel.id]: [userId, member.id] }));
    setChannels((current) => [...current, channel]);
    setActiveId(channel.id);
  };

  const saveMembership = async () => {
    if (!active || !userId || active.channel_type === "Direct") return;
    const currentIds = channelMemberIds[active.id] ?? [];
    const nextIds = Array.from(new Set([userId, ...managedMemberIds]));
    const additions = nextIds.filter((id) => !currentIds.includes(id));
    const removals = currentIds.filter((id) => id !== userId && !nextIds.includes(id));
    if (additions.length) {
      const { error } = await supabase.from("communication_channel_members").insert(additions.map((id) => ({ channel_id: active.id, user_id: id })));
      if (error) { setNotice(error.message); return; }
    }
    for (const id of removals) {
      const { error } = await supabase.from("communication_channel_members").delete().eq("channel_id", active.id).eq("user_id", id);
      if (error) { setNotice(error.message); return; }
    }
    setChannelMemberIds((current) => ({ ...current, [active.id]: nextIds }));
    setChannels((current) => current.map((channel) => channel.id === active.id ? { ...channel, memberCount: nextIds.length } : channel));
    setManagingMembers(false);
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

  const toggleReaction = async (item: Message, reaction = "👍") => {
    if (!userId) return;
    const existing = item.reactions?.some((entry) => entry.reaction === reaction && entry.reacted);
    const query = (supabase as any).from("communication_reactions").delete().eq("message_id", item.id).eq("user_id", userId).eq("reaction", reaction);
    const result = existing ? await query : await (supabase as any).from("communication_reactions").insert({ message_id: item.id, user_id: userId, reaction });
    if (result.error) { setNotice(result.error.message); return; }
    void loadWorkspace(true);
  };

  const startCall = async (type: "voice" | "video") => {
    if (!active || !orgId || !userId) return;
    if (!navigator.mediaDevices?.getUserMedia) { setNotice("Calling is not supported in this browser."); return; }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === "video" });
    } catch (error) {
      setNotice(error instanceof DOMException && error.name === "NotAllowedError"
        ? "Microphone/camera permission was denied. Allow access in your browser settings and try again."
        : "Could not access your microphone or camera.");
      return;
    }
    const { data, error } = await (supabase as any).from("communication_calls").insert({ org_id: orgId, channel_id: active.id, started_by: userId, call_type: type, metadata: { status: "ringing" } }).select("id").single();
    if (error) { stream.getTracks().forEach((track) => track.stop()); setNotice(error.message); return; }
    setCallSeconds(0);
    setCallMuted(false);
    setCameraEnabled(type === "video");
    setCall({ id: data.id, type, startedAt: Date.now(), stream });
  };

  const answerCall = async () => {
    if (!incomingCall) return;
    if (!navigator.mediaDevices?.getUserMedia) { setNotice("Calling is not supported in this browser."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: incomingCall.type === "video" });
      await (supabase as any).from("communication_calls").update({ metadata: { status: "accepted", accepted_by: userId } }).eq("id", incomingCall.id);
      setActiveId(incomingCall.channelId);
      setCall({ id: incomingCall.id, type: incomingCall.type, startedAt: Date.now(), stream });
      setCallSeconds(0);
      setCallMuted(false);
      setCameraEnabled(incomingCall.type === "video");
      setIncomingCall(null);
    } catch {
      setNotice("Could not access your microphone or camera.");
    }
  };

  const declineCall = async () => {
    if (!incomingCall) return;
    await (supabase as any).from("communication_calls").update({ ended_at: new Date().toISOString(), metadata: { status: "declined", declined_by: userId } }).eq("id", incomingCall.id);
    setIncomingCall(null);
  };

  const endCall = async () => {
    if (!call) return;
    call.stream?.getTracks().forEach((track) => track.stop());
    screenStream?.getTracks().forEach((track) => track.stop());
    if (call.id) await (supabase as any).from("communication_calls").update({ ended_at: new Date().toISOString() }).eq("id", call.id);
    setCall(null);
    setScreenStream(null);
    setScreenSharing(false);
  };

  const toggleScreenShare = async () => {
    if (screenSharing) {
      screenStream?.getTracks().forEach((track) => track.stop());
      setScreenStream(null);
      setScreenSharing(false);
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) { setNotice("Screen sharing is not supported in this browser."); return; }
    if (!call) { setNotice("Start a voice or video call before sharing your screen."); return; }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError") return;
      setNotice("Could not start screen sharing.");
      return;
    }
    stream.getVideoTracks()[0]?.addEventListener("ended", () => {
      setScreenStream(null);
      setScreenSharing(false);
    });
    setScreenStream(stream);
    setScreenSharing(true);
  };

  const toggleCallMute = () => {
    if (!call?.stream) return;
    const nextMuted = !callMuted;
    call.stream.getAudioTracks().forEach((track) => { track.enabled = !nextMuted; });
    setCallMuted(nextMuted);
  };

  const toggleCamera = () => {
    if (!call?.stream || call.type !== "video") return;
    const nextEnabled = !cameraEnabled;
    call.stream.getVideoTracks().forEach((track) => { track.enabled = nextEnabled; });
    setCameraEnabled(nextEnabled);
  };

  const createAnnouncement = async () => {
    if (!orgId || !userId) return;
    const title = window.prompt("Announcement title");
    const body = title ? window.prompt("Announcement message") : null;
    if (!title?.trim() || !body?.trim()) return;
    const { data, error } = await (supabase as any).from("communication_announcements")
      .insert({ org_id: orgId, created_by: userId, title: title.trim(), body: body.trim(), announcement_type: "Company Announcement", priority: "Important" })
      .select("id, title, body, announcement_type, priority, created_at").single();
    if (error) { setNotice(error.message); return; }
    setAnnouncements((current) => [data as Announcement, ...current]);
  };

  const createTaskFromMessage = async (item: Message) => {
    if (!orgId || !userId || !active) return;
    const title = window.prompt("Task title", item.body ?? "Follow up from communication");
    if (!title?.trim()) return;
    const { error } = await (supabase as any).from("communication_tasks").insert({ org_id: orgId, channel_id: active.id, message_id: item.id, created_by: userId, title: title.trim() });
    if (error) setNotice(error.message); else setNotice("Task created.");
  };

  const createTemplate = async () => {
    if (!orgId || !userId) return;
    const name = window.prompt("Template name");
    if (!name?.trim()) return;
    const content = window.prompt("Message content. Variables such as {{customer_name}} are supported.");
    if (!content?.trim()) return;
    const code = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const { data, error } = await (supabase as any).from("communication_templates").insert({
      org_id: orgId, name: name.trim(), category: "Custom Templates", template_code: code,
      content: content.trim(), channel: "SMS", created_by: userId
    }).select("id, name, category, template_code, subject, content, channel, branch_scope, status, version, created_at").single();
    if (error) { setNotice(error.message); return; }
    setTemplates((current) => [data as Template, ...current]);
  };

  const updateTemplateStatus = async (template: Template, status: string) => {
    const { error } = await (supabase as any).from("communication_templates").update({ status, updated_at: new Date().toISOString(), approved_by: status === "Approved" ? userId : null }).eq("id", template.id);
    if (error) { setNotice(error.message); return; }
    setTemplates((current) => current.map((item) => item.id === template.id ? { ...item, status } : item));
  };

  const toggleAutomation = async (automation: Automation) => {
    const { error } = await (supabase as any).from("communication_automations").update({ enabled: !automation.enabled, updated_at: new Date().toISOString() }).eq("id", automation.id);
    if (error) { setNotice(error.message); return; }
    setAutomations((current) => current.map((item) => item.id === automation.id ? { ...item, enabled: !item.enabled } : item));
  };

  const saveAutomation = async () => {
    if (!orgId || !userId || !templates.length) { setNotice("Create an approved template first."); return; }
    const event = window.prompt("Automation event", "Payment Received");
    if (!event?.trim()) return;
    const { data, error } = await (supabase as any).from("communication_automations").upsert({
      org_id: orgId, event: event.trim(), template_id: templates[0].id, channel: templates[0].channel, enabled: false, created_by: userId
    }, { onConflict: "org_id,event" }).select("id, event, template_id, channel, enabled, send_mode").single();
    if (error) { setNotice(error.message); return; }
    setAutomations((current) => [...current.filter((item) => item.event !== data.event), data as Automation]);
  };

  if (busy) return <div className="flex h-[calc(100vh-6.5rem)] items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">Loading communication workspace...</div>;

  return (
    <div className="relative flex h-[calc(100vh-6.5rem)] min-h-[620px] min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white pt-14 shadow-sm">
      <div className="absolute inset-x-0 top-0 z-20 flex gap-1 overflow-x-auto border-b border-slate-200 bg-white p-2 shadow-sm">
        <button onClick={() => setWorkspaceTab("chat")} className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold ${workspaceTab === "chat" ? "bg-blue-600 text-white" : "text-slate-500"}`}>Chats</button>
        <button onClick={() => setWorkspaceTab("dashboard")} className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-semibold ${workspaceTab === "dashboard" ? "bg-blue-600 text-white" : "text-slate-500"}`}><BarChart3 className="h-3 w-3" />Dashboard</button>
        <button onClick={() => setWorkspaceTab("announcements")} className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-semibold ${workspaceTab === "announcements" ? "bg-blue-600 text-white" : "text-slate-500"}`}><Megaphone className="h-3 w-3" />Announcements</button>
        <button onClick={() => setWorkspaceTab("templates")} className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold ${workspaceTab === "templates" ? "bg-blue-600 text-white" : "text-slate-500"}`}>Message Templates</button>
        <button onClick={() => setWorkspaceTab("automations")} className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold ${workspaceTab === "automations" ? "bg-blue-600 text-white" : "text-slate-500"}`}>Automated Messages</button>
        <button onClick={() => setWorkspaceTab("history")} className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold ${workspaceTab === "history" ? "bg-blue-600 text-white" : "text-slate-500"}`}>Message History</button>
        <button onClick={() => setWorkspaceTab("approvals")} className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold ${workspaceTab === "approvals" ? "bg-blue-600 text-white" : "text-slate-500"}`}>Template Approvals</button>
        <button onClick={() => setWorkspaceTab("template-analytics")} className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold ${workspaceTab === "template-analytics" ? "bg-blue-600 text-white" : "text-slate-500"}`}>Template Analytics</button>
      </div>
      {showTeamComposer && <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/30 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
          <div className="flex items-center justify-between"><div><h2 className="text-sm font-bold text-slate-900">Create team channel</h2><p className="mt-1 text-[10px] text-slate-500">{selectedBranchId === "all" ? "Organization-wide team" : `Scoped to ${branches.find((branch) => branch.id === selectedBranchId)?.name}`}</p></div><button onClick={() => setShowTeamComposer(false)} className="text-slate-400"><X className="h-4 w-4" /></button></div>
          <input value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Team name" autoFocus className="mt-4 h-10 w-full rounded-xl border border-slate-200 px-3 text-xs outline-none focus:border-blue-400" />
          <p className="mt-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Select members</p>
          <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">{members.filter(memberInBranchScope).map((member) => <label key={member.id} className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs text-slate-700 hover:bg-slate-50"><input type="checkbox" checked={teamMemberIds.includes(member.id)} disabled={member.id === userId} onChange={(event) => setTeamMemberIds((current) => event.target.checked ? Array.from(new Set([...current, member.id])) : current.filter((id) => id !== member.id))} />{member.name}</label>)}</div>
          <div className="mt-5 flex justify-end gap-2"><button onClick={() => setShowTeamComposer(false)} className="rounded-xl px-3 py-2 text-xs text-slate-500">Cancel</button><button onClick={() => void createChannel()} disabled={!teamName.trim()} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Create team</button></div>
        </div>
      </div>}
      {workspaceTab === "dashboard" && <CommunicationDashboard messages={messages} channels={channels} announcements={announcements} />}
      {workspaceTab === "announcements" && <AnnouncementCenter announcements={announcements} onCreate={createAnnouncement} />}
      {workspaceTab === "templates" && <TemplateCenter templates={templates} onCreate={createTemplate} onStatus={updateTemplateStatus} />}
      {workspaceTab === "automations" && <AutomationCenter automations={automations} templates={templates} onCreate={saveAutomation} onToggle={toggleAutomation} />}
      {workspaceTab === "history" && <MessageHistoryCenter history={messageHistory} />}
      {workspaceTab === "approvals" && <TemplateApprovalCenter templates={templates} onStatus={updateTemplateStatus} />}
      {workspaceTab === "template-analytics" && <TemplateAnalytics templates={templates} history={messageHistory} />}
      {workspaceTab !== "chat" ? null : <>
      <aside className="flex w-[300px] shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-4">
          <div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Workspace</p><h1 className="mt-1 text-lg font-bold text-slate-900">Communication</h1></div><button onClick={openTeamComposer} className="rounded-xl p-2 text-blue-600 hover:bg-blue-50" title="Create team"><Plus className="h-4 w-4" /></button></div>
          <div className="relative mt-4"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations..." className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs outline-none focus:border-blue-400" /></div>
          <div className="mt-3 flex gap-1 overflow-x-auto pb-1">{tabs.map((tab) => <button key={tab} onClick={() => setFilter(tab)} className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[10px] font-semibold ${filter === tab ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50"}`}>{tab}{tab === "Unread" && unreadCount > 0 && <span className="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] text-white">{unreadCount}</span>}</button>)}</div>
          <label className="mt-2 flex items-center gap-2 text-[10px] font-semibold text-slate-500"><span>Branch</span><select value={selectedBranchId} onChange={(event) => setSelectedBranchId(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] text-slate-700 outline-none"><option value="all">All accessible branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        </div>
        <div className="flex-1 overflow-y-auto p-2">{filter === "Direct" && <div className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Start a direct chat in {selectedBranchId === "all" ? "an accessible branch" : branches.find((branch) => branch.id === selectedBranchId)?.name}</div>}{filter === "Direct" && visibleMembers.map((member) => <button key={member.id} onClick={() => void startDirectChat(member)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-slate-50"><Avatar label={initials(member.name)} color={theme.colors.primary} /><span className="text-xs font-semibold text-slate-800">{member.name}</span></button>)}{visibleChannels.map((item) => <button key={item.id} onClick={() => { setActiveId(item.id); markRead(item.id); }} className={`flex w-full items-start gap-3 rounded-xl p-3 text-left transition ${active?.id === item.id ? "bg-blue-50" : "hover:bg-slate-50"}`}><Avatar label={item.name[0]} color={theme.colors.primary} /><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><strong className="truncate text-xs text-slate-800">{item.name}</strong><span className="shrink-0 text-[10px] text-slate-400">{item.latest ? formatTime(item.latest.created_at) : ""}</span></span><span className="mt-1 block truncate text-[11px] text-slate-500">{item.latest?.body || (item.latest?.attachment_name ? `📎 ${item.latest.attachment_name}` : "No messages yet")}</span><span className="mt-1 flex items-center gap-1 text-[9px] text-slate-400"><Users className="h-3 w-3" /> {item.memberCount} members</span></span></button>)}</div>
        <div className="border-t border-slate-100 p-3"><button onClick={openTeamComposer} className="flex w-full items-center gap-2 rounded-xl border border-dashed border-blue-200 bg-blue-50/50 p-3 text-left text-xs font-semibold text-blue-700"><Plus className="h-4 w-4" /> {filter === "Groups" ? "Create group" : "New team channel"}</button></div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        {active ? <>        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3"><div className="flex items-center gap-3"><Avatar label={active.name[0]} color={theme.colors.primary} /><div><h2 className="text-sm font-bold text-slate-900">{active.name}</h2><p className="text-[10px] text-slate-400">{active.channel_type} · {active.memberCount} members</p></div></div><div className="flex items-center gap-1 text-slate-500"><button onClick={() => void startCall("voice")} className="rounded-lg p-2 hover:bg-slate-50" title="Start voice call"><Phone className="h-4 w-4" /></button><button onClick={() => void startCall("video")} className="rounded-lg p-2 hover:bg-slate-50" title="Start video meeting"><Video className="h-4 w-4" /></button><button onClick={() => void toggleScreenShare()} className={`rounded-lg p-2 ${screenSharing ? "bg-blue-50 text-blue-600" : "hover:bg-slate-50"}`} title="Share screen"><MonitorUp className="h-4 w-4" /></button><button onClick={() => setShowDetails((value) => !value)} className="rounded-lg p-2 hover:bg-slate-50" title="Conversation details"><Info className="h-4 w-4" /></button><button onClick={archiveChannel} className="rounded-lg p-2 hover:bg-slate-50" title={active.archived ? "Restore channel" : "Archive channel"}><Archive className="h-4 w-4" /></button><button onClick={() => setNotice("Use the message box to communicate with this channel.")} className="rounded-lg p-2 hover:bg-slate-50" title="More options"><MoreVertical className="h-4 w-4" /></button></div></header>
          <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/40 p-5">{activeMessages.length ? activeMessages.map((item) => <div key={item.id} className={`flex gap-2.5 ${item.user_id === userId ? "justify-end" : ""}`}><Avatar label={initials(item.author)} color={item.user_id === userId ? theme.colors.primary : "#64748b"} /><div className={`max-w-[68%] ${item.user_id === userId ? "items-end" : ""}`}><p className={`mb-1 text-[10px] font-semibold ${item.user_id === userId ? "text-right text-blue-700" : "text-slate-600"}`}>{item.author}</p><div className={`rounded-2xl px-3.5 py-2.5 text-xs leading-5 ${item.user_id === userId ? "rounded-tr-sm bg-blue-600 text-white" : "rounded-tl-sm border border-slate-100 bg-white text-slate-700 shadow-sm"}`}>{item.body && <p>{item.body}</p>}{item.attachment_path && (item.attachment_type?.startsWith("audio/") ? <audio controls src={attachmentUrls[item.attachment_path]} className="mt-1 max-w-full" /> : <a href={attachmentUrls[item.attachment_path]} target="_blank" rel="noreferrer" download={item.attachment_name ?? undefined} className="mt-1 flex items-center gap-2 rounded-lg bg-black/10 px-2 py-1.5 underline"><FileText className="h-4 w-4 shrink-0" />{item.attachment_name}<Download className="ml-auto h-3 w-3" /></a>)}<div className={`mt-1 flex items-center justify-end gap-2 text-[9px] ${item.user_id === userId ? "text-blue-100" : "text-slate-400"}`}>{formatTime(item.created_at)}{item.user_id === userId && <CheckCheck className="h-3 w-3" />}<button onClick={() => void toggleReaction(item)} className="rounded px-1 hover:bg-black/10">👍 {item.reactions?.find((reaction) => reaction.reaction === "👍")?.count ?? 0}</button><button onClick={() => void createTaskFromMessage(item)} title="Create task"><ListTodo className="h-3 w-3" /></button><button onClick={() => togglePin(item)} title={item.pinned ? "Unpin message" : "Pin message"} className="opacity-70 hover:opacity-100"><Pin className={`h-3 w-3 ${item.pinned ? "fill-current" : ""}`} /></button></div></div></div></div>) : <div className="flex h-full items-center justify-center text-sm text-slate-400">Start the conversation in this channel.</div>}</div>
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
      {showDetails && active && <aside className="hidden w-[255px] shrink-0 border-l border-slate-200 bg-white xl:block"><div className="flex items-center justify-between border-b border-slate-100 p-4"><h3 className="text-xs font-bold text-slate-900">Conversation details</h3><button onClick={() => setShowDetails(false)} className="text-slate-400"><X className="h-4 w-4" /></button></div><div className="space-y-6 p-4"><div className="flex items-center gap-3"><Avatar label={active.name[0]} color={theme.colors.primary} /><div><p className="text-xs font-bold text-slate-800">{active.name}</p><p className="text-[10px] text-slate-400">{active.channel_type} channel</p></div></div><div><div className="mb-3 flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Members ({(channelMemberIds[active.id] ?? members.map((member) => member.id)).length})</p>{active.channel_type !== "Direct" && (active.created_by === userId || canManageChannels) && <button onClick={() => { setManagedMemberIds((channelMemberIds[active.id] ?? []).filter((id) => id !== userId)); setManagingMembers((current) => !current); }} className="text-[10px] font-semibold text-blue-600">{managingMembers ? "Close" : "Manage"}</button>}</div>{managingMembers && <div className="mb-3 max-h-40 space-y-1 overflow-y-auto rounded-lg bg-slate-50 p-2">{members.filter(memberInBranchScope).map((member) => <label key={member.id} className="flex items-center gap-2 py-1 text-[10px] text-slate-700"><input type="checkbox" checked={member.id === userId || managedMemberIds.includes(member.id)} disabled={member.id === userId} onChange={(event) => setManagedMemberIds((current) => event.target.checked ? [...current, member.id] : current.filter((id) => id !== member.id))} />{member.name}</label>)}<button onClick={() => void saveMembership()} className="mt-2 w-full rounded-lg bg-blue-600 px-2 py-1.5 text-[10px] font-semibold text-white">Save members</button></div>}<div className="space-y-2">{members.filter((member) => (channelMemberIds[active.id] ?? members.map((item) => item.id)).includes(member.id)).slice(0, 8).map((member) => <div key={member.id} className="flex items-center gap-2"><Avatar label={initials(member.name)} color="#64748b" /><span className="truncate text-xs text-slate-600">{member.name}</span></div>)}</div></div><div><p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Pinned messages</p>{activeMessages.filter((item) => item.pinned).map((item) => <div key={item.id} className="mb-2 rounded-lg bg-amber-50 p-2 text-[10px] text-slate-600"><Pin className="mr-1 inline h-3 w-3 text-amber-600" />{item.body}</div>)}{!activeMessages.some((item) => item.pinned) && <p className="text-xs text-slate-400">No pinned messages.</p>}</div></div></aside>}
      {call && <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 p-4">
        <div className="flex h-full max-h-[760px] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-slate-900 shadow-2xl">
          <header className="flex items-center justify-between border-b border-white/10 px-5 py-3 text-white">
            <div><p className="text-sm font-semibold">{call.type === "video" ? "Video meeting" : "Voice call"}</p><p className="text-xs text-slate-400">{active?.name} · {String(Math.floor(callSeconds / 60)).padStart(2, "0")}:{String(callSeconds % 60).padStart(2, "0")}</p></div>
            <button onClick={() => void endCall()} className="rounded-lg p-2 text-slate-400 hover:bg-white/10" title="Close call"><X className="h-5 w-5" /></button>
          </header>
          <div className="relative flex min-h-0 flex-1 items-center justify-center bg-slate-950 p-4">
            {call.type === "video" ? <video ref={callVideoRef} autoPlay muted playsInline className={`h-full w-full rounded-xl object-contain ${cameraEnabled ? "" : "opacity-0"}`} /> : <div className="flex flex-col items-center gap-3 text-white"><div className="flex h-24 w-24 items-center justify-center rounded-full bg-blue-600 text-3xl font-bold">{active?.name?.[0] ?? "?"}</div><p className="text-sm text-slate-300">Microphone connected</p></div>}
            {screenStream && <video ref={screenVideoRef} autoPlay muted playsInline className="absolute inset-8 h-[calc(100%-4rem)] w-[calc(100%-4rem)] rounded-xl bg-black object-contain shadow-2xl" />}
            {call.type === "video" && !cameraEnabled && <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">Camera is off</div>}
          </div>
          <footer className="flex items-center justify-center gap-3 border-t border-white/10 px-5 py-4">
            <button onClick={toggleCallMute} className={`rounded-full p-3 text-white ${callMuted ? "bg-red-600" : "bg-white/10 hover:bg-white/20"}`} title={callMuted ? "Unmute microphone" : "Mute microphone"}><Mic className="h-5 w-5" /></button>
            {call.type === "video" && <button onClick={toggleCamera} className={`rounded-full p-3 text-white ${!cameraEnabled ? "bg-red-600" : "bg-white/10 hover:bg-white/20"}`} title={cameraEnabled ? "Turn camera off" : "Turn camera on"}><Video className="h-5 w-5" /></button>}
            <button onClick={() => void toggleScreenShare()} className={`rounded-full p-3 text-white ${screenSharing ? "bg-blue-600" : "bg-white/10 hover:bg-white/20"}`} title={screenSharing ? "Stop sharing" : "Share screen"}><MonitorUp className="h-5 w-5" /></button>
            <button onClick={() => void endCall()} className="rounded-full bg-red-600 p-3 text-white hover:bg-red-500" title="End call"><Phone className="h-5 w-5 rotate-[135deg]" /></button>
          </footer>
        </div>
      </div>}
      {incomingCall && !call && <div className="fixed right-5 top-5 z-50 w-full max-w-sm rounded-2xl border border-blue-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
            {incomingCall.type === "video" ? <Video className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900">{incomingCall.type === "video" ? "Incoming video call" : "Incoming voice call"}</p>
            <p className="mt-1 truncate text-xs text-slate-500">{incomingCall.callerName} is calling in {channels.find((channel) => channel.id === incomingCall.channelId)?.name ?? "a conversation"}.</p>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => void declineCall()} className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100">Decline</button>
          <button type="button" onClick={() => void answerCall()} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700">{incomingCall.type === "video" ? "Join video" : "Answer"}</button>
        </div>
      </div>}
      </>}
      {notice && <button onClick={() => setNotice("")} className="fixed bottom-5 right-5 rounded-xl bg-slate-900 px-4 py-3 text-xs text-white shadow-lg">{notice}</button>}
    </div>
  );
}

function initials(name: string) { return name.split(" ").map((part) => part[0]).join("").toUpperCase().slice(0, 2) || "U"; }
function formatTime(value: string) { return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value)); }
function Avatar({ label, color }: { label: string; color: string }) { return <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: color }}>{label.toUpperCase()}</span>; }
function CommunicationDashboard({ messages, channels, announcements }: { messages: Message[]; channels: Channel[]; announcements: Announcement[] }) {
  const cards = [
    ["Total messages", messages.length],
    ["Active conversations", channels.filter((channel) => !channel.archived).length],
    ["Active users", new Set(messages.map((message) => message.user_id)).size],
    ["Announcements sent", announcements.length]
  ];
  return <section className="flex flex-1 flex-col overflow-y-auto bg-slate-50 p-8 pt-20"><h1 className="text-xl font-bold text-slate-900">Communication dashboard</h1><p className="mt-1 text-xs text-slate-500">A live view of collaboration activity across your workspace.</p><div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{value}</p></div>)}</div><div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-sm font-bold text-slate-900">Activity summary</h2><div className="mt-4 space-y-3 text-xs text-slate-600"><p>Messages are grouped by conversation and updated in real time.</p><p>Use pinned messages, reactions, tasks, calls, and announcements directly from Chats.</p></div></div></section>;
}
function AnnouncementCenter({ announcements, onCreate }: { announcements: Announcement[]; onCreate: () => void }) {
  return <section className="flex flex-1 flex-col overflow-y-auto bg-slate-50 p-8 pt-20"><div className="flex items-center justify-between"><div><h1 className="text-xl font-bold text-slate-900">Announcement center</h1><p className="mt-1 text-xs text-slate-500">Publish company and branch notices with priority visibility.</p></div><button onClick={onCreate} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white">New announcement</button></div><div className="mt-6 grid gap-4 lg:grid-cols-2">{announcements.map((announcement) => <article key={announcement.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">{announcement.announcement_type}</span><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${announcement.priority === "Critical" ? "bg-red-50 text-red-700" : announcement.priority === "Important" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{announcement.priority}</span></div><h2 className="mt-3 text-sm font-bold text-slate-900">{announcement.title}</h2><p className="mt-2 text-xs leading-5 text-slate-600">{announcement.body}</p><p className="mt-4 text-[10px] text-slate-400">{new Date(announcement.created_at).toLocaleString()}</p></article>)}{!announcements.length && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-xs text-slate-400">No active announcements.</div>}</div></section>;
}
const templateVariables = ["{{customer_name}}", "{{company_name}}", "{{invoice_number}}", "{{order_number}}", "{{amount}}", "{{balance}}", "{{branch_name}}", "{{current_date}}"];
function TemplateCenter({ templates, onCreate, onStatus }: { templates: Template[]; onCreate: () => void; onStatus: (template: Template, status: string) => void }) {
  return <section className="flex flex-1 flex-col overflow-y-auto bg-slate-50 p-8 pt-20"><div className="flex items-center justify-between"><div><h1 className="text-xl font-bold text-slate-900">Message Templates & Automation Center</h1><p className="mt-1 text-xs text-slate-500">Create reusable customer communications with dynamic variables.</p></div><button onClick={onCreate} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white"><Plus className="mr-1 inline h-3 w-3" />Create template</button></div><div className="mt-5 flex flex-wrap gap-2">{templateVariables.map((variable) => <code key={variable} className="rounded bg-white px-2 py-1 text-[10px] text-blue-700 shadow-sm">{variable}</code>)}</div><div className="mt-6 grid gap-4 lg:grid-cols-2">{templates.map((template) => <article key={template.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">{template.category} · {template.channel}</p><h2 className="mt-1 text-sm font-bold text-slate-900">{template.name}</h2><p className="text-[10px] text-slate-400">{template.template_code} · v{template.version}</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{template.status}</span></div><p className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">{template.content}</p><div className="mt-4 flex flex-wrap gap-2">{template.status === "Draft" && <button onClick={() => onStatus(template, "Pending Approval")} className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-[10px] font-semibold text-blue-700">Submit for approval</button>}{template.status === "Approved" && <button onClick={() => onStatus(template, "Archived")} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600">Archive</button>}</div></article>)}{!templates.length && <EmptyState label="No templates yet." />}</div></section>;
}
function AutomationCenter({ automations, templates, onCreate, onToggle }: { automations: Automation[]; templates: Template[]; onCreate: () => void; onToggle: (automation: Automation) => void }) {
  return <section className="flex flex-1 flex-col overflow-y-auto bg-slate-50 p-8 pt-20"><div className="flex items-center justify-between"><div><h1 className="text-xl font-bold text-slate-900">Automated Messages</h1><p className="mt-1 text-xs text-slate-500">Trigger approved templates from sales, orders, payments, CRM, and accounting events.</p></div><button onClick={onCreate} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white">New automation</button></div><div className="mt-6 space-y-3">{automations.map((automation) => <div key={automation.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div><p className="text-sm font-semibold text-slate-900">{automation.event}</p><p className="text-xs text-slate-500">{templates.find((template) => template.id === automation.template_id)?.name ?? "No template selected"} · {automation.channel} · {automation.send_mode}</p></div><button onClick={() => onToggle(automation)} className={`rounded-full px-3 py-1.5 text-[10px] font-bold ${automation.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{automation.enabled ? "Enabled" : "Disabled"}</button></div>)}{!automations.length && <EmptyState label="No automation rules configured." />}</div></section>;
}
function MessageHistoryCenter({ history }: { history: MessageHistory[] }) {
  return <section className="flex flex-1 flex-col overflow-y-auto bg-slate-50 p-8 pt-20"><h1 className="text-xl font-bold text-slate-900">Message History</h1><p className="mt-1 text-xs text-slate-500">Track outgoing automated and manual customer messages.</p><div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm"><table className="w-full text-left text-xs"><thead className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400"><tr>{["Date", "Recipient", "Event", "Channel", "Status", "Message"].map((head) => <th key={head} className="px-4 py-3">{head}</th>)}</tr></thead><tbody>{history.map((item) => <tr key={item.id} className="border-b border-slate-50"><td className="px-4 py-3 text-slate-500">{new Date(item.created_at).toLocaleString()}</td><td className="px-4 py-3 text-slate-700">{item.recipient ?? "—"}</td><td className="px-4 py-3 text-slate-500">{item.event ?? "Manual"}</td><td className="px-4 py-3 text-slate-500">{item.channel}</td><td className="px-4 py-3 font-semibold text-emerald-600">{item.status}</td><td className="max-w-xs truncate px-4 py-3 text-slate-500">{item.rendered_content}</td></tr>)}</tbody></table>{!history.length && <EmptyState label="No outgoing messages recorded." />}</div></section>;
}
function TemplateApprovalCenter({ templates, onStatus }: { templates: Template[]; onStatus: (template: Template, status: string) => void }) {
  const pending = templates.filter((template) => template.status === "Pending Approval");
  return <section className="flex flex-1 flex-col overflow-y-auto bg-slate-50 p-8 pt-20"><h1 className="text-xl font-bold text-slate-900">Template Approvals</h1><p className="mt-1 text-xs text-slate-500">Review and publish templates before they can be automated.</p><div className="mt-6 space-y-3">{pending.map((template) => <div key={template.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-white p-4 shadow-sm"><div><p className="text-sm font-semibold text-slate-900">{template.name}</p><p className="text-xs text-slate-500">{template.category} · version {template.version}</p></div><div className="flex gap-2"><button onClick={() => onStatus(template, "Approved")} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[10px] font-semibold text-white">Approve</button><button onClick={() => onStatus(template, "Rejected")} className="rounded-lg bg-red-50 px-3 py-1.5 text-[10px] font-semibold text-red-700">Reject</button></div></div>)}{!pending.length && <EmptyState label="Approval queue is empty." />}</div></section>;
}
function TemplateAnalytics({ templates, history }: { templates: Template[]; history: MessageHistory[] }) {
  const delivered = history.filter((item) => ["Delivered", "Read"].includes(item.status)).length;
  const rate = history.length ? Math.round((delivered / history.length) * 100) : 0;
  return <section className="flex flex-1 flex-col overflow-y-auto bg-slate-50 p-8 pt-20"><h1 className="text-xl font-bold text-slate-900">Template Analytics</h1><p className="mt-1 text-xs text-slate-500">Monitor template usage and delivery performance.</p><div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[["Templates", templates.length], ["Messages sent", history.length], ["Delivery rate", `${rate}%`], ["Failed messages", history.filter((item) => item.status === "Failed").length]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{String(value)}</p></div>)}</div></section>;
}
function EmptyState({ label }: { label: string }) { return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-xs text-slate-400">{label}</div>; }
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
