"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Phone, PhoneOff, Video } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Call = { id: string; type: "voice" | "video"; channelId: string; callerName: string };
type Metadata = { status?: string; accepted_by?: string; declined_by?: string; offer?: RTCSessionDescriptionInit; answer?: RTCSessionDescriptionInit; callerCandidates?: RTCIceCandidateInit[]; calleeCandidates?: RTCIceCandidateInit[] };

export function GlobalCallNotifications() {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState("");
  const [orgId, setOrgId] = useState("");
  const [incoming, setIncoming] = useState<Call | null>(null);
  const [active, setActive] = useState<(Call & { stream: MediaStream; remote?: MediaStream; startedAt: number }) | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const callRef = useRef<string | null>(null);
  const processed = useRef({ offer: false, answer: false, caller: 0, callee: 0 });
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const activeRef = useRef<typeof active>(null);
  activeRef.current = active;

  const patch = async (id: string, value: Metadata) => {
    const key = value.callerCandidates ? "callerCandidates" : value.calleeCandidates ? "calleeCandidates" : null;
    const candidate = key ? value[key]?.[0] : undefined;
    await (supabase as any).rpc("merge_communication_call_metadata", {
      p_call_id: id, p_patch: key ? Object.fromEntries(Object.entries(value).filter(([k]) => k !== key)) : value,
      p_candidate_key: key, p_candidate: candidate ?? null
    });
  };

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(async ({ data }) => {
      if (cancelled || !data.user) return;
      setUserId(data.user.id);
      const { data: membership } = await supabase.from("organization_members").select("org_id").eq("user_id", data.user.id).eq("status", "active").limit(1).maybeSingle();
      if (!cancelled && membership?.org_id) setOrgId(membership.org_id);
    });
    return () => { cancelled = true; };
  }, [supabase]);

  useEffect(() => {
    if (!orgId || !userId || active) return;
    let disposed = false;
    const find = async () => {
      const { data } = await (supabase as any).from("communication_calls")
        .select("id, channel_id, started_by, call_type, metadata, started_at").eq("org_id", orgId).neq("started_by", userId)
        .is("ended_at", null).gte("started_at", new Date(Date.now() - 2 * 60 * 1000).toISOString()).order("started_at", { ascending: false }).limit(20);
      if (disposed) return;
      const candidate = (data ?? []).find((row: any) => row.channel_id && row.metadata?.status === "ringing");
      if (!candidate) return;
      const { data: channel } = await supabase.from("communication_channels").select("id, channel_type, name").eq("id", candidate.channel_id).maybeSingle();
      if (!channel) return;
      if (channel.channel_type === "Direct") {
        const { data: member } = await supabase.from("communication_channel_members").select("user_id").eq("channel_id", channel.id).eq("user_id", userId).maybeSingle();
        if (!member) return;
      }
      const { data: caller } = await supabase.from("profiles").select("full_name").eq("id", candidate.started_by).maybeSingle();
      setIncoming((current) => current?.id === candidate.id ? current : { id: candidate.id, type: candidate.call_type, channelId: channel.id, callerName: caller?.full_name || "A team member" });
    };
    void find();
    const timer = window.setInterval(() => void find(), 2000);
    const channel = supabase.channel(`global-call-notifications:${orgId}:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "communication_calls", filter: `org_id=eq.${orgId}` }, () => void find()).subscribe();
    return () => { disposed = true; window.clearInterval(timer); void supabase.removeChannel(channel); };
  }, [active, orgId, supabase, userId]);

  useEffect(() => {
    if (!active || !callRef.current || !pcRef.current) return;
    const id = callRef.current;
    const pc = pcRef.current;
    const apply = async (metadata: Metadata) => {
      if (metadata.offer && !processed.current.offer) {
        processed.current.offer = true;
        await pc.setRemoteDescription(metadata.offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await patch(id, { answer: { type: answer.type, sdp: answer.sdp ?? undefined } });
      }
      const candidates = metadata.callerCandidates ?? [];
      for (const candidate of candidates.slice(processed.current.caller)) await pc.addIceCandidate(candidate).catch(() => undefined);
      processed.current.caller = candidates.length;
    };
    const channel = supabase.channel(`global-call-signal:${id}`).on("postgres_changes", { event: "UPDATE", schema: "public", table: "communication_calls", filter: `id=eq.${id}` }, (payload) => {
      const row = payload.new as { metadata?: Metadata; ended_at?: string | null };
      if (row.ended_at || row.metadata?.status === "declined") {
        active?.stream.getTracks().forEach((track) => track.stop());
        active?.remote?.getTracks().forEach((track) => track.stop());
        pc.close();
        pcRef.current = null;
        callRef.current = null;
        setActive(null);
        setExpanded(false);
        return;
      }
      void apply(row.metadata ?? {});
    }).subscribe();
    void (async () => { const { data } = await (supabase as any).from("communication_calls").select("metadata").eq("id", id).single(); if (data?.metadata) await apply(data.metadata); })();
    return () => { void supabase.removeChannel(channel); };
  }, [active, supabase]);

  useEffect(() => { if (videoRef.current) videoRef.current.srcObject = active?.remote ?? active?.stream ?? null; }, [active]);
  useEffect(() => { if (audioRef.current) audioRef.current.srcObject = active?.remote ?? null; }, [active]);
  useEffect(() => () => {
    activeRef.current?.stream.getTracks().forEach((track) => track.stop());
    activeRef.current?.remote?.getTracks().forEach((track) => track.stop());
    pcRef.current?.close();
    pcRef.current = null;
    callRef.current = null;
  }, []);

  const answer = async () => {
    if (!incoming || busy) return;
    setBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: incoming.type === "video" });
      const pc = new RTCPeerConnection();
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      pc.ontrack = (event) => setActive((current) => current ? { ...current, remote: event.streams[0] ?? new MediaStream([event.track]) } : current);
      pc.onicecandidate = (event) => { if (event.candidate) void patch(incoming.id, { calleeCandidates: [{ candidate: event.candidate.candidate, sdpMid: event.candidate.sdpMid, sdpMLineIndex: event.candidate.sdpMLineIndex }] }); };
      pcRef.current = pc; callRef.current = incoming.id; processed.current = { offer: false, answer: false, caller: 0, callee: 0 };
      const { data } = await (supabase as any).from("communication_calls").select("metadata").eq("id", incoming.id).single();
      await patch(incoming.id, { status: "accepted", accepted_by: userId });
      setActive({ ...incoming, stream, startedAt: Date.now() }); setIncoming(null);
      if (data?.metadata?.offer) { processed.current.offer = true; await pc.setRemoteDescription(data.metadata.offer); const answerDescription = await pc.createAnswer(); await pc.setLocalDescription(answerDescription); await patch(incoming.id, { answer: { type: answerDescription.type, sdp: answerDescription.sdp ?? undefined } }); }
    } catch { setIncoming(null); }
    finally { setBusy(false); }
  };

  const decline = async () => {
    if (!incoming) return;
    const { data: channel } = await supabase.from("communication_channels").select("channel_type").eq("id", incoming.channelId).maybeSingle();
    if (channel?.channel_type === "Direct") await (supabase as any).from("communication_calls").update({ ended_at: new Date().toISOString(), metadata: { status: "declined", declined_by: userId } }).eq("id", incoming.id);
    else await patch(incoming.id, { status: "declined", declined_by: userId });
    setIncoming(null);
  };

  const end = async () => {
    if (!active) return;
    active.stream.getTracks().forEach((track) => track.stop()); active.remote?.getTracks().forEach((track) => track.stop());
    await (supabase as any).from("communication_calls").update({ ended_at: new Date().toISOString() }).eq("id", active.id);
    pcRef.current?.close(); pcRef.current = null; callRef.current = null; setActive(null); setExpanded(false);
  };

  if (!incoming && !active) return null;
  return <>{incoming && <div className="fixed right-5 top-5 z-[70] w-80 rounded-2xl border border-blue-200 bg-white p-4 shadow-2xl"><div className="flex items-center gap-3"><div className="rounded-full bg-blue-600 p-3 text-white">{incoming.type === "video" ? <Video className="h-4 w-4" /> : <Phone className="h-4 w-4" />}</div><div className="min-w-0"><p className="text-sm font-bold">Incoming {incoming.type} call</p><p className="truncate text-xs text-slate-500">{incoming.callerName}</p></div></div><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => void decline()} className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">Decline</button><button type="button" onClick={() => void answer()} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Answer</button></div></div>}{active && <div className={`fixed right-5 bottom-5 z-[65] overflow-hidden rounded-2xl bg-slate-900 text-white shadow-2xl ${expanded ? "inset-8" : "w-72"}`}><div className="flex items-center justify-between px-3 py-2 text-xs"><span>{active.callerName} · {active.type}</span><div className="flex gap-2"><button type="button" onClick={() => setExpanded((value) => !value)} title="Expand"><Maximize2 className="h-4 w-4" /></button><button type="button" onClick={() => void end()} title="End call"><PhoneOff className="h-4 w-4 text-red-400" /></button></div></div><video ref={videoRef} autoPlay playsInline muted className={`${active.type === "video" ? "aspect-video" : "hidden"} w-full bg-black`} /><audio ref={audioRef} autoPlay /><div className="px-3 py-2 text-[10px] text-slate-300">{Math.floor((Date.now() - active.startedAt) / 1000)}s · Call is active across the dashboard</div></div>}</>;
}
