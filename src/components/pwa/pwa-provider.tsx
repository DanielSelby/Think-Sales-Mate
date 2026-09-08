"use client";

import { useEffect, useState } from "react";
import { Download, WifiOff, X } from "lucide-react";

export function PwaProvider() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("[pwa] Service worker registration failed:", error);
      });
    }
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setShowInstall(true);
    };
    const updateConnection = () => setOffline(!navigator.onLine);
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    updateConnection();
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    setInstallEvent(null);
    setShowInstall(false);
  }

  return (
    <>
      {offline && (
        <div className="fixed bottom-4 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-full bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-xl">
          <WifiOff className="h-4 w-4" /> You are offline. Changes will resume when connected.
        </div>
      )}
      {showInstall && (
        <div className="fixed bottom-4 right-4 z-[80] flex max-w-sm items-center gap-3 rounded-2xl border border-blue-100 bg-white p-4 shadow-2xl dark:border-blue-900 dark:bg-ink-900">
          <Download className="h-5 w-5 shrink-0 text-blue-600" />
          <div className="flex-1">
            <p className="text-sm font-bold text-ink-900 dark:text-white">Install ThinkSales</p>
            <p className="text-xs text-ledger-500">Use ThinkSales like a native app.</p>
          </div>
          <button type="button" onClick={() => void install()} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">Install</button>
          <button type="button" onClick={() => setShowInstall(false)} aria-label="Dismiss install prompt" className="text-ledger-400 hover:text-ink-900"><X className="h-4 w-4" /></button>
        </div>
      )}
    </>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}
