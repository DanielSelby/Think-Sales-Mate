"use client";

import { useEffect, useRef, useState } from "react";
import { BellRing, Volume2, VolumeX, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type IncomingOrder = {
  id: string;
  order_number: number;
  location_id: string;
  order_type: "dine_in" | "takeaway" | "pickup" | "delivery";
  status: string;
};

const SOUND_SETTING = "restaurant-order-alert-sound-enabled";

function playOrderChime(context: AudioContext) {
  const now = context.currentTime;
  [880, 1174].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = now + index * 0.18;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.16, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(start);
    oscillator.stop(start + 0.25);
  });
}

export function IncomingOrderAlerts({
  orgId,
  locationIds,
}: {
  orgId: string;
  locationIds: string[];
}) {
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [alerts, setAlerts] = useState<IncomingOrder[]>([]);
  const [soundError, setSoundError] = useState("");
  const audioContext = useRef<AudioContext | null>(null);
  const soundEnabledRef = useRef(false);
  const notifiedOrderIds = useRef(new Set<string>());
  const visibleLocationsKey = locationIds.join(",");

  useEffect(() => {
    soundEnabledRef.current = window.localStorage.getItem(SOUND_SETTING) === "true";
    setSoundEnabled(soundEnabledRef.current);
    const visibleLocationIds = new Set(visibleLocationsKey.split(",").filter(Boolean));
    const unlockSavedSound = () => {
      if (!soundEnabledRef.current || !window.AudioContext) return;
      audioContext.current ??= new window.AudioContext();
      if (audioContext.current.state === "suspended") {
        void audioContext.current.resume().catch((error: unknown) => {
          console.error("Restaurant order alert sound could not be resumed:", error);
        });
      }
    };
    window.addEventListener("pointerdown", unlockSavedSound, { once: true });
    window.addEventListener("keydown", unlockSavedSound, { once: true });
    const supabase = createClient();
    const channel = supabase
      .channel(`restaurant-incoming-orders:${orgId}:${visibleLocationsKey}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "restaurant_orders",
        filter: `org_id=eq.${orgId}`,
      }, (payload) => {
        const order = payload.new as IncomingOrder;
        if (!order.id || notifiedOrderIds.current.has(order.id)
          || !visibleLocationIds.has(order.location_id) || order.status !== "new") return;
        notifiedOrderIds.current.add(order.id);
        setAlerts((current) => [order, ...current.filter((entry) => entry.id !== order.id)].slice(0, 4));
        if (soundEnabledRef.current && audioContext.current) {
          if (audioContext.current.state === "suspended") {
            void audioContext.current.resume().then(() => {
              if (audioContext.current) playOrderChime(audioContext.current);
            }).catch((error: unknown) => {
              console.error("Restaurant order alert sound could not play:", error);
            });
          } else {
            playOrderChime(audioContext.current);
          }
        }
        if (typeof window.Notification !== "undefined" && window.Notification.permission === "granted") {
          new window.Notification("New restaurant order", {
            body: `Order #${order.order_number} · ${order.order_type.replace("_", " ")}`,
            tag: `restaurant-order-${order.id}`,
          });
        }
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("Restaurant incoming order notifications could not connect.");
        }
      });
    return () => {
      window.removeEventListener("pointerdown", unlockSavedSound);
      window.removeEventListener("keydown", unlockSavedSound);
      void supabase.removeChannel(channel);
    };
  }, [orgId, visibleLocationsKey]);

  async function toggleSound() {
    setSoundError("");
    if (soundEnabled) {
      soundEnabledRef.current = false;
      window.localStorage.setItem(SOUND_SETTING, "false");
      setSoundEnabled(false);
      return;
    }
    const Constructor = window.AudioContext;
    if (!Constructor) {
      setSoundError("This browser does not support alert sounds.");
      return;
    }
    try {
      audioContext.current ??= new Constructor();
      if (audioContext.current.state === "suspended") await audioContext.current.resume();
      playOrderChime(audioContext.current);
      soundEnabledRef.current = true;
      window.localStorage.setItem(SOUND_SETTING, "true");
      setSoundEnabled(true);
      if (typeof window.Notification !== "undefined" && window.Notification.permission === "default") {
        void window.Notification.requestPermission();
      }
    } catch (error) {
      console.error("Restaurant order alert sound could not be enabled:", error);
      setSoundError("Could not enable order sounds. Check your browser audio settings.");
    }
  }

  return <section aria-label="Incoming restaurant order alerts" className="space-y-2">
    <div className="flex items-center justify-between rounded-xl border bg-white px-3 py-2">
      <p className="flex items-center gap-2 text-sm font-semibold text-slate-800"><BellRing className="h-4 w-4 text-orange-600" />Incoming order alerts</p>
      <button type="button" onClick={() => void toggleSound()} aria-pressed={soundEnabled} className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold text-slate-700">
        {soundEnabled ? <Volume2 className="h-4 w-4 text-orange-600" /> : <VolumeX className="h-4 w-4" />}
        {soundEnabled ? "Sound on" : "Enable sound"}
      </button>
    </div>
    {soundError && <p role="alert" className="text-xs text-red-700">{soundError}</p>}
    {alerts.map((order) => <article key={order.id} role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-orange-300 bg-orange-50 p-3 text-orange-950">
      <a href="/restaurant" className="min-w-0 flex-1">
        <strong className="block">New order #{order.order_number}</strong>
        <span className="text-xs capitalize">{order.order_type.replace("_", " ")} · {order.status.replace("_", " ")}</span>
      </a>
      <button type="button" onClick={() => setAlerts((current) => current.filter((entry) => entry.id !== order.id))} aria-label={`Dismiss order ${order.order_number} alert`} className="rounded p-1 hover:bg-orange-100"><X className="h-4 w-4" /></button>
    </article>)}
  </section>;
}
