"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Mic, MonitorUp, Phone, PhoneOff, Video } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Call = { id: string; type: "voice" | "video"; channelId: string; callerName: string; ringingStartedAt: string };
type Metadata = { status?: string; accepted_by?: string; declined_by?: string; offer?: RTCSessionDescriptionInit; answer?: RTCSessionDescriptionInit; callerCandidates?: RTCIceCandidateInit[]; calleeCandidates?: RTCIceCandidateInit[] };

export function GlobalCallNotifications() {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState("");
  const [orgId, setOrgId] = useState("");
  const [incoming, setIncoming] = useState<Call | null>(null);
  const [active, setActive] = useState<(Call & { stream: MediaStream; remote?: MediaStream; startedAt: number }) | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [callMuted, setCallMuted] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const callRef = useRef<string | null>(null);
  const processed = useRef({ offer: false, answer: false, caller: 0, callee: 0 });
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const videoSenderRef = useRef<RTCRtpSender | null>(null);
  const ringtoneContextRef = useRef<AudioContext | null>(null);
  const ringtoneTimerRef = useRef<number | null>(null);
  const activeRef = useRef<typeof active>(null);
  activeRef.current = active;
  screenStreamRef.current = screenStream;

  const unlockAudio = async () => {
    const context = ringtoneContextRef.current ?? new AudioContext();
    ringtoneContextRef.current = context;
    if (context.state === "suspended") await context.resume();
  };

  const playRingtone = () => {
    const context = ringtoneContextRef.current;
    if (!context || context.state !== "running") return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.28);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.3);
  };

  useEffect(() => {
    if (!incoming) return;
    void unlockAudio().then(playRingtone).catch(() => undefined);
    ringtoneTimerRef.current = window.setInterval(playRingtone, 1200);
    return () => {
      if (ringtoneTimerRef.current !== null) window.clearInterval(ringtoneTimerRef.current);
      ringtoneTimerRef.current = null;
    };
  }, [incoming?.id]);

  useEffect(() => {
    if (!incoming) return;
    const remaining = Math.max(0, 30_000 - (Date.now() - new Date(incoming.ringingStartedAt).getTime()));
    const timer = window.setTimeout(async () => {
      const { data } = await (supabase as any).from("communication_calls").select("metadata, ended_at").eq("id", incoming.id).maybeSingle();
      if (data?.ended_at || data?.metadata?.status !== "ringing") return;
      await (supabase as any).rpc("expire_communication_call", { p_call_id: incoming.id });
      setIncoming(null);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [incoming, supabase]);

  useEffect(() => {
    const unlock = () => { void unlockAudio().catch(() => undefined); };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

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
      const candidate = (data ?? []).find((row: any) => row.channel_id && row.metadata?.status === "ringing" && Date.now() - new Date(row.started_at).getTime() < 30_000);
      if (!candidate) return;
      const { data: channel } = await supabase.from("communication_channels").select("id, channel_type, name").eq("id", candidate.channel_id).maybeSingle();
      if (!channel) return;
      if (channel.channel_type === "Direct") {
        const { data: member } = await supabase.from("communication_channel_members").select("user_id").eq("channel_id", channel.id).eq("user_id", userId).maybeSingle();
        if (!member) return;
      }
      const { data: caller } = await supabase.from("profiles").select("full_name").eq("id", candidate.started_by).maybeSingle();
      setIncoming((current) => current?.id === candidate.id ? current : { id: candidate.id, type: candidate.call_type, channelId: channel.id, callerName: caller?.full_name || "A team member", ringingStartedAt: candidate.started_at });
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
        screenStreamRef.current?.getTracks().forEach((track) => track.stop());
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

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = active?.remote ?? active?.stream ?? null;
      void videoRef.current.play().catch(() => undefined);
    }
    if (audioRef.current) {
      audioRef.current.srcObject = active?.remote ?? null;
      void audioRef.current.play().catch(() => undefined);
    }
  }, [active]);
  useEffect(() => { if (screenStream && videoRef.current) videoRef.current.srcObject = active?.remote ?? screenStream; }, [screenStream, active?.remote]);
  useEffect(() => () => {
    activeRef.current?.stream.getTracks().forEach((track) => track.stop());
    activeRef.current?.remote?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    pcRef.current?.close();
    pcRef.current = null;
    callRef.current = null;
  }, []);

  const answer = async () => {
    if (!incoming || busy) return;
    setBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: incoming.type === "video" });
      await unlockAudio().catch(() => undefined);
      const pc = new RTCPeerConnection();
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      if (incoming.type === "voice") videoSenderRef.current = pc.addTransceiver("video", { direction: "sendrecv" }).sender;
      else videoSenderRef.current = pc.getSenders().find((sender) => sender.track?.kind === "video") ?? null;
      pc.ontrack = (event) => setActive((current) => {
        if (!current) return current;
        const remote = current.remote ?? new MediaStream();
        if (!remote.getTracks().some((track) => track.id === event.track.id)) remote.addTrack(event.track);
        return { ...current, remote };
      });
      pc.onicecandidate = (event) => { if (event.candidate) void patch(incoming.id, { calleeCandidates: [{ candidate: event.candidate.candidate, sdpMid: event.candidate.sdpMid, sdpMLineIndex: event.candidate.sdpMLineIndex }] }); };
      pcRef.current = pc; callRef.current = incoming.id; processed.current = { offer: false, answer: false, caller: 0, callee: 0 };
      const { data } = await (supabase as any).from("communication_calls").select("metadata").eq("id", incoming.id).single();
      await patch(incoming.id, { status: "accepted", accepted_by: userId });
      setCallMuted(false); setCameraEnabled(incoming.type === "video");
      setActive({ ...incoming, stream, startedAt: Date.now() }); setIncoming(null);
      if (data?.metadata?.offer) { processed.current.offer = true; await pc.setRemoteDescription(data.metadata.offer); const answerDescription = await pc.createAnswer(); await pc.setLocalDescription(answerDescription); await patch(incoming.id, { answer: { type: answerDescription.type, sdp: answerDescription.sdp ?? undefined } }); }
    } catch { setIncoming(null); }
    finally { setBusy(false); }
  };

  const decline = async () => {
    if (!incoming) return;
    const { data: channel } = await supabase.from("communication_channels").select("channel_type").eq("id", incoming.channelId).maybeSingle();
    await patch(incoming.id, { status: "declined", declined_by: userId });
    await (supabase as any).from("communication_calls").update({ ended_at: new Date().toISOString() }).eq("id", incoming.id).is("ended_at", null);
    setIncoming(null);
  };

  const end = async () => {
    if (!active) return;
    active.stream.getTracks().forEach((track) => track.stop()); active.remote?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    await (supabase as any).from("communication_calls").update({ ended_at: new Date().toISOString() }).eq("id", active.id);
    pcRef.current?.close(); pcRef.current = null; callRef.current = null; videoSenderRef.current = null; setScreenStream(null); setScreenSharing(false); setActive(null); setExpanded(false);
  };

  const toggleMute = () => {
    if (!active?.stream) return;
    const next = !callMuted;
    active.stream.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setCallMuted(next);
  };

  const toggleCamera = () => {
    if (!active?.stream || active.type !== "video") return;
    const next = !cameraEnabled;
    active.stream.getVideoTracks().forEach((track) => { track.enabled = next; });
    setCameraEnabled(next);
  };

  const toggleScreenShare = async () => {
    if (!active || !navigator.mediaDevices?.getDisplayMedia) return;
    const sender = videoSenderRef.current;
    if (screenSharing) {
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      await sender?.replaceTrack(active.stream.getVideoTracks()[0] ?? null);
      setScreenStream(null); setScreenSharing(false); return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      if (sender) await sender.replaceTrack(track);
      else if (pcRef.current) videoSenderRef.current = pcRef.current.addTransceiver(track, { direction: "sendrecv" }).sender;
      track.addEventListener("ended", () => {
        const current = activeRef.current;
        screenStreamRef.current?.getTracks().forEach((screenTrack) => screenTrack.stop());
        void videoSenderRef.current?.replaceTrack(current?.stream.getVideoTracks()[0] ?? null);
        setScreenStream(null);
        setScreenSharing(false);
      });
      setScreenStream(stream); setScreenSharing(true);
    } catch { /* user cancelled */ }
  };

  if (!incoming && !active) return null;
  return <>{incoming && <div className="fixed right-5 top-5 z-[70] w-80 rounded-2xl border border-blue-200 bg-white p-4 shadow-2xl"><div className="flex items-center gap-3"><div className="rounded-full bg-blue-600 p-3 text-white">{incoming.type === "video" ? <Video className="h-4 w-4" /> : <Phone className="h-4 w-4" />}</div><div className="min-w-0"><p className="text-sm font-bold">Incoming {incoming.type} call</p><p className="truncate text-xs text-slate-500">{incoming.callerName}</p></div></div><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => void decline()} className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">Decline</button><button type="button" onClick={() => void answer()} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Answer</button></div></div>}{active && <div className={`fixed right-5 bottom-5 z-[65] overflow-hidden rounded-2xl bg-slate-900 text-white shadow-2xl ${expanded ? "inset-8" : "w-72"}`}><div className="flex items-center justify-between px-3 py-2 text-xs"><span>{active.callerName} · {active.type}</span><div className="flex gap-2"><button type="button" onClick={() => setExpanded((value) => !value)} title="Expand"><Maximize2 className="h-4 w-4" /></button><button type="button" onClick={() => void end()} title="End call"><PhoneOff className="h-4 w-4 text-red-400" /></button></div></div><video ref={videoRef} autoPlay playsInline muted className={`${active.type === "video" ? "aspect-video" : "hidden"} w-full bg-black`} /><audio ref={audioRef} autoPlay /><div className="flex items-center justify-center gap-2 border-t border-white/10 px-3 py-2"><button type="button" onClick={toggleMute} title={callMuted ? "Unmute microphone" : "Mute microphone"} className={`rounded-full p-2 ${callMuted ? "bg-red-600" : "bg-white/10"}`}><Mic className="h-4 w-4" /></button>{active.type === "video" && <button type="button" onClick={toggleCamera} title={cameraEnabled ? "Turn camera off" : "Turn camera on"} className={`rounded-full p-2 ${!cameraEnabled ? "bg-red-600" : "bg-white/10"}`}><Video className="h-4 w-4" /></button>}<button type="button" onClick={() => void toggleScreenShare()} title={screenSharing ? "Stop sharing" : "Share screen"} className={`rounded-full p-2 ${screenSharing ? "bg-blue-600" : "bg-white/10"}`}><MonitorUp className="h-4 w-4" /></button></div><div className="px-3 py-2 text-[10px] text-slate-300">{Math.floor((Date.now() - active.startedAt) / 1000)}s · Call is active across the dashboard</div></div>}</>;
}
