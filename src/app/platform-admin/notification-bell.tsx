"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, Volume2, VolumeX } from "lucide-react";
import { createPlatformClient } from "@/lib/supabase/platform-client";
import { markAllPlatformNotificationsRead, markPlatformNotificationRead } from "./actions";

type PlatformNotification = {
  id: string;
  severity: "info" | "success" | "warning" | "critical";
  title: string;
  message: string;
  created_at: string;
  read_at: string | null;
};

function playAlert(context: AudioContext, delay = 0) {
  const now = context.currentTime + delay;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.14, now + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
  gain.connect(context.destination);

  for (const [offset, frequency] of [[0, 784], [0.13, 1046], [0.27, 1318]] as const) {
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, now + offset);
    oscillator.connect(gain);
    oscillator.start(now + offset);
    oscillator.stop(now + offset + 0.32);
  }
}

export default function PlatformNotificationBell({ initialNotifications }: { initialNotifications: PlatformNotification[] }) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [open, setOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const soundEnabledRef = useRef(false);
  const knownIds = useRef(new Set(initialNotifications.map((notification) => notification.id)));
  const pendingIds = useRef(new Set<string>());

  useEffect(() => {
    const supabase = createPlatformClient();
    const channel = supabase
      .channel("platform-admin-notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "platform_notifications" }, (payload) => {
        const incoming = payload.new as PlatformNotification;
        if (knownIds.current.has(incoming.id)) return;
        knownIds.current.add(incoming.id);
        setNotifications((current) => [incoming, ...current.filter((notice) => notice.id !== incoming.id)].slice(0, 20));
        const context = audioContext.current;
        if (soundEnabledRef.current && context) {
          void context.resume().then(() => playAlert(context)).catch((error: unknown) => {
            console.error("Platform notification sound could not play:", error);
          });
        } else {
          pendingIds.current.add(incoming.id);
        }
      })
      .subscribe((status, error) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("Platform notification updates could not be subscribed to:", error ?? status);
        }
      });
    return () => {
      void supabase.removeChannel(channel);
      audioContext.current?.close().catch((error: unknown) => console.error("Platform notification audio could not close:", error));
    };
  }, []);

  const unreadCount = notifications.filter((notification) => !notification.read_at).length;

  const enableSound = async () => {
    const Context = window.AudioContext;
    if (!Context) {
      setErrorMessage("This browser does not support notification sounds.");
      return;
    }
    try {
      const context = audioContext.current ?? new Context();
      audioContext.current = context;
      await context.resume();
      soundEnabledRef.current = true;
      setSoundEnabled(true);
      setErrorMessage(null);
      if (pendingIds.current.size) {
        Array.from(pendingIds.current).forEach((_, index) => playAlert(context, index * 0.8));
        pendingIds.current.clear();
      }
    } catch (error) {
      console.error("Platform notification sound could not be enabled:", error);
      setErrorMessage("Could not enable notification sound. Check your browser audio settings.");
      soundEnabledRef.current = false;
      setSoundEnabled(false);
    }
  };

  const toggleSound = () => {
    if (soundEnabledRef.current) {
      soundEnabledRef.current = false;
      setSoundEnabled(false);
      return;
    }
    void enableSound();
  };

  const markRead = async (id: string) => {
    setErrorMessage(null);
    try {
      await markPlatformNotificationRead(id);
      pendingIds.current.delete(id);
      setNotifications((current) => current.map((notice) => notice.id === id ? { ...notice, read_at: new Date().toISOString() } : notice));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not mark notification as read.");
    }
  };

  const markAllRead = async () => {
    setErrorMessage(null);
    try {
      await markAllPlatformNotificationsRead();
      pendingIds.current.clear();
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((notice) => ({ ...notice, read_at: notice.read_at ?? readAt })));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not mark notifications as read.");
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Platform alerts${unreadCount ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>
      {open && (
        <>
          <button type="button" aria-label="Close alerts" onClick={() => setOpen(false)} className="fixed inset-0 z-40 cursor-default" />
          <section className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div><h2 className="text-sm font-bold text-slate-900">Platform alerts</h2><p className="text-[11px] text-slate-500">{unreadCount} unread</p></div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={toggleSound} aria-label={soundEnabled ? "Disable notification sound" : "Enable notification sound"} title={soundEnabled ? "Mute sound" : "Enable sound"} className={`rounded-lg p-2 ${soundEnabled ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-100"}`}>
                  {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </button>
                <button type="button" onClick={() => void markAllRead()} disabled={!unreadCount} aria-label="Mark all alerts as read" title="Mark all as read" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40"><CheckCheck className="h-4 w-4" /></button>
              </div>
            </header>
            {errorMessage && <p role="alert" className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-800">{errorMessage}</p>}
            {!soundEnabled && <button type="button" onClick={() => void enableSound()} className="w-full border-b border-blue-100 bg-blue-50 px-4 py-2 text-left text-[11px] font-medium text-blue-800">Enable the alert chime to hear incoming notifications.</button>}
            <div className="max-h-[min(26rem,65vh)] overflow-y-auto">
              {notifications.length ? notifications.map((notification) => (
                <article key={notification.id} className={`flex gap-3 border-b border-slate-100 px-4 py-3 last:border-0 ${notification.read_at ? "bg-white" : "bg-blue-50/50"}`}>
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${notification.read_at ? "bg-slate-300" : notification.severity === "critical" ? "bg-rose-600" : notification.severity === "warning" ? "bg-amber-500" : "bg-blue-600"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-900">{notification.title}</p>
                    <p className="mt-1 whitespace-pre-wrap text-[11px] leading-4 text-slate-600">{notification.message}</p>
                    <time className="mt-1 block text-[10px] text-slate-400">{new Date(notification.created_at).toLocaleString()}</time>
                  </div>
                  {!notification.read_at && <button type="button" onClick={() => void markRead(notification.id)} className="shrink-0 self-start text-[10px] font-semibold text-blue-700 hover:underline">Mark read</button>}
                </article>
              )) : <p className="px-4 py-10 text-center text-xs text-slate-500">No platform alerts yet.</p>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
